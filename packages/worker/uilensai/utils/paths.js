const path = require('path');

/**
 * Resolve UILENSAI_ROOT using a dual strategy:
 * 1. require.resolve('@optimald/uilensai/package.json') — works when the package
 *    is consumed as an npm dependency (e.g. in Next.js / webpack bundles).
 *    This is the fix for the __dirname-rewriting bug under webpack.
 * 2. __dirname fallback — works in local monorepo dev and Jest, where the
 *    scoped package name isn't resolvable.
 */
let UILENSAI_ROOT;
try {
  UILENSAI_ROOT = path.join(
    path.dirname(require.resolve('@optimald/uilensai/package.json')),
    'packages', 'worker', 'uilensai'
  );
} catch {
  // Fallback: this file lives at utils/paths.js, so root is one level up
  UILENSAI_ROOT = path.resolve(__dirname, '..');
}

module.exports = {
  SCHEMAS_DIR: path.join(UILENSAI_ROOT, 'schemas'),
  CONFIG_DIR: path.join(UILENSAI_ROOT, 'config'),
  getSchemaPath: (name) => path.join(UILENSAI_ROOT, 'schemas', name),
  getConfigPath: (name) => path.join(UILENSAI_ROOT, 'config', name),
};
