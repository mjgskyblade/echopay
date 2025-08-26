#!/bin/bash

# Test script for International Fraud Coordination Service
# This script tests the cross-border fraud detection and coordination functionality

set -e

echo "🌍 Testing International Fraud Coordination Service..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service URL
SERVICE_URL="http://localhost:3007"

# Function to check if service is running
check_service() {
    echo "📡 Checking if International Fraud Coordination service is running..."
    
    if curl -s "${SERVICE_URL}/health" > /dev/null; then
        echo -e "${GREEN}✅ Service is running${NC}"
        return 0
    else
        echo -e "${RED}❌ Service is not running${NC}"
        return 1
    fi
}

# Function to test cross-border fraud analysis
test_cross_border_analysis() {
    echo "🔍 Testing cross-border fraud analysis..."
    
    local response=$(curl -s -X POST "${SERVICE_URL}/api/v1/cross-border/analyze" \
        -H "Content-Type: application/json" \
        -d '{
            "transactionData": {
                "id": "tx-test-international-123",
                "fromWallet": "wallet-us-456",
                "toWallet": "wallet-eu-789",
                "amount": 500000,
                "currency": "USD-CBDC",
                "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'",
                "metadata": {
                    "description": "Large international business payment",
                    "category": "business"
                }
            },
            "jurisdictions": ["US", "EU", "UK"]
        }')
    
    if echo "$response" | jq -e '.transactionId' > /dev/null 2>&1; then
        local risk_score=$(echo "$response" | jq -r '.riskScore')
        local risk_factors=$(echo "$response" | jq -r '.riskFactors | length')
        local recommendations=$(echo "$response" | jq -r '.recommendedActions | length')
        
        echo -e "${GREEN}✅ Cross-border analysis successful${NC}"
        echo "   Risk Score: $risk_score"
        echo "   Risk Factors: $risk_factors"
        echo "   Recommendations: $recommendations"
        
        # Test high-risk scenario
        echo "🚨 Testing high-risk corridor analysis..."
        local high_risk_response=$(curl -s -X POST "${SERVICE_URL}/api/v1/cross-border/analyze" \
            -H "Content-Type: application/json" \
            -d '{
                "transactionData": {
                    "id": "tx-high-risk-456",
                    "fromWallet": "wallet-us-123",
                    "toWallet": "wallet-ru-456",
                    "amount": 2000000,
                    "currency": "USD-CBDC",
                    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
                },
                "jurisdictions": ["US", "RU"]
            }')
        
        local high_risk_score=$(echo "$high_risk_response" | jq -r '.riskScore')
        if (( $(echo "$high_risk_score > 0.3" | bc -l) )); then
            echo -e "${GREEN}✅ High-risk corridor detection working${NC}"
        else
            echo -e "${YELLOW}⚠️  High-risk corridor detection may need adjustment${NC}"
        fi
        
        return 0
    else
        echo -e "${RED}❌ Cross-border analysis failed${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Function to test pattern sharing
test_pattern_sharing() {
    echo "🔄 Testing fraud pattern sharing..."
    
    local response=$(curl -s -X POST "${SERVICE_URL}/api/v1/cross-border/patterns" \
        -H "Content-Type: application/json" \
        -d '{
            "patterns": [
                {
                    "type": "RAPID_SEQUENTIAL_TRANSFERS",
                    "indicators": [
                        {"type": "VELOCITY", "value": "HIGH"},
                        {"type": "TIMING", "value": "SUSPICIOUS"}
                    ],
                    "riskLevel": "HIGH",
                    "frequency": 15
                },
                {
                    "type": "ROUND_TRIP_TRANSACTIONS",
                    "indicators": [
                        {"type": "PATTERN", "value": "CIRCULAR"},
                        {"type": "AMOUNT", "value": "CONSISTENT"}
                    ],
                    "riskLevel": "MEDIUM",
                    "frequency": 8
                }
            ],
            "jurisdiction": "US"
        }')
    
    if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
        local shared_patterns=$(echo "$response" | jq -r '.sharedPatterns')
        echo -e "${GREEN}✅ Pattern sharing successful${NC}"
        echo "   Shared Patterns: $shared_patterns"
        return 0
    else
        echo -e "${RED}❌ Pattern sharing failed${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Function to test international case coordination
test_case_coordination() {
    echo "🤝 Testing international case coordination..."
    
    local case_id="case-international-test-$(date +%s)"
    local response=$(curl -s -X POST "${SERVICE_URL}/api/v1/cases/coordinate" \
        -H "Content-Type: application/json" \
        -d '{
            "caseData": {
                "caseId": "'$case_id'",
                "type": "MONEY_LAUNDERING",
                "description": "Large-scale money laundering operation across multiple jurisdictions",
                "amounts": {"total": 5000000, "currency": "USD-CBDC"},
                "timeframe": "ONGOING",
                "urgency": "HIGH",
                "evidenceTypes": ["TRANSACTION_LOGS", "USER_BEHAVIOR", "NETWORK_ANALYSIS", "FINANCIAL_RECORDS"]
            },
            "targetJurisdictions": ["EU", "UK", "CA"]
        }')
    
    if echo "$response" | jq -e '.coordinationId' > /dev/null 2>&1; then
        local coordination_id=$(echo "$response" | jq -r '.coordinationId')
        local priority=$(echo "$response" | jq -r '.priority')
        local jurisdictions=$(echo "$response" | jq -r '.jurisdictionalResponses | length')
        
        echo -e "${GREEN}✅ Case coordination initiated${NC}"
        echo "   Coordination ID: $coordination_id"
        echo "   Priority: $priority"
        echo "   Target Jurisdictions: $jurisdictions"
        
        # Test case status retrieval
        echo "📊 Testing case status retrieval..."
        sleep 2  # Allow some processing time
        
        local status_response=$(curl -s "${SERVICE_URL}/api/v1/cases/${case_id}/status")
        
        if echo "$status_response" | jq -e '.coordinationId' > /dev/null 2>&1; then
            local progress=$(echo "$status_response" | jq -r '.progress')
            local status=$(echo "$status_response" | jq -r '.status')
            
            echo -e "${GREEN}✅ Case status retrieval successful${NC}"
            echo "   Status: $status"
            echo "   Progress: $progress%"
            return 0
        else
            echo -e "${RED}❌ Case status retrieval failed${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Case coordination failed${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Function to test secure channel establishment
test_secure_channels() {
    echo "🔐 Testing secure communication channels..."
    
    local response=$(curl -s -X POST "${SERVICE_URL}/api/v1/secure-channel/establish" \
        -H "Content-Type: application/json" \
        -d '{
            "targetJurisdiction": "EU",
            "purpose": "case_coordination"
        }')
    
    if echo "$response" | jq -e '.channelId' > /dev/null 2>&1; then
        local channel_id=$(echo "$response" | jq -r '.channelId')
        local security_level=$(echo "$response" | jq -r '.securityLevel')
        local status=$(echo "$response" | jq -r '.status')
        
        echo -e "${GREEN}✅ Secure channel established${NC}"
        echo "   Channel ID: $channel_id"
        echo "   Security Level: $security_level"
        echo "   Status: $status"
        
        # Test secure message sending
        echo "📨 Testing secure message transmission..."
        local message_response=$(curl -s -X POST "${SERVICE_URL}/api/v1/secure-channel/send" \
            -H "Content-Type: application/json" \
            -d '{
                "channelId": "'$channel_id'",
                "message": {
                    "type": "EVIDENCE_SHARE",
                    "priority": "high",
                    "content": {
                        "caseId": "case-test-evidence",
                        "evidenceType": "TRANSACTION_LOGS",
                        "data": "encrypted_evidence_data_sample"
                    }
                },
                "recipient": "EU"
            }')
        
        if echo "$message_response" | jq -e '.messageId' > /dev/null 2>&1; then
            local message_id=$(echo "$message_response" | jq -r '.messageId')
            local message_status=$(echo "$message_response" | jq -r '.status')
            
            echo -e "${GREEN}✅ Secure message transmission successful${NC}"
            echo "   Message ID: $message_id"
            echo "   Status: $message_status"
            return 0
        else
            echo -e "${RED}❌ Secure message transmission failed${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Secure channel establishment failed${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Function to test critical priority cases
test_critical_cases() {
    echo "🚨 Testing critical priority case handling..."
    
    local critical_case_id="case-critical-$(date +%s)"
    local response=$(curl -s -X POST "${SERVICE_URL}/api/v1/cases/coordinate" \
        -H "Content-Type: application/json" \
        -d '{
            "caseData": {
                "caseId": "'$critical_case_id'",
                "type": "TERRORISM_FINANCING",
                "description": "Suspected terrorism financing network",
                "amounts": {"total": 1000000, "currency": "USD-CBDC"},
                "timeframe": "IMMEDIATE",
                "urgency": "CRITICAL",
                "evidenceTypes": ["TRANSACTION_LOGS", "INTELLIGENCE_REPORTS"]
            },
            "targetJurisdictions": ["EU", "UK"]
        }')
    
    if echo "$response" | jq -e '.coordinationId' > /dev/null 2>&1; then
        local priority=$(echo "$response" | jq -r '.priority')
        local timeline=$(echo "$response" | jq -r '.timeline[0].estimatedDuration')
        
        if [ "$priority" = "4" ]; then
            echo -e "${GREEN}✅ Critical priority assignment working${NC}"
            echo "   Priority Level: $priority (CRITICAL)"
            echo "   Initial Timeline: $timeline"
            return 0
        else
            echo -e "${YELLOW}⚠️  Critical priority not assigned correctly${NC}"
            echo "   Expected: 4, Got: $priority"
            return 1
        fi
    else
        echo -e "${RED}❌ Critical case coordination failed${NC}"
        return 1
    fi
}

# Function to test error handling
test_error_handling() {
    echo "🛡️  Testing error handling..."
    
    # Test invalid transaction data
    local invalid_response=$(curl -s -X POST "${SERVICE_URL}/api/v1/cross-border/analyze" \
        -H "Content-Type: application/json" \
        -d '{"invalid": "data"}')
    
    if echo "$invalid_response" | jq -e '.error' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Invalid data error handling working${NC}"
    else
        echo -e "${YELLOW}⚠️  Invalid data error handling may need improvement${NC}"
    fi
    
    # Test untrusted jurisdiction
    local untrusted_response=$(curl -s -X POST "${SERVICE_URL}/api/v1/secure-channel/establish" \
        -H "Content-Type: application/json" \
        -d '{
            "targetJurisdiction": "UNTRUSTED",
            "purpose": "case_coordination"
        }')
    
    if echo "$untrusted_response" | jq -e '.error' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Untrusted jurisdiction error handling working${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Untrusted jurisdiction error handling may need improvement${NC}"
        return 1
    fi
}

# Function to run unit tests
run_unit_tests() {
    echo "🧪 Running unit tests..."
    
    cd services/international-fraud-coordination
    
    if npm test; then
        echo -e "${GREEN}✅ Unit tests passed${NC}"
        cd - > /dev/null
        return 0
    else
        echo -e "${RED}❌ Unit tests failed${NC}"
        cd - > /dev/null
        return 1
    fi
}

# Main test execution
main() {
    echo "🌍 International Fraud Coordination Service Test Suite"
    echo "=================================================="
    
    local tests_passed=0
    local tests_failed=0
    
    # Check if service is running
    if ! check_service; then
        echo -e "${RED}❌ Service not available. Please start the service first.${NC}"
        exit 1
    fi
    
    # Run tests
    echo ""
    if test_cross_border_analysis; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    echo ""
    if test_pattern_sharing; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    echo ""
    if test_case_coordination; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    echo ""
    if test_secure_channels; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    echo ""
    if test_critical_cases; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    echo ""
    if test_error_handling; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    echo ""
    if run_unit_tests; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    # Summary
    echo ""
    echo "=================================================="
    echo "🌍 International Fraud Coordination Test Summary"
    echo "=================================================="
    echo -e "Tests Passed: ${GREEN}$tests_passed${NC}"
    echo -e "Tests Failed: ${RED}$tests_failed${NC}"
    
    if [ $tests_failed -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed! International fraud coordination is working correctly.${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed. Please check the implementation.${NC}"
        exit 1
    fi
}

# Check if required tools are available
if ! command -v curl &> /dev/null; then
    echo -e "${RED}❌ curl is required but not installed${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ jq is required but not installed${NC}"
    exit 1
fi

if ! command -v bc &> /dev/null; then
    echo -e "${RED}❌ bc is required but not installed${NC}"
    exit 1
fi

# Run main function
main "$@"