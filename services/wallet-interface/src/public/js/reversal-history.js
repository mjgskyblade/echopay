// Reversal History Management
class ReversalHistoryManager {
    constructor() {
        this.socket = null;
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalItems = 0;
        this.filters = {
            status: 'all',
            time: 'all',
            type: 'all',
            search: ''
        };
        this.reversals = [];
        
        this.init();
    }

    init() {
        this.initializeSocket();
        this.bindEvents();
        this.loadReversalHistory();
        this.loadStatistics();
        this.checkAuthentication();
    }

    initializeSocket() {
        this.socket = io({
            auth: {
                token: localStorage.getItem('authToken')
            }
        });

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.socket.emit('join-user-room', this.getUserId());
        });

        this.socket.on('reversal-status-update', (data) => {
            this.handleReversalUpdate(data);
        });

        this.socket.on('new-reversal-created', (data) => {
            this.handleNewReversal(data);
        });

        this.socket.on('dispute-status-change', (data) => {
            this.handleDisputeUpdate(data);
        });
    }

    bindEvents() {
        // Navigation
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadReversalHistory();
            this.loadStatistics();
        });

        // Filters
        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.currentPage = 1;
            this.loadReversalHistory();
        });

        document.getElementById('timeFilter').addEventListener('change', (e) => {
            this.filters.time = e.target.value;
            this.currentPage = 1;
            this.loadReversalHistory();
        });

        document.getElementById('typeFilter').addEventListener('change', (e) => {
            this.filters.type = e.target.value;
            this.currentPage = 1;
            this.loadReversalHistory();
        });

        // Search
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.filters.search = document.getElementById('searchInput').value;
            this.currentPage = 1;
            this.loadReversalHistory();
        });

        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.filters.search = e.target.value;
                this.currentPage = 1;
                this.loadReversalHistory();
            }
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadReversalHistory();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            if (this.currentPage < Math.ceil(this.totalItems / this.itemsPerPage)) {
                this.currentPage++;
                this.loadReversalHistory();
            }
        });

        // Dispute Transaction
        document.getElementById('disputeTransactionBtn').addEventListener('click', () => {
            this.showDisputeModal();
        });

        document.getElementById('closeDisputeModal').addEventListener('click', () => {
            this.hideDisputeModal();
        });

        document.getElementById('cancelDispute').addEventListener('click', () => {
            this.hideDisputeModal();
        });

        document.getElementById('disputeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitDispute();
        });

        // Export History
        document.getElementById('exportHistoryBtn').addEventListener('click', () => {
            this.exportHistory();
        });

        // Modal close handlers
        document.getElementById('closeReversalModal').addEventListener('click', () => {
            this.hideReversalDetailModal();
        });

        // Keyboard accessibility
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllModals();
            }
        });
    }

    async checkAuthentication() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        try {
            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Authentication failed');
            }

            const userData = await response.json();
            document.getElementById('userName').textContent = userData.name || 'User';
        } catch (error) {
            console.error('Authentication error:', error);
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        }
    }

    async loadReversalHistory() {
        try {
            this.showLoading();
            
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.itemsPerPage,
                status: this.filters.status,
                time: this.filters.time,
                type: this.filters.type,
                search: this.filters.search
            });

            const response = await fetch(`/api/reversals/history?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load reversal history');
            }

            const data = await response.json();
            this.reversals = data.reversals;
            this.totalItems = data.totalCount;
            
            this.renderReversalList();
            this.updatePagination();
            
        } catch (error) {
            console.error('Error loading reversal history:', error);
            this.showError('Failed to load reversal history');
        }
    }

    async loadStatistics() {
        try {
            const response = await fetch('/api/reversals/statistics', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load statistics');
            }

            const stats = await response.json();
            this.updateStatistics(stats);
            
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    }

    renderReversalList() {
        const container = document.getElementById('reversalList');
        
        if (this.reversals.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-undo text-gray-400 text-4xl mb-4"></i>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">No Reversals Found</h3>
                    <p class="text-gray-500">You haven't initiated any transaction reversals yet.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.reversals.map(reversal => this.renderReversalCard(reversal)).join('');
        
        // Add click handlers for reversal cards
        container.querySelectorAll('.reversal-card').forEach(card => {
            card.addEventListener('click', () => {
                const reversalId = card.dataset.reversalId;
                this.showReversalDetails(reversalId);
            });
            
            // Add keyboard accessibility
            card.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const reversalId = card.dataset.reversalId;
                    this.showReversalDetails(reversalId);
                }
            });
        });
    }

    renderReversalCard(reversal) {
        const statusClass = this.getStatusClass(reversal.status);
        const typeIcon = this.getTypeIcon(reversal.type);
        const formattedAmount = this.formatCurrency(reversal.amount, reversal.currency);
        const relativeTime = this.getRelativeTime(reversal.createdAt);

        return `
            <div class="reversal-card p-6 hover:bg-gray-50 cursor-pointer transition-colors" 
                 data-reversal-id="${reversal.id}" 
                 tabindex="0" 
                 role="button"
                 aria-label="View details for reversal ${reversal.caseNumber}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="bg-gray-100 p-3 rounded-full">
                            <i class="${typeIcon} text-gray-600"></i>
                        </div>
                        <div>
                            <div class="flex items-center space-x-2 mb-1">
                                <h4 class="font-semibold text-gray-900">${reversal.caseNumber}</h4>
                                <span class="status-badge ${statusClass}">${this.formatStatus(reversal.status)}</span>
                            </div>
                            <p class="text-sm text-gray-600 mb-1">${reversal.description}</p>
                            <div class="flex items-center space-x-4 text-sm text-gray-500">
                                <span><i class="fas fa-calendar mr-1"></i>${relativeTime}</span>
                                <span><i class="fas fa-clock mr-1"></i>${reversal.estimatedResolution || 'TBD'}</span>
                                ${reversal.transactionId ? `<span><i class="fas fa-link mr-1"></i>${reversal.transactionId.slice(0, 8)}...</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-lg font-semibold text-gray-900">${formattedAmount}</div>
                        <div class="text-sm text-gray-500">${this.formatReversalType(reversal.type)}</div>
                        ${reversal.progress ? `
                            <div class="mt-2">
                                <div class="w-24 bg-gray-200 rounded-full h-2">
                                    <div class="bg-blue-600 h-2 rounded-full" style="width: ${reversal.progress.percentage}%"></div>
                                </div>
                                <div class="text-xs text-gray-500 mt-1">${reversal.progress.percentage}% complete</div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    async showReversalDetails(reversalId) {
        try {
            const response = await fetch(`/api/reversals/${reversalId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load reversal details');
            }

            const reversal = await response.json();
            this.renderReversalDetails(reversal);
            this.showReversalDetailModal();
            
        } catch (error) {
            console.error('Error loading reversal details:', error);
            this.showError('Failed to load reversal details');
        }
    }

    renderReversalDetails(reversal) {
        const container = document.getElementById('reversalDetailContent');
        const statusClass = this.getStatusClass(reversal.status);
        const formattedAmount = this.formatCurrency(reversal.amount, reversal.currency);

        container.innerHTML = `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="text-xl font-semibold text-gray-900">${reversal.caseNumber}</h4>
                        <p class="text-gray-600">${reversal.description}</p>
                    </div>
                    <span class="status-badge ${statusClass}">${this.formatStatus(reversal.status)}</span>
                </div>

                <!-- Key Information -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h5 class="font-medium text-gray-900 mb-3">Reversal Information</h5>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="text-gray-600">Amount:</span>
                                <span class="font-medium">${formattedAmount}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Type:</span>
                                <span class="font-medium">${this.formatReversalType(reversal.type)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Priority:</span>
                                <span class="font-medium">${reversal.priority || 'Normal'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Created:</span>
                                <span class="font-medium">${new Date(reversal.createdAt).toLocaleString()}</span>
                            </div>
                            ${reversal.estimatedResolution ? `
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Est. Resolution:</span>
                                    <span class="font-medium">${reversal.estimatedResolution}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    ${reversal.transactionDetails ? `
                        <div class="bg-gray-50 rounded-lg p-4">
                            <h5 class="font-medium text-gray-900 mb-3">Original Transaction</h5>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Transaction ID:</span>
                                    <span class="font-medium font-mono">${reversal.transactionDetails.id}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Date:</span>
                                    <span class="font-medium">${new Date(reversal.transactionDetails.timestamp).toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Recipient:</span>
                                    <span class="font-medium">${reversal.transactionDetails.toWallet}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Description:</span>
                                    <span class="font-medium">${reversal.transactionDetails.description || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Progress -->
                ${reversal.progress ? `
                    <div class="bg-blue-50 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-2">
                            <h5 class="font-medium text-gray-900">Progress</h5>
                            <span class="text-sm font-medium text-blue-600">${reversal.progress.percentage}% Complete</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                            <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: ${reversal.progress.percentage}%"></div>
                        </div>
                        <p class="text-sm text-gray-600">${reversal.progress.description}</p>
                    </div>
                ` : ''}

                <!-- Timeline -->
                ${reversal.timeline && reversal.timeline.length > 0 ? `
                    <div>
                        <h5 class="font-medium text-gray-900 mb-4">Timeline</h5>
                        <div class="space-y-4">
                            ${reversal.timeline.map(item => `
                                <div class="timeline-item">
                                    <div class="flex items-start justify-between">
                                        <div class="flex-1">
                                            <h6 class="font-medium text-gray-900">${item.title}</h6>
                                            <p class="text-sm text-gray-600 mt-1">${item.description}</p>
                                            ${item.details ? `<p class="text-xs text-gray-500 mt-1">${item.details}</p>` : ''}
                                        </div>
                                        <div class="text-sm text-gray-500 ml-4">
                                            ${new Date(item.timestamp).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Evidence -->
                ${reversal.evidence && reversal.evidence.length > 0 ? `
                    <div>
                        <h5 class="font-medium text-gray-900 mb-4">Evidence</h5>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            ${reversal.evidence.map(item => `
                                <div class="border border-gray-200 rounded-lg p-3">
                                    <div class="flex items-center space-x-3">
                                        <i class="fas fa-file-alt text-gray-400"></i>
                                        <div class="flex-1">
                                            <p class="text-sm font-medium text-gray-900">${item.name}</p>
                                            <p class="text-xs text-gray-500">${item.type} • ${item.size}</p>
                                        </div>
                                        <a href="${item.url}" target="_blank" class="text-blue-600 hover:text-blue-800">
                                            <i class="fas fa-external-link-alt"></i>
                                        </a>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Actions -->
                <div class="flex space-x-3 pt-4 border-t border-gray-200">
                    ${reversal.canAddEvidence ? `
                        <button id="addEvidenceBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-plus mr-2"></i>Add Evidence
                        </button>
                    ` : ''}
                    ${reversal.canCancel ? `
                        <button id="cancelReversalBtn" class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                            <i class="fas fa-times mr-2"></i>Cancel Reversal
                        </button>
                    ` : ''}
                    <button id="downloadReportBtn" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700">
                        <i class="fas fa-download mr-2"></i>Download Report
                    </button>
                </div>
            </div>
        `;

        // Bind action buttons
        const addEvidenceBtn = container.querySelector('#addEvidenceBtn');
        if (addEvidenceBtn) {
            addEvidenceBtn.addEventListener('click', () => {
                this.showAddEvidenceModal(reversal.id);
            });
        }

        const cancelReversalBtn = container.querySelector('#cancelReversalBtn');
        if (cancelReversalBtn) {
            cancelReversalBtn.addEventListener('click', () => {
                this.cancelReversal(reversal.id);
            });
        }

        const downloadReportBtn = container.querySelector('#downloadReportBtn');
        if (downloadReportBtn) {
            downloadReportBtn.addEventListener('click', () => {
                this.downloadReversalReport(reversal.id);
            });
        }
    }

    async submitDispute() {
        try {
            const form = document.getElementById('disputeForm');
            const formData = new FormData(form);

            const response = await fetch('/api/reversals/dispute', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to submit dispute');
            }

            const result = await response.json();
            
            this.hideDisputeModal();
            this.showSuccess('Dispute submitted successfully. Case number: ' + result.caseNumber);
            this.loadReversalHistory();
            this.loadStatistics();
            
        } catch (error) {
            console.error('Error submitting dispute:', error);
            this.showError('Failed to submit dispute');
        }
    }

    async exportHistory() {
        try {
            const response = await fetch('/api/reversals/export', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to export history');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reversal-history-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Error exporting history:', error);
            this.showError('Failed to export history');
        }
    }

    updateStatistics(stats) {
        document.getElementById('successfulReversals').textContent = stats.successful || 0;
        document.getElementById('pendingReversals').textContent = stats.pending || 0;
        document.getElementById('amountRecovered').textContent = this.formatCurrency(stats.amountRecovered || 0, 'USD');
        document.getElementById('successRate').textContent = (stats.successRate || 0) + '%';
    }

    updatePagination() {
        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);

        document.getElementById('showingStart').textContent = startItem;
        document.getElementById('showingEnd').textContent = endItem;
        document.getElementById('totalResults').textContent = this.totalItems;

        document.getElementById('prevPage').disabled = this.currentPage <= 1;
        document.getElementById('nextPage').disabled = this.currentPage >= totalPages;

        document.getElementById('pagination').classList.toggle('hidden', this.totalItems === 0);
    }

    // Event handlers
    handleReversalUpdate(data) {
        // Update reversal in local array
        const index = this.reversals.findIndex(r => r.id === data.reversalId);
        if (index !== -1) {
            this.reversals[index] = { ...this.reversals[index], ...data };
            this.renderReversalList();
        }

        this.showNotification('Reversal status updated', data.message);
    }

    handleNewReversal(data) {
        this.loadReversalHistory();
        this.loadStatistics();
        this.showNotification('New reversal created', data.message);
    }

    handleDisputeUpdate(data) {
        this.loadReversalHistory();
        this.showNotification('Dispute status updated', data.message);
    }

    // Modal management
    showDisputeModal() {
        document.getElementById('disputeModal').classList.remove('hidden');
        document.getElementById('disputeModal').classList.add('flex');
        document.getElementById('transactionId').focus();
    }

    hideDisputeModal() {
        document.getElementById('disputeModal').classList.add('hidden');
        document.getElementById('disputeModal').classList.remove('flex');
        document.getElementById('disputeForm').reset();
    }

    showReversalDetailModal() {
        document.getElementById('reversalDetailModal').classList.remove('hidden');
        document.getElementById('reversalDetailModal').classList.add('flex');
    }

    hideReversalDetailModal() {
        document.getElementById('reversalDetailModal').classList.add('hidden');
        document.getElementById('reversalDetailModal').classList.remove('flex');
    }

    hideAllModals() {
        this.hideDisputeModal();
        this.hideReversalDetailModal();
    }

    // Utility functions
    showLoading() {
        document.getElementById('reversalList').innerHTML = `
            <div class="flex justify-center py-12">
                <div class="loading-spinner"></div>
            </div>
        `;
    }

    showError(message) {
        this.showNotification('Error', message, 'error');
    }

    showSuccess(message) {
        this.showNotification('Success', message, 'success');
    }

    showNotification(title, message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
            type === 'error' ? 'bg-red-100 border border-red-400 text-red-700' :
            type === 'success' ? 'bg-green-100 border border-green-400 text-green-700' :
            'bg-blue-100 border border-blue-400 text-blue-700'
        }`;
        
        notification.innerHTML = `
            <div class="flex items-start">
                <i class="fas ${
                    type === 'error' ? 'fa-exclamation-circle' :
                    type === 'success' ? 'fa-check-circle' :
                    'fa-info-circle'
                } mt-0.5 mr-3"></i>
                <div class="flex-1">
                    <h4 class="font-medium">${title}</h4>
                    <p class="text-sm mt-1">${message}</p>
                </div>
                <button class="ml-3 text-gray-400 hover:text-gray-600" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    getStatusClass(status) {
        const statusClasses = {
            'completed': 'status-completed',
            'pending': 'status-pending',
            'investigating': 'status-investigating',
            'failed': 'status-failed'
        };
        return statusClasses[status] || 'status-pending';
    }

    getTypeIcon(type) {
        const typeIcons = {
            'fraud': 'fas fa-exclamation-triangle',
            'error': 'fas fa-bug',
            'dispute': 'fas fa-gavel',
            'chargeback': 'fas fa-undo'
        };
        return typeIcons[type] || 'fas fa-undo';
    }

    formatStatus(status) {
        return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    formatReversalType(type) {
        return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    formatCurrency(amount, currency) {
        const symbols = {
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'JPY': '¥'
        };
        const symbol = symbols[currency] || '$';
        return `${symbol}${parseFloat(amount).toFixed(2)}`;
    }

    getRelativeTime(timestamp) {
        const now = new Date();
        const date = new Date(timestamp);
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
        
        return date.toLocaleDateString();
    }

    getUserId() {
        // In a real implementation, this would extract user ID from JWT token
        return 'user-123';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ReversalHistoryManager();
});