# EchoPay Testing Guide

## Testing Strategy Overview

This document outlines the comprehensive testing approach for the EchoPay digital payments system. Our testing strategy ensures reliability, performance, and security across all microservices.

## Test Categories

### 1. **Project Structure Validation** ✅
**Purpose**: Verify that all required files and directories are in place  
**Command**: `./scripts/test-basic-validation.sh`  
**Status**: ✅ PASSING

**What it checks**:
- Project structure completeness
- Service directory organization
- Shared library availability
- API specification presence
- Infrastructure configuration files
- Service-specific configuration files

### 2. **Build Verification Tests**
**Purpose**: Ensure all services can build successfully  
**Command**: `./scripts/test-build.sh`  
**Prerequisites**: Go, Python, Node.js, Java, Maven

**What it tests**:
- Go services compilation (Transaction, Token Management)
- Python service syntax validation (Fraud Detection)
- Node.js service syntax validation (Compliance)
- Java service compilation (Reversibility)
- Docker image builds (if Docker available)

### 3. **API Contract Validation**
**Purpose**: Validate OpenAPI specifications and data models  
**Command**: `./scripts/test-api-contracts.sh`  
**Prerequisites**: Python with PyYAML

**What it validates**:
- YAML syntax correctness
- OpenAPI 3.0 specification compliance
- Required fields presence
- Data model structure
- Infrastructure configuration syntax

### 4. **Unit Tests**
**Purpose**: Test individual components and shared libraries  
**Command**: `make test-unit`  
**Prerequisites**: Go, testing frameworks

**Coverage**:
- Shared error handling library
- Configuration management
- HTTP utilities
- Database utilities
- Service-specific business logic

### 5. **Service Integration Tests**
**Purpose**: Verify services can start and communicate  
**Command**: `./scripts/test-service-health.sh`  
**Prerequisites**: Docker, Docker Compose

**What it tests**:
- Service startup and health checks
- Database connectivity
- Inter-service communication
- Metrics endpoint availability
- Infrastructure service health

## Quick Testing Commands

### Run All Tests
```bash
make test                    # Comprehensive test suite
./scripts/test-all.sh       # Alternative comprehensive test
```

### Individual Test Categories
```bash
./scripts/test-basic-validation.sh  # Structure validation (no deps)
make test-build                      # Build verification
make test-contracts                  # API contract validation
make test-unit                       # Unit tests
make test-integration               # Integration tests
```

### Development Testing
```bash
make dev-start              # Start infrastructure only
make health                 # Check running service health
make logs                   # View service logs
```

## Test Environment Setup

### Minimal Setup (Structure Validation Only)
- No external dependencies required
- Run: `./scripts/test-basic-validation.sh`

### Build Testing Setup
```bash
# Install Go 1.21+
go version

# Install Python 3.11+
python3 --version
pip install -r services/fraud-detection/requirements.txt

# Install Node.js 18+
node --version
cd services/compliance-service && npm install

# Install Java 17+ and Maven
java --version
mvn --version
```

### Full Integration Testing Setup
```bash
# Install Docker and Docker Compose
docker --version
docker compose version

# Run integration tests
make test-integration
```

## Continuous Integration Pipeline

### Pre-commit Checks
1. **Structure Validation**: `./scripts/test-basic-validation.sh`
2. **Code Formatting**: `make format`
3. **Linting**: `make lint`
4. **Unit Tests**: `make test-unit`

### Build Pipeline
1. **Build Verification**: `make test-build`
2. **API Contract Validation**: `make test-contracts`
3. **Docker Image Builds**: `docker compose build`

### Integration Pipeline
1. **Service Health Tests**: `make test-integration`
2. **End-to-End API Tests**: (To be implemented in future tasks)
3. **Performance Tests**: (To be implemented in future tasks)

## Test Results Interpretation

### ✅ All Tests Passing
- Project structure is complete
- All services build successfully
- API contracts are valid
- Services can start and respond to health checks
- **Ready to proceed with next implementation task**

### ⚠️ Some Tests Failing
- Review test output for specific failures
- Common issues:
  - Missing dependencies
  - Configuration errors
  - Port conflicts
  - Docker not running

### ❌ Critical Test Failures
- Do not proceed with implementation
- Fix structural issues first
- Re-run validation tests

## Testing Best Practices

### For Developers
1. **Run structure validation first**: `./scripts/test-basic-validation.sh`
2. **Test builds before committing**: `make test-build`
3. **Validate API changes**: `make test-contracts`
4. **Run unit tests frequently**: `make test-unit`
5. **Integration test before major changes**: `make test-integration`

### For CI/CD
1. **Fail fast on structure issues**
2. **Cache dependencies between builds**
3. **Run tests in parallel where possible**
4. **Generate test reports and coverage**
5. **Notify on test failures**

## Current Test Status

| Test Category | Status | Command | Prerequisites |
|---------------|--------|---------|---------------|
| Structure Validation | ✅ PASSING | `./scripts/test-basic-validation.sh` | None |
| Build Verification | ⏳ READY | `make test-build` | Go, Python, Node.js, Java |
| API Contracts | ⏳ READY | `make test-contracts` | Python + PyYAML |
| Unit Tests | ⏳ READY | `make test-unit` | Go |
| Integration Tests | ⏳ READY | `make test-integration` | Docker |

## Next Steps

1. **Install development dependencies** (Go, Python, Node.js, Java)
2. **Run build verification tests** to ensure compilation works
3. **Set up Docker environment** for integration testing
4. **Proceed with implementing Task 2** from the specification

## Troubleshooting

### Common Issues

**"Command not found" errors**
- Install missing dependencies (Go, Python, Node.js, Java, Docker)
- Check PATH environment variable

**Port conflicts during integration tests**
- Stop other services using ports 8001-8005, 5432, 6379, 9092
- Use `docker compose down` to clean up

**Docker build failures**
- Ensure Docker daemon is running
- Check available disk space
- Review Dockerfile syntax

**Permission denied on scripts**
- Run `chmod +x scripts/*.sh` to make scripts executable

### Getting Help

1. Check test output for specific error messages
2. Review service logs: `make logs`
3. Verify service health: `make health`
4. Check Docker container status: `docker compose ps`

---

**Ready to proceed with implementation once testing setup is complete!**