
// Global variables
let currentTransactions = [];
let monthlyAggregates = [];
let forecastData = {};
let projects = [];
let selectedProject = null;
let isShowingAllProjects = true;
let yearlyIncomes = {}; // Track yearly income for each project
let employees = []; // Track employees

// Firebase integration status
let firebaseConnected = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Set default date to now
    document.getElementById('date').value = new Date().toISOString().slice(0, 16);
    
    // Check for monthly reset
    checkAndResetMonthlyIncome();
    
    // Load initial data
    loadProjects();
    loadDashboard();
    loadTransactions();
    
    // Set up form submission
    document.getElementById('transaction-form').addEventListener('submit', handleTransactionSubmit);
    document.getElementById('project-form').addEventListener('submit', handleProjectSubmit);
    document.getElementById('employee-form').addEventListener('submit', handleEmployeeSubmit);
    
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
    } else if (sectionId === 'employees') {
        loadEmployees();
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
        clients: parseInt(document.getElementById('clients').value) || 0,
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
            const result = await response.json();
            showMessage('تم حفظ المعاملة بنجاح في قاعدة البيانات!', 'success');
            event.target.reset();
            document.getElementById('date').value = new Date().toISOString().slice(0, 16);
            
            // Reload data with a slight delay to allow Firebase to process
            setTimeout(() => {
                loadDashboard();
                loadTransactions();
            }, 1000);
        } else {
            throw new Error('فشل في حفظ المعاملة في قاعدة البيانات');
        }
    } catch (error) {
        showMessage('حدث خطأ في حفظ المعاملة: ' + error.message, 'error');
        console.error('Transaction save error:', error);
    }
}

// Toggle form fields based on transaction type
function toggleFields() {
    const type = document.getElementById('type').value;
    const studentsGroup = document.getElementById('students-group');
    const clientsGroup = document.getElementById('clients-group');
    const costGroup = document.getElementById('cost-group');
    
    if (type === 'revenue') {
        studentsGroup.style.display = 'flex';
        clientsGroup.style.display = 'flex';
        costGroup.style.display = 'flex';
    } else if (type === 'expense') {
        studentsGroup.style.display = 'none';
        clientsGroup.style.display = 'none';
        costGroup.style.display = 'none';
        document.getElementById('students').value = '';
        document.getElementById('clients').value = '';
        document.getElementById('cost').value = '';
    }
}

// Load dashboard data
async function loadDashboard() {
    try {
        console.log('Loading dashboard data from Firebase...');
        
        // Load monthly aggregates
        const aggregatesResponse = await fetch('/api/monthly-aggregates');
        if (aggregatesResponse.ok) {
            monthlyAggregates = await aggregatesResponse.json();
            firebaseConnected = true;
            console.log('Monthly aggregates loaded from Firebase:', monthlyAggregates.length, 'records');
        } else {
            monthlyAggregates = [];
            firebaseConnected = false;
        }
        
        // Load forecast
        const forecastResponse = await fetch('/api/forecast');
        if (forecastResponse.ok) {
            forecastData = await forecastResponse.json();
            console.log('Forecast data loaded from Firebase');
        } else {
            forecastData = { forecast_revenue: 0, forecast_profit: 0, confidence: 'low' };
        }
        
        // Update KPI cards
        updateKPICards();
        
        // Update charts
        updateCharts();
        
        // Show connection status
        if (firebaseConnected) {
            showMessage('تم الاتصال بقاعدة البيانات بنجاح', 'success');
        }
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        firebaseConnected = false;
        // Initialize with empty data instead of showing error
        monthlyAggregates = [];
        forecastData = { forecast_revenue: 0, forecast_profit: 0, confidence: 'low' };
        updateKPICards();
        updateCharts();
        showMessage('خطأ في الاتصال بقاعدة البيانات', 'error');
    }
}

// Update KPI cards
function updateKPICards() {
    const currentMonth = new Date();
    
    // Filter aggregates by selected project if any
    let filteredAggregates = monthlyAggregates;
    if (selectedProject) {
        filteredAggregates = monthlyAggregates.filter(agg => agg.businessId === selectedProject);
    }
    
    // Aggregate data across all businesses for current month if no project selected
    let currentMonthData;
    if (selectedProject) {
        currentMonthData = filteredAggregates.find(agg => 
            agg.year === currentMonth.getFullYear() && 
            agg.month === currentMonth.getMonth() + 1
        );
    } else {
        // Aggregate all businesses for current month
        const currentMonthAggregates = monthlyAggregates.filter(agg => 
            agg.year === currentMonth.getFullYear() && 
            agg.month === currentMonth.getMonth() + 1
        );
        
        if (currentMonthAggregates.length > 0) {
            currentMonthData = currentMonthAggregates.reduce((total, agg) => ({
                total_revenue: total.total_revenue + agg.total_revenue,
                net_profit: total.net_profit + agg.net_profit,
                students_count: total.students_count + agg.students_count,
                clients_count: total.clients_count + (agg.clients_count || 0)
            }), {
                total_revenue: 0,
                net_profit: 0,
                students_count: 0,
                clients_count: 0
            });
        }
    }
    
    const lastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
    
    let lastMonthData;
    if (selectedProject) {
        lastMonthData = filteredAggregates.find(agg => 
            agg.year === lastMonth.getFullYear() && 
            agg.month === lastMonth.getMonth() + 1
        );
    } else {
        // Aggregate all businesses for last month
        const lastMonthAggregates = monthlyAggregates.filter(agg => 
            agg.year === lastMonth.getFullYear() && 
            agg.month === lastMonth.getMonth() + 1
        );
        
        if (lastMonthAggregates.length > 0) {
            lastMonthData = lastMonthAggregates.reduce((total, agg) => ({
                total_revenue: total.total_revenue + agg.total_revenue,
                net_profit: total.net_profit + agg.net_profit,
                students_count: total.students_count + agg.students_count,
                clients_count: total.clients_count + (agg.clients_count || 0)
            }), {
                total_revenue: 0,
                net_profit: 0,
                students_count: 0,
                clients_count: 0
            });
        }
    }
    
    // Current revenue and yearly income
    const currentRevenue = currentMonthData ? currentMonthData.total_revenue : 0;
    const lastRevenue = lastMonthData ? lastMonthData.total_revenue : 0;
    const revenueChange = lastRevenue > 0 ? ((currentRevenue - lastRevenue) / lastRevenue * 100) : 0;
    
    // Calculate yearly income for selected project or all projects
    let yearlyIncome = 0;
    if (selectedProject) {
        yearlyIncome = getProjectYearlyIncome(selectedProject);
    } else {
        // Sum yearly income for all projects
        projects.forEach(project => {
            yearlyIncome += getProjectYearlyIncome(project.id);
        });
    }
    
    document.getElementById('current-revenue').textContent = formatCurrency(currentRevenue);
    document.getElementById('revenue-change').textContent = `السنوي: ${formatCurrency(yearlyIncome)}`;
    document.getElementById('revenue-change').className = 'kpi-change yearly-income';
    
    // Current profit
    const currentProfit = currentMonthData ? currentMonthData.net_profit : 0;
    const lastProfit = lastMonthData ? lastMonthData.net_profit : 0;
    const profitChange = lastProfit > 0 ? ((currentProfit - lastProfit) / lastProfit * 100) : 0;
    
    document.getElementById('current-profit').textContent = formatCurrency(currentProfit);
    document.getElementById('profit-change').textContent = formatPercentage(profitChange);
    document.getElementById('profit-change').className = 'kpi-change ' + (profitChange >= 0 ? 'positive' : 'negative');
    
    // Current students and clients
    const currentStudents = currentMonthData ? currentMonthData.students_count : 0;
    const currentClients = currentMonthData ? currentMonthData.clients_count || 0 : 0;
    const lastStudents = lastMonthData ? lastMonthData.students_count : 0;
    const lastClients = lastMonthData ? lastMonthData.clients_count || 0 : 0;
    const studentsChange = lastStudents > 0 ? ((currentStudents - lastStudents) / lastStudents * 100) : 0;
    const clientsChange = lastClients > 0 ? ((currentClients - lastClients) / lastClients * 100) : 0;
    
    document.getElementById('current-students').textContent = currentStudents;
    document.getElementById('students-change').textContent = formatPercentage(studentsChange);
    document.getElementById('students-change').className = 'kpi-change ' + (studentsChange >= 0 ? 'positive' : 'negative');
    
    document.getElementById('current-clients').textContent = currentClients;
    document.getElementById('clients-change').textContent = formatPercentage(clientsChange);
    document.getElementById('clients-change').className = 'kpi-change ' + (clientsChange >= 0 ? 'positive' : 'negative');
    
    // Forecast
    document.getElementById('forecast-profit').textContent = formatCurrency(forecastData.forecast_profit || 0);
    document.getElementById('forecast-confidence').textContent = getConfidenceText(forecastData.confidence);
}

// Check and reset monthly income if it's a new month
function checkAndResetMonthlyIncome() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Get last check date from localStorage
    const lastCheck = localStorage.getItem('lastMonthlyCheck');
    const lastCheckDate = lastCheck ? new Date(lastCheck) : null;
    
    // If it's a new month or first time running
    if (!lastCheckDate || 
        lastCheckDate.getMonth() !== currentMonth || 
        lastCheckDate.getFullYear() !== currentYear) {
        
        // If this is not the first run, transfer monthly income to yearly
        if (lastCheckDate) {
            transferMonthlyToYearly();
        }
        
        // Update last check date
        localStorage.setItem('lastMonthlyCheck', now.toISOString());
        
        // Initialize yearly incomes if not exists
        initializeYearlyIncomes();
    }
}

// Transfer previous month's income to yearly totals
function transferMonthlyToYearly() {
    const yearlyIncomes = getYearlyIncomes();
    const currentYear = new Date().getFullYear();
    
    // Get previous month's aggregates
    const previousMonth = new Date();
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    
    const prevMonthAggregates = monthlyAggregates.filter(agg => 
        agg.year === previousMonth.getFullYear() && 
        agg.month === previousMonth.getMonth() + 1
    );
    
    // Add previous month's revenue to yearly totals
    prevMonthAggregates.forEach(agg => {
        const projectKey = `${agg.businessId}_${currentYear}`;
        if (!yearlyIncomes[projectKey]) {
            yearlyIncomes[projectKey] = 0;
        }
        yearlyIncomes[projectKey] += agg.total_revenue;
    });
    
    // Save updated yearly incomes
    localStorage.setItem('yearlyIncomes', JSON.stringify(yearlyIncomes));
    
    console.log('Monthly income transferred to yearly totals');
}

// Initialize yearly incomes
function initializeYearlyIncomes() {
    const stored = localStorage.getItem('yearlyIncomes');
    if (!stored) {
        yearlyIncomes = {};
        localStorage.setItem('yearlyIncomes', JSON.stringify(yearlyIncomes));
    } else {
        yearlyIncomes = JSON.parse(stored);
    }
}

// Get yearly incomes from localStorage
function getYearlyIncomes() {
    const stored = localStorage.getItem('yearlyIncomes');
    return stored ? JSON.parse(stored) : {};
}

// Get yearly income for a specific project
function getProjectYearlyIncome(projectId) {
    const currentYear = new Date().getFullYear();
    const yearlyIncomes = getYearlyIncomes();
    const projectKey = `${projectId}_${currentYear}`;
    
    // Get stored yearly income
    const storedYearly = yearlyIncomes[projectKey] || 0;
    
    // Get current year's monthly totals (excluding current month if we're tracking separately)
    const currentYearAggregates = monthlyAggregates.filter(agg => 
        agg.businessId === projectId && 
        agg.year === currentYear &&
        agg.month < new Date().getMonth() + 1 // Only completed months
    );
    
    const monthlyTotal = currentYearAggregates.reduce((sum, agg) => sum + agg.total_revenue, 0);
    
    return storedYearly + monthlyTotal;
}

// Get current month income for a project
function getProjectMonthlyIncome(projectId) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const currentMonthAggregate = monthlyAggregates.find(agg => 
        agg.businessId === projectId && 
        agg.year === currentYear && 
        agg.month === currentMonth
    );
    
    return currentMonthAggregate ? currentMonthAggregate.total_revenue : 0;
}

// Load and display projects
function loadProjects() {
    // Initialize with default projects if none exist
    if (!localStorage.getItem('projects')) {
        projects = [
            {
                id: 'abayat_shop',
                name: 'محل العبايات',
                description: 'متجر العبايات والملابس النسائية',
                color: '#4CAF50'
            },
            {
                id: 'courses',
                name: 'الدورات التدريبية',
                description: 'دورات تدريبية في مختلف المجالات',
                color: '#2196F3'
            },
            {
                id: 'consultation',
                name: 'الاستشارات',
                description: 'خدمات الاستشارة المهنية',
                color: '#FF9800'
            }
        ];
        localStorage.setItem('projects', JSON.stringify(projects));
    } else {
        projects = JSON.parse(localStorage.getItem('projects'));
    }
    
    displaySidebarProjects();
    updateBusinessOptions();
}

// Display projects in sidebar
function displaySidebarProjects() {
    const sidebarProjects = document.getElementById('sidebar-projects');
    sidebarProjects.innerHTML = '';
    
    projects.forEach(project => {
        // Calculate project stats
        const yearlyIncome = getProjectYearlyIncome(project.id);
        const monthlyIncome = getProjectMonthlyIncome(project.id);
        const totalTransactions = currentTransactions.filter(t => t.businessId === project.id).length;
        
        const projectElement = document.createElement('div');
        projectElement.className = 'sidebar-project';
        if (selectedProject === project.id) {
            projectElement.classList.add('active');
        }
        projectElement.style.setProperty('--project-color', project.color);
        projectElement.style.setProperty('--project-color-transparent', project.color + '40');
        
        projectElement.innerHTML = `
            <div class="sidebar-project-name">${project.name}</div>
            <div class="sidebar-project-stats">
                <div class="sidebar-project-yearly">
                    <span class="income-label">السنوي:</span> ${formatCurrency(yearlyIncome)}
                </div>
                <div class="sidebar-project-monthly">
                    <span class="income-label">هذا الشهر:</span> ${formatCurrency(monthlyIncome)}
                </div>
                <div class="sidebar-project-count">${totalTransactions} معاملة</div>
            </div>
        `;
        
        projectElement.addEventListener('click', () => {
            selectProject(project.id);
        });
        
        sidebarProjects.appendChild(projectElement);
    });
}

// Open add project modal
function openAddProjectModal() {
    document.getElementById('addProjectModal').style.display = 'block';
}

// Close add project modal
function closeAddProjectModal() {
    document.getElementById('addProjectModal').style.display = 'none';
    document.getElementById('project-form').reset();
}

// Handle project form submission
async function handleProjectSubmit(event) {
    event.preventDefault();
    
    const projectData = {
        id: document.getElementById('project-id').value,
        name: document.getElementById('project-name').value,
        description: document.getElementById('project-description').value,
        color: document.getElementById('project-color').value
    };
    
    // Check if project ID already exists
    if (projects.some(p => p.id === projectData.id)) {
        showMessage('معرف المشروع موجود بالفعل', 'error');
        return;
    }
    
    projects.push(projectData);
    localStorage.setItem('projects', JSON.stringify(projects));
    
    displaySidebarProjects();
    updateBusinessOptions();
    closeAddProjectModal();
    
    showMessage('تم إضافة المشروع بنجاح!', 'success');
}

// Update business options in forms
function updateBusinessOptions() {
    const businessSelects = document.querySelectorAll('#business, #filter-business, #report-business');
    
    businessSelects.forEach(select => {
        // Save current value
        const currentValue = select.value;
        
        // Clear options except "اختر العمل" or "جميع الأعمال"
        const firstOption = select.firstElementChild;
        select.innerHTML = '';
        select.appendChild(firstOption);
        
        // Add project options
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            select.appendChild(option);
        });
        
        // Restore value if it still exists
        if (currentValue && projects.some(p => p.id === currentValue)) {
            select.value = currentValue;
        }
    });
}

// Select a specific project
function selectProject(projectId) {
    selectedProject = projectId;
    isShowingAllProjects = false;
    
    const project = projects.find(p => p.id === projectId);
    if (project) {
        document.getElementById('dashboard-title').textContent = `لوحة التحكم - ${project.name}`;
        
        // Update navigation to show we're in project mode
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const originalText = btn.textContent;
            if (!btn.dataset.originalText) {
                btn.dataset.originalText = originalText;
            }
            btn.textContent = btn.dataset.originalText + ` - ${project.name}`;
        });
    }
    
    displaySidebarProjects();
    loadDashboard();
    loadTransactions();
    
    showMessage(`تم اختيار مشروع ${project.name}`, 'success');
}

// Show all projects view
function showAllProjects() {
    selectedProject = null;
    isShowingAllProjects = true;
    
    document.getElementById('dashboard-title').textContent = 'لوحة التحكم العامة';
    
    // Reset navigation text
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
    });
    
    displaySidebarProjects();
    loadDashboard();
    loadTransactions();
    
    showMessage('تم عرض جميع المشاريع', 'success');
}

// Edit project (placeholder)
function editProject(projectId) {
    showMessage('ميزة تعديل المشروع ستكون متاحة قريباً', 'info');
}

// Delete project
function deleteProject(projectId) {
    if (confirm('هل أنت متأكد من حذف هذا المشروع؟ سيتم حذف جميع البيانات المرتبطة به.')) {
        projects = projects.filter(p => p.id !== projectId);
        localStorage.setItem('projects', JSON.stringify(projects));
        
        // If deleted project was selected, show all projects
        if (selectedProject === projectId) {
            showAllProjects();
        } else {
            displaySidebarProjects();
        }
        
        updateBusinessOptions();
        
        showMessage('تم حذف المشروع بنجاح', 'success');
    }
}

// Update charts
function updateCharts() {
    updateRevenueChart();
    updateBusinessChart();
    updateClientsChart();
    updateExpensesChart();
}

// Revenue and profit chart
function updateRevenueChart() {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.revenueChart && typeof window.revenueChart.destroy === 'function') {
        window.revenueChart.destroy();
    }
    
    // Filter data by selected project if any
    let chartData = monthlyAggregates;
    if (selectedProject) {
        chartData = monthlyAggregates.filter(agg => agg.businessId === selectedProject);
    } else {
        // Aggregate by month across all businesses
        const monthlyTotals = {};
        monthlyAggregates.forEach(agg => {
            const key = `${agg.year}/${agg.month}`;
            if (!monthlyTotals[key]) {
                monthlyTotals[key] = {
                    year: agg.year,
                    month: agg.month,
                    total_revenue: 0,
                    net_profit: 0
                };
            }
            monthlyTotals[key].total_revenue += agg.total_revenue;
            monthlyTotals[key].net_profit += agg.net_profit;
        });
        chartData = Object.values(monthlyTotals).sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));
    }
    
    const labels = chartData.map(agg => `${agg.year}/${agg.month}`);
    const revenueData = chartData.map(agg => agg.total_revenue);
    const profitData = chartData.map(agg => agg.net_profit);
    
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
    
    if (window.businessChart && typeof window.businessChart.destroy === 'function') {
        window.businessChart.destroy();
    }
    
    // If project is selected, show only that project
    if (selectedProject) {
        const project = projects.find(p => p.id === selectedProject);
        const projectRevenue = monthlyAggregates
            .filter(agg => agg.businessId === selectedProject)
            .reduce((sum, agg) => sum + agg.total_revenue, 0);
            
        window.businessChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: [project ? project.name : selectedProject],
                datasets: [{
                    data: [projectRevenue],
                    backgroundColor: [project ? project.color : '#4CAF50']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + formatCurrency(context.parsed);
                            }
                        }
                    }
                }
            }
        });
        return;
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

// Clients chart
function updateClientsChart() {
    const ctx = document.getElementById('clientsChart').getContext('2d');
    
    if (window.clientsChart && typeof window.clientsChart.destroy === 'function') {
        window.clientsChart.destroy();
    }
    
    const labels = monthlyAggregates.map(agg => `${agg.year}/${agg.month}`);
    const studentsData = monthlyAggregates.map(agg => agg.students_count);
    const clientsData = monthlyAggregates.map(agg => agg.clients_count || 0);
    
    window.clientsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'عدد الطلاب',
                data: studentsData,
                backgroundColor: '#FF9800',
                borderColor: '#F57C00',
                borderWidth: 1
            }, {
                label: 'عدد العملاء',
                data: clientsData,
                backgroundColor: '#9C27B0',
                borderColor: '#7B1FA2',
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
    
    if (window.expensesChart && typeof window.expensesChart.destroy === 'function') {
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
        console.log('Loading transactions from Firebase...');
        const response = await fetch('/api/transactions');
        if (response.ok) {
            currentTransactions = await response.json();
            displayTransactions(currentTransactions);
            console.log('Transactions loaded from Firebase:', currentTransactions.length, 'records');
        } else {
            throw new Error('Failed to fetch transactions');
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        showMessage('خطأ في تحميل المعاملات من قاعدة البيانات', 'error');
        currentTransactions = [];
        displayTransactions(currentTransactions);
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
    const project = projects.find(p => p.id === businessId);
    return project ? project.name : businessId;
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
    
    // Find a suitable container - try main-content first, then body
    const container = document.querySelector('.main-content') || document.body;
    const header = document.querySelector('header');
    
    if (container && header) {
        container.insertBefore(messageDiv, header.nextSibling);
    } else if (container) {
        container.appendChild(messageDiv);
    } else {
        // Fallback: just append to body
        document.body.appendChild(messageDiv);
    }
    
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
}

// Employee management functions
async function handleEmployeeSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const employee = {
        name: formData.get('name'),
        role: formData.get('role'),
        salary: parseFloat(formData.get('salary')),
        phone: formData.get('phone'),
        email: formData.get('email'),
        startDate: formData.get('startDate'),
        notes: formData.get('notes'),
        status: 'active'
    };
    
    try {
        const response = await fetch('/api/employees', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(employee)
        });
        
        if (response.ok) {
            showMessage('تم إضافة الموظفة بنجاح!', 'success');
            event.target.reset();
            loadEmployees();
        } else {
            throw new Error('فشل في إضافة الموظفة');
        }
    } catch (error) {
        showMessage('حدث خطأ في إضافة الموظفة: ' + error.message, 'error');
        console.error('Employee add error:', error);
    }
}

async function loadEmployees() {
    try {
        const response = await fetch('/api/employees');
        if (response.ok) {
            employees = await response.json();
            displayEmployees();
            updateEmployeesSummary();
        } else {
            throw new Error('Failed to fetch employees');
        }
    } catch (error) {
        console.error('Error loading employees:', error);
        showMessage('خطأ في تحميل بيانات الموظفات', 'error');
        employees = [];
        displayEmployees();
        updateEmployeesSummary();
    }
}

function displayEmployees() {
    const tbody = document.getElementById('employees-body');
    tbody.innerHTML = '';
    
    employees.forEach(employee => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${employee.name}</td>
            <td>${getRoleName(employee.role)}</td>
            <td>${formatCurrency(employee.salary)}</td>
            <td>${formatDate(employee.startDate)}</td>
            <td>${employee.phone || '-'}</td>
            <td>
                <div class="employee-actions">
                    <button onclick="editEmployee('${employee.id}')" class="edit-employee-btn">تعديل</button>
                    <button onclick="deleteEmployee('${employee.id}')" class="delete-employee-btn">حذف</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updateEmployeesSummary() {
    const totalEmployees = employees.length;
    const totalSalaries = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const averageSalary = totalEmployees > 0 ? totalSalaries / totalEmployees : 0;
    
    document.getElementById('total-employees').textContent = totalEmployees;
    document.getElementById('total-salaries').textContent = formatCurrency(totalSalaries);
    document.getElementById('average-salary').textContent = formatCurrency(averageSalary);
}

function getRoleName(role) {
    const roleNames = {
        'programmer': 'مبرمجة',
        'blogger': 'مدونة',
        'teacher': 'معلمة لغة',
        'designer': 'مصممة',
        'marketer': 'مسوقة',
        'manager': 'مديرة',
        'other': 'أخرى'
    };
    return roleNames[role] || role;
}

async function editEmployee(id) {
    showMessage('ميزة تعديل الموظفة ستكون متاحة قريباً', 'info');
}

async function deleteEmployee(id) {
    if (confirm('هل أنت متأكد من حذف بيانات هذه الموظفة؟')) {
        try {
            const response = await fetch(`/api/employees/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                showMessage('تم حذف الموظفة بنجاح', 'success');
                loadEmployees();
            } else {
                throw new Error('فشل في حذف الموظفة');
            }
        } catch (error) {
            showMessage('حدث خطأ في حذف الموظفة: ' + error.message, 'error');
            console.error('Employee delete error:', error);
        }
    }
}

// Placeholder functions for edit/delete transactions (can be implemented later)
function editTransaction(id) {
    showMessage('ميزة التعديل ستكون متاحة قريباً', 'info');
}

function deleteTransaction(id) {
    if (confirm('هل أنت متأكد من حذف هذه المعاملة؟')) {
        showMessage('ميزة الحذف ستكون متاحة قريباً', 'info');
    }
}
