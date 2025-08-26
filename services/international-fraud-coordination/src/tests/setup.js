// Mock axios for testing
jest.mock('axios', () => ({
  post: jest.fn(() => Promise.resolve({
    data: {
      success: true,
      publicKey: 'mock-public-key',
      acknowledgment: 'mock-acknowledgment',
      expectedResponseTime: '2 hours',
      assignedOfficer: 'mock-officer',
      plannedActions: ['INVESTIGATE', 'SHARE_EVIDENCE']
    }
  })),
  get: jest.fn(() => Promise.resolve({
    data: {
      status: 'investigating',
      progress: 50,
      actions: ['INVESTIGATE', 'SHARE_EVIDENCE']
    }
  }))
}));

// Mock crypto operations for consistent testing
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid-123'),
  randomBytes: jest.fn((size) => Buffer.alloc(size, 'mock')),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mock-hash')
  })),
  createHmac: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mock-hmac')
  })),
  createCipher: jest.fn(() => ({
    setAAD: jest.fn(),
    update: jest.fn(() => 'encrypted'),
    final: jest.fn(() => 'final'),
    getAuthTag: jest.fn(() => Buffer.from('auth-tag'))
  })),
  createDecipher: jest.fn(() => ({
    setAAD: jest.fn(),
    setAuthTag: jest.fn(),
    update: jest.fn(() => 'decrypted'),
    final: jest.fn(() => 'final')
  })),
  sign: jest.fn(() => Buffer.from('signature')),
  verify: jest.fn(() => true)
}));

// Mock NodeRSA
jest.mock('node-rsa', () => {
  return jest.fn().mockImplementation(() => ({
    exportKey: jest.fn((type) => `mock-${type}-key`)
  }));
});

// Increase timeout for async operations
jest.setTimeout(10000);