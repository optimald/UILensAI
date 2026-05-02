module.exports = {
  // Test timeout configuration
  testTimeout: 30000, // 30 seconds max per test for API calls
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.js'],
  
  // Test environment
  testEnvironment: 'node',
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    'api/**/*.js',
    '!src/**/*.test.js',
    '!src/examples/**',
    '!src/cli/**'
  ],
  
  // Test patterns - run all tests
  testMatch: [
    '**/test/**/*.test.js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/storage/',
    '/test-results/',
    '/docs/',
    '/scripts/',
    '/.vercel/'
  ],
  
  // Module paths
  moduleDirectories: ['node_modules', 'src'],
  
  // Force exit after tests (important for hanging issues)
  forceExit: true,
  
  // Detect open handles (helps identify hanging async operations)
  detectOpenHandles: true,
  
  // Max workers for stability
  maxWorkers: 2,
  
  // Verbose output for debugging
  verbose: false,
  
  // Silent console logs during tests unless errors
  silent: false
}; 