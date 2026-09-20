/**
 * Jest configuration for Angular unit tests.
 *
 * Uses jest-preset-angular which wires up zone.js/testing, transforms
 * .ts files via ts-jest with the angular compiler, and configures jsdom.
 */
const { createCjsPreset } = require('jest-preset-angular/presets');

module.exports = {
  ...createCjsPreset(),
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  verbose: true,
  testMatch: ['<rootDir>/src/**/**/*.spec.ts'],
  moduleNameMapper: {
    // PrimeNG ships ESM-only with no CJS entry — point Jest at the .mjs bundles.
    '^@primeng/themes$': '<rootDir>/node_modules/@primeng/themes/index.mjs',
    '^@primeng/themes/(.*)$': '<rootDir>/node_modules/@primeng/themes/$1/index.mjs',
    '^src/(.*)$': '<rootDir>/src/$1'
  },
  transformIgnorePatterns: ['node_modules/(?!@angular|@primeng|primeng|primeicons|primeflex|@primeuix|rxjs|zone.js)']
};
