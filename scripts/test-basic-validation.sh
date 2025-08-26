#!/bin/bash

# EchoPay Basic Validation Script (No external dependencies)
set -e

echo "🔍 EchoPay Basic Project Validation"
echo "==================================="

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
        return 1
    fi
}

echo -e "${YELLOW}1. Checking Project Structure${NC}"
echo "--------------------------------"

# Check if all required files exist
required_files=(
    "docker-compose.yml:Docker Compose Configuration"
    "README.md:Project Documentation"
    "DEPLOYMENT.md:Deployment Guide"
    "Makefile:Build Automation"
    ".gitignore:Git Ignore Configuration"
)

for file in "${required_files[@]}"; do
    IFS=':' read -r filepath name <<< "$file"
    if [ -f "$filepath" ]; then
        print_status 0 "$name exists"
    else
        print_status 1 "$name missing"
    fi
done

echo -e "${YELLOW}2. Checking Service Directories${NC}"
echo "--------------------------------"

# Check service directories
services=(
    "services/transaction-service:Transaction Service"
    "services/fraud-detection:Fraud Detection Service"
    "services/token-management:Token Management Service"
    "services/compliance-service:Compliance Service"
    "services/reversibility-service:Reversibility Service"
)

for service in "${services[@]}"; do
    IFS=':' read -r dir name <<< "$service"
    if [ -d "$dir" ]; then
        print_status 0 "$name directory exists"
        
        # Check for main files
        if [ -f "$dir/Dockerfile" ]; then
            print_status 0 "$name has Dockerfile"
        else
            print_status 1 "$name missing Dockerfile"
        fi
    else
        print_status 1 "$name directory missing"
    fi
done

echo -e "${YELLOW}3. Checking Shared Libraries${NC}"
echo "--------------------------------"

# Check shared libraries
shared_libs=(
    "shared/libraries/errors:Error Handling Library"
    "shared/libraries/logging:Logging Library"
    "shared/libraries/monitoring:Monitoring Library"
    "shared/libraries/config:Configuration Library"
    "shared/libraries/http:HTTP Utilities Library"
    "shared/libraries/database:Database Utilities Library"
)

for lib in "${shared_libs[@]}"; do
    IFS=':' read -r dir name <<< "$lib"
    if [ -d "$dir" ]; then
        print_status 0 "$name exists"
    else
        print_status 1 "$name missing"
    fi
done

echo -e "${YELLOW}4. Checking API Specifications${NC}"
echo "--------------------------------"

# Check API specifications
apis=(
    "shared/apis/transaction-service.yaml:Transaction Service API"
    "shared/apis/fraud-detection.yaml:Fraud Detection API"
    "shared/apis/token-management.yaml:Token Management API"
    "shared/apis/compliance-service.yaml:Compliance Service API"
    "shared/apis/reversibility-service.yaml:Reversibility Service API"
)

for api in "${apis[@]}"; do
    IFS=':' read -r file name <<< "$api"
    if [ -f "$file" ]; then
        print_status 0 "$name exists"
        
        # Basic YAML syntax check (look for common patterns)
        if grep -q "openapi:" "$file" && grep -q "paths:" "$file"; then
            print_status 0 "$name has OpenAPI structure"
        else
            print_status 1 "$name missing OpenAPI structure"
        fi
    else
        print_status 1 "$name missing"
    fi
done

echo -e "${YELLOW}5. Checking Data Models${NC}"
echo "--------------------------------"

# Check data models
models=(
    "shared/models/transaction.yaml:Transaction Models"
    "shared/models/token.yaml:Token Models"
    "shared/models/fraud-case.yaml:Fraud Case Models"
)

for model in "${models[@]}"; do
    IFS=':' read -r file name <<< "$model"
    if [ -f "$file" ]; then
        print_status 0 "$name exists"
    else
        print_status 1 "$name missing"
    fi
done

echo -e "${YELLOW}6. Checking Infrastructure Configuration${NC}"
echo "--------------------------------"

# Check infrastructure files
infra_files=(
    "infrastructure/postgres/init/01-create-databases.sql:Database Initialization"
    "infrastructure/monitoring/prometheus.yml:Prometheus Configuration"
)

for infra in "${infra_files[@]}"; do
    IFS=':' read -r file name <<< "$infra"
    if [ -f "$file" ]; then
        print_status 0 "$name exists"
    else
        print_status 1 "$name missing"
    fi
done

echo -e "${YELLOW}7. Checking Service Configuration Files${NC}"
echo "--------------------------------"

# Check service-specific configuration files
configs=(
    "services/transaction-service/go.mod:Transaction Service Go Module"
    "services/token-management/go.mod:Token Management Go Module"
    "services/fraud-detection/requirements.txt:Fraud Detection Python Requirements"
    "services/compliance-service/package.json:Compliance Service Node.js Package"
    "services/reversibility-service/pom.xml:Reversibility Service Maven POM"
)

for config in "${configs[@]}"; do
    IFS=':' read -r file name <<< "$config"
    if [ -f "$file" ]; then
        print_status 0 "$name exists"
    else
        print_status 1 "$name missing"
    fi
done

echo ""
echo -e "${GREEN}🎉 Basic validation completed!${NC}"
echo ""
echo -e "${YELLOW}Summary:${NC}"
echo "- Project structure is in place"
echo "- All services have proper directory structure"
echo "- Shared libraries are available"
echo "- API specifications are defined"
echo "- Infrastructure configuration is ready"
echo ""
echo -e "${YELLOW}Next steps for testing:${NC}"
echo "1. Install dependencies (Go, Python, Node.js, Java, Docker)"
echo "2. Run 'make test-build' to verify builds"
echo "3. Run 'make test-integration' to test service startup"
echo "4. Proceed with implementing the next task"