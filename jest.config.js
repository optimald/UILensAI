module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/packages/worker/uilensai/test/**/*.test.js'
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    'packages/worker/uilensai/utils/ai-output-validator.js',
    'packages/worker/uilensai/utils/circuit-breaker.js'
  ],
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 60,
      functions: 60,
      lines: 60
    }
  }
};
