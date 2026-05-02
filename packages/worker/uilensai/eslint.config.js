const js = require('@eslint/js');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  {
    // Global ignores
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      '*.min.js',
      'coverage/',
      '.vercel/',
      'fly-worker/node_modules/',
      'docs-site/',
      'status-site/',
      'test-results/',
      'backups/'
    ]
  },
  js.configs.recommended,
  {
    // Configuration for API files and other ES module files
    files: ['api/**/*.js', 'fly-worker/**/*.js'],
    plugins: {
      import: importPlugin
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        global: 'readonly',
        exports: 'readonly',
        fetch: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-inner-declarations': 'off',
      'no-fallthrough': 'off',
      'no-case-declarations': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',
      'no-irregular-whitespace': 'off',
      'no-control-regex': 'off',
      'no-empty': 'off',
      'no-mixed-spaces-and-tabs': 'warn',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-useless-catch': 'warn',
      'import/no-duplicates': 'warn',
      'eqeqeq': 'warn',
      'curly': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error'
    }
  },
  {
    // Configuration for all other files (CommonJS)
    files: ['**/*.js'],
    ignores: ['api/**/*.js', 'fly-worker/**/*.js'],
    plugins: {
      import: importPlugin
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        global: 'readonly',
        exports: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-inner-declarations': 'off',
      'no-fallthrough': 'off',
      'no-case-declarations': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',
      'no-irregular-whitespace': 'off',
      'no-control-regex': 'off',
      'no-empty': 'off',
      'no-mixed-spaces-and-tabs': 'warn',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-useless-catch': 'warn',
      'import/no-duplicates': 'warn',
      'eqeqeq': 'warn',
      'curly': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error'
    }
  }
]; 