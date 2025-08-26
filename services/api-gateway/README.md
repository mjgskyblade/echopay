# EchoPay API Gateway

The EchoPay API Gateway is a high-performance, production-ready gateway that provides load balancing, rate limiting, authentication, circuit breaking, and service orchestration for the EchoPay digital payments system.

## Features

### Core Functionality
- **Service Discovery**: Automatic service registration and discovery with Consul integration
- **Load Balancing**: Multiple algorithms (round-robin, least-connections, weighted, random)
- **Circuit Breaker**: Automatic failure detection and recovery with configurable thresholds
- **Rate Limiting**: IP-based rate limiting with configurable windows and limits
- **Authentication**: JWT-based authentication with Redis session management
- **Request Proxying**: Intelligent request routing to backend services
- **Health Monitoring**: Comprehensive health checks and service status monitoring

### Advanced Features
- **Service Orchestration**: High-level workflow orchestration for complex operations
- **Correlation Tracking**: Request correlation IDs for distributed tracing
- **Metrics Collection**: Prometheus metrics integration
- **Security Headers**: Comprehensive security header management
- **Error Handling**: Graceful error handling with fallback mechanisms
- **Graceful Shutdown**: Clean shutdown with connection draining

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     EchoPay API Gateway                         │
├─────────────────────────────────────────────────────────────────┤
│  Authentication & Rate Limiting Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  Load Balancer & Circuit Breaker                               │
├─────────────────────────────────────────────────────────────────┤
│  Service Discovery & Health Monitoring                         │
├─────────────────────────────────────────────────────────────────┤
│  Request Proxying & Orchestration                              │
├─────────────────────────────────────────────────────────────────┤
│  Backend Services                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Transaction │  │    Fraud    │  │ Reversibility│             │
│  │   Service   │  │  Detection  │  │   Service   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  ┌─────────────┐  ┌─────────────┐                              │
│  │   Token     │  │ Compliance  │                              │
│  │ Management  │  │   Service   │                              │
│  └─────────────┘  └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd services/api-gateway
npm install
```

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Rate Limiting
RATE_LIMIT_MAX=1000

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Service Discovery (Consul)
CONSUL_HOST=localhost
CONSUL_PORT=8500
CONSUL_SECURE=false

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Load Balancing
LOAD_BALANCING_ALGORITHM=round-robin

# Service Configuration
SERVICE_HOST=localhost

# Logging
LOG_LEVEL=info
```

### Load Balancing Algorithms

The gateway supports multiple load balancing algorithms:

- **round-robin** (default): Distributes requests evenly across instances
- **least-connections**: Routes to instance with fewest active connections
- **weighted-round-robin**: Distributes based on instance weights
- **random**: Randomly selects an instance

## API Endpoints

### Health and Monitoring

#### GET /health
Returns comprehensive gateway health status including service availability.

```json
{
  "status": "healthy",
  "timestamp": "2025-01-08T10:00:00Z",
  "uptime": 3600000,
  "version": "1.0.0",
  "services": {
    "transaction-service": { "instances": 2, "healthy": true },
    "fraud-detection": { "instances": 1, "healthy": true }
  },
  "memory": { "rss": 45678, "heapTotal": 23456 },
  "system": { "platform": "darwin", "nodeVersion": "v18.0.0" }
}
```

#### GET /health/ready
Returns readiness status for load balancer health checks.

#### GET /health/live
Returns liveness status for container orchestration.

#### GET /services
Returns current service registry status.

#### GET /circuit-breaker
Returns circuit breaker status for all services.

```json
{
  "status": "success",
  "circuitBreakers": {
    "transaction-service": {
      "state": "CLOSED",
      "failureCount": 0,
      "successCount": 150,
      "failureRate": 0.02
    }
  },
  "metrics": {
    "totalCircuits": 5,
    "openCircuits": 0,
    "closedCircuits": 5
  }
}
```

#### GET /load-balancer
Returns load balancer statistics.

```json
{
  "status": "success",
  "algorithm": "round-robin",
  "stats": {
    "transaction-service": {
      "connections": { "instance-1": 5, "instance-2": 3 },
      "roundRobinCounter": 42
    }
  }
}
```

### Circuit Breaker Control

#### POST /circuit-breaker/:serviceName/reset
Resets circuit breaker for a specific service.

#### POST /circuit-breaker/:serviceName/force/:state
Forces circuit breaker to a specific state (OPEN, CLOSED, HALF_OPEN).

### Service Orchestration

#### POST /api/v1/orchestration/transaction
Orchestrates a complete transaction workflow including fraud detection, token validation, and processing.

**Request:**
```json
{
  "fromWallet": "wallet_123",
  "toWallet": "wallet_456",
  "amount": 100.00,
  "currency": "USD-CBDC",
  "metadata": {
    "description": "Payment for services",
    "category": "business"
  }
}
```

**Response:**
```json
{
  "success": true,
  "transaction": {
    "id": "txn_789",
    "status": "completed",
    "amount": 100.00,
    "timestamp": "2025-01-08T10:00:00Z"
  },
  "fraudScore": 0.15,
  "correlationId": "txn_1234567890_abc123"
}
```

#### POST /api/v1/orchestration/fraud-report
Orchestrates fraud reporting workflow including evidence collection, analysis, and potential automated reversal.

**Request:**
```json
{
  "transactionId": "txn_789",
  "reason": "unauthorized_transaction",
  "description": "I did not authorize this transaction",
  "evidence": ["screenshot.jpg", "bank_statement.pdf"]
}
```

**Response:**
```json
{
  "success": true,
  "fraudCase": {
    "id": "case_456",
    "status": "open",
    "transactionId": "txn_789"
  },
  "reversal": {
    "id": "reversal_123",
    "status": "completed"
  },
  "automated": true,
  "correlationId": "fraud_1234567890_def456"
}
```

### Service Proxying

The gateway automatically proxies requests to backend services:

- `/api/v1/transactions/*` → Transaction Service
- `/api/v1/tokens/*` → Token Management Service
- `/api/v1/fraud/*` → Fraud Detection Service
- `/api/v1/reversibility/*` → Reversibility Service
- `/api/v1/compliance/*` → Compliance Service

## Authentication

All protected endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

The JWT token should contain:
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "roles": ["user"],
  "permissions": ["transaction:create", "fraud:report"]
}
```

## Circuit Breaker Configuration

The circuit breaker protects against cascading failures:

- **Failure Threshold**: 3 failures trigger OPEN state
- **Recovery Timeout**: 30 seconds before attempting HALF_OPEN
- **Expected Errors**: Connection refused, timeouts don't trigger circuit breaker

### Circuit Breaker States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Service is failing, requests are blocked or use fallback
- **HALF_OPEN**: Testing if service has recovered

## Load Balancer Configuration

### Service Instance Format

```javascript
{
  id: 'service-instance-1',
  address: 'localhost',
  port: 8001,
  healthy: true,
  weight: 1  // For weighted algorithms
}
```

### Connection Tracking

The load balancer tracks active connections for least-connections algorithm and provides statistics for monitoring.

## Monitoring and Metrics

### Prometheus Metrics

The gateway exposes Prometheus metrics at `/metrics`:

- `http_requests_total`: Total HTTP requests
- `http_request_duration_seconds`: Request duration histogram
- `circuit_breaker_state`: Circuit breaker state by service
- `load_balancer_connections`: Active connections by service instance

### Logging

Structured logging with correlation IDs for request tracing:

```json
{
  "level": "info",
  "message": "Transaction orchestration completed",
  "correlationId": "txn_1234567890_abc123",
  "transactionId": "txn_789",
  "userId": "user_123",
  "timestamp": "2025-01-08T10:00:00Z"
}
```

## Error Handling

### Service Failures

When backend services fail, the gateway:

1. Triggers circuit breaker if failure threshold is reached
2. Uses fallback URLs for critical services
3. Returns appropriate error responses with correlation IDs
4. Logs errors for debugging and monitoring

### Rate Limiting

When rate limits are exceeded:

```json
{
  "error": "Too many requests from this IP, please try again later.",
  "retryAfter": "15 minutes"
}
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=integration.test.js

# Run with coverage
npm test -- --coverage
```

### Test Coverage

The gateway has comprehensive test coverage including:

- Unit tests for all components
- Integration tests for API endpoints
- End-to-end workflow tests
- Circuit breaker and load balancer tests
- Authentication and security tests

### Development Mode

```bash
npm run dev
```

This starts the gateway with nodemon for automatic reloading during development.

## Production Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Health Checks

Configure your load balancer to use:
- **Readiness**: `GET /health/ready`
- **Liveness**: `GET /health/live`

### Scaling

The gateway is stateless and can be horizontally scaled. Use Redis for session storage and Consul for service discovery in multi-instance deployments.

### Security Considerations

1. **JWT Secrets**: Use strong, unique JWT secrets in production
2. **HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Adjust rate limits based on expected traffic
4. **CORS**: Configure CORS origins appropriately
5. **Headers**: Security headers are automatically applied

## Troubleshooting

### Common Issues

1. **Service Discovery Failures**: Check Consul connectivity
2. **Circuit Breaker Stuck Open**: Use reset endpoint or check service health
3. **High Memory Usage**: Monitor connection pooling and cleanup
4. **Authentication Failures**: Verify JWT secret and token format

### Debug Mode

Set `LOG_LEVEL=debug` for detailed logging including:
- Request/response details
- Service discovery events
- Circuit breaker state changes
- Load balancer decisions

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass
5. Check test coverage remains high

## License

This project is part of the EchoPay digital payments system.