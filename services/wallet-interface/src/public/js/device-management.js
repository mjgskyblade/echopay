class DeviceManager {
    constructor() {
        this.devices = [];
        this.concurrentSessions = [];
        this.init();
    }

    async init() {
        await this.loadDevices();
        await this.loadConcurrentSessions();
        await this.loadFraudStatistics();
        this.setupEventListeners();
        this.detectCurrentDevice();
    }

    setupEventListeners() {
        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.loadConcurrentSessions();
        }, 30000);

        // Update device activity every 5 minutes
        setInterval(() => {
            this.updateDeviceActivity();
        }, 5 * 60 * 1000);
    }

    detectCurrentDevice() {
        const platform = navigator.platform || 'Unknown';
        const userAgent = navigator.userAgent || 'Unknown';
        
        document.getElementById('platform').value = `${platform} - ${userAgent.substring(0, 50)}...`;
    }

    async loadDevices() {
        try {
            const response = await fetch('/api/devices', {
                headers: {
                    'X-User-Id': 'user-123' // Mock user ID
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.devices = data.devices;
                this.renderDevices();
            } else {
                console.error('Failed to load devices');
            }
        } catch (error) {
            console.error('Error loading devices:', error);
        }
    }

    async loadConcurrentSessions() {
        try {
            const response = await fetch('/api/devices/sessions/concurrent', {
                headers: {
                    'X-User-Id': 'user-123'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.concurrentSessions = data.concurrentSessions;
                document.getElementById('sessionCount').textContent = data.sessionCount;
            }
        } catch (error) {
            console.error('Error loading concurrent sessions:', error);
        }
    }

    async loadFraudStatistics() {
        try {
            const response = await fetch('/api/devices/fraud/statistics', {
                headers: {
                    'X-User-Id': 'user-123'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderFraudStatistics(data.statistics);
            }
        } catch (error) {
            console.error('Error loading fraud statistics:', error);
        }
    }

    renderDevices() {
        const deviceList = document.getElementById('deviceList');
        deviceList.innerHTML = '';

        this.devices.forEach(device => {
            const deviceCard = this.createDeviceCard(device);
            deviceList.appendChild(deviceCard);
        });
    }

    createDeviceCard(device) {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 mb-3';

        const riskLevel = this.getRiskLevel(device.riskScore);
        const deviceIcon = this.getDeviceIcon(device.deviceType);
        const lastSeen = new Date(device.lastSeenAt).toLocaleString();

        col.innerHTML = `
            <div class="card device-card h-100">
                <div class="card-body">
                    <div class="text-center">
                        <i class="${deviceIcon} device-icon text-primary"></i>
                        <h5 class="card-title">${device.deviceName}</h5>
                        <span class="badge risk-badge risk-${riskLevel}">${riskLevel.toUpperCase()} RISK</span>
                    </div>
                    
                    <div class="mt-3">
                        <small class="text-muted">
                            <i class="fas fa-desktop me-1"></i>${device.deviceType}
                        </small><br>
                        <small class="text-muted">
                            <i class="fas fa-clock me-1"></i>Last seen: ${lastSeen}
                        </small><br>
                        <small class="text-muted">
                            <i class="fas fa-map-marker-alt me-1"></i>${device.location ? `${device.location.city || 'Unknown'}` : 'Location unknown'}
                        </small><br>
                        <small class="text-muted">
                            <i class="fas fa-network-wired me-1"></i>${device.ipAddress}
                        </small>
                    </div>

                    <div class="mt-3">
                        ${device.isTrusted ? 
                            '<span class="badge bg-success"><i class="fas fa-check me-1"></i>Verified</span>' : 
                            `<button class="btn btn-sm btn-warning" onclick="showVerifyModal('${device.deviceId}')">
                                <i class="fas fa-shield-alt me-1"></i>Verify
                            </button>`
                        }
                        <button class="btn btn-sm btn-info ms-2" onclick="viewDeviceRisk('${device.deviceId}')">
                            <i class="fas fa-chart-line me-1"></i>Risk Details
                        </button>
                    </div>
                </div>
                <div class="card-footer">
                    <div class="d-flex justify-content-between">
                        <button class="btn btn-sm btn-outline-primary" onclick="updateDeviceActivity('${device.deviceId}')">
                            <i class="fas fa-sync me-1"></i>Update Activity
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="removeDevice('${device.deviceId}')">
                            <i class="fas fa-trash me-1"></i>Remove
                        </button>
                    </div>
                </div>
            </div>
        `;

        return col;
    }

    renderFraudStatistics(stats) {
        const fraudStats = document.getElementById('fraudStats');
        fraudStats.innerHTML = `
            <div class="col-md-3">
                <div class="text-center">
                    <h4 class="text-primary">${stats.totalTransactions}</h4>
                    <small class="text-muted">Total Transactions</small>
                </div>
            </div>
            <div class="col-md-3">
                <div class="text-center">
                    <h4 class="text-warning">${stats.flaggedTransactions}</h4>
                    <small class="text-muted">Flagged</small>
                </div>
            </div>
            <div class="col-md-3">
                <div class="text-center">
                    <h4 class="text-danger">${stats.blockedTransactions}</h4>
                    <small class="text-muted">Blocked</small>
                </div>
            </div>
            <div class="col-md-3">
                <div class="text-center">
                    <h4 class="text-info">${(stats.averageRiskScore * 100).toFixed(1)}%</h4>
                    <small class="text-muted">Avg Risk Score</small>
                </div>
            </div>
        `;
    }

    getRiskLevel(riskScore) {
        if (riskScore >= 0.7) return 'high';
        if (riskScore >= 0.4) return 'medium';
        return 'low';
    }

    getDeviceIcon(deviceType) {
        const icons = {
            mobile: 'fas fa-mobile-alt',
            web: 'fas fa-globe',
            desktop: 'fas fa-desktop'
        };
        return icons[deviceType] || 'fas fa-question';
    }

    async getCurrentLocation() {
        return new Promise((resolve) => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        resolve({
                            lat: position.coords.latitude,
                            lon: position.coords.longitude
                        });
                    },
                    () => resolve(null)
                );
            } else {
                resolve(null);
            }
        });
    }

    getClientInfo() {
        return {
            screenResolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            platform: navigator.platform,
            language: navigator.language,
            cookieEnabled: navigator.cookieEnabled,
            onlineStatus: navigator.onLine
        };
    }

    async updateDeviceActivity(deviceId) {
        try {
            const location = await this.getCurrentLocation();
            
            const response = await fetch(`/api/devices/${deviceId}/activity`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': 'user-123'
                },
                body: JSON.stringify({ location })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.suspiciousPatterns.length > 0) {
                    alert(`Suspicious activity detected: ${data.suspiciousPatterns.join(', ')}`);
                }
                await this.loadDevices();
            }
        } catch (error) {
            console.error('Error updating device activity:', error);
        }
    }
}

// Global functions for button clicks
async function registerDevice() {
    const deviceName = document.getElementById('deviceName').value;
    const deviceType = document.getElementById('deviceType').value;
    const platform = document.getElementById('platform').value;
    const shareLocation = document.getElementById('shareLocation').checked;

    if (!deviceName || !deviceType) {
        alert('Please fill in all required fields');
        return;
    }

    try {
        const deviceManager = window.deviceManager;
        const location = shareLocation ? await deviceManager.getCurrentLocation() : null;
        const clientInfo = deviceManager.getClientInfo();

        const response = await fetch('/api/devices/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': 'user-123'
            },
            body: JSON.stringify({
                deviceName,
                deviceType,
                platform,
                location,
                clientInfo
            })
        });

        if (response.ok) {
            const data = await response.json();
            alert('Device registered successfully!');
            bootstrap.Modal.getInstance(document.getElementById('registerDeviceModal')).hide();
            document.getElementById('registerDeviceForm').reset();
            await deviceManager.loadDevices();
        } else {
            const error = await response.json();
            alert(`Registration failed: ${error.message}`);
        }
    } catch (error) {
        console.error('Error registering device:', error);
        alert('Registration failed. Please try again.');
    }
}

function showVerifyModal(deviceId) {
    document.getElementById('verifyDeviceId').value = deviceId;
    new bootstrap.Modal(document.getElementById('verifyDeviceModal')).show();
}

async function verifyDevice() {
    const deviceId = document.getElementById('verifyDeviceId').value;
    const verificationCode = document.getElementById('verificationCode').value;

    if (!verificationCode) {
        alert('Please enter the verification code');
        return;
    }

    try {
        const response = await fetch(`/api/devices/${deviceId}/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': 'user-123'
            },
            body: JSON.stringify({ verificationCode })
        });

        if (response.ok) {
            alert('Device verified successfully!');
            bootstrap.Modal.getInstance(document.getElementById('verifyDeviceModal')).hide();
            document.getElementById('verificationCode').value = '';
            await window.deviceManager.loadDevices();
        } else {
            const error = await response.json();
            alert(`Verification failed: ${error.message}`);
        }
    } catch (error) {
        console.error('Error verifying device:', error);
        alert('Verification failed. Please try again.');
    }
}

async function viewDeviceRisk(deviceId) {
    try {
        const response = await fetch(`/api/devices/${deviceId}/risk`, {
            headers: {
                'X-User-Id': 'user-123'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const risk = data.riskAssessment;
            
            let factorsText = risk.factors.length > 0 ? 
                `Risk factors: ${risk.factors.join(', ')}` : 
                'No specific risk factors identified';

            alert(`Risk Assessment:\n\nRisk Level: ${risk.riskLevel.toUpperCase()}\nRisk Score: ${(risk.riskScore * 100).toFixed(1)}%\nTrusted: ${risk.isTrusted ? 'Yes' : 'No'}\n\n${factorsText}`);
        }
    } catch (error) {
        console.error('Error getting device risk:', error);
    }
}

async function removeDevice(deviceId) {
    if (!confirm('Are you sure you want to remove this device? You will need to re-register it to use it again.')) {
        return;
    }

    try {
        const response = await fetch(`/api/devices/${deviceId}`, {
            method: 'DELETE',
            headers: {
                'X-User-Id': 'user-123'
            }
        });

        if (response.ok) {
            alert('Device removed successfully');
            await window.deviceManager.loadDevices();
        } else {
            const error = await response.json();
            alert(`Failed to remove device: ${error.message}`);
        }
    } catch (error) {
        console.error('Error removing device:', error);
        alert('Failed to remove device. Please try again.');
    }
}

// Initialize device manager when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.deviceManager = new DeviceManager();
});