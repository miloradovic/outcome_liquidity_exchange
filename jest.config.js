/** @type {import('jest').Config} */
const config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};

module.exports = config;
