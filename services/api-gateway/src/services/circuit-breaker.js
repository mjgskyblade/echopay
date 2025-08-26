const logger = require('../utils/logger');

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    this.expectedErrors = options.expectedErrors || [];
    
    this.circuits = new Map();
  }

  async execute(serviceName, operation, fallback = null) {
    const circuit = this.getCircuit(serviceName);
    
    if (circuit.state === 'OPEN') {
      if (Date.now() - circuit.lastFailureTime > this.recoveryTimeout) {
        circuit.state = 'HALF_OPEN';
        logger.info(`Circuit breaker for ${serviceName} moved to HALF_OPEN state`);
      } else {
        logger.warn(`Circuit breaker for ${serviceName} is OPEN, executing fallback`);
        if (fallback) {
          return await fallback();
        }
        throw new Error(`Circuit breaker is OPEN for service ${serviceName}`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess(serviceName);
      return result;
    } catch (error) {
      this.onFailure(serviceName, error);
      
      if (fallback && circuit.state === 'OPEN') {
        logger.info(`Executing fallback for ${serviceName} due to circuit breaker`);
        return await fallback();
      }
      
      throw error;
    }
  }

  getCircuit(serviceName) {
    if (!this.circuits.has(serviceName)) {
      this.circuits.set(serviceName, {
        state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        totalRequests: 0,
        totalFailures: 0,
        totalSuccesses: 0
      });
    }
    return this.circuits.get(serviceName);
  }

  onSuccess(serviceName) {
    const circuit = this.getCircuit(serviceName);
    circuit.successCount++;
    circuit.totalSuccesses++;
    circuit.totalRequests++;
    circuit.lastSuccessTime = Date.now();

    if (circuit.state === 'HALF_OPEN') {
      // Reset failure count on successful request in HALF_OPEN state
      circuit.failureCount = 0;
      circuit.state = 'CLOSED';
      logger.info(`Circuit breaker for ${serviceName} moved to CLOSED state after successful request`);
    } else if (circuit.state === 'CLOSED') {
      // Reset failure count on successful request
      circuit.failureCount = 0;
    }

    logger.debug(`Circuit breaker success for ${serviceName}:`, {
      state: circuit.state,
      successCount: circuit.successCount,
      failureCount: circuit.failureCount
    });
  }

  onFailure(serviceName, error) {
    const circuit = this.getCircuit(serviceName);
    
    // Check if this is an expected error that shouldn't trigger circuit breaker
    if (this.isExpectedError(error)) {
      logger.debug(`Expected error for ${serviceName}, not counting towards circuit breaker:`, error.message);
      return;
    }

    circuit.failureCount++;
    circuit.totalFailures++;
    circuit.totalRequests++;
    circuit.lastFailureTime = Date.now();

    logger.debug(`Circuit breaker failure for ${serviceName}:`, {
      state: circuit.state,
      failureCount: circuit.failureCount,
      threshold: this.failureThreshold,
      error: error.message
    });

    if (circuit.failureCount >= this.failureThreshold) {
      circuit.state = 'OPEN';
      logger.warn(`Circuit breaker for ${serviceName} moved to OPEN state`, {
        failureCount: circuit.failureCount,
        threshold: this.failureThreshold,
        lastError: error.message
      });
    }
  }

  isExpectedError(error) {
    return this.expectedErrors.some(expectedError => {
      if (typeof expectedError === 'string') {
        return error.message.includes(expectedError);
      }
      if (expectedError instanceof RegExp) {
        return expectedError.test(error.message);
      }
      if (typeof expectedError === 'function') {
        return expectedError(error);
      }
      return false;
    });
  }

  getState(serviceName) {
    const circuit = this.getCircuit(serviceName);
    return {
      serviceName,
      state: circuit.state,
      failureCount: circuit.failureCount,
      successCount: circuit.successCount,
      lastFailureTime: circuit.lastFailureTime,
      lastSuccessTime: circuit.lastSuccessTime,
      totalRequests: circuit.totalRequests,
      totalFailures: circuit.totalFailures,
      totalSuccesses: circuit.totalSuccesses,
      failureRate: circuit.totalRequests > 0 ? (circuit.totalFailures / circuit.totalRequests) : 0,
      uptime: circuit.lastSuccessTime ? Date.now() - circuit.lastSuccessTime : null
    };
  }

  getAllStates() {
    const states = {};
    for (const serviceName of this.circuits.keys()) {
      states[serviceName] = this.getState(serviceName);
    }
    return states;
  }

  reset(serviceName) {
    if (serviceName) {
      const circuit = this.getCircuit(serviceName);
      circuit.state = 'CLOSED';
      circuit.failureCount = 0;
      circuit.successCount = 0;
      circuit.lastFailureTime = null;
      logger.info(`Circuit breaker for ${serviceName} has been reset`);
    } else {
      // Reset all circuits
      for (const serviceName of this.circuits.keys()) {
        this.reset(serviceName);
      }
    }
  }

  // Force circuit state (for testing or manual intervention)
  forceState(serviceName, state) {
    const circuit = this.getCircuit(serviceName);
    const oldState = circuit.state;
    circuit.state = state.toUpperCase();
    
    logger.info(`Circuit breaker for ${serviceName} state forced from ${oldState} to ${circuit.state}`);
  }

  // Health check method
  isHealthy(serviceName) {
    const circuit = this.getCircuit(serviceName);
    return circuit.state === 'CLOSED' || circuit.state === 'HALF_OPEN';
  }

  // Metrics for monitoring
  getMetrics() {
    const metrics = {
      totalCircuits: this.circuits.size,
      openCircuits: 0,
      halfOpenCircuits: 0,
      closedCircuits: 0,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0
    };

    for (const circuit of this.circuits.values()) {
      switch (circuit.state) {
        case 'OPEN':
          metrics.openCircuits++;
          break;
        case 'HALF_OPEN':
          metrics.halfOpenCircuits++;
          break;
        case 'CLOSED':
          metrics.closedCircuits++;
          break;
      }
      
      metrics.totalRequests += circuit.totalRequests;
      metrics.totalFailures += circuit.totalFailures;
      metrics.totalSuccesses += circuit.totalSuccesses;
    }

    return metrics;
  }
}

module.exports = CircuitBreaker;