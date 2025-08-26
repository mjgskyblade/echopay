#!/bin/bash

# Test Cross-Jurisdiction Compliance Implementation
# This script tests the cross-jurisdiction compliance features

set -e

echo "🌍 Testing Cross-Jurisdiction Compliance Implementation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run test and check result
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -e "\n${YELLOW}Running: $test_name${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        ((TESTS_FAILED++))
    fi
}

# Start compliance service for testing
echo "🚀 Starting compliance service..."
cd services/compliance-service

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run the cross-jurisdiction compliance tests
run_test "Cross-Jurisdiction Compliance Tests" "npm test -- --testPathPattern=cross-jurisdiction-compliance.test.js"

# Test API endpoints if service is running
echo -e "\n🔧 Testing API endpoints..."

# Check if service is running (optional - for integration testing)
if curl -s http://localhost:8004/health > /dev/null 2>&1; then
    echo "✅ Compliance service is running, testing API endpoints..."
    
    # Test supported jurisdictions endpoint
    run_test "Get Supported Jurisdictions" "curl -s -f http://localhost:8004/api/v1/cross-jurisdiction/jurisdictions"
    
    # Test US compliance framework
    run_test "Get US Compliance Framework" "curl -s -f http://localhost:8004/api/v1/cross-jurisdiction/frameworks/US"
    
    # Test EU data residency rules
    run_test "Get EU Data Residency Rules" "curl -s -f http://localhost:8004/api/v1/cross-jurisdiction/data-residency/EU"
    
else
    echo "⚠️  Compliance service not running, skipping API endpoint tests"
    echo "   (This is expected for unit testing - service endpoints can be tested separately)"
fi

# Summary
echo -e "\n📊 Test Summary:"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All cross-jurisdiction compliance tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}💥 Some tests failed. Please check the output above.${NC}"
    exit 1
fi