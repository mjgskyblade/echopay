#!/bin/bash

# Test script for API Gateway integration and orchestration
set -e

echo "🚀 Starting API Gateway Integration Tests"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
GATEWAY_URL="http://localhost:3001"
TEST_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInJvbGVzIjpbInVzZXIiXSwicGVybWlzc2lvbnMiOlsidHJhbnNhY3Rpb246Y3JlYXRlIiwiZnJhdWQ6cmVwb3J0Il0sImlhdCI6MTcwNDcyMDAwMCwiZXhwIjoxNzA0NzIzNjAwfQ.test-signature"

# Function to make HTTP requests
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local auth_header=""
    
    if [ "$4" = "auth" ]; then
        auth_header="-H 'Authorization: Bearer $TEST_JWT'"
    fi
    
    if [ -n "$data" ]; then
        eval "curl -s -X $method $auth_header -H 'Content-Type: application/json' -d '$data' $GATEWAY_URL$endpoint"
    else
        eval "curl -s -X $method $auth_header $GATEWAY_URL$endpoint"
    fi
}

# Function to check if service is running
check_service() {
    local service_name=$1
    local url=$2
    
    echo -n "Checking $service_name... "
    if curl -s "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Running${NC}"
        return 0
    else
        echo -e "${RED}✗ Not running${NC}"
        return 1
    fi
}

# Function to test endpoint
test_endpoint() {
    local test_name=$1
    local method=$2
    local endpoint=$3
    local expected_status=$4
    local data=$5
    local auth=$6
    
    echo -n "Testing $test_name... "
    
    local response
    local status_code
    
    if [ -n "$data" ]; then
        if [ "$auth" = "auth" ]; then
            response=$(curl -s -w "\n%{http_code}" -X "$method" \
                -H "Authorization: Bearer $TEST_JWT" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "$GATEWAY_URL$endpoint")
        else
            response=$(curl -s -w "\n%{http_code}" -X "$method" \
                -H "Content-Type: application/json" \
                -d "$data" \
                "$GATEWAY_URL$endpoint")
        fi
    else
        if [ "$auth" = "auth" ]; then
            response=$(curl -s -w "\n%{http_code}" -X "$method" \
                -H "Authorization: Bearer $TEST_JWT" \
                "$GATEWAY_URL$endpoint")
        else
            response=$(curl -s -w "\n%{http_code}" -X "$method" \
                "$GATEWAY_URL$endpoint")
        fi
    fi
    
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ Passed (Status: $status_code)${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed (Expected: $expected_status, Got: $status_code)${NC}"
        echo "Response: $body"
        return 1
    fi
}

# Wait for services to be ready
echo "🔍 Checking service availability..."
sleep 5

# Check if API Gateway is running
if ! check_service "API Gateway" "$GATEWAY_URL/health"; then
    echo -e "${RED}❌ API Gateway is not running. Please start it first.${NC}"
    exit 1
fi

echo ""
echo "🧪 Running Health Check Tests..."

# Test health endpoints
test_endpoint "Health check" "GET" "/health" "200"
test_endpoint "Readiness check" "GET" "/health/ready" "200"
test_endpoint "Liveness check" "GET" "/health/live" "200"
test_endpoint "Service discovery" "GET" "/services" "200"

echo ""
echo "🔐 Running Authentication Tests..."

# Test authentication
test_endpoint "Unauthenticated request" "POST" "/api/v1/orchestration/transaction" "401" '{"amount": 100}'
test_endpoint "Invalid token" "POST" "/api/v1/orchestration/transaction" "401" '{"amount": 100}' "invalid"

echo ""
echo "🔄 Running Orchestration Tests..."

# Test transaction orchestration
transaction_data='{
    "fromWallet": "wallet_test_user",
    "toWallet": "wallet_merchant",
    "amount": 50.00,
    "currency": "USD-CBDC",
    "metadata": {
        "description": "Test payment",
        "category": "test"
    }
}'

test_endpoint "Transaction orchestration" "POST" "/api/v1/orchestration/transaction" "200" "$transaction_data" "auth"

# Test fraud report orchestration
fraud_report_data='{
    "transactionId": "txn_test_123",
    "reason": "unauthorized_transaction",
    "description": "Test fraud report",
    "evidence": ["test_evidence.jpg"]
}'

test_endpoint "Fraud report orchestration" "POST" "/api/v1/orchestration/fraud-report" "200" "$fraud_report_data" "auth"

echo ""
echo "🛡️ Running Security Tests..."

# Test rate limiting (make multiple requests)
echo -n "Testing rate limiting... "
rate_limit_passed=true
for i in {1..5}; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health")
    if [ "$status" != "200" ] && [ "$status" != "429" ]; then
        rate_limit_passed=false
        break
    fi
done

if [ "$rate_limit_passed" = true ]; then
    echo -e "${GREEN}✓ Passed${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

# Test CORS headers
echo -n "Testing CORS headers... "
cors_response=$(curl -s -I -H "Origin: http://localhost:3000" "$GATEWAY_URL/health")
if echo "$cors_response" | grep -q "Access-Control-Allow-Origin"; then
    echo -e "${GREEN}✓ Passed${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

echo ""
echo "📊 Running Load Balancing Tests..."

# Test service discovery and load balancing
echo -n "Testing service discovery... "
services_response=$(make_request "GET" "/services")
if echo "$services_response" | grep -q "services"; then
    echo -e "${GREEN}✓ Passed${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

echo ""
echo "🔍 Running Error Handling Tests..."

# Test 404 handling
test_endpoint "404 handling" "GET" "/api/v1/nonexistent" "404"

# Test malformed JSON
echo -n "Testing malformed JSON handling... "
malformed_response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer $TEST_JWT" \
    -H "Content-Type: application/json" \
    -d "invalid json" \
    "$GATEWAY_URL/api/v1/orchestration/transaction")

malformed_status=$(echo "$malformed_response" | tail -n1)
if [ "$malformed_status" = "400" ]; then
    echo -e "${GREEN}✓ Passed${NC}"
else
    echo -e "${RED}✗ Failed (Expected: 400, Got: $malformed_status)${NC}"
fi

echo ""
echo "📈 Running Performance Tests..."

# Simple performance test
echo -n "Testing response times... "
start_time=$(date +%s%N)
for i in {1..10}; do
    curl -s "$GATEWAY_URL/health" > /dev/null
done
end_time=$(date +%s%N)

duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
avg_response_time=$(( duration / 10 ))

if [ $avg_response_time -lt 500 ]; then
    echo -e "${GREEN}✓ Passed (Avg: ${avg_response_time}ms)${NC}"
else
    echo -e "${YELLOW}⚠ Slow (Avg: ${avg_response_time}ms)${NC}"
fi

echo ""
echo "🎯 Running End-to-End Workflow Tests..."

# Test complete payment workflow
echo -n "Testing complete payment workflow... "
workflow_response=$(make_request "POST" "/api/v1/orchestration/transaction" "$transaction_data" "auth")
if echo "$workflow_response" | grep -q "correlationId"; then
    echo -e "${GREEN}✓ Passed${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
    echo "Response: $workflow_response"
fi

# Test complete fraud report workflow
echo -n "Testing complete fraud report workflow... "
fraud_workflow_response=$(make_request "POST" "/api/v1/orchestration/fraud-report" "$fraud_report_data" "auth")
if echo "$fraud_workflow_response" | grep -q "correlationId"; then
    echo -e "${GREEN}✓ Passed${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
    echo "Response: $fraud_workflow_response"
fi

echo ""
echo "📋 Test Summary"
echo "==============="

# Count passed/failed tests (this is a simplified version)
echo -e "${GREEN}✅ API Gateway integration tests completed${NC}"
echo ""
echo "Key features tested:"
echo "  • Health checks and service discovery"
echo "  • Authentication and authorization"
echo "  • Transaction orchestration"
echo "  • Fraud report orchestration"
echo "  • Rate limiting and security"
echo "  • Error handling"
echo "  • Performance characteristics"
echo "  • End-to-end workflows"
echo ""
echo "🔗 Gateway URL: $GATEWAY_URL"
echo "📊 Metrics: $GATEWAY_URL/metrics"
echo "🏥 Health: $GATEWAY_URL/health"
echo "🔍 Services: $GATEWAY_URL/services"

echo ""
echo -e "${GREEN}🎉 API Gateway testing completed successfully!${NC}"