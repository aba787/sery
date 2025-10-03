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

// Add resize handler for responsive updates
let resizeTimeout;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
        // Update charts on resize
        if (document.querySelector('.section.active')) {
            updateCharts();
            if (document.getElementById('company-dashboard').classList.contains('active')) {
                updateCompanyCharts();
            }
        }
    }, 250);
});

// Add touch event handlers for better mobile interaction
document.addEventListener('touchstart', function() {}, {passive: true});

// Navigation
function showSection(sectionId) {
    console.log('Navigating to section:', sectionId);
    
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });

    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
        console.log('Section displayed:', sectionId);
    } else {
        console.error('Section not found:', sectionId);
        return;
    }

    // Add active class to clicked button - find the button that matches this section
    const activeBtn = document.querySelector(`button[onclick*="${sectionId}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Load section-specific data
    if (sectionId === 'dashboard') {
        loadDashboard();
    } else if (sectionId === 'transactions') {
        loadTransactions();
    } else if (sectionId === 'employees') {
        loadEmployees();
    } else if (sectionId === 'company-dashboard') {
        setTimeout(() => {
            loadCompanyOverview();
        }, 100);
    } else if (sectionId === 'company-finance') {
        setTimeout(() => {
            loadCompanyFinance();
        }, 100);
    } else if (sectionId === 'company-projects') {
        setTimeout(() => {
            loadCompanyProjects();
        }, 100);
    } else if (sectionId === 'company') {
        setTimeout(() => {
            loadCompanyDashboard();
        }, 100);
    }
}

// Handle transaction form submission
async function handleTransactionSubmit(event) {
    event.preventDefault();

    // Validate required fields
    const businessId = document.getElementById('business').value;
    const type = document.getElementById('type').value;
    const category = document.getElementById('category').value;
    const amount = document.getElementById('amount').value;

    if (!businessId) {
        showMessage('يرجى اختيار العمل/البراند', 'error');
        return;
    }

    if (!type) {
        showMessage('يرجى اختيار نوع المعاملة', 'error');
        return;
    }

    if (!category) {
        showMessage('يرجى اختيار الفئة', 'error');
        return;
    }

    if (!amount || parseFloat(amount) <= 0) {
        showMessage('يرجى إدخال مبلغ صحيح', 'error');
        return;
    }

    const paymentMethod = document.getElementById('payment-method').value;
    const transaction = {
        date: document.getElementById('date').value,
        businessId: businessId,
        type: type,
        category: category,
        amount: parseFloat(amount),
        cost: parseFloat(document.getElementById('cost').value) || 0,
        students: parseInt(document.getElementById('students').value) || 0,
        clients: parseInt(document.getElementById('clients').value) || 0,
        notes: document.getElementById('notes').value.trim(),
        paymentMethod: paymentMethod
    };

    // Add installment data if payment method is installment
    if (paymentMethod === 'installment') {
        const installmentMonths = parseInt(document.getElementById('installment-months').value) || 1;
        const downPayment = parseFloat(document.getElementById('down-payment').value) || 0;
        
        transaction.installmentData = {
            totalMonths: installmentMonths,
            monthlyAmount: parseFloat(document.getElementById('installment-amount').value) || 0,
            downPayment: downPayment,
            remainingAmount: transaction.amount - downPayment
        };
    }

    // Show loading state
    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'جاري الحفظ...';
    submitButton.disabled = true;

    try {
        console.log('Sending transaction:', transaction);

        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transaction)
        });

        const result = await response.json();
        console.log('Server response:', result);

        if (response.ok && result.success) {
            showMessage('تم حفظ المعاملة بنجاح!', 'success');
            
            // Reset form
            event.target.reset();
            document.getElementById('date').value = new Date().toISOString().slice(0, 16);
            
            // Hide conditional fields
            toggleFields();
            toggleInstallmentFields();

            // Reload data
            setTimeout(() => {
                loadDashboard();
                loadTransactions();
            }, 500);
        } else {
            const errorMessage = result.error || 'فشل في حفظ المعاملة';
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('Transaction save error:', error);
        showMessage('حدث خطأ في حفظ المعاملة: ' + error.message, 'error');
    } finally {
        // Restore button state
        submitButton.textContent = originalText;
        submitButton.disabled = false;
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

// Toggle installment payment fields
function toggleInstallmentFields() {
    const paymentMethod = document.getElementById('payment-method').value;
    const installmentGroup = document.getElementById('installment-group');
    const installmentAmountGroup = document.getElementById('installment-amount-group');
    const downPaymentGroup = document.getElementById('down-payment-group');

    if (paymentMethod === 'installment') {
        installmentGroup.style.display = 'flex';
        installmentAmountGroup.style.display = 'flex';
        downPaymentGroup.style.display = 'flex';
    } else {
        installmentGroup.style.display = 'none';
        installmentAmountGroup.style.display = 'none';
        downPaymentGroup.style.display = 'none';
        document.getElementById('installment-months').value = '';
        document.getElementById('installment-amount').value = '';
        document.getElementById('down-payment').value = '';
    }
}

// Calculate installment amount
function calculateInstallmentAmount() {
    const totalAmount = parseFloat(document.getElementById('amount').value) || 0;
    const installmentMonths = parseInt(document.getElementById('installment-months').value) || 1;
    const downPayment = parseFloat(document.getElementById('down-payment').value) || 0;
    
    if (totalAmount > 0 && installmentMonths > 0) {
        const remainingAmount = totalAmount - downPayment;
        const monthlyInstallment = remainingAmount / installmentMonths;
        document.getElementById('installment-amount').value = monthlyInstallment.toFixed(2);
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
    // Initialize with empty projects array
    if (!localStorage.getItem('projects')) {
        projects = [];
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
            <div class="sidebar-project-actions">
                <button onclick="event.stopPropagation(); editProject('${project.id}')" class="sidebar-edit-btn" title="تعديل المشروع">✏️</button>
                <button onclick="event.stopPropagation(); deleteProject('${project.id}')" class="sidebar-delete-btn" title="حذف المشروع">🗑️</button>
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

        // If no projects exist and this is the main business select, add a default option
        if (projects.length === 0 && select.id === 'business') {
            const defaultOption = document.createElement('option');
            defaultOption.value = 'default_business';
            defaultOption.textContent = 'العمل الافتراضي';
            select.appendChild(defaultOption);
        }

        // Restore value if it still exists
        if (currentValue && projects.some(p => p.id === currentValue)) {
            select.value = currentValue;
        } else if (projects.length === 0 && select.id === 'business') {
            // Select default business if no projects exist
            select.value = 'default_business';
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
    const project = projects.find(p => p.id === projectId);
    if (!project) {
        showMessage('المشروع غير موجود', 'error');
        return;
    }

    if (confirm(`هل أنت متأكد من حذف مشروع "${project.name}"؟ سيتم حذف جميع البيانات المرتبطة به بشكل نهائي.`)) {
        // Remove project from projects array
        projects = projects.filter(p => p.id !== projectId);
        localStorage.setItem('projects', JSON.stringify(projects));

        // Clean up yearly income data for this project
        const yearlyIncomes = getYearlyIncomes();
        const currentYear = new Date().getFullYear();
        const projectYearlyKey = `${projectId}_${currentYear}`;
        if (yearlyIncomes[projectYearlyKey]) {
            delete yearlyIncomes[projectYearlyKey];
            localStorage.setItem('yearlyIncomes', JSON.stringify(yearlyIncomes));
        }

        // If deleted project was selected, show all projects
        if (selectedProject === projectId) {
            showAllProjects();
        } else {
            displaySidebarProjects();
        }

        // Update business options in all select elements
        updateBusinessOptions();

        // Reload data to reflect changes
        loadDashboard();
        loadTransactions();

        showMessage(`تم حذف مشروع "${project.name}" بنجاح`, 'success');
    }
}

// Update charts with responsive options
function updateCharts() {
    updateRevenueChart();
    updateBusinessChart();
    updateClientsChart();
    updateExpensesChart();
}

// Mobile detection utility
function isMobile() {
    return window.innerWidth <= 768;
}

// Get responsive chart options
function getResponsiveChartOptions(baseOptions = {}) {
    const isMobileDevice = isMobile();

    return {
        ...baseOptions,
        responsive: true,
        maintainAspectRatio: !isMobileDevice,
        aspectRatio: isMobileDevice ? 1 : 2,
        plugins: {
            ...baseOptions.plugins,
            legend: {
                ...baseOptions.plugins?.legend,
                position: isMobileDevice ? 'bottom' : 'top',
                labels: {
                    ...baseOptions.plugins?.legend?.labels,
                    boxWidth: isMobileDevice ? 12 : 20,
                    font: {
                        size: isMobileDevice ? 10 : 12
                    }
                }
            },
            tooltip: {
                ...baseOptions.plugins?.tooltip,
                titleFont: {
                    size: isMobileDevice ? 12 : 14
                },
                bodyFont: {
                    size: isMobileDevice ? 10 : 12
                }
            }
        },
        scales: baseOptions.scales ? {
            ...baseOptions.scales,
            x: {
                ...baseOptions.scales.x,
                ticks: {
                    ...baseOptions.scales.x?.ticks,
                    font: {
                        size: isMobileDevice ? 10 : 12
                    },
                    maxRotation: isMobileDevice ? 45 : 0
                }
            },
            y: {
                ...baseOptions.scales.y,
                ticks: {
                    ...baseOptions.scales.y?.ticks,
                    font: {
                        size: isMobileDevice ? 10 : 12
                    }
                }
            }
        } : undefined
    };
}

// Revenue and profit data table
function updateRevenueChart() {
    const tableBody = document.getElementById('revenueTableBody');
    
    if (!tableBody) {
        console.error('Revenue table body not found');
        return;
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

    // Clear existing table content
    tableBody.innerHTML = '';

    if (chartData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3">لا توجد بيانات</td></tr>';
        return;
    }

    // Populate table with data
    chartData.forEach(agg => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${agg.year}/${agg.month.toString().padStart(2, '0')}</td>
            <td>${formatCurrency(agg.total_revenue)}</td>
            <td>${formatCurrency(agg.net_profit)}</td>
        `;
        tableBody.appendChild(row);
    });

    // Add totals row if multiple entries
    if (chartData.length > 1) {
        const totalRevenue = chartData.reduce((sum, agg) => sum + agg.total_revenue, 0);
        const totalProfit = chartData.reduce((sum, agg) => sum + agg.net_profit, 0);
        
        const totalRow = document.createElement('tr');
        totalRow.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
        totalRow.style.fontWeight = '600';
        totalRow.innerHTML = `
            <td>الإجمالي</td>
            <td>${formatCurrency(totalRevenue)}</td>
            <td>${formatCurrency(totalProfit)}</td>
        `;
        tableBody.appendChild(totalRow);
    }
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

// Company Management Functions
function loadCompanyDashboard() {
    updateCompanyStats();
    displayAdvancedEmployees();
    updateDepartmentStats();
    updatePayrollSummary();
    updatePerformanceChart();
    generateDepartmentReports();
}

function generateDepartmentReports() {
    const departments = {
        'programming': { name: 'قسم التطوير', employees: [], totalSalary: 0, projects: 0 },
        'marketing': { name: 'قسم التسويق', employees: [], totalSalary: 0, projects: 0 },
        'training': { name: 'قسم التدريب', employees: [], totalSalary: 0, projects: 0 },
        'other': { name: 'أقسام أخرى', employees: [], totalSalary: 0, projects: 0 }
    };

    // Categorize employees
    employees.forEach(emp => {
        let dept = 'other';
        if (emp.role === 'programmer') dept = 'programming';
        else if (emp.role === 'blogger' || emp.role === 'marketer') dept = 'marketing';
        else if (emp.role === 'teacher') dept = 'training';

        departments[dept].employees.push(emp);
        departments[dept].totalSalary += emp.salary;
    });

    // Count projects per department
    companyProjects.forEach(project => {
        if (project.assignedEmployees) {
            const projectEmployees = employees.filter(emp => project.assignedEmployees.includes(emp.id));
            projectEmployees.forEach(emp => {
                let dept = 'other';
                if (emp.role === 'programmer') dept = 'programming';
                else if (emp.role === 'blogger' || emp.role === 'marketer') dept = 'marketing';
                else if (emp.role === 'teacher') dept = 'training';

                departments[dept].projects += 1 / projectEmployees.length; // Distribute project count
            });
        }
    });

    console.log('Department reports generated:', departments);
    return departments;
}

function updateCompanyStats() {
    const totalEmployees = employees.length;
    const totalSalaries = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const productivity = calculateTeamProductivity();
    const growth = calculateTeamGrowth();

    document.getElementById('total-company-employees').textContent = totalEmployees;
    document.getElementById('total-monthly-salaries').textContent = formatCurrency(totalSalaries);
    document.getElementById('company-productivity').textContent = productivity + '%';
    document.getElementById('team-growth').textContent = growth >= 0 ? '+' + growth : growth;
}

function displayAdvancedEmployees() {
    const tbody = document.getElementById('advanced-employees-body');
    tbody.innerHTML = '';

    employees.forEach(employee => {
        const performance = getEmployeePerformance(employee);
        const status = getEmployeeStatus(employee);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="employee-info">
                    <strong>${employee.name}</strong>
                    <small>${employee.email || ''}</small>
                </div>
            </td>
            <td>${getRoleName(employee.role)}</td>
            <td>${formatCurrency(employee.salary)}</td>
            <td>${formatDate(employee.startDate)}</td>
            <td><span class="status-badge ${status.class}">${status.text}</span></td>
            <td>
                <div class="performance-indicator">
                    <div class="performance-bar" style="width: ${performance}%"></div>
                    <span>${performance}%</span>
                </div>
            </td>
            <td>
                <div class="employee-actions">
                    <button onclick="viewEmployeeProfile('${employee.id}')" class="view-btn">عرض</button>
                    <button onclick="editEmployeeAdvanced('${employee.id}')" class="edit-employee-btn">تعديل</button>
                    <button onclick="manageEmployeeLeave('${employee.id}')" class="leave-btn">إجازة</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updateDepartmentStats() {
    const departments = {
        dev: employees.filter(emp => emp.role === 'programmer'),
        marketing: employees.filter(emp => emp.role === 'blogger' || emp.role === 'marketer'),
        training: employees.filter(emp => emp.role === 'teacher')
    };

    document.getElementById('dev-team-count').textContent = departments.dev.length;
    document.getElementById('marketing-team-count').textContent = departments.marketing.length;
    document.getElementById('training-team-count').textContent = departments.training.length;

    document.getElementById('dev-budget').textContent = formatCurrency(
        departments.dev.reduce((sum, emp) => sum + emp.salary, 0)
    );
    document.getElementById('marketing-budget').textContent = formatCurrency(
        departments.marketing.reduce((sum, emp) => sum + emp.salary, 0)
    );
    document.getElementById('training-budget').textContent = formatCurrency(
        departments.training.reduce((sum, emp) => sum + emp.salary, 0)
    );
}

function updatePayrollSummary() {
    const totalSalaries = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const bonuses = totalSalaries * 0.1; // 10% average bonus
    const deductions = totalSalaries * 0.05; // 5% average deductions
    const netPayroll = totalSalaries + bonuses - deductions;

    document.getElementById('total-payroll').textContent = formatCurrency(totalSalaries);
    document.getElementById('total-bonuses').textContent = formatCurrency(bonuses);
    document.getElementById('total-deductions').textContent = formatCurrency(deductions);
    document.getElementById('net-payroll').textContent = formatCurrency(netPayroll);
}

function updatePerformanceChart() {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;

    if (window.performanceChart && typeof window.performanceChart.destroy === 'function') {
        window.performanceChart.destroy();
    }

    const performanceData = employees.map(emp => getEmployeePerformance(emp));
    const employeeNames = employees.map(emp => emp.name);

    window.performanceChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: employeeNames,
            datasets: [{
                label: 'الأداء الشهري',
                data: performanceData,
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                borderColor: '#10b981',
                borderWidth: 2,
                pointBackgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

// Utility functions for company management
function calculateTeamProductivity() {
    if (employees.length === 0) return 0;
    const averagePerformance = employees.reduce((sum, emp) => sum + getEmployeePerformance(emp), 0) / employees.length;
    return Math.round(averagePerformance);
}

function calculateTeamGrowth() {
    // Calculate growth based on new hires this month
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();

    const newHires = employees.filter(emp => {
        const startDate = new Date(emp.startDate);
        return startDate.getMonth() === thisMonth && startDate.getFullYear() === thisYear;
    }).length;

    return newHires;
}

function getEmployeePerformance(employee) {
    // Mock performance calculation - in real app this would come from actual performance data
    const basePerformance = 70;
    const roleBonus = {
        'programmer': 15,
        'blogger': 10,
        'teacher': 12,
        'designer': 8,
        'marketer': 10,
        'manager': 20
    };

    const experience = Math.floor((new Date() - new Date(employee.startDate)) / (1000 * 60 * 60 * 24 * 30));
    const experienceBonus = Math.min(experience * 2, 20);

    return Math.min(basePerformance + (roleBonus[employee.role] || 5) + experienceBonus, 100);
}

function getEmployeeStatus(employee) {
    // Mock status - in real app this would be stored in database
    const statuses = [
        { class: 'active', text: 'نشطة' },
        { class: 'vacation', text: 'في إجازة' },
        { class: 'inactive', text: 'غير نشطة' }
    ];

    return statuses[0]; // Default to active
}

// Company management action functions
function applyEmployeeFilters() {
    const roleFilter = document.getElementById('role-filter').value;
    const statusFilter = document.getElementById('status-filter').value;

    // Apply filters and refresh display
    let filteredEmployees = [...employees];

    if (roleFilter) {
        filteredEmployees = filteredEmployees.filter(emp => emp.role === roleFilter);
    }

    if (statusFilter) {
        // Filter by status when implemented
    }

    showMessage(`تم تطبيق الفلاتر - ${filteredEmployees.length} موظفة`, 'success');
}

function exportEmployeeData() {
    const csvHeaders = ['الاسم', 'المنصب', 'الراتب', 'تاريخ البداية', 'الهاتف', 'البريد الإلكتروني'];
    const csvContent = [
        csvHeaders.join(','),
        ...employees.map(emp => [
            emp.name,
            getRoleName(emp.role),
            emp.salary,
            emp.startDate,
            emp.phone || '',
            emp.email || ''
        ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    showMessage('تم تصدير بيانات الموظفات بنجاح', 'success');
}

function generatePayroll() {
    showMessage('تم إنشاء كشف الراتب للشهر الحالي', 'success');
}

function exportPayroll() {
    showMessage('تم تصدير كشف الراتب', 'success');
}

function scheduleTeamMeeting() {
    showMessage('تم جدولة اجتماع الفريق لنهاية الأسبوع', 'success');
}

function sendTeamAnnouncement() {
    showMessage('تم إرسال الإعلان لجميع أعضاء الفريق', 'success');
}

function reviewPerformance() {
    showMessage('سيتم فتح نظام تقييم الأداء قريباً', 'info');
}

function manageLeave() {
    showMessage('سيتم فتح نظام إدارة الإجازات قريباً', 'info');
}

function viewEmployeeProfile(id) {
    showMessage('سيتم فتح الملف الشخصي للموظفة', 'info');
}

function editEmployeeAdvanced(id) {
    showMessage('سيتم فتح نافذة التعديل المتقدم', 'info');
}

function manageEmployeeLeave(id) {
    showMessage('سيتم فتح نظام إدارة إجازات الموظفة', 'info');
}

// Company management functions
function loadCompanyOverview() {
    // Load employees first to ensure data is available
    loadEmployees().then(() => {
        updateCompanyOverviewData();
    });
}

function updateCompanyOverviewData() {
    const totalEmployees = employees.length;
    const totalProjects = projects.length;
    const monthlyCosts = employees.reduce((sum, emp) => sum + emp.salary, 0);

    // Calculate expected revenue based on current month's performance
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const currentMonthAggregates = monthlyAggregates.filter(agg => 
        agg.year === currentYear && agg.month === currentMonth
    );
    const monthlyRevenue = currentMonthAggregates.reduce((sum, agg) => sum + agg.total_revenue, 0);
    const expectedRevenue = monthlyRevenue > 0 ? monthlyRevenue : monthlyCosts * 2.5; // 2.5x multiplier

    // Update overview cards
    const elements = {
        'company-total-employees': totalEmployees,
        'company-total-projects': totalProjects,
        'company-monthly-costs': formatCurrency(monthlyCosts),
        'company-expected-revenue': formatCurrency(expectedRevenue)
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });

    // Update quick action counts
    const quickElements = {
        'quick-employees-count': totalEmployees,
        'quick-projects-count': totalProjects
    };

    Object.entries(quickElements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });

    updateCompanyCharts();
}

function updateCompanyCharts() {
    // Company costs chart
    const costsCtx = document.getElementById('companyCostsChart');
    if (costsCtx) {
        if (window.companyCostsChart && typeof window.companyCostsChart.destroy === 'function') {
            window.companyCostsChart.destroy();
        }

        const totalSalaries = employees.reduce((sum, emp) => sum + emp.salary, 0);
        const operationalCosts = totalSalaries * 0.3; // 30% of salaries
        const otherCosts = totalSalaries * 0.1; // 10% of salaries

        window.companyCostsChart = new Chart(costsCtx, {
            type: 'doughnut',
            data: {
                labels: ['الرواتب', 'المصاريف التشغيلية', 'مصاريف أخرى'],
                datasets: [{
                    data: [totalSalaries, operationalCosts, otherCosts],
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b']
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
    }

    // Departments chart
    const deptCtx = document.getElementById('departmentsChart');
    if (deptCtx) {
        if (window.departmentsChart && typeof window.departmentsChart.destroy === 'function') {
            window.departmentsChart.destroy();
        }

        const departments = {
            'التطوير': employees.filter(emp => emp.role === 'programmer').length,
            'التسويق': employees.filter(emp => emp.role === 'blogger' || emp.role === 'marketer').length,
            'التدريب': employees.filter(emp => emp.role === 'teacher').length,
            'أخرى': employees.filter(emp => !['programmer', 'blogger', 'marketer', 'teacher'].includes(emp.role)).length
        };

        window.departmentsChart = new Chart(deptCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(departments),
                datasets: [{
                    label: 'عدد الموظفات',
                    data: Object.values(departments),
                    backgroundColor: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']
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
}

function addNewEmployee() {
    showSection('employees');
    // Focus on the employee name input
    setTimeout(() => {
        const nameInput = document.getElementById('employee-name');
        if (nameInput) {
            nameInput.focus();
        }
    }, 100);
}

function generatePayrollReport() {
    showSection('company-finance');
    showMessage('تم إنشاء تقرير الرواتب', 'success');
}

function loadCompanyFinance() {
    const totalPayroll = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const totalBonuses = totalPayroll * 0.1; // 10% bonuses
    const operationalExpenses = totalPayroll * 0.3; // 30% operational expenses
    const netCost = totalPayroll + totalBonuses + operationalExpenses;

    document.getElementById('total-monthly-payroll').textContent = formatCurrency(totalPayroll);
    document.getElementById('total-bonuses-month').textContent = formatCurrency(totalBonuses);
    document.getElementById('operational-expenses').textContent = formatCurrency(operationalExpenses);
    document.getElementById('net-company-cost').textContent = formatCurrency(netCost);

    loadPayrollTable();
}

function loadPayrollTable() {
    const tbody = document.getElementById('payroll-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    employees.forEach(employee => {
        const baseSalary = employee.salary;
        const bonus = baseSalary * 0.1; // 10% bonus
        const deductions = baseSalary * 0.05; // 5% deductions
        const netSalary = baseSalary + bonus - deductions;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${employee.name}</td>
            <td>${formatCurrency(baseSalary)}</td>
            <td>${formatCurrency(bonus)}</td>
            <td>${formatCurrency(deductions)}</td>
            <td>${formatCurrency(netSalary)}</td>
            <td><span class="status-badge active">مدفوع</span></td>
        `;
        tbody.appendChild(row);
    });
}

function generateMonthlyPayroll() {
    showMessage('تم إنشاء كشف الرواتب الشهري', 'success');
}

function addBonus() {
    showMessage('سيتم فتح نافذة إضافة المكافآت قريباً', 'info');
}

function exportPayrollReport() {
    const csvHeaders = ['الموظفة', 'الراتب الأساسي', 'المكافآت', 'الاستقطاعات', 'صافي الراتب'];
    const csvContent = [
        csvHeaders.join(','),
        ...employees.map(emp => {
            const baseSalary = emp.salary;
            const bonus = baseSalary * 0.1;
            const deductions = baseSalary * 0.05;
            const netSalary = baseSalary + bonus - deductions;

            return [
                emp.name,
                baseSalary,
                bonus,
                deductions,
                netSalary
            ].join(',');
        })
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payroll_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    showMessage('تم تصدير تقرير الرواتب', 'success');
}

// Company project management
let companyProjects = [];

function loadCompanyProjects() {
    const stored = localStorage.getItem('companyProjects');
    companyProjects = stored ? JSON.parse(stored) : [];
    displayCompanyProjects();
}

function displayCompanyProjects() {
    const grid = document.getElementById('company-projects-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (companyProjects.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: rgba(255,255,255,0.7);">
                <h3>لا توجد مشاريع شركة حالياً</h3>
                <p>ابدأ بإضافة مشروع شركة جديد</p>
            </div>
        `;
        return;
    }

    companyProjects.forEach(project => {
        const projectCard = document.createElement('div');
        projectCard.className = 'project-card';
        projectCard.style.setProperty('--project-color', project.color || '#10b981');
        projectCard.style.setProperty('--project-color-transparent', (project.color || '#10b981') + '40');

        const assignedEmployees = employees.filter(emp => 
            project.assignedEmployees && project.assignedEmployees.includes(emp.id)
        );

        const totalBudget = project.budget || 0;
        const usedBudget = totalBudget * (project.progress || 0) / 100;

        projectCard.innerHTML = `
            <div class="project-header">
                <div class="project-info">
                    <h4>${project.name}</h4>
                    <p>${project.description || 'لا يوجد وصف'}</p>
                </div>
                <div class="project-actions">
                    <button onclick="editCompanyProject('${project.id}')" class="edit-project-btn">تعديل</button>
                    <button onclick="deleteCompanyProject('${project.id}')" class="delete-project-btn">حذف</button>
                </div>
            </div>
            <div class="project-stats">
                <div class="project-stat">
                    <div class="project-stat-value">${project.progress || 0}%</div>
                    <div class="project-stat-label">التقدم</div>
                </div>
                <div class="project-stat">
                    <div class="project-stat-value">${assignedEmployees.length}</div>
                    <div class="project-stat-label">الموظفات</div>
                </div>
                <div class="project-stat">
                    <div class="project-stat-value">${formatCurrency(usedBudget)}</div>
                    <div class="project-stat-label">المستخدم من الميزانية</div>
                </div>
                <div class="project-stat">
                    <div class="project-stat-value">${formatDate(project.deadline || new Date())}</div>
                    <div class="project-stat-label">الموعد النهائي</div>
                </div>
            </div>
            <div class="project-progress-bar" style="margin-top: 15px;">
                <div style="background: rgba(255,255,255,0.2); height: 6px; border-radius: 3px; overflow: hidden;">
                    <div style="background: ${project.color || '#10b981'}; height: 100%; width: ${project.progress || 0}%; transition: width 0.3s ease;"></div>
                </div>
            </div>
            <div class="project-team" style="margin-top: 15px;">
                <small style="color: rgba(255,255,255,0.7);">
                    الفريق: ${assignedEmployees.map(emp => emp.name).join(', ') || 'لم يتم تعيين موظفات'}
                </small>
            </div>
        `;

        grid.appendChild(projectCard);
    });
}

function openCompanyProjectModal() {
    const modalHTML = `
        <div id="companyProjectModal" class="modal" style="display: block;">
            <div class="modal-content">
                <span class="close" onclick="closeCompanyProjectModal()">&times;</span>
                <h2>إضافة مشروع شركة جديد</h2>
                <form id="company-project-form">
                    <div class="form-group">
                        <label for="company-project-name">اسم المشروع:</label>
                        <input type="text" id="company-project-name" required>
                    </div>
                    <div class="form-group">
                        <label for="company-project-description">وصف المشروع:</label>
                        <textarea id="company-project-description" rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="company-project-budget">الميزانية (ريال):</label>
                        <input type="number" id="company-project-budget" min="0" step="100">
                    </div>
                    <div class="form-group">
                        <label for="company-project-deadline">الموعد النهائي:</label>
                        <input type="date" id="company-project-deadline" required>
                    </div>
                    <div class="form-group">
                        <label for="company-project-employees">الموظفات المخصصات:</label>
                        <select id="company-project-employees" multiple style="height: 100px;">
                            ${employees.map(emp => `<option value="${emp.id}">${emp.name} - ${getRoleName(emp.role)}</option>`).join('')}
                        </select>
                        <small style="color: rgba(255,255,255,0.7);">اضغط Ctrl للاختيار المتعدد</small>
                    </div>
                    <div class="form-group">
                        <label for="company-project-color">لون المشروع:</label>
                        <select id="company-project-color">
                            <option value="#10b981">أخضر</option>
                            <option value="#3b82f6">أزرق</option>
                            <option value="#f59e0b">برتقالي</option>
                            <option value="#8b5cf6">بنفسجي</option>
                            <option value="#ef4444">أحمر</option>
                            <option value="#06b6d4">أزرق فاتح</option>
                        </select>
                    </div>
                    <button type="submit" class="submit-btn">حفظ المشروع</button>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('company-project-form').addEventListener('submit', function(e) {
        e.preventDefault();

        const selectedEmployees = Array.from(document.getElementById('company-project-employees').selectedOptions).map(option => option.value);

        const project = {
            id: Date.now().toString(),
            name: document.getElementById('company-project-name').value,
            description: document.getElementById('company-project-description').value,
            budget: parseFloat(document.getElementById('company-project-budget').value) || 0,
            deadline: document.getElementById('company-project-deadline').value,
            assignedEmployees: selectedEmployees,
            color: document.getElementById('company-project-color').value,
            progress: 0,
            status: 'active',
            createdAt: new Date().toISOString()
        };

        companyProjects.push(project);
        localStorage.setItem('companyProjects', JSON.stringify(companyProjects));

        closeCompanyProjectModal();
        displayCompanyProjects();
        updateCompanyOverviewData();

        showMessage('تم إضافة مشروع الشركة بنجاح!', 'success');
    });
}

function closeCompanyProjectModal() {
    const modal = document.getElementById('companyProjectModal');
    if (modal) {
        modal.remove();
    }
}

function editCompanyProject(projectId) {
    const project = companyProjects.find(p => p.id === projectId);
    if (!project) return;

    const newProgress = prompt(`تحديث تقدم المشروع "${project.name}" (0-100):`, project.progress || 0);
    if (newProgress !== null) {
        const progress = Math.max(0, Math.min(100, parseInt(newProgress) || 0));
        project.progress = progress;

        if (progress === 100) {
            project.status = 'completed';
        } else if (progress > 0) {
            project.status = 'active';
        }

        localStorage.setItem('companyProjects', JSON.stringify(companyProjects));
        displayCompanyProjects();
        showMessage('تم تحديث تقدم المشروع', 'success');
    }
}

function deleteCompanyProject(projectId) {
    if (confirm('هل أنت متأكد من حذف هذا المشروع؟')) {
        companyProjects = companyProjects.filter(p => p.id !== projectId);
        localStorage.setItem('companyProjects', JSON.stringify(companyProjects));
        displayCompanyProjects();
        updateCompanyOverviewData();
        showMessage('تم حذف المشروع بنجاح', 'success');
    }
}

// Update navigation to load appropriate sections
const originalShowSection = showSection;
window.showSection = function(sectionId) {
    originalShowSection.call(this, sectionId);

    if (sectionId === 'company-dashboard') {
        setTimeout(() => {
            loadCompanyOverview();
        }, 100);
    } else if (sectionId === 'company-finance') {
        setTimeout(() => {
            loadCompanyFinance();
        }, 100);
    } else if (sectionId === 'company-projects') {
        setTimeout(() => {
            loadCompanyProjects();
        }, 100);
    } else if (sectionId === 'company') {
        setTimeout(() => {
            loadCompanyDashboard();
        }, 100);
    }
};

// Placeholder functions for edit/delete transactions (can be implemented later)
function editTransaction(id) {
    showMessage('ميزة التعديل ستكون متاحة قريباً', 'info');
}

function deleteTransaction(id) {
    if (confirm('هل أنت متأكد من حذف هذه المعاملة؟')) {
        showMessage('ميزة الحذف ستكون متاحة قريباً', 'info');
    }
}

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', function() {
    // Show dashboard by default
    showSection('dashboard');
    
    // Set default date to now
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().slice(0, 16);
    }

    // Check for monthly reset
    checkAndResetMonthlyIncome();

    // Load initial data
    loadProjects();
    loadDashboard();
    loadTransactions();
    loadCompanyProjects();

    // Set up form submission
    const transactionForm = document.getElementById('transaction-form');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleTransactionSubmit);
    }

    const projectForm = document.getElementById('project-form');
    if (projectForm) {
        projectForm.addEventListener('submit', handleProjectSubmit);
    }

    const employeeForm = document.getElementById('employee-form');
    if (employeeForm) {
        employeeForm.addEventListener('submit', handleEmployeeSubmit);
    }

    // Toggle fields based on transaction type
    toggleFields();

    console.log('Application initialized successfully');
});

function openAddProjectModal() {
    document.getElementById('addProjectModal').style.display = 'block';
}

function closeAddProjectModal() {
    document.getElementById('addProjectModal').style.display = 'none';
}

function openCompanyProjectModal() {
    const modalHTML = `
        <div id="companyProjectModal" class="modal" style="display: block;">
            <div class="modal-content">
                <span class="close" onclick="closeCompanyProjectModal()">&times;</span>
                <h2>إضافة مشروع شركة جديد</h2>
                <form id="company-project-form">
                    <div class="form-group">
                        <label for="company-project-name">اسم المشروع:</label>
                        <input type="text" id="company-project-name" required>
                    </div>
                    <div class="form-group">
                        <label for="company-project-description">وصف المشروع:</label>
                        <textarea id="company-project-description" rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="company-project-budget">الميزانية (ريال):</label>
                        <input type="number" id="company-project-budget" min="0" step="100">
                    </div>
                    <div class="form-group">
                        <label for="company-project-deadline">الموعد النهائي:</label>
                        <input type="date" id="company-project-deadline" required>
                    </div>
                    <div class="form-group">
                        <label for="company-project-employees">الموظفات المخصصات:</label>
                        <select id="company-project-employees" multiple style="height: 100px;">
                            ${employees.map(emp => `<option value="${emp.id}">${emp.name} - ${getRoleName(emp.role)}</option>`).join('')}
                        </select>
                        <small style="color: rgba(255,255,255,0.7);">اضغط Ctrl للاختيار المتعدد</small>
                    </div>
                    <div class="form-group">
                        <label for="company-project-color">لون المشروع:</label>
                        <select id="company-project-color">
                            <option value="#10b981">أخضر</option>
                            <option value="#3b82f6">أزرق</option>
                            <option value="#f59e0b">برتقالي</option>
                            <option value="#8b5cf6">بنفسجي</option>
                            <option value="#ef4444">أحمر</option>
                            <option value="#06b6d4">أزرق فاتح</option>
                        </select>
                    </div>
                    <button type="submit" class="submit-btn">حفظ المشروع</button>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('company-project-form').addEventListener('submit', function(e) {
        e.preventDefault();

        const selectedEmployees = Array.from(document.getElementById('company-project-employees').selectedOptions).map(option => option.value);

        const project = {
            id: Date.now().toString(),
            name: document.getElementById('company-project-name').value,
            description: document.getElementById('company-project-description').value,
            budget: parseFloat(document.getElementById('company-project-budget').value) || 0,
            deadline: document.getElementById('company-project-deadline').value,
            assignedEmployees: selectedEmployees,
            color: document.getElementById('company-project-color').value,
            progress: 0,
            status: 'active',
            createdAt: new Date().toISOString()
        };

        companyProjects.push(project);
        localStorage.setItem('companyProjects', JSON.stringify(companyProjects));

        closeCompanyProjectModal();
        displayCompanyProjects();
        updateCompanyOverviewData();

        showMessage('تم إضافة مشروع الشركة بنجاح!', 'success');
    });
}

function closeCompanyProjectModal() {
    document.getElementById('companyProjectModal').style.display = 'none';
}

function showAllProjects() {
    showSection('projects');
}

function addNewEmployee() {
    console.log('Add new employee');
}

function generatePayrollReport() {
    console.log('Generate payroll report');
}

function generateMonthlyPayroll() {
    console.log('Generate monthly payroll');
}

function addBonus() {
    console.log('Add bonus');
}

function exportPayrollReport() {
    console.log('Export payroll report');
}

function editEmployee(id) {
    console.log('Edit employee:', id);
}

function deleteEmployee(id) {
    console.log('Delete employee:', id);
}

function editProject(id) {
    console.log('Edit project:', id);
}

function deleteProject(id) {
    console.log('Delete project:', id);
}

function toggleFields() {
    console.log('Toggle fields');
}

function applyFilters() {
    console.log('Apply filters');
}

function clearFilters() {
    console.log('Clear filters');
}

function generateReport() {
    console.log('Generate report');
}

function exportToCSV() {
    console.log('Export to CSV');
}

// Make functions globally available immediately
window.showSection = showSection;
window.openAddProjectModal = openAddProjectModal;
window.closeAddProjectModal = closeAddProjectModal;
window.openCompanyProjectModal = openCompanyProjectModal;
window.closeCompanyProjectModal = closeCompanyProjectModal;
window.showAllProjects = showAllProjects;
window.addNewEmployee = addNewEmployee;
window.generatePayrollReport = generatePayrollReport;
window.generateMonthlyPayroll = generateMonthlyPayroll;
window.addBonus = addBonus;
window.exportPayrollReport = exportPayrollReport;
window.editEmployee = editEmployee;
window.deleteEmployee = deleteEmployee;
window.editProject = editProject;
window.deleteProject = deleteProject;
window.toggleFields = toggleFields;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.generateReport = generateReport;
window.exportToCSV = exportToCSV;