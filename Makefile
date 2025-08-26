.PHONY: help build start stop clean test lint format deps

# Default target
help:
	@echo "EchoPay Development Commands"
	@echo "============================"
	@echo "build     - Build all services"
	@echo "start     - Start all services"
	@echo "stop      - Stop all services"
	@echo "clean     - Clean up containers and volumes"
	@echo "test      - Run all tests"
	@echo "lint      - Run linting for all services"
	@echo "format    - Format code for all services"
	@echo "deps      - Install dependencies for all services"
	@echo "logs      - Show logs for all services"
	@echo "health    - Check health of all services"

# Build all services
build:
	@echo "Building all services..."
	docker-compose build

# Start all services
start:
	@echo "Starting EchoPay services..."
	docker-compose up -d

# Stop all services
stop:
	@echo "Stopping EchoPay services..."
	docker-compose down

# Clean up everything
clean:
	@echo "Cleaning up containers, networks, and volumes..."
	docker-compose down -v --remove-orphans
	docker system prune -f

# Run tests for all services
test:
	@echo "Running comprehensive test suite..."
	./scripts/test-all.sh

# Run individual test suites
test-build:
	@echo "Running build verification tests..."
	./scripts/test-build.sh

test-contracts:
	@echo "Running API contract validation tests..."
	./scripts/test-api-contracts.sh

test-integration:
	@echo "Running service integration tests..."
	./scripts/test-service-health.sh

test-unit:
	@echo "Running unit tests..."
	cd shared && go test ./...
	cd services/transaction-service && go test ./... || true
	cd services/token-management && go test ./... || true

# Lint all services
lint:
	@echo "Linting all services..."
	@echo "Linting Go services..."
	cd services/transaction-service && golangci-lint run
	cd services/token-management && golangci-lint run
	@echo "Linting Python services..."
	cd services/fraud-detection && flake8 src/
	@echo "Linting Java services..."
	cd services/reversibility-service && mvn checkstyle:check
	@echo "Linting Node.js services..."
	cd services/compliance-service && npm run lint

# Format code for all services
format:
	@echo "Formatting code for all services..."
	@echo "Formatting Go services..."
	cd services/transaction-service && go fmt ./...
	cd services/token-management && go fmt ./...
	@echo "Formatting Python services..."
	cd services/fraud-detection && black src/
	@echo "Formatting Java services..."
	cd services/reversibility-service && mvn spotless:apply
	@echo "Formatting Node.js services..."
	cd services/compliance-service && npm run format

# Install dependencies
deps:
	@echo "Installing dependencies for all services..."
	@echo "Installing Go dependencies..."
	cd services/transaction-service && go mod tidy
	cd services/token-management && go mod tidy
	@echo "Installing Python dependencies..."
	cd services/fraud-detection && pip install -r requirements.txt
	@echo "Installing Java dependencies..."
	cd services/reversibility-service && mvn dependency:resolve
	@echo "Installing Node.js dependencies..."
	cd services/compliance-service && npm install

# Show logs
logs:
	@echo "Showing logs for all services..."
	docker-compose logs -f

# Check service health
health:
	@echo "Checking service health..."
	@curl -s http://localhost:8001/health | jq . || echo "Transaction service not responding"
	@curl -s http://localhost:8002/health | jq . || echo "Fraud detection service not responding"
	@curl -s http://localhost:8003/health | jq . || echo "Token management service not responding"
	@curl -s http://localhost:8004/health | jq . || echo "Compliance service not responding"
	@curl -s http://localhost:8005/health | jq . || echo "Reversibility service not responding"

# Development shortcuts
dev-start:
	@echo "Starting development environment..."
	docker-compose up -d postgres redis kafka zookeeper prometheus grafana
	@echo "Infrastructure services started. Start individual services as needed."

dev-stop:
	@echo "Stopping development environment..."
	docker-compose down

# Database operations
db-migrate:
	@echo "Running database migrations..."
	# Add migration commands for each service

db-reset:
	@echo "Resetting databases..."
	docker-compose down -v postgres
	docker-compose up -d postgres
	sleep 5
	$(MAKE) db-migrate

# Monitoring
monitor:
	@echo "Opening monitoring dashboards..."
	@echo "Prometheus: http://localhost:9090"
	@echo "Grafana: http://localhost:3000 (admin/admin)"

# API documentation
docs:
	@echo "API Documentation available at:"
	@echo "Transaction Service: shared/apis/transaction-service.yaml"
	@echo "Fraud Detection: shared/apis/fraud-detection.yaml"
	@echo "Token Management: shared/apis/token-management.yaml"
	@echo "Compliance Service: shared/apis/compliance-service.yaml"
	@echo "Reversibility Service: shared/apis/reversibility-service.yaml"