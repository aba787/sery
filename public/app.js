
// Global variables
let currentTransactions = [];
let monthlyAggregates = [];
let forecastData = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Set default date to now
    document.getElementById('date').value = new Date().toISOString().slice(0, 16);
    
    // Load initial data
    loadDashboard();
    loadTransactions();
    
    // Set up form submission
    document.getElementById('transaction-form').addEventListener('submit', handleTransactionSubmit);
    
    // Toggle fields based on transaction type
    toggleFields();
});

// Navigation
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Load section-specific data
    if (sectionId === 'dashboard') {
        loadDashboard();
    } else if (sectionId === 'transactions') {
        loadTransactions();
    }
}

// Handle transaction form submission
async function handleTransactionSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const transaction = {
        date: document.getElementById('date').value,
        businessId: document.getElementById('business').value,
        type: document.getElementById('type').value,
        category: document.getElementById('category').value,
        amount: parseFloat(document.getElementById('amount').value),
        cost: parseFloat(document.getElementById('cost').value) || 0,
        students: parseInt(document.getElementById('students').value) || 0,
        notes: document.getElementById('notes').value,
        paymentMethod: document.getElementById('payment-method').value
    };
    
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transaction)
        });
        
        if (response.ok) {
            showMessage('تم حفظ المعاملة بنجاح!', 'success');
            event.target.reset();
            document.getElementById('date').value = new Date().toISOString().slice(0, 16);
            loadDashboard();
            loadTransactions();
        } else {
            throw new Error('فشل في حفظ المعاملة');
        }
    } catch (error) {
        showMessage('حدث خطأ في حفظ المعاملة: ' + error.message, 'error');
    }
}

// Toggle form fields based on transaction type
function toggleFields() {
    const type = document.getElementById('type').value;
    const studentsGroup = document.getElementById('students-group');
    const costGroup = document.getElementById('cost-group');
    
    if (type === 'revenue') {
        studentsGroup.style.display = 'flex';
        costGroup.style.display = 'flex';
    } else if (type === 'expense') {
        studentsGroup.style.display = 'none';
        costGroup.style.display = 'none';
        document.getElementById('students').value = '';
        document.getElementById('cost').value = '';
    }
}

// Load dashboard data
async function loadDashboard() {
    try {
        // Load monthly aggregates
        const aggregatesResponse = await fetch('/api/monthly-aggregates');
        monthlyAggregates = await aggregatesResponse.json();
        
        // Load forecast
        const forecastResponse = await fetch('/api/forecast');
        forecastData = await forecastResponse.json();
        
        // Update KPI cards
        updateKPICards();
        
        // Update charts
        updateCharts();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showMessage('خطأ في تحميل البيانات', 'error');
    }
}

// Update KPI cards
function updateKPICards() {
    const currentMonth = new Date();
    const currentMonthData = monthlyAggregates.find(agg => 
        agg.year === currentMonth.getFullYear() && 
        agg.month === currentMonth.getMonth() + 1
    );
    
    const lastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
    const lastMonthData = monthlyAggregates.find(agg => 
        agg.year === lastMonth.getFullYear() && 
        agg.month === lastMonth.getMonth() + 1
    );
    
    // Current revenue
    const currentRevenue = currentMonthData ? currentMonthData.total_revenue : 0;
    const lastRevenue = lastMonthData ? lastMonthData.total_revenue : 0;
    const revenueChange = lastRevenue > 0 ? ((currentRevenue - lastRevenue) / lastRevenue * 100) : 0;
    
    document.getElementById('current-revenue').textContent = formatCurrency(currentRevenue);
    document.getElementById('revenue-change').textContent = formatPercentage(revenueChange);
    document.getElementById('revenue-change').className = 'kpi-change ' + (revenueChange >= 0 ? 'positive' : 'negative');
    
    // Current profit
    const currentProfit = currentMonthData ? currentMonthData.net_profit : 0;
    const lastProfit = lastMonthData ? lastMonthData.net_profit : 0;
    const profitChange = lastProfit > 0 ? ((currentProfit - lastProfit) / lastProfit * 100) : 0;
    
    document.getElementById('current-profit').textContent = formatCurrency(currentProfit);
    document.getElementById('profit-change').textContent = formatPercentage(profitChange);
    document.getElementById('profit-change').className = 'kpi-change ' + (profitChange >= 0 ? 'positive' : 'negative');
    
    // Current students
    const currentStudents = currentMonthData ? currentMonthData.students_count : 0;
    const lastStudents = lastMonthData ? lastMonthData.students_count : 0;
    const studentsChange = lastStudents > 0 ? ((currentStudents - lastStudents) / lastStudents * 100) : 0;
    
    document.getElementById('current-students').textContent = currentStudents;
    document.getElementById('students-change').textContent = formatPercentage(studentsChange);
    document.getElementById('students-change').className = 'kpi-change ' + (studentsChange >= 0 ? 'positive' : 'negative');
    
    // Forecast
    document.getElementById('forecast-profit').textContent = formatCurrency(forecastData.forecast_profit || 0);
    document.getElementById('forecast-confidence').textContent = getConfidenceText(forecastData.confidence);
}

// Update charts
function updateCharts() {
    updateRevenueChart();
    updateBusinessChart();
    updateStudentsChart();
    updateExpensesChart();
}

// Revenue and profit chart
function updateRevenueChart() {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.revenueChart) {
        window.revenueChart.destroy();
    }
    
    const labels = monthlyAggregates.map(agg => `${agg.year}/${agg.month}`);
    const revenueData = monthlyAggregates.map(agg => agg.total_revenue);
    const profitData = monthlyAggregates.map(agg => agg.net_profit);
    
    window.revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'الإيرادات',
                data: revenueData,
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                fill: true,
                tension: 0.4
            }, {
                label: 'صافي الربح',
                data: profitData,
                borderColor: '#2196F3',
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            }
        }
    });
}

// Business distribution chart
function updateBusinessChart() {
    const ctx = document.getElementById('businessChart').getContext('2d');
    
    if (window.businessChart) {
        window.businessChart.destroy();
    }
    
    // Aggregate revenue by business
    const businessRevenue = {};
    monthlyAggregates.forEach(agg => {
        if (!businessRevenue[agg.businessId]) {
            businessRevenue[agg.businessId] = 0;
        }
        businessRevenue[agg.businessId] += agg.total_revenue;
    });
    
    const labels = Object.keys(businessRevenue).map(getBusinessName);
    const data = Object.values(businessRevenue);
    
    window.businessChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return context.label + ': ' + formatCurrency(context.parsed) + ' (' + percentage + '%)';
                        }
                    }
                }
            }
        }
    });
}

// Students chart
function updateStudentsChart() {
    const ctx = document.getElementById('studentsChart').getContext('2d');
    
    if (window.studentsChart) {
        window.studentsChart.destroy();
    }
    
    const labels = monthlyAggregates.map(agg => `${agg.year}/${agg.month}`);
    const studentsData = monthlyAggregates.map(agg => agg.students_count);
    
    window.studentsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'عدد الطلاب',
                data: studentsData,
                backgroundColor: '#FF9800',
                borderColor: '#F57C00',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Expenses vs Revenue chart
function updateExpensesChart() {
    const ctx = document.getElementById('expensesChart').getContext('2d');
    
    if (window.expensesChart) {
        window.expensesChart.destroy();
    }
    
    const labels = monthlyAggregates.map(agg => `${agg.year}/${agg.month}`);
    const revenueData = monthlyAggregates.map(agg => agg.total_revenue);
    const expensesData = monthlyAggregates.map(agg => agg.total_expenses);
    
    window.expensesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'الإيرادات',
                data: revenueData,
                backgroundColor: '#4CAF50'
            }, {
                label: 'المصاريف',
                data: expensesData,
                backgroundColor: '#f44336'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            }
        }
    });
}

// Load transactions
async function loadTransactions() {
    try {
        const response = await fetch('/api/transactions');
        currentTransactions = await response.json();
        displayTransactions(currentTransactions);
    } catch (error) {
        console.error('Error loading transactions:', error);
        showMessage('خطأ في تحميل المعاملات', 'error');
    }
}

// Display transactions in table
function displayTransactions(transactions) {
    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = '';
    
    transactions.reverse().forEach(transaction => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(transaction.date)}</td>
            <td>${getBusinessName(transaction.businessId)}</td>
            <td>${transaction.type === 'revenue' ? 'إيرادات' : 'مصاريف'}</td>
            <td>${getCategoryName(transaction.category)}</td>
            <td>${formatCurrency(transaction.amount)}</td>
            <td>${transaction.students || '-'}</td>
            <td>${transaction.notes || '-'}</td>
            <td>
                <button onclick="editTransaction('${transaction.id}')" class="edit-btn">تعديل</button>
                <button onclick="deleteTransaction('${transaction.id}')" class="delete-btn">حذف</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Apply filters
function applyFilters() {
    const startDate = document.getElementById('filter-start').value;
    const endDate = document.getElementById('filter-end').value;
    const business = document.getElementById('filter-business').value;
    const type = document.getElementById('filter-type').value;
    
    let filtered = [...currentTransactions];
    
    if (startDate) {
        filtered = filtered.filter(t => new Date(t.date) >= new Date(startDate));
    }
    
    if (endDate) {
        filtered = filtered.filter(t => new Date(t.date) <= new Date(endDate));
    }
    
    if (business) {
        filtered = filtered.filter(t => t.businessId === business);
    }
    
    if (type) {
        filtered = filtered.filter(t => t.type === type);
    }
    
    displayTransactions(filtered);
}

// Clear filters
function clearFilters() {
    document.getElementById('filter-start').value = '';
    document.getElementById('filter-end').value = '';
    document.getElementById('filter-business').value = '';
    document.getElementById('filter-type').value = '';
    displayTransactions(currentTransactions);
}

// Export to CSV
function exportToCSV() {
    const headers = ['التاريخ', 'العمل', 'النوع', 'الفئة', 'المبلغ', 'التكلفة', 'الطلاب', 'ملاحظات'];
    const csvContent = [
        headers.join(','),
        ...currentTransactions.map(t => [
            t.date,
            getBusinessName(t.businessId),
            t.type === 'revenue' ? 'إيرادات' : 'مصاريف',
            getCategoryName(t.category),
            t.amount,
            t.cost || 0,
            t.students || 0,
            `"${t.notes || ''}"`
        ].join(','))
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
}

// Generate report
function generateReport() {
    const period = document.getElementById('report-period').value;
    const business = document.getElementById('report-business').value;
    
    let filteredAggregates = [...monthlyAggregates];
    
    if (business) {
        filteredAggregates = filteredAggregates.filter(agg => agg.businessId === business);
    }
    
    const reportContent = document.getElementById('report-content');
    reportContent.innerHTML = generateReportHTML(filteredAggregates, period);
}

// Generate report HTML
function generateReportHTML(aggregates, period) {
    if (aggregates.length === 0) {
        return '<p>لا توجد بيانات للعرض</p>';
    }
    
    const totalRevenue = aggregates.reduce((sum, agg) => sum + agg.total_revenue, 0);
    const totalExpenses = aggregates.reduce((sum, agg) => sum + agg.total_expenses, 0);
    const totalProfit = totalRevenue - totalExpenses;
    const totalStudents = aggregates.reduce((sum, agg) => sum + agg.students_count, 0);
    
    return `
        <h3>تقرير ${period === 'monthly' ? 'شهري' : period === 'quarterly' ? 'ربع سنوي' : 'سنوي'}</h3>
        <div class="report-summary">
            <div class="report-item">
                <strong>إجمالي الإيرادات:</strong> ${formatCurrency(totalRevenue)}
            </div>
            <div class="report-item">
                <strong>إجمالي المصاريف:</strong> ${formatCurrency(totalExpenses)}
            </div>
            <div class="report-item">
                <strong>صافي الربح:</strong> ${formatCurrency(totalProfit)}
            </div>
            <div class="report-item">
                <strong>إجمالي الطلاب:</strong> ${totalStudents}
            </div>
            <div class="report-item">
                <strong>متوسط الإيراد لكل طالب:</strong> ${formatCurrency(totalStudents > 0 ? totalRevenue / totalStudents : 0)}
            </div>
        </div>
        
        <table class="report-table">
            <thead>
                <tr>
                    <th>الفترة</th>
                    <th>الإيرادات</th>
                    <th>المصاريف</th>
                    <th>صافي الربح</th>
                    <th>الطلاب</th>
                    <th>النمو</th>
                </tr>
            </thead>
            <tbody>
                ${aggregates.map(agg => `
                    <tr>
                        <td>${agg.year}/${agg.month}</td>
                        <td>${formatCurrency(agg.total_revenue)}</td>
                        <td>${formatCurrency(agg.total_expenses)}</td>
                        <td>${formatCurrency(agg.net_profit)}</td>
                        <td>${agg.students_count}</td>
                        <td>${formatPercentage(agg.growth_vs_prev || 0)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-SA', {
        style: 'currency',
        currency: 'SAR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatPercentage(value) {
    return (value >= 0 ? '+' : '') + value.toFixed(1) + '%';
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('ar-SA');
}

function getBusinessName(businessId) {
    const businessNames = {
        'abayat_shop': 'محل العبايات',
        'courses': 'الدورات التدريبية',
        'consultation': 'الاستشارات',
        'other': 'أخرى'
    };
    return businessNames[businessId] || businessId;
}

function getCategoryName(category) {
    const categoryNames = {
        'course': 'دورة',
        'product': 'منتج',
        'subscription': 'اشتراك',
        'consultation': 'استشارة',
        'marketing': 'تسويق',
        'supplies': 'مستلزمات',
        'rent': 'إيجار',
        'other': 'أخرى'
    };
    return categoryNames[category] || category;
}

function getConfidenceText(confidence) {
    const confidenceTexts = {
        'high': 'ثقة عالية',
        'medium': 'ثقة متوسطة',
        'low': 'ثقة منخفضة'
    };
    return confidenceTexts[confidence] || 'غير محدد';
}

function showMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    document.querySelector('.container').insertBefore(messageDiv, document.querySelector('header').nextSibling);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Placeholder functions for edit/delete (can be implemented later)
function editTransaction(id) {
    showMessage('ميزة التعديل ستكون متاحة قريباً', 'info');
}

function deleteTransaction(id) {
    if (confirm('هل أنت متأكد من حذف هذه المعاملة؟')) {
        showMessage('ميزة الحذف ستكون متاحة قريباً', 'info');
    }
}
