const express = require('express');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 5000;

// For now, disable Firebase and use local storage only
// This can be enabled later with proper credentials
let db = null;
let isFirebaseReady = false;

console.log('Running in local storage mode - Firebase disabled for this environment');

// Data storage directory
const DATA_DIR = path.join(__dirname, 'user_data');
const DATA_FILE = path.join(DATA_DIR, 'business_data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Private data storage - each user gets their own isolated storage
let privateUserData = {};

// Load data from file on startup
function loadDataFromFile() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            if (data.trim()) {
                privateUserData = JSON.parse(data);
                console.log('Data loaded from persistent storage');
            }
        }
    } catch (error) {
        console.error('Error loading data from file:', error);
        privateUserData = {};
    }
}

// Save data to file
function saveDataToFile() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(privateUserData, null, 2), 'utf8');
        console.log('Data saved to persistent storage');
    } catch (error) {
        console.error('Error saving data to file:', error);
    }
}

// Auto-save every 30 seconds
setInterval(() => {
    if (Object.keys(privateUserData).length > 0) {
        saveDataToFile();
    }
}, 30000);

// Load existing data on startup
loadDataFromFile();

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
function getUserData(req) {
    const sessionId = req.session.id || 'default';
    if (!privateUserData[sessionId]) {
        privateUserData[sessionId] = {
            transactions: [],
            monthlyAggregates: [],
            forecast: { forecast_revenue: 0, forecast_profit: 0, confidence: 'low' },
            employees: [],
            businesses: []
        };
    }
    return privateUserData[sessionId];
}

// Routes

// Password verification page
app.get('/password', (req, res) => {
    res.sendFile(path.join(__dirname, 'Password.html'));
});

// Main application - requires authentication
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login API
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    
    if (password === MASTER_PASSWORD) {
        req.session.authenticated = true;
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: 'Session save failed' });
            }
            res.json({ success: true });
        });
    } else {
        res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    }
});

// Logout API
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

// Get transactions
app.get('/api/transactions', requireAuth, (req, res) => {
    try {
        const userData = getUserData(req);
        res.json(userData.transactions || []);
    } catch (error) {
        console.error('Error getting transactions:', error);
        res.status(500).json({ error: 'فشل في تحميل المعاملات' });
    }
});

// Add transaction
app.post('/api/transactions', requireAuth, (req, res) => {
    try {
        const userData = getUserData(req);
        const transaction = {
            id: Date.now().toString(),
            ...req.body,
            timestamp: new Date().toISOString()
        };
        
        if (!userData.transactions) {
            userData.transactions = [];
        }
        
        userData.transactions.push(transaction);
        
        // Update monthly aggregates
        updateMonthlyAggregates(userData, transaction);
        
        // Save to file immediately
        saveDataToFile();
        
        console.log('Transaction saved successfully:', transaction.id);
        res.json({ success: true, id: transaction.id });
    } catch (error) {
        console.error('Error saving transaction:', error);
        res.status(500).json({ error: 'فشل في حفظ المعاملة: ' + error.message });
    }
});

// Get monthly aggregates
app.get('/api/monthly-aggregates', requireAuth, (req, res) => {
    try {
        const userData = getUserData(req);
        res.json(userData.monthlyAggregates || []);
    } catch (error) {
        console.error('Error getting aggregates:', error);
        res.status(500).json({ error: 'فشل في تحميل البيانات المجمعة' });
    }
});

// Get forecast
app.get('/api/forecast', requireAuth, (req, res) => {
    try {
        const userData = getUserData(req);
        res.json(userData.forecast || { forecast_revenue: 0, forecast_profit: 0, confidence: 'low' });
    } catch (error) {
        console.error('Error getting forecast:', error);
        res.status(500).json({ error: 'فشل في تحميل التوقعات' });
    }
});

// Employee management
app.get('/api/employees', requireAuth, (req, res) => {
    try {
        const userData = getUserData(req);
        res.json(userData.employees || []);
    } catch (error) {
        console.error('Error getting employees:', error);
        res.status(500).json({ error: 'فشل في تحميل بيانات الموظفات' });
    }
});

app.post('/api/employees', requireAuth, (req, res) => {
    try {
        const userData = getUserData(req);
        const employee = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        
        if (!userData.employees) {
            userData.employees = [];
        }
        
        userData.employees.push(employee);
        saveDataToFile();
        
        console.log('Employee added successfully:', employee.id);
        res.json({ success: true, id: employee.id });
    } catch (error) {
        console.error('Error adding employee:', error);
        res.status(500).json({ error: 'فشل في إضافة الموظفة: ' + error.message });
    }
});

app.delete('/api/employees/:id', requireAuth, (req, res) => {
    try {
        const userData = getUserData(req);
        const employeeId = req.params.id;
        
        if (!userData.employees) {
            return res.status(404).json({ error: 'Employees not found' });
        }
        
        userData.employees = userData.employees.filter(emp => emp.id !== employeeId);
        saveDataToFile();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ error: 'فشل في حذف الموظفة: ' + error.message });
    }
});

// Update monthly aggregates function
function updateMonthlyAggregates(userData, transaction) {
    try {
        const date = new Date(transaction.date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        
        if (!userData.monthlyAggregates) {
            userData.monthlyAggregates = [];
        }
        
        let aggregate = userData.monthlyAggregates.find(agg => 
            agg.year === year && 
            agg.month === month && 
            agg.businessId === transaction.businessId
        );
        
        if (!aggregate) {
            aggregate = {
                year,
                month,
                businessId: transaction.businessId,
                total_revenue: 0,
                total_expenses: 0,
                net_profit: 0,
                students_count: 0,
                clients_count: 0
            };
            userData.monthlyAggregates.push(aggregate);
        }
        
        if (transaction.type === 'revenue') {
            aggregate.total_revenue += transaction.amount;
            aggregate.students_count += transaction.students || 0;
            aggregate.clients_count += transaction.clients || 0;
        } else if (transaction.type === 'expense') {
            aggregate.total_expenses += transaction.amount;
        }
        
        aggregate.net_profit = aggregate.total_revenue - aggregate.total_expenses;
        
        console.log('Monthly aggregate updated for', year, month, transaction.businessId);
    } catch (error) {
        console.error('Error updating monthly aggregates:', error);
    }
}

// Redirect root to password page if not authenticated
app.get('/', (req, res) => {
    if (req.session && req.session.authenticated) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/password');
    }
});

// 404 handler
app.use((req, res) => {
    if (req.session && req.session.authenticated) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/password');
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    if (Object.keys(privateUserData).length > 0) {
        saveDataToFile();
        console.log('Data saved before shutdown');
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down gracefully...');
    if (Object.keys(privateUserData).length > 0) {
        saveDataToFile();
        console.log('Data saved before shutdown');
    }
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🔒 Authentication enabled with master password`);
    console.log(`💾 Data persistence enabled - storing in: ${DATA_FILE}`);
    console.log(`🌟 Your private business analytics system is ready!`);
});
function getUserData(sessionId) {
  if (!privateUserData[sessionId]) {
    privateUserData[sessionId] = {
      transactions: [],
      employees: [],
      monthlyAggregates: [],
      projects: []
    };
    // Save immediately when new user data is created
    saveDataToFile();
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
    employee.userId = req.session.userId;

    // Save to Firestore if available
    if (isFirebaseReady && db) {
      await db.collection('employees').add(employee);
      console.log('Employee saved to Firestore');
    }

    // Also save to local session data as backup
    const userData = getUserData(req.session.id);
    userData.employees.push(employee);

    // Save to persistent storage
    saveDataToFile();

    res.json({ success: true, employee, firebaseSync: isFirebaseReady });
  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/employees', requireAuth, async (req, res) => {
  try {
    let employees = [];

    // Try to fetch from Firestore first
    if (isFirebaseReady && db) {
      try {
        const snapshot = await db.collection('employees')
          .where('userId', '==', req.session.userId)
          .get();
        employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Fetched ${employees.length} employees from Firestore`);
      } catch (firestoreError) {
        console.error('Error fetching employees from Firestore:', firestoreError);
        // Fall back to local data
        const userData = getUserData(req.session.id);
        employees = userData.employees;
      }
    } else {
      // Use local session data
      const userData = getUserData(req.session.id);
      employees = userData.employees;
    }

    res.json(employees);
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
      // Save to persistent storage
      saveDataToFile();
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
    
    // Save to persistent storage
    saveDataToFile();

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
    
    // Validate required fields
    if (!transaction.businessId || !transaction.type || !transaction.category || !transaction.amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'البيانات المطلوبة مفقودة (العمل، النوع، الفئة، المبلغ)' 
      });
    }

    // Ensure amount is a valid number
    transaction.amount = parseFloat(transaction.amount);
    if (isNaN(transaction.amount) || transaction.amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المبلغ يجب أن يكون رقماً صحيحاً أكبر من صفر' 
      });
    }

    // Add metadata
    transaction.createdAt = new Date();
    transaction.date = new Date(transaction.date);
    transaction.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
    transaction.userId = req.session.userId;

    console.log('Processing transaction:', {
      id: transaction.id,
      businessId: transaction.businessId,
      type: transaction.type,
      amount: transaction.amount
    });

    // Save to Firestore if available
    let firestoreSuccess = false;
    if (isFirebaseReady && db) {
      try {
        await db.collection('transactions').add(transaction);
        console.log('Transaction saved to Firestore successfully');
        firestoreSuccess = true;
      } catch (firestoreError) {
        console.error('Firestore save error:', firestoreError);
        // Don't fail the request, we'll save locally
      }
    }

    // Save to local session data
    const userData = getUserData(req.session.id);
    userData.transactions.push({
      ...transaction,
      date: transaction.date.toISOString(),
      createdAt: transaction.createdAt.toISOString()
    });

    console.log(`Transaction saved locally. Total transactions: ${userData.transactions.length}`);

    // Save to persistent storage immediately
    saveDataToFile();

    // Recalculate monthly aggregates for this user
    try {
      await calculateMonthlyAggregates(req.session.id);
      console.log('Monthly aggregates recalculated');
      // Save again after aggregates are calculated
      saveDataToFile();
    } catch (aggregateError) {
      console.error('Error calculating aggregates:', aggregateError);
      // Don't fail the request for this
    }

    res.json({ 
      success: true, 
      transaction: {
        ...transaction,
        date: transaction.date.toISOString(),
        createdAt: transaction.createdAt.toISOString()
      }, 
      firebaseSync: firestoreSuccess,
      message: 'تم حفظ المعاملة بنجاح'
    });

  } catch (error) {
    console.error('Error adding transaction:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في الخادم: ' + error.message 
    });
  }
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const { businessId, startDate, endDate } = req.query;
    let transactions = [];

    // Try to fetch from Firestore first
    if (isFirebaseReady && db) {
      try {
        let query = db.collection('transactions').where('userId', '==', req.session.userId);
        
        if (businessId) {
          query = query.where('businessId', '==', businessId);
        }

        const snapshot = await query.get();
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Fetched ${transactions.length} transactions from Firestore`);
      } catch (firestoreError) {
        console.error('Error fetching from Firestore:', firestoreError);
        // Fall back to local data
        const userData = getUserData(req.session.id);
        transactions = [...userData.transactions];
      }
    } else {
      // Use local session data
      const userData = getUserData(req.session.id);
      transactions = [...userData.transactions];
    }

    // Apply additional filters
    if (businessId && !isFirebaseReady) {
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
  console.log('Persistent file storage active - data will be saved automatically');
});

// Graceful shutdown - save data before exit
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  saveDataToFile();
  console.log('Data saved. Server shutting down.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  saveDataToFile();
  console.log('Data saved. Server shutting down.');
  process.exit(0);
});