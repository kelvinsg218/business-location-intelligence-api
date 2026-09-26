'use strict';

const js = require('@eslint/js');

const nodeGlobals = {
  process: 'readonly',
  module: 'writable',
  exports: 'writable',
  require: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  global: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly',
  URL: 'readonly',
};

const jestGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  jest: 'readonly',
};

module.exports = [
  { ignores: ['node_modules/', 'coverage/', 'frontend/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // SQL injection guard: SQL text passed to .query() must be a constant string;
      // values go through bind parameters ($1, $2, ...). A template literal with
      // interpolation, or string concatenation, as the query text is rejected.
      // (Bind parameters cannot express identifiers or DDL, e.g. scripts/db-init.js:
      // there the text is built in a variable and the exception is documented.)
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='query'] > TemplateLiteral[expressions.length>0]",
          message: 'Do not interpolate values into SQL. Use a constant query string and bind parameters ($1, $2, ...).',
        },
        {
          selector: "CallExpression[callee.property.name='query'] > BinaryExpression",
          message: 'Do not build SQL by concatenation. Use a constant query string and bind parameters ($1, $2, ...).',
        },
        {
          selector: "CallExpression[callee.property.name='query'] > ObjectExpression > Property[key.name='text'] > TemplateLiteral[expressions.length>0]",
          message: 'Do not interpolate values into SQL. Use a constant `text` and bind parameters in `values`.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...nodeGlobals, ...jestGlobals },
    },
  },
];
