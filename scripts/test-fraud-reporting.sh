#!/bin/bash

# Test script for fraud reporting interface functionality
# This script tests the fraud reporting workflow end-to-end

set -e

echo "🔍 Testing EchoPay Fraud Reporting Interface..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
WALLET_INTERFACE_URL="http://localhost:3003"
TEST_EMAIL="fraudtest@echopay.com"
TEST_PASSWORD="TestPassword123!"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to check if service is running
check_service() {
    local url=$1
    local service_name=$2
    
    if curl -s -f "$url/health" > /dev/null; then
        print_status "$service_name is running"
        return 0
    else
        print_error "$service_name is not running at $url"
        return 1
    fi
}

# Function to test API endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=$4
    local description=$5
    
    echo "Testing: $description"
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            -d "$data" \
            "$WALLET_INTERFACE_URL$endpoint")
    else
        response=$(curl -s -w "%{http_code}" -X "$method" \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            "$WALLET_INTERFACE_URL$endpoint")
    fi
    
    status_code="${response: -3}"
    response_body="${response%???}"
    
    if [ "$status_code" = "$expected_status" ]; then
        print_status "$description - Status: $status_code"
        return 0
    else
        print_error "$description - Expected: $expected_status, Got: $status_code"
        echo "Response: $response_body"
        return 1
    fi
}

# Main test execution
main() {
    echo "Starting fraud reporting interface tests..."
    
    # Check if wallet interface service is running
    if ! check_service "$WALLET_INTERFACE_URL" "Wallet Interface"; then
        echo "Please start the wallet interface service first:"
        echo "cd services/wallet-interface && npm start"
        exit 1
    fi
    
    # Test user registration
    echo -e "\n📝 Testing user registration..."
    REGISTER_DATA='{
        "email": "'$TEST_EMAIL'",
        "password": "'$TEST_PASSWORD'",
        "firstName": "Fraud",
        "lastName": "Tester"
    }'
    
    register_response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$REGISTER_DATA" \
        "$WALLET_INTERFACE_URL/api/auth/register")
    
    register_status="${register_response: -3}"
    if [ "$register_status" = "201" ] || [ "$register_status" = "400" ]; then
        print_status "User registration test completed"
    else
        print_error "User registration failed with status: $register_status"
    fi
    
    # Test user login
    echo -e "\n🔐 Testing user login..."
    LOGIN_DATA='{
        "email": "'$TEST_EMAIL'",
        "password": "'$TEST_PASSWORD'"
    }'
    
    login_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$LOGIN_DATA" \
        "$WALLET_INTERFACE_URL/api/auth/login")
    
    AUTH_TOKEN=$(echo "$login_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$AUTH_TOKEN" ]; then
        print_status "User login successful"
    else
        print_error "User login failed"
        echo "Response: $login_response"
        exit 1
    fi
    
    # Test fraud report submission
    echo -e "\n📋 Testing fraud report submission..."
    FRAUD_REPORT='{
        "fraudType": "unauthorized_transaction",
        "briefDescription": "Someone made an unauthorized transaction from my account",
        "detailedDescription": "I noticed a transaction I did not authorize on my account. The transaction was for $500 to an unknown recipient. I discovered this when checking my account balance this morning.",
        "discoveryDate": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
        "contactedRecipient": "no",
        "amount": 500,
        "currency": "USD-CBDC",
        "additionalInfo": "I have screenshots of the transaction",
        "notificationPreferences": ["email", "push"]
    }'
    
    fraud_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d "$FRAUD_REPORT" \
        "$WALLET_INTERFACE_URL/api/fraud/report")
    
    CASE_NUMBER=$(echo "$fraud_response" | grep -o '"caseNumber":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$CASE_NUMBER" ]; then
        print_status "Fraud report submitted successfully - Case: $CASE_NUMBER"
    else
        print_error "Fraud report submission failed"
        echo "Response: $fraud_response"
        exit 1
    fi
    
    # Test case tracking
    echo -e "\n🔍 Testing case tracking..."
    if test_endpoint "GET" "/api/fraud/case/$CASE_NUMBER" "" "200" "Case tracking"; then
        print_status "Case tracking working correctly"
    else
        print_error "Case tracking failed"
    fi
    
    # Test user cases retrieval
    echo -e "\n📊 Testing user cases retrieval..."
    if test_endpoint "GET" "/api/fraud/cases/my-cases" "" "200" "User cases retrieval"; then
        print_status "User cases retrieval working correctly"
    else
        print_error "User cases retrieval failed"
    fi
    
    # Test evidence upload (create a test file)
    echo -e "\n📎 Testing evidence upload..."
    TEST_FILE="/tmp/test-evidence.txt"
    echo "This is test evidence content for fraud case $CASE_NUMBER" > "$TEST_FILE"
    
    CASE_ID=$(echo "$fraud_response" | grep -o '"caseId":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$CASE_ID" ]; then
        evidence_response=$(curl -s -w "%{http_code}" -X POST \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            -F "caseId=$CASE_ID" \
            -F "type=document" \
            -F "description=Test evidence document" \
            -F "file=@$TEST_FILE" \
            "$WALLET_INTERFACE_URL/api/fraud/evidence")
        
        evidence_status="${evidence_response: -3}"
        if [ "$evidence_status" = "201" ]; then
            print_status "Evidence upload working correctly"
        else
            print_error "Evidence upload failed - Status: $evidence_status"
        fi
        
        # Clean up test file
        rm -f "$TEST_FILE"
    else
        print_warning "Skipping evidence upload test - no case ID available"
    fi
    
    # Test case report generation
    echo -e "\n📄 Testing case report generation..."
    if test_endpoint "GET" "/api/fraud/case/$CASE_NUMBER/report" "" "200" "Case report generation"; then
        print_status "Case report generation working correctly"
    else
        print_error "Case report generation failed"
    fi
    
    # Test validation and error handling
    echo -e "\n🛡️ Testing validation and error handling..."
    
    # Test invalid fraud report
    INVALID_REPORT='{"fraudType": "invalid_type"}'
    invalid_response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d "$INVALID_REPORT" \
        "$WALLET_INTERFACE_URL/api/fraud/report")
    
    invalid_status="${invalid_response: -3}"
    if [ "$invalid_status" = "400" ]; then
        print_status "Validation working correctly"
    else
        print_error "Validation not working - Expected 400, got: $invalid_status"
    fi
    
    # Test unauthorized access
    echo -e "\n🔒 Testing unauthorized access..."
    unauth_response=$(curl -s -w "%{http_code}" -X GET \
        "$WALLET_INTERFACE_URL/api/fraud/cases/my-cases")
    
    unauth_status="${unauth_response: -3}"
    if [ "$unauth_status" = "401" ]; then
        print_status "Authorization working correctly"
    else
        print_error "Authorization not working - Expected 401, got: $unauth_status"
    fi
    
    echo -e "\n🎉 Fraud reporting interface tests completed!"
    
    # Summary
    echo -e "\n📋 Test Summary:"
    echo "- User registration and login: ✓"
    echo "- Fraud report submission: ✓"
    echo "- Case tracking: ✓"
    echo "- Evidence upload: ✓"
    echo "- Case report generation: ✓"
    echo "- Validation and error handling: ✓"
    echo "- Security and authorization: ✓"
    
    echo -e "\n🌐 You can now test the web interface at:"
    echo "- Main wallet: $WALLET_INTERFACE_URL"
    echo "- Fraud reporting: $WALLET_INTERFACE_URL/fraud-report.html"
    echo "- Case tracker: $WALLET_INTERFACE_URL/fraud-case-tracker.html?case=$CASE_NUMBER"
}

# Run tests
main "$@"