#!/bin/bash

# EchoPay Service Health Check Tests
set -e

echo "🏥 Testing EchoPay Service Health Checks"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Function to wait for service
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1
    
    echo "Waiting for $name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $name is ready${NC}"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ $name failed to start within $((max_attempts * 2)) seconds${NC}"
    return 1
}

# Function to test health endpoint
test_health_endpoint() {
    local url=$1
    local name=$2
    
    echo "Testing $name health endpoint..."
    
    response=$(curl -s "$url" 2>/dev/null)
    if [ $? -eq 0 ]; then
        # Check if response contains expected fields
        if echo "$response" | grep -q '"service"' && echo "$response" | grep -q '"status"'; then
            echo -e "${GREEN}✅ $name health check passed${NC}"
            echo -e "${BLUE}   Response: $response${NC}"
            return 0
        else
            echo -e "${RED}❌ $name health check returned invalid response${NC}"
            echo -e "${BLUE}   Response: $response${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ $name health check failed${NC}"
        return 1
    fi
}

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker not available. Please install Docker to run integration tests.${NC}"
    echo "You can still run individual services manually for testing."
    exit 0
fi

# Check if docker-compose is available
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo -e "${YELLOW}⚠️  Docker Compose not available. Please install Docker Compose to run integration tests.${NC}"
    exit 0
fi

echo -e "${YELLOW}1. Starting Infrastructure Services${NC}"
echo "--------------------------------"

# Start infrastructure services first
echo "Starting PostgreSQL, Redis, and Kafka..."
$COMPOSE_CMD up -d postgres redis zookeeper kafka

# Wait for infrastructure to be ready
sleep 10

echo -e "${YELLOW}2. Building and Starting Application Services${NC}"
echo "--------------------------------"

# Build and start all services
echo "Building services..."
$COMPOSE_CMD build

echo "Starting all services..."
$COMPOSE_CMD up -d

echo -e "${YELLOW}3. Testing Service Health Endpoints${NC}"
echo "--------------------------------"

# Define services to test
services=(
    "http://localhost:8001/health:Transaction Service"
    "http://localhost:8002/health:Fraud Detection Service"
    "http://localhost:8003/health:Token Management Service"
    "http://localhost:8004/health:Compliance Service"
    "http://localhost:8005/health:Reversibility Service"
)

# Wait for services and test health endpoints
for service in "${services[@]}"; do
    IFS=':' read -r url name <<< "$service"
    echo ""
    wait_for_service "$url" "$name"
    if [ $? -eq 0 ]; then
        test_health_endpoint "$url" "$name"
    fi
done

echo -e "${YELLOW}4. Testing Metrics Endpoints${NC}"
echo "--------------------------------"

# Test metrics endpoints
metrics_services=(
    "http://localhost:8001/metrics:Transaction Service"
    "http://localhost:8002/metrics:Fraud Detection Service"
    "http://localhost:8003/metrics:Token Management Service"
    "http://localhost:8004/metrics:Compliance Service"
    "http://localhost:8005/actuator/prometheus:Reversibility Service"
)

for service in "${metrics_services[@]}"; do
    IFS=':' read -r url name <<< "$service"
    echo ""
    echo "Testing $name metrics endpoint..."
    
    if curl -s -f "$url" | head -5 | grep -q "# HELP"; then
        echo -e "${GREEN}✅ $name metrics endpoint working${NC}"
    else
        echo -e "${RED}❌ $name metrics endpoint failed${NC}"
    fi
done

echo -e "${YELLOW}5. Testing Infrastructure Services${NC}"
echo "--------------------------------"

# Test Prometheus
echo "Testing Prometheus..."
if curl -s -f "http://localhost:9090/-/healthy" > /dev/null; then
    echo -e "${GREEN}✅ Prometheus is healthy${NC}"
else
    echo -e "${RED}❌ Prometheus health check failed${NC}"
fi

# Test Grafana
echo "Testing Grafana..."
if curl -s -f "http://localhost:3000/api/health" > /dev/null; then
    echo -e "${GREEN}✅ Grafana is healthy${NC}"
else
    echo -e "${RED}❌ Grafana health check failed${NC}"
fi

echo -e "${YELLOW}6. Cleanup${NC}"
echo "--------------------------------"

echo "Stopping services..."
$COMPOSE_CMD down

echo -e "${GREEN}🎉 Service health tests completed!${NC}"
echo "All services can start and respond to health checks."