// The native database drivers of the benchmark chain, resolved from THIS
// package's own path: mysql2 is a dependency of the reference-client package
// (its own package.json and lockfile, installed with `npm ci --prefix
// test/distributed/reference-client`), never of the repository root; pg
// resolves from the root through the same path. Harness modules elsewhere
// cannot resolve mysql2 from their own directories, so they load it here.
import {createRequire} from 'node:module';

const requireHere = createRequire(import.meta.url);
const NATIVE_CLIENT_PACKAGES = Object.freeze(['pg', 'mysql2']);

// Each driver's installed version as its own package reports it, or why it
// could not be read.
function nativeClientVersions() {
  return Object.fromEntries(NATIVE_CLIENT_PACKAGES.map((name) => {
    try {
      return [name, {version: requireHere(`${name}/package.json`).version, error: null}];
    } catch (error) {
      return [name, {version: null, error: String(error?.message || error)}];
    }
  }));
}

async function loadMysql2Promise() {
  const loaded = await import('mysql2/promise');
  return loaded.default || loaded;
}

export {NATIVE_CLIENT_PACKAGES, loadMysql2Promise, nativeClientVersions};
