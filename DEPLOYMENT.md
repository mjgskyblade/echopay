# EchoPay Deployment Guide

## Prerequisites

- Docker and Docker Compose
- Go 1.21+ (for Go services development)
- Python 3.11+ (for fraud detection service)
- Java 17+ (for reversibility service)
- Node.js 18+ (for compliance service)
- Maven 3.8+ (for Java builds)

## Quick Start

### 1. Infrastructure Setup

Start the core infrastructure services:

```bash
docker compose up -d postgres redis kafka zookeeper prometheus grafana
```

Wait for services to be ready (about 30 seconds), then verify:

```bash
# Check PostgreSQL
docker compose logs postgres

# Check Redis
docker compose exec redis redis-cli ping

# Check Kafka
docker compose logs kafka
```

### 2. Build and Start Services

Build all services:

```bash
docker compose build
```

Start all services:

```bash
docker compose up -d
```

### 3. Verify Deployment

Check service health:

```bash
# Transaction Service
curl http://localhost:8001/health

# Fraud Detection Service  
curl http://localhost:8002/health

# Token Management Service
curl http://localhost:8003/health

# Compliance Service
curl http://localhost:8004/health

# Reversibility Service
curl http://localhost:8005/health
```

### 4. Access Monitoring

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)

## Service Architecture

### Port Allocation

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| Transaction Service | 8001 | Go | High-speed transaction processing |
| Fraud Detection | 8002 | Python | ML-powered fraud analysis |
| Token Management | 8003 | Go | CBDC token lifecycle management |
| Compliance Service | 8004 | Node.js | Regulatory compliance (EchoNet) |
| Reversibility Service | 8005 | Java | Fraud reporting & reversal |
| PostgreSQL | 5432 | Database | Primary data store |
| Redis | 6379 | Cache | Fraud detection cache |
| Kafka | 9092 | Message Queue | Event streaming |
| Prometheus | 9090 | Monitoring | Metrics collection |
| Grafana | 3000 | Visualization | Monitoring dashboards |

### Database Structure

Each service has its own database:
- `echopay_transactions` - Transaction service data
- `echopay_tokens` - Token management data  
- `echopay_reversibility` - Fraud cases and reversals
- `echopay_compliance` - KYC/AML and regulatory data

## Development Workflow

### Local Development

1. **Start infrastructure only:**
   ```bash
   make dev-start
   ```

2. **Run individual services locally:**
   ```bash
   # Go services
   cd services/transaction-service && go run src/main.go
   cd services/token-management && go run src/main.go
   
   # Python service
   cd services/fraud-detection && python src/main.py
   
   # Node.js service
   cd services/compliance-service && npm start
   
   # Java service
   cd services/reversibility-service && mvn spring-boot:run
   ```

### Testing

Run all tests:
```bash
make test
```

Individual service tests:
```bash
# Go services
cd services/transaction-service && go test ./...

# Python service  
cd services/fraud-detection && pytest

# Java service
cd services/reversibility-service && mvn test

# Node.js service
cd services/compliance-service && npm test
```

### Code Quality

Format code:
```bash
make format
```

Run linting:
```bash
make lint
```

## API Documentation

### Service Endpoints

Each service exposes:
- `/health` - Health check
- `/metrics` - Prometheus metrics
- `/api/v1/*` - Business logic endpoints

### OpenAPI Specifications

API documentation is available in `shared/apis/`:
- [Transaction Service](shared/apis/transaction-service.yaml)
- [Fraud Detection](shared/apis/fraud-detection.yaml)
- [Token Management](shared/apis/token-management.yaml)
- [Compliance Service](shared/apis/compliance-service.yaml)
- [Reversibility Service](shared/apis/reversibility-service.yaml)

## Monitoring and Observability

### Metrics

All services expose Prometheus metrics at `/metrics`:
- HTTP request metrics (duration, count, status codes)
- Business metrics (transaction volume, fraud rates)
- System metrics (database connections, queue depth)

### Logging

Structured JSON logging with correlation IDs:
- Request tracing across services
- Error tracking and alerting
- Performance monitoring

### Health Checks

All services implement health checks:
- Database connectivity
- External service dependencies
- Resource utilization

## Security Considerations

### Network Security
- Services communicate within Docker network
- External access only through API gateway (to be implemented)
- Database access restricted to service users

### Data Protection
- Environment variables for sensitive configuration
- Database credentials managed through Docker secrets
- API rate limiting implemented

### Compliance
- Audit logging for all transactions
- Data retention policies
- Privacy-preserving analytics

## Troubleshooting

### Common Issues

1. **Services not starting:**
   ```bash
   docker compose logs [service-name]
   ```

2. **Database connection issues:**
   ```bash
   docker compose exec postgres psql -U echopay -d echopay -c "\l"
   ```

3. **Kafka connectivity:**
   ```bash
   docker compose exec kafka kafka-topics --bootstrap-server localhost:9092 --list
   ```

### Performance Tuning

1. **Database optimization:**
   - Connection pool sizing
   - Query optimization
   - Index management

2. **Cache configuration:**
   - Redis memory limits
   - Cache eviction policies
   - TTL settings

3. **JVM tuning (Java services):**
   - Heap size configuration
   - Garbage collection settings
   - Connection pool sizing

## Production Deployment

### Environment Configuration

Set production environment variables:
```bash
export ENVIRONMENT=production
export DB_PASSWORD=secure_password
export KAFKA_BROKERS=kafka-cluster:9092
```

### Scaling Considerations

- Horizontal scaling for stateless services
- Database read replicas for query performance
- Kafka partitioning for event streaming
- Load balancing for high availability

### Backup and Recovery

- Database backups with point-in-time recovery
- Configuration backup and versioning
- Disaster recovery procedures
- Data retention and archival policies