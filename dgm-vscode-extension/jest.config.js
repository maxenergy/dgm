module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@ui/(.*)$': '<rootDir>/src/ui/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@integrations/(.*)$': '<rootDir>/src/integrations/$1',
    '^@types$': '<rootDir>/src/shared/types',
    '^@utils$': '<rootDir>/src/shared/utils',
    '^@constants$': '<rootDir>/src/shared/constants',
    '^@config$': '<rootDir>/src/shared/config',
    '^vscode$': '<rootDir>/tests/__mocks__/vscode'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true
      }
    }
  }
};