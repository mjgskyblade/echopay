#!/usr/bin/env node

/**
 * WebSocket Integration Test for EchoPay Transaction Service
 * Tests real-time transaction status updates via WebSocket
 */

const WebSocket = require('ws');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuration
const TRANSACTION_SERVICE_URL = 'http://localhost:8001';
const WEBSOCKET_URL = 'ws://localhost:8001/ws/transactions';

// Test configuration
const TEST_TIMEOUT = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 5000; // 5 seconds

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

class WebSocketIntegrationTest {
    constructor() {
        this.testsPassed = 0;
        this.testsFailed = 0;
        this.ws = null;
        this.testWallets = {
            from: uuidv4(),
            to: uuidv4()
        };
    }

    log(message, color = 'reset') {
        console.log(`${colors[color]}${message}${colors.reset}`);
    }

    logTest(testName, passed, details = '') {
        if (passed) {
            this.log(`✓ ${testName}${details ? ': ' + details : ''}`, 'green');
            this.testsPassed++;
        } else {
            this.log(`✗ ${testName}${details ? ': ' + details : ''}`, 'red');
            this.testsFailed++;
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async checkServiceHealth() {
        this.log('\n🏥 Checking service health...', 'yellow');
        try {
            const response = await axios.get(`${TRANSACTION_SERVICE_URL}/health`, {
                timeout: 5000
            });
            this.logTest('Service health check', response.status === 200);
            return response.status === 200;
        } catch (error) {
            this.logTest('Service health check', false, error.message);
            return false;
        }
    }

    async connectWebSocket() {
        this.log('\n🔌 Connecting to WebSocket...', 'yellow');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, CONNECTION_TIMEOUT);

            this.ws = new WebSocket(WEBSOCKET_URL);

            this.ws.on('open', () => {
                clearTimeout(timeout);
                this.logTest('WebSocket connection', true);
                resolve();
            });

            this.ws.on('error', (error) => {
                clearTimeout(timeout);
                this.logTest('WebSocket connection', false, error.message);
                reject(error);
            });

            this.ws.on('close', () => {
                this.log('WebSocket connection closed', 'blue');
            });
        });
    }

    async subscribeToUpdates() {
        this.log('\n📡 Subscribing to transaction updates...', 'yellow');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Subscription timeout'));
            }, 5000);

            // Listen for subscription confirmation
            this.ws.once('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'subscribed') {
                        clearTimeout(timeout);
                        this.logTest('WebSocket subscription', true, `Subscriber ID: ${message.data.subscriber_id}`);
                        resolve(message.data.subscriber_id);
                    } else {
                        clearTimeout(timeout);
                        this.logTest('WebSocket subscription', false, `Unexpected message: ${message.type}`);
                        reject(new Error(`Unexpected message type: ${message.type}`));
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    this.logTest('WebSocket subscription', false, error.message);
                    reject(error);
                }
            });

            // Send subscription request
            const subscriptionRequest = {
                type: 'subscribe',
                wallet_ids: [this.testWallets.from, this.testWallets.to]
            };

            this.ws.send(JSON.stringify(subscriptionRequest));
        });
    }

    async createTransaction() {
        this.log('\n💳 Creating test transaction...', 'yellow');
        
        const transactionData = {
            from_wallet: this.testWallets.from,
            to_wallet: this.testWallets.to,
            amount: 100.0,
            currency: 'USD-CBDC',
            metadata: {
                description: 'WebSocket integration test transaction',
                category: 'test'
            }
        };

        try {
            const response = await axios.post(
                `${TRANSACTION_SERVICE_URL}/api/v1/transactions`,
                transactionData,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                }
            );

            if (response.data.transaction_id) {
                this.logTest('Transaction creation', true, `ID: ${response.data.transaction_id}`);
                return response.data.transaction_id;
            } else {
                this.logTest('Transaction creation', false, 'No transaction ID returned');
                return null;
            }
        } catch (error) {
            this.logTest('Transaction creation', false, error.message);
            return null;
        }
    }

    async waitForStatusUpdates(expectedUpdates = 2) {
        this.log(`\n📊 Waiting for ${expectedUpdates} status updates...`, 'yellow');
        
        return new Promise((resolve, reject) => {
            const receivedUpdates = [];
            const timeout = setTimeout(() => {
                this.logTest('Status updates received', receivedUpdates.length >= expectedUpdates, 
                    `Received ${receivedUpdates.length}/${expectedUpdates} updates`);
                resolve(receivedUpdates);
            }, 10000);

            const messageHandler = (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'status_update') {
                        receivedUpdates.push(message.data);
                        this.log(`📨 Status update ${receivedUpdates.length}: ${message.data.status} - ${message.data.message}`, 'blue');
                        
                        if (receivedUpdates.length >= expectedUpdates) {
                            clearTimeout(timeout);
                            this.ws.off('message', messageHandler);
                            this.logTest('Status updates received', true, `Received ${receivedUpdates.length} updates`);
                            resolve(receivedUpdates);
                        }
                    }
                } catch (error) {
                    this.log(`Error parsing message: ${error.message}`, 'red');
                }
            };

            this.ws.on('message', messageHandler);
        });
    }

    async updateFraudScore(transactionId) {
        this.log('\n🚨 Updating fraud score...', 'yellow');
        
        const fraudScoreData = {
            score: 0.85,
            details: {
                model: 'websocket_test_model',
                reason: 'integration_test'
            }
        };

        try {
            const response = await axios.patch(
                `${TRANSACTION_SERVICE_URL}/api/v1/transactions/${transactionId}/fraud-score`,
                fraudScoreData,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );

            this.logTest('Fraud score update', response.status === 200);
            return response.status === 200;
        } catch (error) {
            this.logTest('Fraud score update', false, error.message);
            return false;
        }
    }

    async updateTransactionStatus(transactionId) {
        this.log('\n🔄 Updating transaction status...', 'yellow');
        
        const statusData = {
            status: 'reversed',
            details: {
                reason: 'websocket_integration_test',
                reversed_by: 'test_system'
            }
        };

        try {
            const response = await axios.patch(
                `${TRANSACTION_SERVICE_URL}/api/v1/transactions/${transactionId}/status`,
                statusData,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );

            this.logTest('Transaction status update', response.status === 200);
            return response.status === 200;
        } catch (error) {
            this.logTest('Transaction status update', false, error.message);
            return false;
        }
    }

    async testMultipleConnections() {
        this.log('\n🔗 Testing multiple WebSocket connections...', 'yellow');
        
        const connections = [];
        const connectionPromises = [];

        for (let i = 0; i < 3; i++) {
            const ws = new WebSocket(WEBSOCKET_URL);
            connections.push(ws);
            
            connectionPromises.push(new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
                
                ws.on('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            }));
        }

        try {
            await Promise.all(connectionPromises);
            this.logTest('Multiple WebSocket connections', true, `${connections.length} connections established`);
            
            // Close all connections
            connections.forEach(ws => ws.close());
            return true;
        } catch (error) {
            this.logTest('Multiple WebSocket connections', false, error.message);
            connections.forEach(ws => ws.close());
            return false;
        }
    }

    async testConnectionResilience() {
        this.log('\n🛡️ Testing connection resilience...', 'yellow');
        
        // Test ping/pong mechanism
        return new Promise((resolve) => {
            let pongReceived = false;
            
            const timeout = setTimeout(() => {
                this.logTest('WebSocket ping/pong', pongReceived);
                resolve(pongReceived);
            }, 5000);

            this.ws.on('pong', () => {
                pongReceived = true;
                clearTimeout(timeout);
                this.logTest('WebSocket ping/pong', true);
                resolve(true);
            });

            this.ws.ping();
        });
    }

    async runTests() {
        this.log('🚀 Starting WebSocket Integration Tests', 'yellow');
        this.log('=====================================', 'yellow');

        try {
            // Test 1: Service health check
            const serviceHealthy = await this.checkServiceHealth();
            if (!serviceHealthy) {
                this.log('❌ Service is not healthy. Aborting tests.', 'red');
                return this.printSummary();
            }

            // Test 2: WebSocket connection
            await this.connectWebSocket();

            // Test 3: Subscribe to updates
            await this.subscribeToUpdates();

            // Test 4: Create transaction and wait for initial updates
            const transactionId = await this.createTransaction();
            if (transactionId) {
                await this.waitForStatusUpdates(2); // Expect created and completed events

                // Test 5: Update fraud score and wait for update
                await this.updateFraudScore(transactionId);
                await this.waitForStatusUpdates(1);

                // Test 6: Update transaction status and wait for update
                await this.updateTransactionStatus(transactionId);
                await this.waitForStatusUpdates(1);
            }

            // Test 7: Connection resilience
            await this.testConnectionResilience();

            // Test 8: Multiple connections
            await this.testMultipleConnections();

            // Close the main WebSocket connection
            if (this.ws) {
                this.ws.close();
            }

        } catch (error) {
            this.log(`❌ Test execution error: ${error.message}`, 'red');
            this.testsFailed++;
        }

        this.printSummary();
    }

    printSummary() {
        this.log('\n📊 Test Summary', 'yellow');
        this.log('==============', 'yellow');
        this.log(`Tests passed: ${this.testsPassed}`, 'green');
        this.log(`Tests failed: ${this.testsFailed}`, 'red');
        this.log(`Total tests: ${this.testsPassed + this.testsFailed}`);

        if (this.testsFailed === 0) {
            this.log('\n🎉 All WebSocket integration tests passed!', 'green');
            process.exit(0);
        } else {
            this.log('\n❌ Some WebSocket integration tests failed.', 'red');
            process.exit(1);
        }
    }
}

// Check if required dependencies are available
const checkDependencies = () => {
    try {
        require('ws');
        require('axios');
        require('uuid');
        return true;
    } catch (error) {
        console.log(`${colors.red}❌ Missing dependencies. Please install with: npm install ws axios uuid${colors.reset}`);
        return false;
    }
};

// Main execution
if (require.main === module) {
    if (checkDependencies()) {
        const test = new WebSocketIntegrationTest();
        test.runTests().catch(error => {
            console.error(`${colors.red}❌ Unhandled error: ${error.message}${colors.reset}`);
            process.exit(1);
        });
    } else {
        process.exit(1);
    }
}

module.exports = WebSocketIntegrationTest;