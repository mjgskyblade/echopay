// EchoPay Fraud Case Tracker

class FraudCaseTracker {
    constructor() {
        this.socket = null;
        this.currentCase = null;
        this.notificationCount = 0;
        this.init();
    }

    async init() {
        // Check authentication
        const token = localStorage.getItem('authToken');
        if (!token) {
            this.redirectToLogin();
            return;
        }

        // Initialize Socket.IO for real-time updates
        this.initSocket();

        // Setup event listeners
        this.setupEventListeners();

        // Check URL parameters for case number
        this.checkUrlParams();

        // Load user's recent cases
        this.loadRecentCases();
    }

    initSocket() {
        this.socket = io({
            auth: {
                token: localStorage.getItem('authToken')
            }
        });

        this.socket.on('connect', () => {
            console.log('Connected to fraud case tracker');
        });

        this.socket.on('case-update', (data) => {
            this.handleCaseUpdate(data);
        });

        this.socket.on('case-status-change', (data) => {
            this.handleStatusChange(data);
        });

        this.socket.on('new-evidence-added', (data) => {
            this.handleNewEvidence(data);
        });

        this.socket.on('investigator-message', (data) => {
            this.handleInvestigatorMessage(data);
        });
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const caseNumber = urlParams.get('case');
        
        if (caseNumber) {
            document.getElementById('caseNumberInput').value = caseNumber;
            this.trackCase(caseNumber);
        }
    }

    setupEventListeners() {
        // Track case button
        document.getElementById('trackCaseBtn').addEventListener('click', () => {
            const caseNumber = document.getElementById('caseNumberInput').value.trim();
            if (caseNumber) {
                this.trackCase(caseNumber);
            } else {
                this.showError('Please enter a case number');
            }
        });

        // Enter key in case number input
        document.getElementById('caseNumberInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const caseNumber = e.target.value.trim();
                if (caseNumber) {
                    this.trackCase(caseNumber);
                }
            }
        });

        // Add evidence modal
        document.getElementById('addEvidenceBtn').addEventListener('click', () => this.openAddEvidenceModal());
        document.getElementById('closeEvidenceModal').addEventListener('click', () => this.closeAddEvidenceModal());
        document.getElementById('cancelEvidence').addEventListener('click', () => this.closeAddEvidenceModal());
        document.getElementById('evidenceForm').addEventListener('submit', (e) => this.submitEvidence(e));

        // Other actions
        document.getElementById('contactSupportBtn').addEventListener('click', () => this.contactSupport());
        document.getElementById('downloadReportBtn').addEventListener('click', () => this.downloadReport());

        // Notification bell
        document.getElementById('notificationBtn').addEventListener('click', () => this.toggleNotifications());
    }

    async trackCase(caseNumber) {
        try {
            // Show loading state
            this.showLoading();

            const response = await this.apiCall(`/api/fraud/case/${caseNumber}`);
            this.currentCase = response.case;

            // Join case room for real-time updates
            if (this.socket) {
                this.socket.emit('join-case', this.currentCase.id);
            }

            // Display case details
            this.displayCaseDetails(this.currentCase);
            
            // Show case details section
            document.getElementById('caseDetails').classList.remove('hidden');

        } catch (error) {
            console.error('Failed to load case:', error);
            this.showError('Case not found or access denied');
            document.getElementById('caseDetails').classList.add('hidden');
        }
    }

    displayCaseDetails(caseData) {
        // Update case header
        document.getElementById('caseTitle').textContent = `Fraud Case #${caseData.caseNumber}`;
        document.getElementById('caseSubtitle').textContent = this.getFraudTypeLabel(caseData.fraudType);
        document.getElementById('caseDate').textContent = `Submitted on ${new Date(caseData.createdAt).toLocaleDateString()}`;

        // Update status
        this.updateCaseStatus(caseData.status, caseData.priority);

        // Update progress
        this.updateProgress(caseData.progress);

        // Update expected resolution
        document.getElementById('expectedResolution').textContent = this.getExpectedResolution(caseData);

        // Display timeline
        this.displayTimeline(caseData.timeline);

        // Display case summary
        this.displayCaseSummary(caseData);

        // Display evidence files
        this.displayEvidenceFiles(caseData.evidence);

        // Display investigation team
        this.displayInvestigationTeam(caseData.investigators);
    }

    updateCaseStatus(status, priority) {
        const statusElement = document.getElementById('caseStatus');
        const statusConfig = this.getStatusConfig(status, priority);
        
        statusElement.className = `status-badge inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusConfig.class}`;
        statusElement.innerHTML = `<i class="fas ${statusConfig.icon} mr-2"></i>${statusConfig.label}`;
    }

    updateProgress(progress) {
        const progressPercent = document.getElementById('progressPercent');
        const progressDescription = document.getElementById('progressDescription');
        const progressCircle = document.getElementById('progressCircle');

        // Animate progress change
        const currentPercent = parseInt(progressPercent.textContent) || 0;
        const targetPercent = progress.percentage;
        
        this.animateProgress(currentPercent, targetPercent, (value) => {
            progressPercent.textContent = `${Math.round(value)}%`;
            
            // Update progress circle
            const circumference = 2 * Math.PI * 52;
            const offset = circumference - (value / 100) * circumference;
            progressCircle.style.strokeDashoffset = offset;
        });

        progressDescription.textContent = progress.description;

        // Add progress milestone notifications
        this.checkProgressMilestones(targetPercent);
    }

    animateProgress(start, end, callback) {
        const duration = 1000; // 1 second
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function for smooth animation
            const easeOutCubic = 1 - Math.pow(1 - progress, 3);
            const currentValue = start + (end - start) * easeOutCubic;
            
            callback(currentValue);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    checkProgressMilestones(percentage) {
        const milestones = [
            { threshold: 25, message: 'Initial review completed' },
            { threshold: 50, message: 'Investigation in progress' },
            { threshold: 75, message: 'Evidence analysis underway' },
            { threshold: 100, message: 'Case resolution complete' }
        ];

        milestones.forEach(milestone => {
            if (percentage >= milestone.threshold && !this.milestonesReached?.includes(milestone.threshold)) {
                if (!this.milestonesReached) this.milestonesReached = [];
                this.milestonesReached.push(milestone.threshold);
                
                this.showNotification(`Progress Update: ${milestone.message}`, 'success');
                
                // Send push notification for major milestones
                if (milestone.threshold >= 50) {
                    this.sendPushNotification('Case Progress Update', {
                        body: milestone.message,
                        icon: '/favicon.ico',
                        tag: `milestone-${milestone.threshold}`,
                        data: { type: 'milestone', threshold: milestone.threshold }
                    });
                }
            }
        });
    }

    displayTimeline(timeline) {
        const container = document.getElementById('caseTimeline');
        
        container.innerHTML = timeline.map((item, index) => `
            <div class="timeline-item flex items-start space-x-4">
                <div class="timeline-dot w-8 h-8 rounded-full flex items-center justify-center ${this.getTimelineItemClass(item.status)}">
                    <i class="fas ${this.getTimelineIcon(item.type)} text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <h4 class="text-sm font-medium text-gray-800">${item.title}</h4>
                        <span class="text-xs text-gray-500">${this.formatTimeAgo(item.timestamp)}</span>
                    </div>
                    <p class="text-sm text-gray-600 mt-1">${item.description}</p>
                    ${item.details ? `
                        <div class="mt-2 p-3 bg-gray-50 rounded-lg">
                            <p class="text-xs text-gray-600">${item.details}</p>
                        </div>
                    ` : ''}
                    ${item.attachments && item.attachments.length > 0 ? `
                        <div class="mt-2 flex space-x-2">
                            ${item.attachments.map(att => `
                                <a href="${att.url}" target="_blank" class="text-xs text-blue-600 hover:underline">
                                    <i class="fas fa-paperclip mr-1"></i>${att.name}
                                </a>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    displayCaseSummary(caseData) {
        const container = document.getElementById('caseSummary');
        
        container.innerHTML = `
            <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-gray-600">Case ID:</span>
                    <span class="font-mono">${caseData.id}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Transaction ID:</span>
                    <span class="font-mono">${caseData.transactionId || 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Amount:</span>
                    <span class="font-semibold">${caseData.amount ? `${caseData.currency} ${caseData.amount}` : 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Priority:</span>
                    <span class="px-2 py-1 rounded text-xs font-medium ${this.getPriorityClass(caseData.priority)}">
                        ${caseData.priority.toUpperCase()}
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Assigned To:</span>
                    <span>${caseData.assignedInvestigator || 'Unassigned'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Last Updated:</span>
                    <span>${this.formatTimeAgo(caseData.lastUpdated)}</span>
                </div>
            </div>
        `;
    }

    displayEvidenceFiles(evidence) {
        const container = document.getElementById('evidenceFiles');
        
        if (!evidence || evidence.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No evidence files uploaded</p>';
            return;
        }

        container.innerHTML = evidence.map(file => `
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div class="flex items-center space-x-2">
                    <i class="fas ${this.getFileIcon(file.type)} text-blue-600"></i>
                    <span class="text-sm font-medium">${file.name}</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="text-xs text-gray-500">${this.formatFileSize(file.size)}</span>
                    <a href="${file.url}" target="_blank" class="text-blue-600 hover:text-blue-800">
                        <i class="fas fa-external-link-alt text-xs"></i>
                    </a>
                </div>
            </div>
        `).join('');
    }

    displayInvestigationTeam(investigators) {
        const container = document.getElementById('investigationTeam');
        
        if (!investigators || investigators.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No investigators assigned</p>';
            return;
        }

        container.innerHTML = investigators.map(investigator => `
            <div class="flex items-center space-x-3">
                <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <i class="fas fa-user text-blue-600 text-sm"></i>
                </div>
                <div>
                    <p class="text-sm font-medium">${investigator.name}</p>
                    <p class="text-xs text-gray-500">${investigator.role}</p>
                </div>
                <div class="ml-auto">
                    <span class="w-2 h-2 rounded-full ${investigator.online ? 'bg-green-500' : 'bg-gray-300'}"></span>
                </div>
            </div>
        `).join('');
    }

    async loadRecentCases() {
        try {
            const response = await this.apiCall('/api/fraud/cases/my-cases');
            this.displayRecentCases(response.cases);
        } catch (error) {
            console.error('Failed to load recent cases:', error);
        }
    }

    displayRecentCases(cases) {
        const container = document.getElementById('recentCases');
        
        if (!cases || cases.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No recent cases found</p>';
            return;
        }

        container.innerHTML = cases.map(caseItem => `
            <div class="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                 onclick="fraudCaseTracker.trackCase('${caseItem.caseNumber}')">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center ${this.getStatusConfig(caseItem.status).bgClass}">
                        <i class="fas ${this.getStatusConfig(caseItem.status).icon} ${this.getStatusConfig(caseItem.status).textClass}"></i>
                    </div>
                    <div>
                        <p class="font-medium text-gray-800">${caseItem.caseNumber}</p>
                        <p class="text-sm text-gray-600">${this.getFraudTypeLabel(caseItem.fraudType)}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-sm font-medium ${this.getStatusConfig(caseItem.status).textClass}">
                        ${this.getStatusConfig(caseItem.status).label}
                    </p>
                    <p class="text-xs text-gray-500">${this.formatTimeAgo(caseItem.createdAt)}</p>
                </div>
            </div>
        `).join('');
    }

    // Modal functions
    openAddEvidenceModal() {
        document.getElementById('addEvidenceModal').classList.remove('hidden');
        document.getElementById('addEvidenceModal').classList.add('flex');
    }

    closeAddEvidenceModal() {
        document.getElementById('addEvidenceModal').classList.add('hidden');
        document.getElementById('addEvidenceModal').classList.remove('flex');
        document.getElementById('evidenceForm').reset();
    }

    async submitEvidence(e) {
        e.preventDefault();
        
        if (!this.currentCase) {
            this.showError('No case selected');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('caseId', this.currentCase.id);
            formData.append('type', document.getElementById('evidenceType').value);
            formData.append('description', document.getElementById('evidenceDescription').value);
            
            const fileInput = document.getElementById('evidenceFile');
            if (fileInput.files[0]) {
                formData.append('file', fileInput.files[0]);
            }

            const response = await fetch('/api/fraud/evidence', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to submit evidence');
            }

            this.showSuccess('Evidence submitted successfully');
            this.closeAddEvidenceModal();
            
            // Refresh case details
            this.trackCase(this.currentCase.caseNumber);

        } catch (error) {
            console.error('Failed to submit evidence:', error);
            this.showError('Failed to submit evidence');
        }
    }

    contactSupport() {
        // Open support chat or redirect to support page
        window.open('/support', '_blank');
    }

    async downloadReport() {
        if (!this.currentCase) {
            this.showError('No case selected');
            return;
        }

        try {
            const response = await fetch(`/api/fraud/case/${this.currentCase.caseNumber}/report`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download report');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fraud-case-${this.currentCase.caseNumber}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Failed to download report:', error);
            this.showError('Failed to download report');
        }
    }

    // Real-time update handlers
    handleCaseUpdate(data) {
        if (this.currentCase && data.caseId === this.currentCase.id) {
            // Update current case display
            this.trackCase(this.currentCase.caseNumber);
        }
        
        this.showNotification(`Case Update: ${data.message}`, 'info');
        this.incrementNotificationCount();
    }

    handleStatusChange(data) {
        if (this.currentCase && data.caseId === this.currentCase.id) {
            this.updateCaseStatus(data.newStatus, data.priority);
            this.updateProgress(data.progress);
        }
        
        this.showNotification(`Status Changed: ${data.message}`, 'success');
        this.incrementNotificationCount();
    }

    handleNewEvidence(data) {
        if (this.currentCase && data.caseId === this.currentCase.id) {
            // Refresh evidence display
            this.displayEvidenceFiles(data.evidence);
        }
        
        this.showNotification('New evidence added to your case', 'info');
        this.incrementNotificationCount();
    }

    handleInvestigatorMessage(data) {
        this.showNotification(`Message from investigator: ${data.message}`, 'info');
        this.incrementNotificationCount();
    }

    incrementNotificationCount() {
        this.notificationCount++;
        const badge = document.getElementById('notificationBadge');
        badge.textContent = this.notificationCount;
        badge.classList.remove('hidden');
    }

    toggleNotifications() {
        // Reset notification count
        this.notificationCount = 0;
        document.getElementById('notificationBadge').classList.add('hidden');
        
        // Show notification panel (could be implemented as a dropdown)
        this.showNotification('All notifications cleared', 'success');
    }

    // Utility functions
    getStatusConfig(status, priority = 'medium') {
        const configs = {
            'submitted': {
                label: 'Submitted',
                icon: 'fa-clock',
                class: 'bg-yellow-100 text-yellow-800',
                bgClass: 'bg-yellow-100',
                textClass: 'text-yellow-600'
            },
            'under_investigation': {
                label: 'Under Investigation',
                icon: 'fa-search',
                class: 'bg-blue-100 text-blue-800',
                bgClass: 'bg-blue-100',
                textClass: 'text-blue-600'
            },
            'evidence_review': {
                label: 'Evidence Review',
                icon: 'fa-eye',
                class: 'bg-purple-100 text-purple-800',
                bgClass: 'bg-purple-100',
                textClass: 'text-purple-600'
            },
            'resolved': {
                label: 'Resolved',
                icon: 'fa-check',
                class: 'bg-green-100 text-green-800',
                bgClass: 'bg-green-100',
                textClass: 'text-green-600'
            },
            'closed': {
                label: 'Closed',
                icon: 'fa-times',
                class: 'bg-gray-100 text-gray-800',
                bgClass: 'bg-gray-100',
                textClass: 'text-gray-600'
            }
        };

        const config = configs[status] || configs['submitted'];
        
        // Adjust for high priority cases
        if (priority === 'high') {
            config.class = config.class.replace('100', '200');
        }
        
        return config;
    }

    getPriorityClass(priority) {
        const classes = {
            'low': 'bg-green-100 text-green-800',
            'medium': 'bg-yellow-100 text-yellow-800',
            'high': 'bg-red-100 text-red-800',
            'urgent': 'bg-red-200 text-red-900'
        };
        return classes[priority] || classes['medium'];
    }

    getTimelineItemClass(status) {
        const classes = {
            'completed': 'bg-green-500 text-white',
            'in_progress': 'bg-blue-500 text-white',
            'pending': 'bg-yellow-500 text-white',
            'failed': 'bg-red-500 text-white'
        };
        return classes[status] || 'bg-gray-300 text-gray-600';
    }

    getTimelineIcon(type) {
        const icons = {
            'submission': 'fa-flag',
            'assignment': 'fa-user-plus',
            'investigation': 'fa-search',
            'evidence': 'fa-file-alt',
            'decision': 'fa-gavel',
            'resolution': 'fa-check',
            'communication': 'fa-comment'
        };
        return icons[type] || 'fa-circle';
    }

    getFraudTypeLabel(type) {
        const labels = {
            'unauthorized_transaction': 'Unauthorized Transaction',
            'account_takeover': 'Account Takeover',
            'phishing_scam': 'Phishing Scam',
            'fake_merchant': 'Fake Merchant',
            'social_engineering': 'Social Engineering',
            'identity_theft': 'Identity Theft',
            'other': 'Other'
        };
        return labels[type] || type;
    }

    getExpectedResolution(caseData) {
        const now = new Date();
        const created = new Date(caseData.createdAt);
        const hoursElapsed = (now - created) / (1000 * 60 * 60);
        const remainingHours = Math.max(0, 72 - hoursElapsed);
        
        if (remainingHours > 24) {
            return `${Math.ceil(remainingHours / 24)} days`;
        } else if (remainingHours > 1) {
            return `${Math.ceil(remainingHours)} hours`;
        } else {
            return 'Soon';
        }
    }

    getFileIcon(type) {
        if (type.startsWith('image/')) return 'fa-image';
        if (type === 'application/pdf') return 'fa-file-pdf';
        if (type.includes('word')) return 'fa-file-word';
        if (type === 'text/plain') return 'fa-file-alt';
        return 'fa-file';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffInSeconds = Math.floor((now - time) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        
        return time.toLocaleDateString();
    }

    showLoading() {
        // Could implement a loading spinner
        console.log('Loading case details...');
    }

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

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        
        const bgColor = type === 'success' ? 'bg-green-500' : 
                       type === 'error' ? 'bg-red-500' : 
                       type === 'info' ? 'bg-blue-500' : 'bg-gray-500';
        
        notification.className = `case-update px-6 py-3 rounded-lg text-white shadow-lg ${bgColor}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    // Push notification methods
    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('Notification permission granted');
                this.registerServiceWorker();
            }
        }
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered:', registration);
                this.serviceWorkerRegistration = registration;
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    sendPushNotification(title, options = {}) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        const notification = new Notification(title, {
            ...options,
            requireInteraction: true,
            actions: [
                {
                    action: 'view',
                    title: 'View Details',
                    icon: '/icons/view.png'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss',
                    icon: '/icons/dismiss.png'
                }
            ]
        });

        notification.onclick = (event) => {
            event.preventDefault();
            window.focus();
            notification.close();
        };

        setTimeout(() => {
            notification.close();
        }, 10000);
    }

    // Enhanced real-time connection management
    initSocket() {
        this.socket = io({
            auth: {
                token: localStorage.getItem('authToken')
            },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
            maxReconnectionAttempts: 10
        });

        this.socket.on('connect', () => {
            console.log('Connected to fraud case tracker');
            this.requestNotificationPermission();
            this.showConnectionStatus('connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showConnectionStatus('disconnected');
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Reconnected after', attemptNumber, 'attempts');
            this.showConnectionStatus('connected');
            this.showNotification('Connection restored', 'success');
        });

        this.socket.on('reconnect_error', (error) => {
            console.error('Reconnection failed:', error);
            this.showConnectionStatus('error');
        });

        this.socket.on('case-update', (data) => {
            this.handleCaseUpdate(data);
        });

        this.socket.on('case-status-change', (data) => {
            this.handleStatusChange(data);
        });

        this.socket.on('new-evidence-added', (data) => {
            this.handleNewEvidence(data);
        });

        this.socket.on('investigator-message', (data) => {
            this.handleInvestigatorMessage(data);
        });

        this.socket.on('case-priority-changed', (data) => {
            this.handlePriorityChange(data);
        });

        this.socket.on('resolution-timeline-update', (data) => {
            this.handleTimelineUpdate(data);
        });
    }

    showConnectionStatus(status) {
        const statusIndicator = document.getElementById('connectionStatus') || this.createConnectionStatusIndicator();
        
        statusIndicator.className = `fixed top-4 left-4 px-3 py-1 rounded-full text-sm font-medium z-50 ${
            status === 'connected' ? 'bg-green-100 text-green-800' :
            status === 'disconnected' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
        }`;
        
        statusIndicator.innerHTML = `
            <i class="fas ${
                status === 'connected' ? 'fa-wifi text-green-600' :
                status === 'disconnected' ? 'fa-wifi text-yellow-600' :
                'fa-exclamation-triangle text-red-600'
            } mr-1"></i>
            ${status === 'connected' ? 'Connected' : 
              status === 'disconnected' ? 'Reconnecting...' : 'Connection Error'}
        `;

        // Auto-hide connected status after 3 seconds
        if (status === 'connected') {
            setTimeout(() => {
                statusIndicator.style.opacity = '0';
                setTimeout(() => {
                    statusIndicator.style.display = 'none';
                }, 300);
            }, 3000);
        } else {
            statusIndicator.style.display = 'block';
            statusIndicator.style.opacity = '1';
        }
    }

    createConnectionStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'connectionStatus';
        indicator.style.transition = 'opacity 0.3s ease';
        document.body.appendChild(indicator);
        return indicator;
    }

    handlePriorityChange(data) {
        if (this.currentCase && data.caseId === this.currentCase.id) {
            this.currentCase.priority = data.newPriority;
            this.updateCaseStatus(this.currentCase.status, data.newPriority);
        }
        
        this.showNotification(`Case priority changed to ${data.newPriority.toUpperCase()}`, 'info');
        
        this.sendPushNotification('Case Priority Update', {
            body: `Your case priority has been changed to ${data.newPriority}`,
            icon: '/favicon.ico',
            tag: `priority-${data.caseId}`,
            data: { caseId: data.caseId, priority: data.newPriority, type: 'priority-change' }
        });
    }

    handleTimelineUpdate(data) {
        if (this.currentCase && data.caseId === this.currentCase.id) {
            // Add new timeline entry
            this.currentCase.timeline.unshift(data.timelineEntry);
            this.displayTimeline(this.currentCase.timeline);
        }
        
        this.showNotification('New timeline update available', 'info');
    }

    // Enhanced accessibility features
    announceToScreenReader(message) {
        let liveRegion = document.getElementById('sr-live-region');
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'sr-live-region';
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            liveRegion.style.position = 'absolute';
            liveRegion.style.left = '-10000px';
            liveRegion.style.width = '1px';
            liveRegion.style.height = '1px';
            liveRegion.style.overflow = 'hidden';
            document.body.appendChild(liveRegion);
        }
        liveRegion.textContent = message;
    }

    // Keyboard navigation support
    setupKeyboardNavigation() {
        document.addEventListener('keydown', (event) => {
            // Alt + T: Track case
            if (event.altKey && event.key === 't') {
                event.preventDefault();
                document.getElementById('caseNumberInput').focus();
            }
            
            // Alt + E: Add evidence (if case is loaded)
            if (event.altKey && event.key === 'e' && this.currentCase) {
                event.preventDefault();
                this.openAddEvidenceModal();
            }
            
            // Alt + R: Refresh case data
            if (event.altKey && event.key === 'r' && this.currentCase) {
                event.preventDefault();
                this.trackCase(this.currentCase.caseNumber);
                this.announceToScreenReader('Case data refreshed');
            }
            
            // Escape: Close modals
            if (event.key === 'Escape') {
                this.closeAddEvidenceModal();
            }
        });
    }

    redirectToLogin() {
        window.location.href = '/login.html';
    }
}

// Initialize the fraud case tracker
const fraudCaseTracker = new FraudCaseTracker();