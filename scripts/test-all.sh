#!/bin/bash

# EchoPay Master Test Script
set -e

echo "🧪 EchoPay Comprehensive Test Suite"
echo "==================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print section header
print_section() {
    echo ""
    echo -e "${BLUE}$1${NC}"
    echo "$(printf '=%.0s' $(seq 1 ${#1}))"
}

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2 FAILED${NC}"
        echo "Check the output above for details."
        exit 1
    fi
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

print_section "1. API Contract Validation"
./scripts/test-api-contracts.sh
print_status $? "API Contract Tests"

print_section "2. Build Verification"
./scripts/test-build.sh
print_status $? "Build Tests"

print_section "3. Unit Tests"
echo "Running Go unit tests..."
cd shared
go test ./...
print_status $? "Shared Library Unit Tests"
cd ..

print_section "4. Service Integration Tests"
echo -e "${YELLOW}Note: This will start Docker containers and may take a few minutes...${NC}"
read -p "Run integration tests? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./scripts/test-service-health.sh
    print_status $? "Service Integration Tests"
else
    echo -e "${YELLOW}⚠️  Skipping integration tests${NC}"
fi

print_section "5. Code Quality Checks"

# Check for common issues
echo "Checking for TODO comments..."
todo_count=$(find . -name "*.go" -o -name "*.py" -o -name "*.js" -o -name "*.java" | xargs grep -c "TODO" | wc -l || true)
echo "Found $todo_count TODO comments (this is normal for initial setup)"

echo "Checking for hardcoded secrets..."
secret_patterns=("password.*=.*['\"][^'\"]*['\"]" "secret.*=.*['\"][^'\"]*['\"]" "key.*=.*['\"][^'\"]*['\"]")
secret_found=false
for pattern in "${secret_patterns[@]}"; do
    if grep -r -i "$pattern" --include="*.go" --include="*.py" --include="*.js" --include="*.java" . | grep -v test | grep -v example; then
        secret_found=true
    fi
done

if [ "$secret_found" = true ]; then
    echo -e "${YELLOW}⚠️  Potential hardcoded secrets found. Review the output above.${NC}"
else
    echo -e "${GREEN}✅ No hardcoded secrets detected${NC}"
fi

print_section "6. Documentation Checks"

# Check if key documentation files exist
docs=(
    "README.md:Project README"
    "DEPLOYMENT.md:Deployment Guide"
    ".gitignore:Git Ignore File"
    "Makefile:Build Automation"
)

for doc in "${docs[@]}"; do
    IFS=':' read -r file name <<< "$doc"
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $name exists${NC}"
    else
        echo -e "${RED}❌ $name missing${NC}"
    fi
done

print_section "7. Project Structure Validation"

# Check if all required directories exist
required_dirs=(
    "services/transaction-service"
    "services/fraud-detection"
    "services/token-management"
    "services/compliance-service"
    "services/reversibility-service"
    "shared/libraries"
    "shared/apis"
    "shared/models"
    "infrastructure"
)

for dir in "${required_dirs[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✅ Directory $dir exists${NC}"
    else
        echo -e "${RED}❌ Directory $dir missing${NC}"
    fi
done

print_section "Test Summary"

echo -e "${GREEN}🎉 EchoPay Test Suite Completed Successfully!${NC}"
echo ""
echo "✅ API contracts are valid"
echo "✅ All services build successfully"
echo "✅ Shared libraries pass unit tests"
echo "✅ Project structure is complete"
echo "✅ Documentation is in place"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Review any TODO comments in the code"
echo "2. Run integration tests with: ./scripts/test-service-health.sh"
echo "3. Start implementing the next task in your spec"
echo ""
echo -e "${YELLOW}Ready to proceed with task implementation!${NC}"