
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes for transactions
app.post('/api/transactions', async (req, res) => {
  try {
    const transaction = req.body;
    // Add timestamp
    transaction.createdAt = new Date().toISOString();
    transaction.id = Date.now().toString();
    
    // Store in memory for now (you can integrate Firebase later)
    if (!global.transactions) global.transactions = [];
    global.transactions.push(transaction);
    
    // Recalculate monthly aggregates
    calculateMonthlyAggregates();
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/transactions', (req, res) => {
  const { businessId, startDate, endDate } = req.query;
  let transactions = global.transactions || [];
  
  if (businessId) {
    transactions = transactions.filter(t => t.businessId === businessId);
  }
  
  if (startDate && endDate) {
    transactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= new Date(startDate) && date <= new Date(endDate);
    });
  }
  
  res.json(transactions);
});

app.get('/api/monthly-aggregates', (req, res) => {
  res.json(global.monthlyAggregates || []);
});

app.get('/api/forecast', (req, res) => {
  const forecast = calculateForecast();
  res.json(forecast);
});

// Calculate monthly aggregates
function calculateMonthlyAggregates() {
  const transactions = global.transactions || [];
  const aggregates = {};
  
  transactions.forEach(transaction => {
    const date = new Date(transaction.date);
    const monthKey = `${transaction.businessId}_${date.getFullYear()}_${date.getMonth() + 1}`;
    
    if (!aggregates[monthKey]) {
      aggregates[monthKey] = {
        businessId: transaction.businessId,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        total_revenue: 0,
        total_expenses: 0,
        net_profit: 0,
        students_count: 0,
        clients_count: 0,
        transactions_count: 0
      };
    }
    
    const agg = aggregates[monthKey];
    agg.transactions_count++;
    
    if (transaction.type === 'revenue') {
      agg.total_revenue += parseFloat(transaction.amount || 0);
      agg.students_count += parseInt(transaction.students || 0);
      if (!agg.clients_count) agg.clients_count = 0;
      agg.clients_count += parseInt(transaction.clients || 0);
    } else if (transaction.type === 'expense') {
      agg.total_expenses += parseFloat(transaction.amount || 0);
    }
    
    // Add costs to expenses
    if (transaction.cost) {
      agg.total_expenses += parseFloat(transaction.cost);
    }
    
    agg.net_profit = agg.total_revenue - agg.total_expenses;
    agg.avg_ticket = agg.students_count > 0 ? agg.total_revenue / agg.students_count : 0;
  });
  
  // Calculate growth rates
  const aggregatesList = Object.values(aggregates).sort((a, b) => {
    return (a.year * 100 + a.month) - (b.year * 100 + b.month);
  });
  
  for (let i = 1; i < aggregatesList.length; i++) {
    const current = aggregatesList[i];
    const previous = aggregatesList[i - 1];
    
    if (previous.net_profit !== 0) {
      current.growth_vs_prev = (current.net_profit - previous.net_profit) / Math.abs(previous.net_profit);
    } else {
      current.growth_vs_prev = 0;
    }
  }
  
  global.monthlyAggregates = aggregatesList;
}

// Forecast calculation using average growth
function calculateForecast() {
  const aggregates = global.monthlyAggregates || [];
  if (aggregates.length < 2) {
    return { forecast_revenue: 0, forecast_profit: 0, confidence: 'low' };
  }
  
  // Get last 6 months for forecast
  const recentMonths = aggregates.slice(-6);
  const growthRates = [];
  
  for (let i = 1; i < recentMonths.length; i++) {
    const prev = recentMonths[i - 1];
    const curr = recentMonths[i];
    
    if (prev.net_profit !== 0) {
      growthRates.push((curr.net_profit - prev.net_profit) / Math.abs(prev.net_profit));
    }
  }
  
  if (growthRates.length === 0) {
    return { forecast_revenue: 0, forecast_profit: 0, confidence: 'low' };
  }
  
  const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
  const lastMonth = recentMonths[recentMonths.length - 1];
  
  const forecastProfit = lastMonth.net_profit * (1 + avgGrowth);
  const forecastRevenue = lastMonth.total_revenue * (1 + avgGrowth);
  
  return {
    forecast_revenue: Math.max(0, forecastRevenue),
    forecast_profit: Math.max(0, forecastProfit),
    avg_growth_rate: avgGrowth,
    confidence: recentMonths.length >= 4 ? 'high' : 'medium',
    based_on_months: recentMonths.length
  };
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Business Analytics Server running on port ${PORT}`);
  console.log(`Access your dashboard at http://localhost:${PORT}`);
});
