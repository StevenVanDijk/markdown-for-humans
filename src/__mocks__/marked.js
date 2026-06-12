/**
 * CJS shim for marked@17 (ESM-only) so Jest 29's CommonJS module loader can
 * require() it.
 *
 * marked@17's package.json has "type": "module", so Node and Jest both treat
 * all its .js files as ES modules. `require('marked')` returns an empty object
 * because the CJS loader skips ESM files. The UMD build ships in the same
 * package but is also affected by the type flag.
 *
 * Workaround: load the UMD build through vm.createContext, which evaluates the
 * code directly without going through Node's module-type system, then
 * re-export the result as a normal CJS module. Jest intercepts require('marked')
 * via moduleNameMapper and gets this file instead.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const umdPath = path.resolve(__dirname, '../../node_modules/marked/lib/marked.umd.js');
const code = fs.readFileSync(umdPath, 'utf8');
const mod = { exports: {} };

const ctx = vm.createContext({
  module: mod,
  exports: mod.exports,
  require,
  __filename: umdPath,
  __dirname: path.dirname(umdPath),
  // Standard globals the UMD code relies on.
  globalThis,
  console,
  Object,
  Array,
  Function,
  RegExp,
  Map,
  Set,
  Promise,
  Error,
  Symbol,
  JSON,
  Math,
  Infinity,
  undefined,
  encodeURI,
  decodeURI,
  encodeURIComponent,
  decodeURIComponent,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
});

new vm.Script(code, { filename: umdPath }).runInContext(ctx);

module.exports = mod.exports;
