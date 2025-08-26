class MultiWalletManager {
    constructor() {
        this.wallets = [];
        this.statistics = {};
        this.init();
    }

    async init() {
        await this.loadWallets();
        await this.loadStatistics();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.loadWallets();
            this.loadStatistics();
        }, 30000);
    }

    async loadWallets() {
        try {
            const response = await fetch('/api/multi-wallet', {
                headers: {
                    'X-User-Id': 'user-123' // Mock user ID
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.wallets = data.wallets;
                this.renderWallets();
                this.populateWalletSelectors();
            } else {
                console.error('Failed to load wallets');
            }
        } catch (error) {
            console.error('Error loading wallets:', error);
        }
    }

    async loadStatistics() {
        try {
            const response = await fetch('/api/multi-wallet/statistics/overview', {
                headers: {
                    'X-User-Id': 'user-123'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.statistics = data.statistics;
                this.renderStatistics();
            }
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    }

    renderWallets() {
        const walletList = document.getElementById('walletList');
        walletList.innerHTML = '';

        this.wallets.forEach(wallet => {
            const walletCard = this.createWalletCard(wallet);
            walletList.appendChild(walletCard);
        });
    }

    createWalletCard(wallet) {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 mb-3';

        const lastSync = new Date(wallet.lastSyncAt).toLocaleString();
        const walletTypeColor = this.getWalletTypeColor(wallet.walletType);

        col.innerHTML = `
            <div class="card wallet-card h-100 ${wallet.isPrimary ? 'primary' : ''}" 
                 style="border-left-color: ${wallet.metadata.color}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div>
                            <h5 class="card-title mb-1">${wallet.walletName}</h5>
                            <span class="badge wallet-type-badge" style="background-color: ${walletTypeColor}">
                                ${wallet.walletType.toUpperCase()}
                            </span>
                            ${wallet.isPrimary ? '<span class="badge bg-success ms-1">PRIMARY</span>' : ''}
                        </div>
                        <div class="dropdown">
                            <button class="btn btn-sm btn-outline-secondary" type="button" 
                                    data-bs-toggle="dropdown">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <ul class="dropdown-menu">
                                ${!wallet.isPrimary ? `<li><a class="dropdown-item" href="#" onclick="setPrimaryWallet('${wallet.walletId}')">
                                    <i class="fas fa-star me-2"></i>Set as Primary
                                </a></li>` : ''}
                                <li><a class="dropdown-item" href="#" onclick="showWalletSettings('${wallet.walletId}')">
                                    <i class="fas fa-cog me-2"></i>Settings
                                </a></li>
                                <li><a class="dropdown-item" href="#" onclick="syncWallet('${wallet.walletId}')">
                                    <i class="fas fa-sync me-2"></i>Sync Now
                                </a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item text-danger" href="#" onclick="removeWallet('${wallet.walletId}')">
                                    <i class="fas fa-trash me-2"></i>Remove
                                </a></li>
                            </ul>
                        </div>
                    </div>

                    <div class="wallet-balance text-center mb-3">
                        ${wallet.balance.toFixed(2)} ${wallet.currency}
                    </div>

                    <div class="mb-3">
                        <small class="text-muted">
                            <i class="fas fa-clock me-1"></i>Last sync: ${lastSync}
                        </small><br>
                        <small class="text-muted">
                            <i class="fas fa-devices me-1"></i>Synced devices: ${wallet.syncDeviceCount}
                        </small><br>
                        ${wallet.metadata.description ? 
                            `<small class="text-muted">
                                <i class="fas fa-info-circle me-1"></i>${wallet.metadata.description}
                            </small>` : ''
                        }
                    </div>

                    <div class="sync-status">
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="text-muted">Sync Status:</span>
                            <span class="badge bg-success">
                                <i class="fas fa-check me-1"></i>Synced
                            </span>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <div class="d-flex justify-content-between">
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-outline-primary" 
                                    onclick="showTransferModal('${wallet.walletId}', 'from')">
                                <i class="fas fa-arrow-up me-1"></i>Send
                            </button>
                            <button class="btn btn-sm btn-outline-success" 
                                    onclick="showTransferModal('${wallet.walletId}', 'to')">
                                <i class="fas fa-arrow-down me-1"></i>Receive
                            </button>
                        </div>
                        <button class="btn btn-sm btn-outline-info" onclick="viewWalletDetails('${wallet.walletId}')">
                            <i class="fas fa-eye me-1"></i>Details
                        </button>
                    </div>
                </div>
            </div>
        `;

        return col;
    }

    renderStatistics() {
        const walletStats = document.getElementById('walletStats');
        walletStats.innerHTML = `
            <div class="col-md-3">
                <div class="text-center">
                    <h4 class="text-primary">${this.statistics.totalWallets || 0}</h4>
                    <small class="text-muted">Total Wallets</small>
                </div>
            </div>
            <div class="col-md-3">
                <div class="text-center">
                    <h4 class="text-success">${(this.statistics.totalBalance || 0).toFixed(2)}</h4>
                    <small class="text-muted">Total Balance</small>
                </div>
            </div>
            <div class="col-md-3">
                <div class="text-center">
                    <h4 class="text-info">${Object.keys(this.statistics.currencies || {}).length}</h4>
                    <small class="text-muted">Currencies</small>
                </div>
            </div>
            <div class="col-md-3">
                <div class="text-center">
                    <h4 class="text-warning">${this.statistics.lastActivity ? 
                        new Date(this.statistics.lastActivity).toLocaleDateString() : 'N/A'}</h4>
                    <small class="text-muted">Last Activity</small>
                </div>
            </div>
        `;
    }

    populateWalletSelectors() {
        const fromWalletSelect = document.getElementById('fromWallet');
        const toWalletSelect = document.getElementById('toWallet');

        // Clear existing options
        fromWalletSelect.innerHTML = '<option value="">Select source wallet</option>';
        toWalletSelect.innerHTML = '<option value="">Select destination wallet</option>';

        this.wallets.forEach(wallet => {
            const option = `<option value="${wallet.walletId}">${wallet.walletName} (${wallet.balance.toFixed(2)} ${wallet.currency})</option>`;
            fromWalletSelect.innerHTML += option;
            toWalletSelect.innerHTML += option;
        });
    }

    getWalletTypeColor(walletType) {
        const colors = {
            personal: '#007bff',
            business: '#28a745',
            savings: '#ffc107'
        };
        return colors[walletType] || '#6c757d';
    }

    async syncWallet(walletId) {
        try {
            // Get current device ID (in production, this would be stored)
            const deviceId = localStorage.getItem('deviceId') || 'device-123';
            
            const response = await fetch(`/api/multi-wallet/${walletId}/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': 'user-123'
                },
                body: JSON.stringify({
                    deviceId,
                    syncData: {
                        version: 1,
                        timestamp: new Date().toISOString()
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.conflicts && data.conflicts.length > 0) {
                    alert(`Sync completed with conflicts: ${data.conflicts.map(c => c.description).join(', ')}`);
                } else {
                    alert('Wallet synced successfully!');
                }
                await this.loadWallets();
            } else {
                const error = await response.json();
                alert(`Sync failed: ${error.message}`);
            }
        } catch (error) {
            console.error('Error syncing wallet:', error);
            alert('Sync failed. Please try again.');
        }
    }
}

// Global functions for button clicks
async function createWallet() {
    const walletName = document.getElementById('walletName').value;
    const walletType = document.getElementById('walletType').value;
    const currency = document.getElementById('currency').value;
    const description = document.getElementById('description').value;
    const color = document.getElementById('walletColor').value;

    if (!walletName || !walletType) {
        alert('Please fill in all required fields');
        return;
    }

    try {
        const response = await fetch('/api/multi-wallet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': 'user-123'
            },
            body: JSON.stringify({
                walletName,
                walletType,
                currency,
                description,
                color
            })
        });

        if (response.ok) {
            alert('Wallet created successfully!');
            bootstrap.Modal.getInstance(document.getElementById('createWalletModal')).hide();
            document.getElementById('createWalletForm').reset();
            await window.multiWalletManager.loadWallets();
            await window.multiWalletManager.loadStatistics();
        } else {
            const error = await response.json();
            alert(`Failed to create wallet: ${error.message}`);
        }
    } catch (error) {
        console.error('Error creating wallet:', error);
        alert('Failed to create wallet. Please try again.');
    }
}

async function setPrimaryWallet(walletId) {
    try {
        const response = await fetch(`/api/multi-wallet/${walletId}/set-primary`, {
            method: 'POST',
            headers: {
                'X-User-Id': 'user-123'
            }
        });

        if (response.ok) {
            alert('Primary wallet updated successfully!');
            await window.multiWalletManager.loadWallets();
        } else {
            const error = await response.json();
            alert(`Failed to set primary wallet: ${error.message}`);
        }
    } catch (error) {
        console.error('Error setting primary wallet:', error);
        alert('Failed to set primary wallet. Please try again.');
    }
}

function showWalletSettings(walletId) {
    const wallet = window.multiWalletManager.wallets.find(w => w.walletId === walletId);
    if (!wallet) return;

    document.getElementById('settingsWalletId').value = walletId;
    document.getElementById('settingsWalletName').value = wallet.walletName;
    document.getElementById('settingsWalletType').value = wallet.walletType;
    document.getElementById('settingsDescription').value = wallet.metadata.description || '';
    document.getElementById('settingsWalletColor').value = wallet.metadata.color || '#007bff';
    document.getElementById('canSend').checked = wallet.permissions.canSend;
    document.getElementById('canReceive').checked = wallet.permissions.canReceive;
    document.getElementById('requiresApproval').checked = wallet.permissions.requiresApproval;

    new bootstrap.Modal(document.getElementById('walletSettingsModal')).show();
}

async function updateWalletSettings() {
    const walletId = document.getElementById('settingsWalletId').value;
    const walletName = document.getElementById('settingsWalletName').value;
    const walletType = document.getElementById('settingsWalletType').value;
    const description = document.getElementById('settingsDescription').value;
    const color = document.getElementById('settingsWalletColor').value;
    const canSend = document.getElementById('canSend').checked;
    const canReceive = document.getElementById('canReceive').checked;
    const requiresApproval = document.getElementById('requiresApproval').checked;

    try {
        const response = await fetch(`/api/multi-wallet/${walletId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': 'user-123'
            },
            body: JSON.stringify({
                walletName,
                walletType,
                permissions: {
                    canSend,
                    canReceive,
                    requiresApproval
                },
                metadata: {
                    description,
                    color
                }
            })
        });

        if (response.ok) {
            alert('Wallet settings updated successfully!');
            bootstrap.Modal.getInstance(document.getElementById('walletSettingsModal')).hide();
            await window.multiWalletManager.loadWallets();
        } else {
            const error = await response.json();
            alert(`Failed to update wallet: ${error.message}`);
        }
    } catch (error) {
        console.error('Error updating wallet:', error);
        alert('Failed to update wallet. Please try again.');
    }
}

function showTransferModal(walletId, direction) {
    if (direction === 'from') {
        document.getElementById('fromWallet').value = walletId;
    } else {
        document.getElementById('toWallet').value = walletId;
    }
    new bootstrap.Modal(document.getElementById('transferModal')).show();
}

async function transferFunds() {
    const fromWalletId = document.getElementById('fromWallet').value;
    const toWalletId = document.getElementById('toWallet').value;
    const amount = parseFloat(document.getElementById('transferAmount').value);
    const description = document.getElementById('transferDescription').value;

    if (!fromWalletId || !toWalletId || !amount) {
        alert('Please fill in all required fields');
        return;
    }

    if (fromWalletId === toWalletId) {
        alert('Source and destination wallets cannot be the same');
        return;
    }

    try {
        const response = await fetch('/api/multi-wallet/transfer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': 'user-123'
            },
            body: JSON.stringify({
                fromWalletId,
                toWalletId,
                amount,
                description
            })
        });

        if (response.ok) {
            alert('Transfer completed successfully!');
            bootstrap.Modal.getInstance(document.getElementById('transferModal')).hide();
            document.getElementById('transferForm').reset();
            await window.multiWalletManager.loadWallets();
            await window.multiWalletManager.loadStatistics();
        } else {
            const error = await response.json();
            alert(`Transfer failed: ${error.message}`);
        }
    } catch (error) {
        console.error('Error transferring funds:', error);
        alert('Transfer failed. Please try again.');
    }
}

async function removeWallet(walletId) {
    const wallet = window.multiWalletManager.wallets.find(w => w.walletId === walletId);
    if (!wallet) return;

    if (wallet.isPrimary) {
        alert('Cannot remove primary wallet. Set another wallet as primary first.');
        return;
    }

    if (wallet.balance > 0) {
        alert('Cannot remove wallet with remaining balance. Transfer funds first.');
        return;
    }

    if (!confirm(`Are you sure you want to remove "${wallet.walletName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/multi-wallet/${walletId}`, {
            method: 'DELETE',
            headers: {
                'X-User-Id': 'user-123'
            }
        });

        if (response.ok) {
            alert('Wallet removed successfully');
            await window.multiWalletManager.loadWallets();
            await window.multiWalletManager.loadStatistics();
        } else {
            const error = await response.json();
            alert(`Failed to remove wallet: ${error.message}`);
        }
    } catch (error) {
        console.error('Error removing wallet:', error);
        alert('Failed to remove wallet. Please try again.');
    }
}

async function syncWallet(walletId) {
    await window.multiWalletManager.syncWallet(walletId);
}

function viewWalletDetails(walletId) {
    const wallet = window.multiWalletManager.wallets.find(w => w.walletId === walletId);
    if (!wallet) return;

    const details = `
Wallet Details:

Name: ${wallet.walletName}
Type: ${wallet.walletType}
Currency: ${wallet.currency}
Balance: ${wallet.balance.toFixed(2)}
Primary: ${wallet.isPrimary ? 'Yes' : 'No'}
Created: ${new Date(wallet.createdAt).toLocaleString()}
Last Sync: ${new Date(wallet.lastSyncAt).toLocaleString()}
Synced Devices: ${wallet.syncDeviceCount}

Permissions:
- Can Send: ${wallet.permissions.canSend ? 'Yes' : 'No'}
- Can Receive: ${wallet.permissions.canReceive ? 'Yes' : 'No'}
- Requires Approval: ${wallet.permissions.requiresApproval ? 'Yes' : 'No'}

${wallet.metadata.description ? `Description: ${wallet.metadata.description}` : ''}
    `;

    alert(details);
}

// Initialize multi-wallet manager when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.multiWalletManager = new MultiWalletManager();
});