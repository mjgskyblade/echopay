const logger = require('../utils/logger');

class LoadBalancer {
  constructor() {
    this.algorithms = {
      'round-robin': this.roundRobin.bind(this),
      'least-connections': this.leastConnections.bind(this),
      'weighted-round-robin': this.weightedRoundRobin.bind(this),
      'random': this.random.bind(this)
    };
    
    this.counters = new Map(); // For round-robin
    this.connections = new Map(); // For least-connections tracking
    this.weights = new Map(); // For weighted round-robin
  }

  selectInstance(serviceName, instances, algorithm = 'round-robin') {
    if (!instances || instances.length === 0) {
      throw new Error(`No instances available for service ${serviceName}`);
    }

    // Filter healthy instances
    const healthyInstances = instances.filter(instance => instance.healthy !== false);
    
    if (healthyInstances.length === 0) {
      throw new Error(`No healthy instances available for service ${serviceName}`);
    }

    const algorithmFn = this.algorithms[algorithm] || this.algorithms['round-robin'];
    const selected = algorithmFn(serviceName, healthyInstances);
    
    logger.debug(`Load balancer selected instance for ${serviceName}:`, {
      algorithm,
      selectedInstance: selected.id,
      totalInstances: instances.length,
      healthyInstances: healthyInstances.length
    });

    return selected;
  }

  roundRobin(serviceName, instances) {
    if (!this.counters.has(serviceName)) {
      this.counters.set(serviceName, 0);
    }

    const counter = this.counters.get(serviceName);
    const selected = instances[counter % instances.length];
    
    this.counters.set(serviceName, counter + 1);
    return selected;
  }

  leastConnections(serviceName, instances) {
    // Initialize connection counts if not exists
    instances.forEach(instance => {
      const key = `${serviceName}:${instance.id}`;
      if (!this.connections.has(key)) {
        this.connections.set(key, 0);
      }
    });

    // Find instance with least connections
    let minConnections = Infinity;
    let selected = instances[0];

    instances.forEach(instance => {
      const key = `${serviceName}:${instance.id}`;
      const connections = this.connections.get(key);
      
      if (connections < minConnections) {
        minConnections = connections;
        selected = instance;
      }
    });

    return selected;
  }

  weightedRoundRobin(serviceName, instances) {
    // Initialize weights if not exists
    instances.forEach(instance => {
      const key = `${serviceName}:${instance.id}`;
      if (!this.weights.has(key)) {
        // Default weight based on instance capacity or configuration
        this.weights.set(key, instance.weight || 1);
      }
    });

    // Create weighted list
    const weightedInstances = [];
    instances.forEach(instance => {
      const key = `${serviceName}:${instance.id}`;
      const weight = this.weights.get(key);
      
      for (let i = 0; i < weight; i++) {
        weightedInstances.push(instance);
      }
    });

    return this.roundRobin(`${serviceName}:weighted`, weightedInstances);
  }

  random(serviceName, instances) {
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  // Connection tracking methods
  incrementConnections(serviceName, instanceId) {
    const key = `${serviceName}:${instanceId}`;
    const current = this.connections.get(key) || 0;
    this.connections.set(key, current + 1);
  }

  decrementConnections(serviceName, instanceId) {
    const key = `${serviceName}:${instanceId}`;
    const current = this.connections.get(key) || 0;
    this.connections.set(key, Math.max(0, current - 1));
  }

  // Weight management
  setWeight(serviceName, instanceId, weight) {
    const key = `${serviceName}:${instanceId}`;
    this.weights.set(key, weight);
  }

  getStats(serviceName) {
    const serviceConnections = {};
    const serviceWeights = {};

    for (const [key, value] of this.connections.entries()) {
      if (key.startsWith(`${serviceName}:`)) {
        const instanceId = key.split(':')[1];
        serviceConnections[instanceId] = value;
      }
    }

    for (const [key, value] of this.weights.entries()) {
      if (key.startsWith(`${serviceName}:`)) {
        const instanceId = key.split(':')[1];
        serviceWeights[instanceId] = value;
      }
    }

    return {
      connections: serviceConnections,
      weights: serviceWeights,
      roundRobinCounter: this.counters.get(serviceName) || 0
    };
  }

  reset(serviceName) {
    if (serviceName) {
      // Reset specific service
      this.counters.delete(serviceName);
      
      for (const key of this.connections.keys()) {
        if (key.startsWith(`${serviceName}:`)) {
          this.connections.delete(key);
        }
      }
      
      for (const key of this.weights.keys()) {
        if (key.startsWith(`${serviceName}:`)) {
          this.weights.delete(key);
        }
      }
    } else {
      // Reset all
      this.counters.clear();
      this.connections.clear();
      this.weights.clear();
    }
  }
}

module.exports = new LoadBalancer();