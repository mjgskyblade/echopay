// EchoPay Fraud Reporting Interface

class FraudReportWizard {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 3;
        this.formData = {};
        this.uploadedFiles = [];
        this.socket = null;
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

        // Pre-populate transaction ID if provided in URL
        this.checkUrlParams();
    }

    initSocket() {
        this.socket = io({
            auth: {
                token: localStorage.getItem('authToken')
            }
        });

        this.socket.on('connect', () => {
            console.log('Connected to server for fraud reporting');
            // Request permission for push notifications
            this.requestNotificationPermission();
        });

        this.socket.on('fraud-case-update', (data) => {
            this.handleCaseUpdate(data);
        });

        this.socket.on('fraud-case-created', (data) => {
            this.handleCaseCreated(data);
        });

        this.socket.on('case-status-change', (data) => {
            this.handleStatusChange(data);
        });

        this.socket.on('investigator-assigned', (data) => {
            this.handleInvestigatorAssigned(data);
        });

        this.socket.on('evidence-acknowledged', (data) => {
            this.handleEvidenceAcknowledged(data);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            this.showError('Connection lost. Some features may not work properly.');
        });
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const transactionId = urlParams.get('transactionId');
        
        if (transactionId) {
            document.getElementById('transactionId').value = transactionId;
            this.loadTransactionDetails(transactionId);
        }
    }

    setupEventListeners() {
        // Step navigation
        document.getElementById('step1NextBtn').addEventListener('click', () => this.nextStep());
        document.getElementById('step2BackBtn').addEventListener('click', () => this.previousStep());
        document.getElementById('step2NextBtn').addEventListener('click', () => this.nextStep());
        document.getElementById('step3BackBtn').addEventListener('click', () => this.previousStep());
        document.getElementById('submitReportBtn').addEventListener('click', () => this.submitReport());

        // Transaction search
        document.getElementById('searchTransactionBtn').addEventListener('click', () => this.openTransactionSearch());
        document.getElementById('closeSearchModal').addEventListener('click', () => this.closeTransactionSearch());
        document.getElementById('transactionSearchInput').addEventListener('input', (e) => this.searchTransactions(e.target.value));

        // File upload
        this.setupFileUpload();

        // Form validation
        this.setupFormValidation();

        // Success modal
        document.getElementById('trackCaseBtn').addEventListener('click', () => this.trackCase());
        document.getElementById('returnHomeBtn').addEventListener('click', () => this.returnHome());

        // Auto-populate transaction details when ID is entered
        document.getElementById('transactionId').addEventListener('blur', (e) => {
            if (e.target.value) {
                this.loadTransactionDetails(e.target.value);
            }
        });
    }

    setupFileUpload() {
        const dropZone = document.getElementById('fileDropZone');
        const fileInput = document.getElementById('evidenceFiles');

        // Click to browse
        dropZone.addEventListener('click', () => fileInput.click());

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });
    }

    setupFormValidation() {
        // Real-time validation for required fields
        const requiredFields = ['fraudType', 'briefDescription', 'detailedDescription', 'discoveryDate', 'contactedRecipient'];
        
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('blur', () => this.validateField(field));
                field.addEventListener('input', () => this.clearFieldError(field));
            }
        });
    }

    validateField(field) {
        const value = field.value.trim();
        const isValid = value !== '';

        if (!isValid) {
            this.showFieldError(field, 'This field is required');
        } else {
            this.clearFieldError(field);
        }

        return isValid;
    }

    showFieldError(field, message) {
        this.clearFieldError(field);
        
        field.classList.add('border-red-500');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'text-red-500 text-sm mt-1 field-error';
        errorDiv.textContent = message;
        field.parentNode.appendChild(errorDiv);
    }

    clearFieldError(field) {
        field.classList.remove('border-red-500');
        const errorDiv = field.parentNode.querySelector('.field-error');
        if (errorDiv) {
            errorDiv.remove();
        }
    }

    async loadTransactionDetails(transactionId) {
        try {
            const response = await this.apiCall(`/api/transactions/${transactionId}`);
            const transaction = response.transaction;

            // Auto-populate form fields
            document.getElementById('transactionDate').value = transaction.timestamp.split('T')[0];
            document.getElementById('amount').value = Math.abs(transaction.amount);
            document.getElementById('currency').value = transaction.currency;

            this.showSuccess('Transaction details loaded successfully');
        } catch (error) {
            console.error('Failed to load transaction details:', error);
            this.showError('Failed to load transaction details. Please verify the transaction ID.');
        }
    }

    handleFiles(files) {
        const maxFiles = 5;
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];

        Array.from(files).forEach(file => {
            // Check file count
            if (this.uploadedFiles.length >= maxFiles) {
                this.showError(`Maximum ${maxFiles} files allowed`);
                return;
            }

            // Check file size
            if (file.size > maxSize) {
                this.showError(`File "${file.name}" is too large. Maximum size is 10MB.`);
                return;
            }

            // Check file type
            if (!allowedTypes.includes(file.type)) {
                this.showError(`File "${file.name}" is not a supported format.`);
                return;
            }

            // Add file to uploaded files
            const fileData = {
                id: Date.now() + Math.random(),
                file: file,
                name: file.name,
                size: file.size,
                type: file.type,
                uploaded: false
            };

            this.uploadedFiles.push(fileData);
            this.displayUploadedFile(fileData);
            this.uploadFile(fileData);
        });
    }

    displayUploadedFile(fileData) {
        const container = document.getElementById('uploadedFiles');
        const fileDiv = document.createElement('div');
        fileDiv.className = 'evidence-item flex items-center justify-between bg-gray-50 rounded-lg p-3';
        fileDiv.dataset.fileId = fileData.id;

        fileDiv.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${this.getFileIcon(fileData.type)} text-blue-600 mr-3"></i>
                <div>
                    <p class="text-sm font-medium text-gray-800">${fileData.name}</p>
                    <p class="text-xs text-gray-500">${this.formatFileSize(fileData.size)}</p>
                </div>
            </div>
            <div class="flex items-center space-x-2">
                <div class="upload-status">
                    <div class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <button type="button" class="text-red-600 hover:text-red-800" onclick="fraudReportWizard.removeFile(${fileData.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        container.appendChild(fileDiv);
    }

    async uploadFile(fileData) {
        try {
            const formData = new FormData();
            formData.append('file', fileData.file);
            formData.append('type', 'fraud-evidence');

            const response = await fetch('/api/upload/evidence', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            fileData.uploaded = true;
            fileData.url = result.url;

            // Update UI
            const fileDiv = document.querySelector(`[data-file-id="${fileData.id}"]`);
            const statusDiv = fileDiv.querySelector('.upload-status');
            statusDiv.innerHTML = '<i class="fas fa-check text-green-600"></i>';

        } catch (error) {
            console.error('File upload failed:', error);
            
            // Update UI to show error
            const fileDiv = document.querySelector(`[data-file-id="${fileData.id}"]`);
            const statusDiv = fileDiv.querySelector('.upload-status');
            statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle text-red-600"></i>';
            
            this.showError(`Failed to upload ${fileData.name}`);
        }
    }

    removeFile(fileId) {
        this.uploadedFiles = this.uploadedFiles.filter(file => file.id !== fileId);
        const fileDiv = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileDiv) {
            fileDiv.remove();
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

    openTransactionSearch() {
        document.getElementById('transactionSearchModal').classList.remove('hidden');
        document.getElementById('transactionSearchModal').classList.add('flex');
        this.loadRecentTransactions();
    }

    closeTransactionSearch() {
        document.getElementById('transactionSearchModal').classList.add('hidden');
        document.getElementById('transactionSearchModal').classList.remove('flex');
    }

    async loadRecentTransactions() {
        try {
            // Get user's wallets first
            const profileResponse = await this.apiCall('/api/auth/profile');
            const walletId = profileResponse.user.wallets[0]; // Use first wallet

            const response = await this.apiCall(`/api/wallet/${walletId}/transactions?limit=20`);
            this.displayTransactionSearchResults(response.transactions);
        } catch (error) {
            console.error('Failed to load transactions:', error);
            this.showError('Failed to load transactions');
        }
    }

    async searchTransactions(query) {
        if (query.length < 2) {
            this.loadRecentTransactions();
            return;
        }

        try {
            const response = await this.apiCall('/api/transactions/search', 'POST', { query });
            this.displayTransactionSearchResults(response.results);
        } catch (error) {
            console.error('Transaction search failed:', error);
        }
    }

    displayTransactionSearchResults(transactions) {
        const container = document.getElementById('transactionSearchResults');
        
        if (transactions.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-search text-2xl mb-2"></i>
                    <p>No transactions found</p>
                </div>
            `;
            return;
        }

        container.innerHTML = transactions.map(tx => `
            <div class="transaction-search-item border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50" 
                 data-transaction-id="${tx.id}" onclick="fraudReportWizard.selectTransaction('${tx.id}', '${tx.displayAmount}', '${tx.timestamp}', '${tx.description || ''}')">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center ${this.getTransactionIconBg(tx.category)}">
                            <i class="fas ${this.getTransactionIcon(tx.category)} ${this.getTransactionIconColor(tx.category)}"></i>
                        </div>
                        <div>
                            <p class="font-medium text-gray-800">${tx.description || 'Transaction'}</p>
                            <p class="text-sm text-gray-500">${tx.relativeTime}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-semibold ${tx.category === 'sent' ? 'text-red-600' : 'text-green-600'}">
                            ${tx.displayAmount}
                        </p>
                        <span class="text-xs px-2 py-1 rounded-full ${this.getStatusBadgeClass(tx.status)}">
                            ${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    selectTransaction(id, amount, timestamp, description) {
        document.getElementById('transactionId').value = id;
        document.getElementById('transactionDate').value = timestamp.split('T')[0];
        document.getElementById('amount').value = Math.abs(parseFloat(amount.replace(/[^0-9.-]+/g, '')));
        
        if (description) {
            document.getElementById('briefDescription').value = `Issue with transaction: ${description}`;
        }

        this.closeTransactionSearch();
        this.showSuccess('Transaction selected successfully');
    }

    nextStep() {
        if (!this.validateCurrentStep()) {
            return;
        }

        this.saveCurrentStepData();

        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateStepDisplay();
            
            if (this.currentStep === 3) {
                this.populateReviewSummary();
            }
        }
    }

    previousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateStepDisplay();
        }
    }

    validateCurrentStep() {
        if (this.currentStep === 1) {
            return this.validateStep1();
        } else if (this.currentStep === 2) {
            return this.validateStep2();
        } else if (this.currentStep === 3) {
            return this.validateStep3();
        }
        return true;
    }

    validateStep1() {
        const requiredFields = ['fraudType', 'briefDescription'];
        let isValid = true;

        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        // Validate transaction ID or amount
        const transactionId = document.getElementById('transactionId').value.trim();
        const amount = document.getElementById('amount').value;

        if (!transactionId && !amount) {
            this.showError('Please provide either a transaction ID or transaction amount');
            isValid = false;
        }

        return isValid;
    }

    validateStep2() {
        const requiredFields = ['detailedDescription', 'discoveryDate', 'contactedRecipient'];
        let isValid = true;

        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    validateStep3() {
        const termsAccepted = document.getElementById('termsAccepted').checked;
        
        if (!termsAccepted) {
            this.showError('Please accept the terms and conditions to proceed');
            return false;
        }

        return true;
    }

    saveCurrentStepData() {
        if (this.currentStep === 1) {
            this.formData.step1 = {
                transactionId: document.getElementById('transactionId').value,
                transactionDate: document.getElementById('transactionDate').value,
                amount: document.getElementById('amount').value,
                currency: document.getElementById('currency').value,
                fraudType: document.getElementById('fraudType').value,
                briefDescription: document.getElementById('briefDescription').value
            };
        } else if (this.currentStep === 2) {
            this.formData.step2 = {
                detailedDescription: document.getElementById('detailedDescription').value,
                discoveryDate: document.getElementById('discoveryDate').value,
                contactedRecipient: document.getElementById('contactedRecipient').value,
                additionalInfo: document.getElementById('additionalInfo').value,
                evidenceFiles: this.uploadedFiles.filter(file => file.uploaded)
            };
        } else if (this.currentStep === 3) {
            this.formData.step3 = {
                termsAccepted: document.getElementById('termsAccepted').checked,
                notificationPrefs: Array.from(document.querySelectorAll('input[name="notificationPrefs"]:checked')).map(cb => cb.value)
            };
        }
    }

    updateStepDisplay() {
        // Hide all steps
        document.querySelectorAll('.step-content').forEach(step => {
            step.classList.remove('active');
        });

        // Show current step
        document.getElementById(`step${this.currentStep}`).classList.add('active');

        // Update step indicators
        document.querySelectorAll('.step-indicator').forEach((indicator, index) => {
            const stepNumber = index + 1;
            indicator.classList.remove('active', 'completed');
            
            if (stepNumber < this.currentStep) {
                indicator.classList.add('completed');
                indicator.innerHTML = '<i class="fas fa-check"></i>';
            } else if (stepNumber === this.currentStep) {
                indicator.classList.add('active');
                indicator.textContent = stepNumber;
            } else {
                indicator.textContent = stepNumber;
            }
        });

        // Update progress bar
        const progress = (this.currentStep / this.totalSteps) * 100;
        document.querySelector('.progress-bar').style.width = `${progress}%`;
    }

    populateReviewSummary() {
        const summary = document.getElementById('reviewSummary');
        const data = this.formData;

        summary.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h4 class="font-medium text-gray-700 mb-2">Transaction Information</h4>
                    <div class="space-y-1 text-sm">
                        <p><span class="text-gray-600">Transaction ID:</span> ${data.step1.transactionId || 'Not provided'}</p>
                        <p><span class="text-gray-600">Date:</span> ${data.step1.transactionDate || 'Not provided'}</p>
                        <p><span class="text-gray-600">Amount:</span> ${data.step1.amount ? `${data.step1.currency} ${data.step1.amount}` : 'Not provided'}</p>
                        <p><span class="text-gray-600">Fraud Type:</span> ${this.getFraudTypeLabel(data.step1.fraudType)}</p>
                    </div>
                </div>
                <div>
                    <h4 class="font-medium text-gray-700 mb-2">Report Details</h4>
                    <div class="space-y-1 text-sm">
                        <p><span class="text-gray-600">Discovery Date:</span> ${new Date(data.step2.discoveryDate).toLocaleString()}</p>
                        <p><span class="text-gray-600">Contacted Recipient:</span> ${this.getContactedRecipientLabel(data.step2.contactedRecipient)}</p>
                        <p><span class="text-gray-600">Evidence Files:</span> ${data.step2.evidenceFiles.length} file(s)</p>
                        <p><span class="text-gray-600">Notifications:</span> ${data.step3.notificationPrefs.join(', ') || 'None selected'}</p>
                    </div>
                </div>
            </div>
            <div class="mt-4">
                <h4 class="font-medium text-gray-700 mb-2">Description</h4>
                <p class="text-sm text-gray-600 bg-white rounded p-3 border">${data.step1.briefDescription}</p>
            </div>
            ${data.step2.detailedDescription ? `
                <div class="mt-4">
                    <h4 class="font-medium text-gray-700 mb-2">Detailed Description</h4>
                    <p class="text-sm text-gray-600 bg-white rounded p-3 border">${data.step2.detailedDescription}</p>
                </div>
            ` : ''}
        `;
    }

    async submitReport() {
        if (!this.validateCurrentStep()) {
            return;
        }

        this.saveCurrentStepData();

        try {
            // Show loading state
            const submitBtn = document.getElementById('submitReportBtn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...';
            submitBtn.disabled = true;

            // Prepare report data
            const reportData = {
                transactionId: this.formData.step1.transactionId,
                transactionDate: this.formData.step1.transactionDate,
                amount: parseFloat(this.formData.step1.amount) || null,
                currency: this.formData.step1.currency,
                fraudType: this.formData.step1.fraudType,
                briefDescription: this.formData.step1.briefDescription,
                detailedDescription: this.formData.step2.detailedDescription,
                discoveryDate: this.formData.step2.discoveryDate,
                contactedRecipient: this.formData.step2.contactedRecipient,
                additionalInfo: this.formData.step2.additionalInfo,
                evidenceFiles: this.formData.step2.evidenceFiles.map(file => ({
                    name: file.name,
                    url: file.url,
                    type: file.type,
                    size: file.size
                })),
                notificationPreferences: this.formData.step3.notificationPrefs,
                submittedAt: new Date().toISOString()
            };

            // Submit report
            const response = await this.apiCall('/api/fraud/report', 'POST', reportData);

            // Show success modal
            document.getElementById('caseNumber').textContent = response.caseNumber;
            document.getElementById('successModal').classList.remove('hidden');
            document.getElementById('successModal').classList.add('flex');

            // Join case room for real-time updates
            if (this.socket) {
                this.socket.emit('join-case', response.caseId);
            }

        } catch (error) {
            console.error('Failed to submit fraud report:', error);
            this.showError('Failed to submit fraud report. Please try again.');
            
            // Reset button
            const submitBtn = document.getElementById('submitReportBtn');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    trackCase() {
        const caseNumber = document.getElementById('caseNumber').textContent;
        window.location.href = `/fraud-case-tracker.html?case=${caseNumber}`;
    }

    returnHome() {
        window.location.href = '/';
    }

    handleCaseUpdate(data) {
        // Handle real-time case updates
        console.log('Case update received:', data);
        
        // Show notification
        this.showNotification(`Case Update: ${data.message}`, 'info');
        
        // Send push notification if supported
        this.sendPushNotification('Fraud Case Update', {
            body: data.message,
            icon: '/favicon.ico',
            badge: '/badge.png',
            tag: `case-${data.caseId}`,
            data: { caseId: data.caseId, type: 'case-update' }
        });
    }

    handleCaseCreated(data) {
        console.log('Case created:', data);
        this.showNotification(`Case ${data.caseNumber} created successfully`, 'success');
        
        this.sendPushNotification('Fraud Report Submitted', {
            body: `Your fraud report has been submitted with case number ${data.caseNumber}`,
            icon: '/favicon.ico',
            tag: `case-created-${data.caseId}`,
            data: { caseId: data.caseId, caseNumber: data.caseNumber, type: 'case-created' }
        });
    }

    handleStatusChange(data) {
        console.log('Status change:', data);
        this.showNotification(`Case status changed to: ${data.newStatus.replace('_', ' ')}`, 'info');
        
        this.sendPushNotification('Case Status Update', {
            body: `Your fraud case status has been updated to ${data.newStatus.replace('_', ' ')}`,
            icon: '/favicon.ico',
            tag: `status-${data.caseId}`,
            data: { caseId: data.caseId, status: data.newStatus, type: 'status-change' }
        });
    }

    handleInvestigatorAssigned(data) {
        console.log('Investigator assigned:', data);
        this.showNotification(`Investigator ${data.investigatorName} assigned to your case`, 'info');
        
        this.sendPushNotification('Investigator Assigned', {
            body: `${data.investigatorName} has been assigned to investigate your fraud case`,
            icon: '/favicon.ico',
            tag: `investigator-${data.caseId}`,
            data: { caseId: data.caseId, investigator: data.investigatorName, type: 'investigator-assigned' }
        });
    }

    handleEvidenceAcknowledged(data) {
        console.log('Evidence acknowledged:', data);
        this.showNotification('Your evidence has been received and is being reviewed', 'success');
        
        this.sendPushNotification('Evidence Received', {
            body: 'Your additional evidence has been received and added to your case',
            icon: '/favicon.ico',
            tag: `evidence-${data.caseId}`,
            data: { caseId: data.caseId, type: 'evidence-acknowledged' }
        });
    }

    // Utility methods
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

    getContactedRecipientLabel(value) {
        const labels = {
            'yes': 'Yes, I contacted them',
            'no': 'No, I haven\'t contacted them',
            'unable': 'Unable to contact them',
            'unknown_recipient': 'Unknown recipient'
        };
        return labels[value] || value;
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
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showNotification(message, type = 'info') {
        this.showToast(message, type);
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-500' : 
                       type === 'error' ? 'bg-red-500' : 
                       type === 'info' ? 'bg-blue-500' : 'bg-gray-500';
        
        toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg text-white z-50 ${bgColor}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    // Push notification methods
    async requestNotificationPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('Notification permission granted');
                this.registerServiceWorker();
            } else {
                console.log('Notification permission denied');
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
        // Check if notifications are supported and permitted
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        // Create notification
        const notification = new Notification(title, {
            ...options,
            requireInteraction: true,
            actions: [
                {
                    action: 'view',
                    title: 'View Case',
                    icon: '/icons/view.png'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss',
                    icon: '/icons/dismiss.png'
                }
            ]
        });

        // Handle notification click
        notification.onclick = (event) => {
            event.preventDefault();
            window.focus();
            
            if (options.data && options.data.caseId) {
                // Navigate to case tracker
                window.location.href = `/fraud-case-tracker.html?case=${options.data.caseNumber || options.data.caseId}`;
            }
            
            notification.close();
        };

        // Auto-close after 10 seconds
        setTimeout(() => {
            notification.close();
        }, 10000);
    }

    // Enhanced progress tracking
    updateFormProgress() {
        const totalSteps = 3;
        const currentProgress = (this.currentStep / totalSteps) * 100;
        
        // Update progress bar
        const progressBars = document.querySelectorAll('.progress-bar');
        progressBars.forEach(bar => {
            bar.style.width = `${currentProgress}%`;
        });

        // Update step completion status
        for (let i = 1; i <= totalSteps; i++) {
            const stepIndicator = document.querySelector(`[data-step="${i}"]`);
            if (stepIndicator) {
                stepIndicator.classList.remove('active', 'completed');
                
                if (i < this.currentStep) {
                    stepIndicator.classList.add('completed');
                    stepIndicator.innerHTML = '<i class="fas fa-check"></i>';
                } else if (i === this.currentStep) {
                    stepIndicator.classList.add('active');
                    stepIndicator.textContent = i;
                } else {
                    stepIndicator.textContent = i;
                }
            }
        }

        // Announce progress to screen readers
        this.announceProgress(`Step ${this.currentStep} of ${totalSteps}`);
    }

    announceProgress(message) {
        // Create or update ARIA live region for screen readers
        let liveRegion = document.getElementById('progress-announcement');
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'progress-announcement';
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            document.body.appendChild(liveRegion);
        }
        liveRegion.textContent = message;
    }

    // Enhanced validation with better user feedback
    validateFieldWithFeedback(field) {
        const isValid = this.validateField(field);
        
        // Add visual feedback
        if (isValid) {
            field.classList.add('border-green-500');
            field.classList.remove('border-red-500');
            
            // Add success icon
            this.addFieldIcon(field, 'fa-check', 'text-green-500');
        } else {
            field.classList.add('border-red-500');
            field.classList.remove('border-green-500');
            
            // Add error icon
            this.addFieldIcon(field, 'fa-exclamation-triangle', 'text-red-500');
        }
        
        return isValid;
    }

    addFieldIcon(field, iconClass, colorClass) {
        // Remove existing icon
        const existingIcon = field.parentNode.querySelector('.field-icon');
        if (existingIcon) {
            existingIcon.remove();
        }

        // Add new icon
        const icon = document.createElement('i');
        icon.className = `fas ${iconClass} ${colorClass} field-icon absolute right-3 top-1/2 transform -translate-y-1/2`;
        
        // Make field container relative if not already
        field.parentNode.style.position = 'relative';
        field.parentNode.appendChild(icon);
    }

    // Enhanced error handling with retry mechanism
    async apiCallWithRetry(endpoint, method = 'GET', data = null, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.apiCall(endpoint, method, data);
            } catch (error) {
                lastError = error;
                
                if (attempt < maxRetries) {
                    // Wait before retry (exponential backoff)
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    this.showNotification(`Retrying... (${attempt}/${maxRetries})`, 'info');
                }
            }
        }
        
        throw lastError;
    }

    redirectToLogin() {
        window.location.href = '/login.html';
    }
}

// Initialize the fraud report wizard
const fraudReportWizard = new FraudReportWizard();