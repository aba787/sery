
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000;

// Import Firebase Admin SDK for server-side operations
const admin = require('firebase-admin');

// Initialize Firebase Admin (you'll need to add service account key)
// For now, we'll use the client SDK approach
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, query, where, orderBy, Timestamp } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAM_nhmybRetSdWJASTFz_Mq2OxVmMFD2A",
  authDomain: "account-3c2d3.firebaseapp.com",
  projectId: "account-3c2d3",
  storageBucket: "account-3c2d3.firebasestorage.app",
  messagingSenderId: "440967751243",
  appId: "1:440967751243:web:cf8af3219c4a4bd5ed8fce",
  measurementId: "G-TTHFRS3CRN"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

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
    transaction.createdAt = Timestamp.now();
    transaction.date = new Date(transaction.date);
    
    // Store in Firestore
    const docRef = await addDoc(collection(db, 'transactions'), transaction);
    transaction.id = docRef.id;
    
    // Recalculate monthly aggregates
    await calculateMonthlyAggregates();
    
    res.json({ success: true, transaction });
  } catch (error) {
    console.error('Error adding transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const { businessId, startDate, endDate } = req.query;
    let q = collection(db, 'transactions');
    
    const constraints = [];
    
    if (businessId) {
      constraints.push(where('businessId', '==', businessId));
    }
    
    if (startDate) {
      constraints.push(where('date', '>=', new Date(startDate)));
    }
    
    if (endDate) {
      constraints.push(where('date', '<=', new Date(endDate)));
    }
    
    constraints.push(orderBy('date', 'desc'));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const querySnapshot = await getDocs(q);
    const transactions = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      transactions.push({
        id: doc.id,
        ...data,
        date: data.date.toDate ? data.date.toDate().toISOString() : data.date,
        createdAt: data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
      });
    });
    
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/monthly-aggregates', async (req, res) => {
  try {
    const querySnapshot = await getDocs(collection(db, 'monthlyAggregates'));
    const aggregates = [];
    
    querySnapshot.forEach((doc) => {
      aggregates.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Sort by year and month
    aggregates.sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));
    
    res.json(aggregates);
  } catch (error) {
    console.error('Error fetching aggregates:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/forecast', async (req, res) => {
  try {
    const forecast = await calculateForecast();
    res.json(forecast);
  } catch (error) {
    console.error('Error calculating forecast:', error);
    res.status(500).json({ error: error.message });
  }
});

// Calculate monthly aggregates
async function calculateMonthlyAggregates() {
  try {
    const querySnapshot = await getDocs(collection(db, 'transactions'));
    const transactions = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      transactions.push({
        id: doc.id,
        ...data,
        date: data.date.toDate ? data.date.toDate() : new Date(data.date)
      });
    });
    
    const aggregates = {};
    
    transactions.forEach(transaction => {
      const date = transaction.date;
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
    
    // Clear existing aggregates and save new ones
    const existingAggregates = await getDocs(collection(db, 'monthlyAggregates'));
    const deletePromises = existingAggregates.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    
    // Save new aggregates
    const savePromises = aggregatesList.map(agg => 
      addDoc(collection(db, 'monthlyAggregates'), agg)
    );
    await Promise.all(savePromises);
    
    console.log('Monthly aggregates updated in Firestore');
  } catch (error) {
    console.error('Error calculating monthly aggregates:', error);
  }
}

// Forecast calculation using average growth
async function calculateForecast() {
  try {
    const querySnapshot = await getDocs(collection(db, 'monthlyAggregates'));
    const aggregates = [];
    
    querySnapshot.forEach((doc) => {
      aggregates.push(doc.data());
    });
    
    aggregates.sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));
    
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
  } catch (error) {
    console.error('Error calculating forecast:', error);
    return { forecast_revenue: 0, forecast_profit: 0, confidence: 'low' };
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Business Analytics Server running on port ${PORT}`);
  console.log(`Access your dashboard at http://localhost:${PORT}`);
  console.log('Firebase integration active - data will be stored in Firestore');
});
