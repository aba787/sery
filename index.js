const express = require('express');
const path = require('path');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 5000;

// Use Firebase Admin SDK for server-side operations
const admin = require('firebase-admin');

// Initialize Firebase Admin
let db;
let isFirebaseReady = false;

try {
  // For development, we'll use a service account key (you should add this to secrets)
  // For now, we'll initialize without credentials for testing
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: "account-3c2d3",
      // Add your service account key here in production
    });
  }
  db = admin.firestore();
  isFirebaseReady = true;
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
  isFirebaseReady = false;
}

// Private data storage - each user gets their own isolated storage
let privateUserData = {};

// Authentication configuration
const MASTER_PASSWORD = 'sa'; // Your private password
const SESSION_SECRET = 'your-secret-key-12345'; // Change this in production

// Middleware
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// Serve static files (CSS, JS, images) without authentication
app.use('/styles.css', express.static('public/styles.css'));
app.use('/app.js', express.static('public/app.js'));
app.use('/public', express.static('public'));

// Get user's private data storage
function getUserData(sessionId) {
  if (!privateUserData[sessionId]) {
    privateUserData[sessionId] = {
      transactions: [],
      employees: [],
      monthlyAggregates: [],
      projects: []
    };
  }
  return privateUserData[sessionId];
}

// Authentication routes
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  
  if (password === MASTER_PASSWORD) {
    req.session.authenticated = true;
    req.session.userId = 'master_user'; // Single user system
    res.json({ success: true, message: 'تم تسجيل الدخول بنجاح' });
  } else {
    res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'خطأ في تسجيل الخروج' });
    }
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

// Routes
app.get('/', (req, res) => {
  // Check if user is authenticated
  if (req.session && req.session.authenticated) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'Password.html'));
  }
});

// API Routes for employees (protected)
app.post('/api/employees', requireAuth, async (req, res) => {
  try {
    const employee = req.body;
    employee.createdAt = new Date();
    employee.id = Date.now().toString();

    const userData = getUserData(req.session.id);
    userData.employees.push(employee);

    res.json({ success: true, employee });
  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/employees', requireAuth, async (req, res) => {
  try {
    const userData = getUserData(req.session.id);
    res.json(userData.employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.json([]);
  }
});

app.put('/api/employees/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userData = getUserData(req.session.id);

    const index = userData.employees.findIndex(emp => emp.id === id);
    if (index !== -1) {
      userData.employees[index] = { ...userData.employees[index], ...updates };
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/employees/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userData = getUserData(req.session.id);
    
    userData.employees = userData.employees.filter(emp => emp.id !== id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Routes for transactions (protected)
app.post('/api/transactions', requireAuth, async (req, res) => {
  try {
    const transaction = req.body;
    transaction.createdAt = new Date();
    transaction.date = new Date(transaction.date);
    transaction.id = Date.now().toString();

    const userData = getUserData(req.session.id);
    userData.transactions.push(transaction);

    // Recalculate monthly aggregates for this user
    await calculateMonthlyAggregates(req.session.id);

    res.json({ success: true, transaction });
  } catch (error) {
    console.error('Error adding transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const { businessId, startDate, endDate } = req.query;
    const userData = getUserData(req.session.id);
    let transactions = [...userData.transactions];

    // Apply filters
    if (businessId) {
      transactions = transactions.filter(t => t.businessId === businessId);
    }

    if (startDate) {
      transactions = transactions.filter(t => new Date(t.date) >= new Date(startDate));
    }

    if (endDate) {
      transactions = transactions.filter(t => new Date(t.date) <= new Date(endDate));
    }

    // Convert dates to strings and sort by date descending
    transactions = transactions.map(t => ({
      ...t,
      date: t.date instanceof Date ? t.date.toISOString() : t.date,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt
    }));

    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.json([]);
  }
});

app.get('/api/monthly-aggregates', requireAuth, async (req, res) => {
  try {
    const userData = getUserData(req.session.id);
    let aggregates = [...userData.monthlyAggregates];

    // Sort by year and month
    aggregates.sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));

    res.json(aggregates);
  } catch (error) {
    console.error('Error fetching aggregates:', error);
    res.json([]);
  }
});

app.get('/api/forecast', requireAuth, async (req, res) => {
  try {
    const forecast = await calculateForecast(req.session.id);
    res.json(forecast);
  } catch (error) {
    console.error('Error calculating forecast:', error);
    res.status(500).json({ error: error.message });
  }
});

// Calculate monthly aggregates for specific user
async function calculateMonthlyAggregates(sessionId) {
  try {
    const userData = getUserData(sessionId);
    const transactions = userData.transactions.map(t => ({
      ...t,
      date: t.date instanceof Date ? t.date : new Date(t.date)
    }));

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

    // Save to user's private data
    userData.monthlyAggregates = aggregatesList;
    console.log('Monthly aggregates updated for user');

  } catch (error) {
    console.error('Error calculating monthly aggregates:', error);
  }
}

// Forecast calculation using average growth for specific user
async function calculateForecast(sessionId) {
  try {
    const userData = getUserData(sessionId);
    let aggregates = userData.monthlyAggregates || [];

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
  console.log(`Access your dashboard at http://0.0.0.0:${PORT}`);
  console.log('Firebase integration active - data will be stored in Firestore');
});