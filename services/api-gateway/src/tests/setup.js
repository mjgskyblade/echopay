// Test setup file

// Mock axios globally
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
}));

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    on: jest.fn()
  }))
}));

// Mock Consul
jest.mock('consul', () => {
  return jest.fn(() => ({
    agent: {
      service: {
        register: jest.fn().mockResolvedValue(undefined),
        deregister: jest.fn().mockResolvedValue(undefined)
      }
    },
    health: {
      service: jest.fn().mockResolvedValue([])
    },
    catalog: {
      service: {
        list: jest.fn().mockResolvedValue({})
      }
    }
  }));
});

// Suppress console logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '0'; // Use random port for tests