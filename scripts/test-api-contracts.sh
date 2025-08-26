#!/bin/bash

# EchoPay API Contract Validation Script
set -e

echo "📋 Testing EchoPay API Contracts"
echo "================================"

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

# Function to validate YAML syntax
validate_yaml() {
    local file=$1
    local name=$2
    
    echo "Validating $name..."
    
    # Check if file exists
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ File not found: $file${NC}"
        return 1
    fi
    
    # Validate YAML syntax using Python
    python3 -c "
import yaml
import sys
try:
    with open('$file', 'r') as f:
        yaml.safe_load(f)
    print('✓ Valid YAML syntax')
except yaml.YAMLError as e:
    print(f'✗ YAML syntax error: {e}')
    sys.exit(1)
except Exception as e:
    print(f'✗ Error reading file: {e}')
    sys.exit(1)
"
    return $?
}

# Function to validate OpenAPI structure
validate_openapi() {
    local file=$1
    local name=$2
    
    echo "Validating OpenAPI structure for $name..."
    
    python3 -c "
import yaml
import sys

try:
    with open('$file', 'r') as f:
        spec = yaml.safe_load(f)
    
    # Check required OpenAPI fields
    required_fields = ['openapi', 'info', 'paths']
    for field in required_fields:
        if field not in spec:
            print(f'✗ Missing required field: {field}')
            sys.exit(1)
    
    # Check OpenAPI version
    if not spec['openapi'].startswith('3.'):
        print(f'✗ Unsupported OpenAPI version: {spec[\"openapi\"]}')
        sys.exit(1)
    
    # Check info section
    info_fields = ['title', 'version']
    for field in info_fields:
        if field not in spec['info']:
            print(f'✗ Missing info field: {field}')
            sys.exit(1)
    
    # Check paths
    if not spec['paths']:
        print('✗ No paths defined')
        sys.exit(1)
    
    print('✓ Valid OpenAPI 3.0 structure')
    print(f'✓ Service: {spec[\"info\"][\"title\"]}')
    print(f'✓ Version: {spec[\"info\"][\"version\"]}')
    print(f'✓ Endpoints: {len(spec[\"paths\"])}')
    
except Exception as e:
    print(f'✗ Error validating OpenAPI spec: {e}')
    sys.exit(1)
"
    return $?
}

echo -e "${YELLOW}1. Validating API Specifications${NC}"
echo "--------------------------------"

# Validate each API specification
apis=(
    "shared/apis/transaction-service.yaml:Transaction Service API"
    "shared/apis/fraud-detection.yaml:Fraud Detection API"
    "shared/apis/token-management.yaml:Token Management API"
    "shared/apis/compliance-service.yaml:Compliance Service API"
    "shared/apis/reversibility-service.yaml:Reversibility Service API"
)

for api in "${apis[@]}"; do
    IFS=':' read -r file name <<< "$api"
    echo ""
    echo "Testing $name..."
    validate_yaml "$file" "$name"
    print_status $? "$name YAML syntax"
    
    validate_openapi "$file" "$name"
    print_status $? "$name OpenAPI structure"
done

echo -e "${YELLOW}2. Validating Data Models${NC}"
echo "--------------------------------"

# Validate data models
models=(
    "shared/models/transaction.yaml:Transaction Models"
    "shared/models/token.yaml:Token Models"
    "shared/models/fraud-case.yaml:Fraud Case Models"
)

for model in "${models[@]}"; do
    IFS=':' read -r file name <<< "$model"
    echo ""
    echo "Testing $name..."
    validate_yaml "$file" "$name"
    print_status $? "$name YAML syntax"
done

echo -e "${YELLOW}3. Validating Infrastructure Config${NC}"
echo "--------------------------------"

# Validate infrastructure configurations
configs=(
    "docker-compose.yml:Docker Compose Configuration"
    "infrastructure/monitoring/prometheus.yml:Prometheus Configuration"
)

for config in "${configs[@]}"; do
    IFS=':' read -r file name <<< "$config"
    echo ""
    echo "Testing $name..."
    validate_yaml "$file" "$name"
    print_status $? "$name YAML syntax"
done

echo -e "${GREEN}🎉 All API contract tests passed!${NC}"
echo "API specifications are valid and ready for implementation."