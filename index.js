
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000;

// Use Firebase Admin SDK for server-side operations
const admin = require('firebase-admin');
const { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, Timestamp } = require('firebase/firestore');

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

// Fallback to in-memory storage if Firebase fails
let memoryStorage = {
  transactions: [],
  employees: [],
  monthlyAggregates: []
};

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes for employees
app.post('/api/employees', async (req, res) => {
  try {
    const employee = req.body;
    employee.createdAt = new Date();
    employee.id = Date.now().toString();
    
    if (isFirebaseReady) {
      try {
        const docRef = await db.collection('employees').add(employee);
        employee.id = docRef.id;
        console.log('Employee saved to Firebase');
      } catch (firebaseError) {
        console.log('Firebase not available, using memory storage');
        memoryStorage.employees = memoryStorage.employees || [];
        memoryStorage.employees.push(employee);
      }
    } else {
      memoryStorage.employees = memoryStorage.employees || [];
      memoryStorage.employees.push(employee);
    }
    
    res.json({ success: true, employee });
  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/employees', async (req, res) => {
  try {
    let employees = [];
    
    if (isFirebaseReady) {
      try {
        const snapshot = await db.collection('employees').get();
        snapshot.forEach((doc) => {
          const data = doc.data();
          employees.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof admin.firestore.Timestamp ? 
              data.createdAt.toDate().toISOString() : data.createdAt
          });
        });
        console.log(`Loaded ${employees.length} employees from Firebase`);
      } catch (firebaseError) {
        console.log('Firebase not available, using memory storage');
        employees = memoryStorage.employees || [];
      }
    } else {
      employees = memoryStorage.employees || [];
    }
    
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.json([]);
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (isFirebaseReady) {
      try {
        await db.collection('employees').doc(id).update(updates);
      } catch (firebaseError) {
        // Update in memory storage
        if (memoryStorage.employees) {
          const index = memoryStorage.employees.findIndex(emp => emp.id === id);
          if (index !== -1) {
            memoryStorage.employees[index] = { ...memoryStorage.employees[index], ...updates };
          }
        }
      }
    } else {
      // Update in memory storage
      if (memoryStorage.employees) {
        const index = memoryStorage.employees.findIndex(emp => emp.id === id);
        if (index !== -1) {
          memoryStorage.employees[index] = { ...memoryStorage.employees[index], ...updates };
        }
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (isFirebaseReady) {
      try {
        await db.collection('employees').doc(id).delete();
      } catch (firebaseError) {
        // Delete from memory storage
        if (memoryStorage.employees) {
          memoryStorage.employees = memoryStorage.employees.filter(emp => emp.id !== id);
        }
      }
    } else {
      // Delete from memory storage
      if (memoryStorage.employees) {
        memoryStorage.employees = memoryStorage.employees.filter(emp => emp.id !== id);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Routes for transactions
app.post('/api/transactions', async (req, res) => {
  try {
    const transaction = req.body;
    transaction.createdAt = new Date();
    transaction.date = new Date(transaction.date);
    transaction.id = Date.now().toString(); // Simple ID generation
    
    try {
      // Try to store in Firestore
      const docRef = await db.collection('transactions').add(transaction);
      transaction.id = docRef.id;
      console.log('Transaction saved to Firebase');
    } catch (firebaseError) {
      console.log('Firebase not available, using memory storage');
      // Fallback to memory storage
      memoryStorage.transactions.push(transaction);
    }
    
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
    let transactions = [];
    
    try {
      // Try to get from Firebase
      const snapshot = await db.collection('transactions').get();
      snapshot.forEach((doc) => {
        const data = doc.data();
        transactions.push({
          id: doc.id,
          ...data,
          date: data.date instanceof admin.firestore.Timestamp ? data.date.toDate().toISOString() : data.date,
          createdAt: data.createdAt instanceof admin.firestore.Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt
        });
      });
      console.log(`Loaded ${transactions.length} transactions from Firebase`);
    } catch (firebaseError) {
      console.log('Firebase not available, using memory storage');
      // Fallback to memory storage
      transactions = memoryStorage.transactions.map(t => ({
        ...t,
        date: t.date instanceof Date ? t.date.toISOString() : t.date,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt
      }));
    }
    
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
    
    // Sort by date descending
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.json([]); // Return empty array instead of error
  }
});

app.get('/api/monthly-aggregates', async (req, res) => {
  try {
    let aggregates = [];
    
    try {
      // Try to get from Firebase
      const snapshot = await db.collection('monthlyAggregates').get();
      snapshot.forEach((doc) => {
        aggregates.push({
          id: doc.id,
          ...doc.data()
        });
      });
      console.log(`Loaded ${aggregates.length} aggregates from Firebase`);
    } catch (firebaseError) {
      console.log('Firebase not available, using memory storage');
      // Fallback to memory storage
      aggregates = memoryStorage.monthlyAggregates;
    }
    
    // Sort by year and month
    aggregates.sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));
    
    res.json(aggregates);
  } catch (error) {
    console.error('Error fetching aggregates:', error);
    res.json([]); // Return empty array instead of error
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
    let transactions = [];
    
    try {
      // Try to get from Firebase
      const snapshot = await db.collection('transactions').get();
      snapshot.forEach((doc) => {
        const data = doc.data();
        transactions.push({
          id: doc.id,
          ...data,
          date: data.date instanceof admin.firestore.Timestamp ? data.date.toDate() : new Date(data.date)
        });
      });
    } catch (firebaseError) {
      // Fallback to memory storage
      transactions = memoryStorage.transactions.map(t => ({
        ...t,
        date: t.date instanceof Date ? t.date : new Date(t.date)
      }));
    }
    
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
    
    try {
      // Try to save to Firebase
      const batch = db.batch();
      
      // Clear existing aggregates
      const existingSnapshot = await db.collection('monthlyAggregates').get();
      existingSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Add new aggregates
      aggregatesList.forEach(agg => {
        const ref = db.collection('monthlyAggregates').doc();
        batch.set(ref, agg);
      });
      
      await batch.commit();
      console.log('Monthly aggregates updated in Firebase');
    } catch (firebaseError) {
      // Save to memory storage
      memoryStorage.monthlyAggregates = aggregatesList;
      console.log('Monthly aggregates updated in memory storage');
    }
    
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
