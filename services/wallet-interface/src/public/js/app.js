// EchoPay Wallet Interface JavaScript

class WalletApp {
    constructor() {
        this.socket = null;
        this.currentWallet = null;
        this.currentPage = 1;
        this.currentFilters = {
            category: 'all',
            search: ''
        };
        this.init();
    }

    async init() {
        // Check authentication
        const token = localStorage.getItem('authToken');
        if (!token) {
            this.redirectToLogin();
            return;
        }

        // Initialize Socket.IO
        this.initSocket();

        // Load user data
        await this.loadUserProfile();
        
        // Load wallet data
        await this.loadWalletDashboard();

        // Setup event listeners
        this.setupEventListeners();

        // Load initial transaction data
        await this.loadTransactions();
    }

    initSocket() {
        this.socket = io({
            auth: {
                token: localStorage.getItem('authToken')
            }
        });

        this.socket.on('connect', () => {
            console.log('Connected to server');
            if (this.currentWallet) {
                this.socket.emit('join-wallet', this.currentWallet.id);
            }
        });

        this.socket.on('transaction-update', (data) => {
            this.handleTransactionUpdate(data);
        });

        this.socket.on('fraud-alert', (data) => {
            this.showFraudAlert(data);
        });
    }

    async loadUserProfile() {
        try {
            const response = await this.apiCall('/api/auth/profile');
            const userData = response.user;
            
            document.getElementById('userName').textContent = `${userData.firstName} ${userData.lastName}`;
            
            // Load first wallet if available
            if (userData.wallets && userData.wallets.length > 0) {
                this.currentWallet = { id: userData.wallets[0] };
            }
        } catch (error) {
            console.error('Failed to load user profile:', error);
            this.redirectToLogin();
        }
    }

    async loadWalletDashboard() {
        if (!this.currentWallet) return;

        try {
            const response = await this.apiCall(`/api/wallet/${this.currentWallet.id}/dashboard`);
            
            // Update wallet display
            const wallet = response.wallet;
            document.getElementById('walletId').textContent = wallet.id.slice(0, 8) + '...';
            document.getElementById('walletBalance').textContent = this.formatCurrency(wallet.balance, wallet.currency);
            document.getElementById('pendingBalance').textContent = `${this.formatCurrency(wallet.pendingBalance, wallet.currency)} pending`;
            
            // Update quick stats
            document.getElementById('monthlySpending').textContent = this.formatCurrency(response.quickStats.monthlySpending, wallet.currency);
            document.getElementById('totalTransactions').textContent = response.quickStats.totalTransactions;
            
            // Update fraud score
            const fraudScore = response.quickStats.fraudScore;
            const fraudLevel = fraudScore > 0.7 ? 'High' : fraudScore > 0.3 ? 'Medium' : 'Low';
            document.getElementById('fraudScore').textContent = `Fraud Score: ${fraudLevel}`;
            
            // Show fraud alerts if any
            if (response.fraudAlerts && response.fraudAlerts.length > 0) {
                this.showFraudAlerts(response.fraudAlerts);
            }

            // Update analytics
            this.updateAnalytics(response.analytics);
            
        } catch (error) {
            console.error('Failed to load wallet dashboard:', error);
            this.showError('Failed to load wallet data');
        }
    }

    async loadTransactions(page = 1) {
        if (!this.currentWallet) return;

        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
                category: this.currentFilters.category,
                search: this.currentFilters.search
            });

            const response = await this.apiCall(`/api/wallet/${this.currentWallet.id}/transactions?${params}`);
            
            this.displayTransactions(response.transactions);
            this.updatePagination(response.pagination);
            
        } catch (error) {
            console.error('Failed to load transactions:', error);
            this.showError('Failed to load transactions');
        }
    }

    displayTransactions(transactions) {
        const container = document.getElementById('transactionList');
        
        if (transactions.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-4"></i>
                    <p>No transactions found</p>
                </div>
            `;
            return;
        }

        container.innerHTML = transactions.map(tx => `
            <div class="transaction-item bg-gray-50 rounded-lg p-4 cursor-pointer hover:shadow-md" data-transaction-id="${tx.id}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center ${this.getTransactionIconBg(tx.category)}">
                            <i class="fas ${this.getTransactionIcon(tx.category)} ${this.getTransactionIconColor(tx.category)}"></i>
                        </div>
                        <div>
                            <p class="font-medium text-gray-800">${tx.description || 'Transaction'}</p>
                            <p class="text-sm text-gray-500">${tx.relativeTime}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-semibold ${tx.category === 'sent' ? 'text-red-600' : 'text-green-600'}">
                            ${tx.category === 'sent' ? '-' : '+'}${tx.displayAmount}
                        </p>
                        <div class="flex items-center space-x-2">
                            <span class="text-xs px-2 py-1 rounded-full ${this.getStatusBadgeClass(tx.status)}">
                                ${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                            </span>
                            ${tx.fraudRisk === 'high' ? '<i class="fas fa-exclamation-triangle text-red-500 text-xs"></i>' : ''}
                            ${tx.isFlagged ? '<i class="fas fa-flag text-yellow-500 text-xs" title="Flagged for review"></i>' : ''}
                            <button class="flag-transaction-btn text-gray-400 hover:text-yellow-500 text-xs p-1" title="Flag transaction">
                                <i class="fas fa-flag"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // Add click listeners
        container.querySelectorAll('.transaction-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't show details if clicking on flag button
                if (e.target.closest('.flag-transaction-btn')) {
                    return;
                }
                this.showTransactionDetails(item.dataset.transactionId);
            });
            
            // Add flag button functionality
            const flagBtn = item.querySelector('.flag-transaction-btn');
            if (flagBtn) {
                flagBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showFlagTransactionModal(item.dataset.transactionId);
                });
            }
        });
    }

    updatePagination(pagination) {
        const paginationContainer = document.getElementById('pagination');
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');

        if (pagination.totalPages > 1) {
            paginationContainer.classList.remove('hidden');
            pageInfo.textContent = `Page ${pagination.currentPage} of ${pagination.totalPages}`;
            
            prevBtn.disabled = pagination.currentPage === 1;
            nextBtn.disabled = pagination.currentPage === pagination.totalPages;
            
            prevBtn.onclick = () => {
                if (pagination.currentPage > 1) {
                    this.currentPage = pagination.currentPage - 1;
                    this.loadTransactions(this.currentPage);
                }
            };
            
            nextBtn.onclick = () => {
                if (pagination.currentPage < pagination.totalPages) {
                    this.currentPage = pagination.currentPage + 1;
                    this.loadTransactions(this.currentPage);
                }
            };
        } else {
            paginationContainer.classList.add('hidden');
        }
    }

    async showTransactionDetails(transactionId) {
        try {
            const response = await this.apiCall(`/api/transactions/${transactionId}`);
            const transaction = response.transaction;

            const modal = document.getElementById('transactionModal');
            const detailsContainer = document.getElementById('transactionDetails');

            detailsContainer.innerHTML = `
                <div class="space-y-6">
                    <!-- Transaction Header -->
                    <div class="text-center">
                        <div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center ${this.getTransactionIconBg(this.categorizeTransaction(transaction))}">
                            <i class="fas ${this.getTransactionIcon(this.categorizeTransaction(transaction))} text-2xl ${this.getTransactionIconColor(this.categorizeTransaction(transaction))}"></i>
                        </div>
                        <h3 class="text-2xl font-bold mt-4">${transaction.formattedAmount}</h3>
                        <p class="text-gray-600">${transaction.description || 'Transaction'}</p>
                    </div>

                    <!-- Transaction Status -->
                    <div class="text-center">
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${this.getStatusBadgeClass(transaction.status)}">
                            <i class="fas ${transaction.statusDetails.icon} mr-2"></i>
                            ${transaction.statusDetails.message}
                        </span>
                    </div>

                    <!-- Transaction Details -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold mb-3">Transaction Details</h4>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="text-gray-600">Transaction ID:</span>
                                <span class="font-mono">${transaction.id}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Date:</span>
                                <span>${new Date(transaction.timestamp).toLocaleString()}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">From:</span>
                                <span class="font-mono">${transaction.fromWallet}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">To:</span>
                                <span class="font-mono">${transaction.toWallet}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Network Fee:</span>
                                <span>${this.formatCurrency(transaction.fees || 0, transaction.currency)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Fraud Analysis -->
                    ${transaction.fraudAnalysis ? `
                        <div class="bg-blue-50 rounded-lg p-4">
                            <h4 class="font-semibold mb-3">Security Analysis</h4>
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-600">Risk Level:</span>
                                <span class="px-2 py-1 rounded text-xs font-medium ${this.getRiskLevelClass(transaction.fraudAnalysis.riskLevel)}">
                                    ${transaction.fraudAnalysis.riskLevel.toUpperCase()}
                                </span>
                            </div>
                            <div class="text-sm text-gray-600">
                                Risk Score: ${(transaction.fraudAnalysis.riskScore * 100).toFixed(1)}%
                            </div>
                        </div>
                    ` : ''}

                    <!-- Action Buttons -->
                    <div class="flex space-x-3">
                        <button onclick="walletApp.downloadReceipt('${transaction.id}')" class="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-download mr-2"></i>Download Receipt
                        </button>
                        ${transaction.status === 'completed' ? `
                            <button onclick="walletApp.reportFraud('${transaction.id}')" class="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700">
                                <i class="fas fa-flag mr-2"></i>Report Issue
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');
            modal.classList.add('flex');
        } catch (error) {
            console.error('Failed to load transaction details:', error);
            this.showError('Failed to load transaction details');
        }
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        // Send money modal
        document.getElementById('sendBtn').addEventListener('click', () => {
            document.getElementById('sendModal').classList.remove('hidden');
            document.getElementById('sendModal').classList.add('flex');
        });

        document.getElementById('closeSendModal').addEventListener('click', () => {
            document.getElementById('sendModal').classList.add('hidden');
            document.getElementById('sendModal').classList.remove('flex');
        });

        document.getElementById('cancelSend').addEventListener('click', () => {
            document.getElementById('sendModal').classList.add('hidden');
            document.getElementById('sendModal').classList.remove('flex');
        });

        // Send form
        document.getElementById('sendForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMoney();
        });

        // Transaction modal
        document.getElementById('closeTransactionModal').addEventListener('click', () => {
            document.getElementById('transactionModal').classList.add('hidden');
            document.getElementById('transactionModal').classList.remove('flex');
        });

        // Filters
        document.getElementById('categoryFilter').addEventListener('change', (e) => {
            this.currentFilters.category = e.target.value;
            this.currentPage = 1;
            this.loadTransactions();
        });

        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.currentFilters.search = e.target.value;
                this.currentPage = 1;
                this.loadTransactions();
            }, 500);
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadWalletDashboard();
            this.loadTransactions();
        });

        // Flagged transactions button
        document.getElementById('flaggedTransactionsBtn').addEventListener('click', () => {
            this.showFlaggedTransactions();
        });

        // Settings
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active', 'border-blue-500', 'text-blue-600');
            btn.classList.add('border-transparent', 'text-gray-500');
        });
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active', 'border-blue-500', 'text-blue-600');
        document.querySelector(`[data-tab="${tabName}"]`).classList.remove('border-transparent', 'text-gray-500');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        document.getElementById(`${tabName}Tab`).classList.remove('hidden');

        // Load tab-specific data
        if (tabName === 'analytics') {
            this.loadAnalytics();
        } else if (tabName === 'settings') {
            this.loadSettings();
        }
    }

    async sendMoney() {
        const form = document.getElementById('sendForm');
        const formData = new FormData(form);
        
        const transactionData = {
            fromWallet: this.currentWallet.id,
            toWallet: document.getElementById('toWallet').value,
            amount: parseFloat(document.getElementById('amount').value),
            currency: 'USD-CBDC', // Default currency
            description: document.getElementById('description').value
        };

        try {
            const response = await this.apiCall('/api/transactions/send', 'POST', transactionData);
            
            // Close modal
            document.getElementById('sendModal').classList.add('hidden');
            document.getElementById('sendModal').classList.remove('flex');
            
            // Reset form
            form.reset();
            
            // Show success message
            this.showSuccess('Transaction sent successfully!');
            
            // Refresh data
            this.loadWalletDashboard();
            this.loadTransactions();
            
        } catch (error) {
            console.error('Failed to send transaction:', error);
            this.showError(error.message || 'Failed to send transaction');
        }
    }

    async saveSettings() {
        const settings = {
            notifications: document.getElementById('notificationsToggle').checked,
            fraudAlerts: document.getElementById('fraudAlertsToggle').checked,
            transactionLimits: {
                daily: parseFloat(document.getElementById('dailyLimit').value),
                single: parseFloat(document.getElementById('singleLimit').value)
            }
        };

        try {
            await this.apiCall(`/api/wallet/${this.currentWallet.id}/settings`, 'PUT', settings);
            this.showSuccess('Settings saved successfully!');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showError('Failed to save settings');
        }
    }

    async loadSettings() {
        if (!this.currentWallet) return;

        try {
            const response = await this.apiCall(`/api/wallet/${this.currentWallet.id}/settings`);
            const settings = response.settings;

            document.getElementById('notificationsToggle').checked = settings.notifications;
            document.getElementById('fraudAlertsToggle').checked = settings.fraudAlerts;
            document.getElementById('dailyLimit').value = settings.transactionLimits.daily;
            document.getElementById('singleLimit').value = settings.transactionLimits.single;
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    loadAnalytics() {
        // Mock analytics data - in production, this would come from the API
        const categoryData = {
            labels: ['Food', 'Transport', 'Shopping', 'Utilities', 'Entertainment', 'Other'],
            datasets: [{
                data: [300, 150, 200, 100, 80, 170],
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF',
                    '#FF9F40'
                ]
            }]
        };

        const trendData = {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Spending',
                data: [1200, 1900, 800, 1500, 2000, 1800],
                borderColor: '#36A2EB',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                fill: true
            }]
        };

        // Create charts
        this.createCategoryChart(categoryData);
        this.createTrendChart(trendData);
    }

    createCategoryChart(data) {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    createTrendChart(data) {
        const ctx = document.getElementById('trendChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    updateAnalytics(analytics) {
        // Update analytics data when available
        if (analytics && analytics.categories) {
            // Update charts with real data
            console.log('Analytics data:', analytics);
        }
    }

    handleTransactionUpdate(data) {
        // Handle real-time transaction updates
        console.log('Transaction update:', data);
        
        // Show notification
        this.showNotification(data.type, data.transaction);
        
        // Refresh data
        this.loadWalletDashboard();
        this.loadTransactions();
    }

    showFraudAlert(alert) {
        const alertContainer = document.getElementById('fraudAlerts');
        const alertMessage = document.getElementById('fraudAlertMessage');
        
        alertMessage.textContent = alert.message;
        alertContainer.classList.remove('hidden');
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            alertContainer.classList.add('hidden');
        }, 10000);
    }

    showFraudAlerts(alerts) {
        if (alerts.length > 0) {
            const alertContainer = document.getElementById('fraudAlerts');
            const alertMessage = document.getElementById('fraudAlertMessage');
            
            alertMessage.textContent = alerts[0].message;
            alertContainer.classList.remove('hidden');
        }
    }

    showNotification(type, data) {
        // Simple notification system
        const message = type === 'transaction-sent' ? 'Transaction sent successfully' :
                       type === 'transaction-received' ? 'Money received' :
                       type === 'transaction-cancelled' ? 'Transaction cancelled' :
                       'Transaction updated';
        
        this.showSuccess(message);
    }

    async downloadReceipt(transactionId) {
        try {
            const response = await this.apiCall(`/api/transactions/${transactionId}/receipt`);
            
            // Create and download receipt
            const receiptData = response.receipt;
            const receiptText = this.generateReceiptText(receiptData);
            
            const blob = new Blob([receiptText], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `echopay-receipt-${transactionId.slice(-8)}.txt`;
            a.click();
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Failed to download receipt:', error);
            this.showError('Failed to download receipt');
        }
    }

    generateReceiptText(receipt) {
        return `
ECHOPAY TRANSACTION RECEIPT
===========================

Transaction ID: ${receipt.transactionId}
Confirmation: ${receipt.confirmationNumber}
Date: ${new Date(receipt.timestamp).toLocaleString()}

Amount: ${this.formatCurrency(receipt.amount, receipt.currency)}
Network Fee: ${this.formatCurrency(receipt.fees, receipt.currency)}
Total: ${this.formatCurrency(receipt.amount + receipt.fees, receipt.currency)}

From: ${receipt.fromWallet}
To: ${receipt.toWallet}
Description: ${receipt.description || 'N/A'}

Status: ${receipt.status.toUpperCase()}
Processing Time: ${receipt.processingTime}

Security Hash: ${receipt.securityHash}

Thank you for using EchoPay!
        `.trim();
    }

    reportFraud(transactionId) {
        // Redirect to fraud reporting interface
        window.location.href = `/fraud-report.html?transactionId=${transactionId}`;
    }

    // Utility methods
    async apiCall(endpoint, method = 'GET', data = null) {
        const token = localStorage.getItem('authToken');
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(endpoint, options);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'API call failed');
        }

        return response.json();
    }

    formatCurrency(amount, currency) {
        const symbol = currency.includes('USD') ? '$' : 
                      currency.includes('EUR') ? '€' : 
                      currency.includes('GBP') ? '£' : 
                      currency.includes('JPY') ? '¥' : '';
        
        return `${symbol}${Math.abs(amount).toFixed(2)}`;
    }

    categorizeTransaction(transaction) {
        if (transaction.status === 'pending') return 'pending';
        if (transaction.status === 'failed') return 'failed';
        return transaction.fromWallet === this.currentWallet?.id ? 'sent' : 'received';
    }

    getTransactionIcon(category) {
        const icons = {
            sent: 'fa-arrow-up',
            received: 'fa-arrow-down',
            pending: 'fa-clock',
            failed: 'fa-times'
        };
        return icons[category] || 'fa-exchange-alt';
    }

    getTransactionIconBg(category) {
        const backgrounds = {
            sent: 'bg-red-100',
            received: 'bg-green-100',
            pending: 'bg-yellow-100',
            failed: 'bg-gray-100'
        };
        return backgrounds[category] || 'bg-blue-100';
    }

    getTransactionIconColor(category) {
        const colors = {
            sent: 'text-red-600',
            received: 'text-green-600',
            pending: 'text-yellow-600',
            failed: 'text-gray-600'
        };
        return colors[category] || 'text-blue-600';
    }

    getStatusBadgeClass(status) {
        const classes = {
            completed: 'bg-green-100 text-green-800',
            pending: 'bg-yellow-100 text-yellow-800',
            failed: 'bg-red-100 text-red-800',
            cancelled: 'bg-gray-100 text-gray-800'
        };
        return classes[status] || 'bg-gray-100 text-gray-800';
    }

    getRiskLevelClass(level) {
        const classes = {
            low: 'bg-green-100 text-green-800',
            medium: 'bg-yellow-100 text-yellow-800',
            high: 'bg-red-100 text-red-800'
        };
        return classes[level] || 'bg-gray-100 text-gray-800';
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg text-white z-50 ${
            type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    redirectToLogin() {
        window.location.href = '/login.html';
    }

    logout() {
        localStorage.removeItem('authToken');
        this.redirectToLogin();
    }

    // Transaction flagging functionality
    async showFlaggedTransactions() {
        try {
            const response = await this.apiCall('/api/reversals/flagged-transactions');
            this.displayFlaggedTransactionsModal(response.flaggedTransactions);
        } catch (error) {
            console.error('Failed to load flagged transactions:', error);
            this.showError('Failed to load flagged transactions');
        }
    }

    displayFlaggedTransactionsModal(flaggedTransactions) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('flaggedTransactionsModal');
        if (!modal) {
            modal = this.createFlaggedTransactionsModal();
            document.body.appendChild(modal);
        }

        const container = modal.querySelector('#flaggedTransactionsList');
        
        if (flaggedTransactions.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-flag text-4xl mb-4"></i>
                    <p>No flagged transactions found</p>
                </div>
            `;
        } else {
            container.innerHTML = flaggedTransactions.map(flagged => `
                <div class="border border-gray-200 rounded-lg p-4 mb-4">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center space-x-2">
                            <i class="fas fa-flag text-yellow-500"></i>
                            <span class="font-medium">Transaction ${flagged.transactionId.slice(0, 8)}...</span>
                            <span class="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                                ${flagged.reason.replace('_', ' ').toUpperCase()}
                            </span>
                        </div>
                        <span class="text-sm text-gray-500">${flagged.relativeTime}</span>
                    </div>
                    ${flagged.transactionDetails ? `
                        <div class="text-sm text-gray-600 mb-2">
                            <div class="flex justify-between">
                                <span>Amount:</span>
                                <span class="font-medium">${this.formatCurrency(flagged.transactionDetails.amount, flagged.transactionDetails.currency)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>To:</span>
                                <span class="font-mono">${flagged.transactionDetails.toWallet}</span>
                            </div>
                        </div>
                    ` : ''}
                    <div class="flex space-x-2 mt-3">
                        <button onclick="walletApp.showTransactionDetails('${flagged.transactionId}')" 
                                class="text-blue-600 hover:text-blue-800 text-sm">
                            View Details
                        </button>
                        <button onclick="walletApp.unflagTransaction('${flagged.id}')" 
                                class="text-green-600 hover:text-green-800 text-sm">
                            Unflag
                        </button>
                    </div>
                </div>
            `).join('');
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    createFlaggedTransactionsModal() {
        const modal = document.createElement('div');
        modal.id = 'flaggedTransactionsModal';
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 hidden items-center justify-center z-50';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-labelledby', 'flaggedTransactionsTitle');
        modal.setAttribute('aria-modal', 'true');

        modal.innerHTML = `
            <div class="bg-white rounded-xl w-full max-w-4xl mx-4 max-h-screen overflow-y-auto">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <h3 id="flaggedTransactionsTitle" class="text-lg font-semibold text-gray-900">
                            <i class="fas fa-flag text-yellow-500 mr-2"></i>Flagged Transactions
                        </h3>
                        <button id="closeFlaggedTransactionsModal" class="text-gray-400 hover:text-gray-600" aria-label="Close modal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="p-6">
                    <div id="flaggedTransactionsList">
                        <!-- Content will be loaded dynamically -->
                    </div>
                </div>
            </div>
        `;

        // Add close event listener
        modal.querySelector('#closeFlaggedTransactionsModal').addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });

        return modal;
    }

    showFlagTransactionModal(transactionId) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('flagTransactionModal');
        if (!modal) {
            modal = this.createFlagTransactionModal();
            document.body.appendChild(modal);
        }

        // Set transaction ID in form
        modal.querySelector('#flagTransactionId').value = transactionId;
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.querySelector('#flagReason').focus();
    }

    createFlagTransactionModal() {
        const modal = document.createElement('div');
        modal.id = 'flagTransactionModal';
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 hidden items-center justify-center z-50';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-labelledby', 'flagTransactionTitle');
        modal.setAttribute('aria-modal', 'true');

        modal.innerHTML = `
            <div class="bg-white rounded-xl w-full max-w-md mx-4">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <h3 id="flagTransactionTitle" class="text-lg font-semibold text-gray-900">
                            <i class="fas fa-flag text-yellow-500 mr-2"></i>Flag Transaction
                        </h3>
                        <button id="closeFlagTransactionModal" class="text-gray-400 hover:text-gray-600" aria-label="Close modal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="p-6">
                    <form id="flagTransactionForm">
                        <input type="hidden" id="flagTransactionId" name="transactionId">
                        
                        <div class="space-y-4">
                            <div>
                                <label for="flagReason" class="block text-sm font-medium text-gray-700 mb-2">
                                    Reason for flagging
                                </label>
                                <select id="flagReason" name="reason" class="w-full border border-gray-300 rounded-lg px-3 py-2" required>
                                    <option value="">Select a reason</option>
                                    <option value="suspicious_activity">Suspicious Activity</option>
                                    <option value="potential_fraud">Potential Fraud</option>
                                    <option value="unusual_pattern">Unusual Pattern</option>
                                    <option value="high_risk">High Risk</option>
                                    <option value="manual_review">Manual Review Required</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            
                            <div>
                                <label for="flagDescription" class="block text-sm font-medium text-gray-700 mb-2">
                                    Description (Optional)
                                </label>
                                <textarea id="flagDescription" name="description" rows="3" 
                                          class="w-full border border-gray-300 rounded-lg px-3 py-2" 
                                          placeholder="Provide additional details about why you're flagging this transaction..."></textarea>
                            </div>
                            
                            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <div class="flex">
                                    <i class="fas fa-info-circle text-yellow-600 mt-0.5 mr-2"></i>
                                    <div class="text-sm text-yellow-800">
                                        <p class="font-medium mb-1">Note:</p>
                                        <p>Flagging a transaction will mark it for review and monitoring. This helps improve fraud detection for all users.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex space-x-3 mt-6">
                            <button type="button" id="cancelFlagTransaction" class="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
                                Cancel
                            </button>
                            <button type="submit" class="flex-1 bg-yellow-600 text-white py-2 rounded-lg hover:bg-yellow-700">
                                <i class="fas fa-flag mr-2"></i>Flag Transaction
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('#closeFlagTransactionModal').addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        });

        modal.querySelector('#cancelFlagTransaction').addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        });

        modal.querySelector('#flagTransactionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitTransactionFlag();
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });

        return modal;
    }

    async submitTransactionFlag() {
        try {
            const form = document.getElementById('flagTransactionForm');
            const formData = new FormData(form);
            
            const flagData = {
                transactionId: formData.get('transactionId'),
                reason: formData.get('reason'),
                description: formData.get('description')
            };

            const response = await this.apiCall('/api/reversals/flag-transaction', 'POST', flagData);
            
            // Close modal
            document.getElementById('flagTransactionModal').classList.add('hidden');
            document.getElementById('flagTransactionModal').classList.remove('flex');
            
            this.showSuccess('Transaction flagged successfully');
            
            // Refresh transactions to show flag
            this.loadTransactions();
            
        } catch (error) {
            console.error('Failed to flag transaction:', error);
            this.showError('Failed to flag transaction');
        }
    }

    async unflagTransaction(flagId) {
        try {
            await this.apiCall(`/api/reversals/unflag-transaction/${flagId}`, 'POST');
            this.showSuccess('Transaction unflagged successfully');
            
            // Refresh flagged transactions list
            this.showFlaggedTransactions();
            
            // Refresh main transactions list
            this.loadTransactions();
            
        } catch (error) {
            console.error('Failed to unflag transaction:', error);
            this.showError('Failed to unflag transaction');
        }
    }
}

// Initialize the app
const walletApp = new WalletApp();