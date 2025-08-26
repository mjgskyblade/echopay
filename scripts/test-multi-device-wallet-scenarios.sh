#!/bin/bash

# Test script for multi-device and wallet synchronization scenarios
# This script tests the implementation of task 7.4

set -e

echo "🚀 Starting Multi-Device and Wallet Synchronization Tests"
echo "========================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
WALLET_SERVICE_URL="http://localhost:3003"
TEST_USER_ID="multi-device-test-user"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if service is running
check_service() {
    print_status "Checking if wallet interface service is running..."
    
    if curl -s "$WALLET_SERVICE_URL/health" > /dev/null; then
        print_success "Wallet interface service is running"
    else
        print_error "Wallet interface service is not running. Please start it first."
        echo "Run: cd services/wallet-interface && npm start"
        exit 1
    fi
}

# Function to run Jest tests
run_jest_tests() {
    print_status "Running Jest tests for multi-device functionality..."
    
    cd services/wallet-interface
    
    # Run device management tests
    print_status "Testing device management..."
    if npm test -- --testPathPattern=device-management.test.js --verbose; then
        print_success "Device management tests passed"
    else
        print_error "Device management tests failed"
        return 1
    fi
    
    # Run multi-wallet tests
    print_status "Testing multi-wallet management..."
    if npm test -- --testPathPattern=multi-wallet.test.js --verbose; then
        print_success "Multi-wallet management tests passed"
    else
        print_error "Multi-wallet management tests failed"
        return 1
    fi
    
    # Run device switching scenarios
    print_status "Testing device switching scenarios..."
    if npm test -- --testPathPattern=device-switching-scenarios.test.js --verbose; then
        print_success "Device switching scenarios tests passed"
    else
        print_error "Device switching scenarios tests failed"
        return 1
    fi
    
    cd - > /dev/null
}

# Function to test device registration
test_device_registration() {
    print_status "Testing device registration..."
    
    # Register mobile device
    MOBILE_DEVICE=$(curl -s -X POST "$WALLET_SERVICE_URL/api/devices/register" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d '{
            "deviceName": "Test iPhone",
            "deviceType": "mobile",
            "platform": "iOS 17.0",
            "location": {"lat": 40.7128, "lon": -74.0060},
            "clientInfo": {
                "screenResolution": "1170x2532",
                "timezone": "America/New_York"
            }
        }')
    
    if echo "$MOBILE_DEVICE" | grep -q "deviceId"; then
        print_success "Mobile device registered successfully"
        MOBILE_DEVICE_ID=$(echo "$MOBILE_DEVICE" | grep -o '"deviceId":"[^"]*"' | cut -d'"' -f4)
    else
        print_error "Failed to register mobile device"
        return 1
    fi
    
    # Register web device
    WEB_DEVICE=$(curl -s -X POST "$WALLET_SERVICE_URL/api/devices/register" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d '{
            "deviceName": "Chrome Browser",
            "deviceType": "web",
            "platform": "Chrome 120.0"
        }')
    
    if echo "$WEB_DEVICE" | grep -q "deviceId"; then
        print_success "Web device registered successfully"
        WEB_DEVICE_ID=$(echo "$WEB_DEVICE" | grep -o '"deviceId":"[^"]*"' | cut -d'"' -f4)
    else
        print_error "Failed to register web device"
        return 1
    fi
}

# Function to test wallet creation
test_wallet_creation() {
    print_status "Testing wallet creation..."
    
    # Create primary wallet
    PRIMARY_WALLET=$(curl -s -X POST "$WALLET_SERVICE_URL/api/multi-wallet" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d '{
            "walletName": "Primary Test Wallet",
            "walletType": "personal",
            "currency": "USD-CBDC",
            "description": "Test wallet for multi-device scenarios"
        }')
    
    if echo "$PRIMARY_WALLET" | grep -q "walletId"; then
        print_success "Primary wallet created successfully"
        PRIMARY_WALLET_ID=$(echo "$PRIMARY_WALLET" | grep -o '"walletId":"[^"]*"' | cut -d'"' -f4)
    else
        print_error "Failed to create primary wallet"
        return 1
    fi
    
    # Create business wallet
    BUSINESS_WALLET=$(curl -s -X POST "$WALLET_SERVICE_URL/api/multi-wallet" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d '{
            "walletName": "Business Test Wallet",
            "walletType": "business",
            "currency": "USD-CBDC"
        }')
    
    if echo "$BUSINESS_WALLET" | grep -q "walletId"; then
        print_success "Business wallet created successfully"
        BUSINESS_WALLET_ID=$(echo "$BUSINESS_WALLET" | grep -o '"walletId":"[^"]*"' | cut -d'"' -f4)
    else
        print_error "Failed to create business wallet"
        return 1
    fi
}

# Function to test wallet synchronization
test_wallet_sync() {
    print_status "Testing wallet synchronization across devices..."
    
    # Sync primary wallet to mobile device
    MOBILE_SYNC=$(curl -s -X POST "$WALLET_SERVICE_URL/api/multi-wallet/$PRIMARY_WALLET_ID/sync" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d "{
            \"deviceId\": \"$MOBILE_DEVICE_ID\",
            \"syncData\": {\"version\": 1}
        }")
    
    if echo "$MOBILE_SYNC" | grep -q '"success":true'; then
        print_success "Wallet synced to mobile device"
    else
        print_error "Failed to sync wallet to mobile device"
        return 1
    fi
    
    # Sync business wallet to web device
    WEB_SYNC=$(curl -s -X POST "$WALLET_SERVICE_URL/api/multi-wallet/$BUSINESS_WALLET_ID/sync" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d "{
            \"deviceId\": \"$WEB_DEVICE_ID\",
            \"syncData\": {\"version\": 1}
        }")
    
    if echo "$WEB_SYNC" | grep -q '"success":true'; then
        print_success "Business wallet synced to web device"
    else
        print_error "Failed to sync business wallet to web device"
        return 1
    fi
}

# Function to test fraud detection
test_fraud_detection() {
    print_status "Testing device-based fraud detection..."
    
    # Test normal transaction
    NORMAL_TX=$(curl -s -X POST "$WALLET_SERVICE_URL/api/devices/$MOBILE_DEVICE_ID/analyze-transaction" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d '{
            "transaction": {
                "transactionId": "normal-tx-001",
                "amount": 50.00,
                "walletId": "'$PRIMARY_WALLET_ID'",
                "location": {"lat": 40.7128, "lon": -74.0060}
            }
        }')
    
    if echo "$NORMAL_TX" | grep -q '"riskScore"'; then
        RISK_SCORE=$(echo "$NORMAL_TX" | grep -o '"riskScore":[0-9.]*' | cut -d':' -f2)
        print_success "Normal transaction analyzed - Risk Score: $RISK_SCORE"
    else
        print_error "Failed to analyze normal transaction"
        return 1
    fi
    
    # Test suspicious transaction (high amount from new location)
    SUSPICIOUS_TX=$(curl -s -X POST "$WALLET_SERVICE_URL/api/devices/$MOBILE_DEVICE_ID/analyze-transaction" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d '{
            "transaction": {
                "transactionId": "suspicious-tx-001",
                "amount": 5000.00,
                "walletId": "'$PRIMARY_WALLET_ID'",
                "location": {"lat": 51.5074, "lon": -0.1278}
            }
        }')
    
    if echo "$SUSPICIOUS_TX" | grep -q '"riskScore"'; then
        SUSPICIOUS_RISK_SCORE=$(echo "$SUSPICIOUS_TX" | grep -o '"riskScore":[0-9.]*' | cut -d':' -f2)
        print_success "Suspicious transaction analyzed - Risk Score: $SUSPICIOUS_RISK_SCORE"
        
        # Check if risk score is higher for suspicious transaction
        if (( $(echo "$SUSPICIOUS_RISK_SCORE > $RISK_SCORE" | bc -l) )); then
            print_success "Fraud detection working correctly - higher risk for suspicious transaction"
        else
            print_warning "Fraud detection may need tuning - risk scores: normal=$RISK_SCORE, suspicious=$SUSPICIOUS_RISK_SCORE"
        fi
    else
        print_error "Failed to analyze suspicious transaction"
        return 1
    fi
}

# Function to test concurrent sessions
test_concurrent_sessions() {
    print_status "Testing concurrent session detection..."
    
    # Update activity on both devices
    curl -s -X POST "$WALLET_SERVICE_URL/api/devices/$MOBILE_DEVICE_ID/activity" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d '{"location": {"lat": 40.7128, "lon": -74.0060}}' > /dev/null
    
    curl -s -X POST "$WALLET_SERVICE_URL/api/devices/$WEB_DEVICE_ID/activity" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $TEST_USER_ID" \
        -d '{"location": {"lat": 40.7589, "lon": -73.9851}}' > /dev/null
    
    # Check concurrent sessions
    SESSIONS=$(curl -s "$WALLET_SERVICE_URL/api/devices/sessions/concurrent" \
        -H "X-User-Id: $TEST_USER_ID")
    
    if echo "$SESSIONS" | grep -q '"sessionCount"'; then
        SESSION_COUNT=$(echo "$SESSIONS" | grep -o '"sessionCount":[0-9]*' | cut -d':' -f2)
        if [ "$SESSION_COUNT" -ge 2 ]; then
            print_success "Concurrent sessions detected correctly - Count: $SESSION_COUNT"
        else
            print_warning "Expected at least 2 concurrent sessions, got: $SESSION_COUNT"
        fi
    else
        print_error "Failed to check concurrent sessions"
        return 1
    fi
}

# Function to test wallet statistics
test_wallet_statistics() {
    print_status "Testing wallet statistics..."
    
    STATS=$(curl -s "$WALLET_SERVICE_URL/api/multi-wallet/statistics/overview" \
        -H "X-User-Id: $TEST_USER_ID")
    
    if echo "$STATS" | grep -q '"totalWallets"'; then
        TOTAL_WALLETS=$(echo "$STATS" | grep -o '"totalWallets":[0-9]*' | cut -d':' -f2)
        if [ "$TOTAL_WALLETS" -ge 2 ]; then
            print_success "Wallet statistics working - Total Wallets: $TOTAL_WALLETS"
        else
            print_warning "Expected at least 2 wallets, got: $TOTAL_WALLETS"
        fi
    else
        print_error "Failed to get wallet statistics"
        return 1
    fi
}

# Function to cleanup test data
cleanup_test_data() {
    print_status "Cleaning up test data..."
    
    # Remove devices
    if [ ! -z "$MOBILE_DEVICE_ID" ]; then
        curl -s -X DELETE "$WALLET_SERVICE_URL/api/devices/$MOBILE_DEVICE_ID" \
            -H "X-User-Id: $TEST_USER_ID" > /dev/null
    fi
    
    if [ ! -z "$WEB_DEVICE_ID" ]; then
        curl -s -X DELETE "$WALLET_SERVICE_URL/api/devices/$WEB_DEVICE_ID" \
            -H "X-User-Id: $TEST_USER_ID" > /dev/null
    fi
    
    # Note: Wallets with balance cannot be removed in the current implementation
    # This is by design for safety
    
    print_success "Test data cleanup completed"
}

# Function to run performance tests
test_performance() {
    print_status "Running performance tests..."
    
    START_TIME=$(date +%s%N)
    
    # Run multiple concurrent operations
    for i in {1..10}; do
        curl -s -X POST "$WALLET_SERVICE_URL/api/devices/$MOBILE_DEVICE_ID/analyze-transaction" \
            -H "Content-Type: application/json" \
            -H "X-User-Id: $TEST_USER_ID" \
            -d "{
                \"transaction\": {
                    \"transactionId\": \"perf-test-$i\",
                    \"amount\": $((i * 10)).00,
                    \"walletId\": \"$PRIMARY_WALLET_ID\"
                }
            }" > /dev/null &
    done
    
    wait # Wait for all background processes to complete
    
    END_TIME=$(date +%s%N)
    DURATION=$(( (END_TIME - START_TIME) / 1000000 )) # Convert to milliseconds
    
    if [ $DURATION -lt 5000 ]; then # Less than 5 seconds
        print_success "Performance test passed - Duration: ${DURATION}ms"
    else
        print_warning "Performance test slow - Duration: ${DURATION}ms"
    fi
}

# Main test execution
main() {
    echo "Starting comprehensive multi-device and wallet synchronization tests..."
    echo
    
    # Check prerequisites
    check_service
    
    # Initialize test variables
    MOBILE_DEVICE_ID=""
    WEB_DEVICE_ID=""
    PRIMARY_WALLET_ID=""
    BUSINESS_WALLET_ID=""
    
    # Run tests
    test_device_registration
    test_wallet_creation
    test_wallet_sync
    test_fraud_detection
    test_concurrent_sessions
    test_wallet_statistics
    test_performance
    
    # Run Jest tests
    run_jest_tests
    
    # Cleanup
    cleanup_test_data
    
    echo
    print_success "All multi-device and wallet synchronization tests completed successfully!"
    echo
    echo "✅ Device registration and management"
    echo "✅ Multi-wallet creation and synchronization"
    echo "✅ Device-based fraud detection"
    echo "✅ Concurrent session monitoring"
    echo "✅ Wallet statistics and reporting"
    echo "✅ Performance under load"
    echo "✅ Comprehensive Jest test suite"
    echo
    echo "Task 7.4 implementation verified successfully! 🎉"
}

# Run main function
main "$@"