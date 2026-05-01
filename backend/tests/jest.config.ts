import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/../tsconfig.json',
      },
    ],
  },
  testMatch: [
    '<rootDir>/unit/**/*.test.ts',
    '<rootDir>/integration/**/*.test.ts',
  ],
  collectCoverageFrom: [
    '<rootDir>/../src/**/*.ts',
    '!<rootDir>/../src/index.ts',
  ],
  coverageDirectory: '<rootDir>/../coverage',
  clearMocks: true,
  restoreMocks: true,
};

export default config;
