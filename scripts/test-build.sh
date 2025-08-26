#!/bin/bash

# EchoPay Build Verification Script
set -e

echo "🔨 Testing EchoPay Project Structure and Build Process"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

echo -e "${YELLOW}1. Testing Go Services Build${NC}"
echo "--------------------------------"

# Test shared Go module
echo "Testing shared Go module..."
cd shared
go mod tidy
go build ./...
print_status $? "Shared Go libraries build"
cd ..

# Test transaction service
echo "Testing transaction service..."
cd services/transaction-service
go mod tidy
go build ./src/...
print_status $? "Transaction service build"
cd ../..

# Test token management service
echo "Testing token management service..."
cd services/token-management
go mod tidy
go build ./src/...
print_status $? "Token management service build"
cd ../..

echo -e "${YELLOW}2. Testing Python Service${NC}"
echo "--------------------------------"

# Test fraud detection service
echo "Testing fraud detection service..."
cd services/fraud-detection
python3 -m py_compile src/main.py
print_status $? "Fraud detection service syntax check"
cd ../..

echo -e "${YELLOW}3. Testing Node.js Service${NC}"
echo "--------------------------------"

# Test compliance service
echo "Testing compliance service..."
cd services/compliance-service
node -c src/index.js
print_status $? "Compliance service syntax check"
cd ../..

echo -e "${YELLOW}4. Testing Java Service${NC}"
echo "--------------------------------"

# Test reversibility service
echo "Testing reversibility service..."
cd services/reversibility-service
mvn compile -q
print_status $? "Reversibility service build"
cd ../..

echo -e "${YELLOW}5. Testing Docker Builds${NC}"
echo "--------------------------------"

# Test Docker builds (if Docker is available and running)
if command -v docker &> /dev/null && docker info &> /dev/null; then
    echo "Testing Docker builds..."
    
    # Build each service
    docker build -t echopay/transaction-service services/transaction-service/
    print_status $? "Transaction service Docker build"
    
    docker build -t echopay/token-management services/token-management/
    print_status $? "Token management Docker build"
    
    docker build -t echopay/fraud-detection services/fraud-detection/
    print_status $? "Fraud detection Docker build"
    
    docker build -t echopay/compliance-service services/compliance-service/
    print_status $? "Compliance service Docker build"
    
    docker build -t echopay/reversibility-service services/reversibility-service/
    print_status $? "Reversibility service Docker build"
else
    echo -e "${YELLOW}⚠️  Docker not available or not running, skipping Docker build tests${NC}"
fi

echo -e "${GREEN}🎉 All build tests passed!${NC}"
echo "Project structure is ready for development."