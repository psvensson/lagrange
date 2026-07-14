import fs from 'node:fs';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const PACKAGE_PATH = path.join(PROJECT_ROOT, 'package.json');
const LOCK_PATH = path.join(PROJECT_ROOT, 'package-lock.json');
const PG_VERSION_RANGE = '^8.18.0';
const PG_RUNTIME_PACKAGES = Object.freeze([
  'pg',
  'pg-cloudflare',
  'pg-connection-string',
  'pg-int8',
  'pg-pool',
  'pg-protocol',
  'pg-types',
  'pgpass',
  'postgres-array',
  'postgres-bytea',
  'postgres-date',
  'postgres-interval',
  'xtend',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('shipped service CLI retains pg in production installations', (t) => {
  const packageJson = readJson(PACKAGE_PATH);
  const packageLock = readJson(LOCK_PATH);
  const rootLock = packageLock.packages[''];

  t.equal(packageJson.dependencies.pg, PG_VERSION_RANGE);
  t.equal(Object.hasOwn(packageJson.devDependencies, 'pg'), false);
  t.equal(rootLock.dependencies.pg, PG_VERSION_RANGE);
  t.equal(Object.hasOwn(rootLock.devDependencies, 'pg'), false);
  t.same(rootLock.bin, {
    'lagrange': 'src/sea-entry.js',
    'lagrange-admin': 'src/cli/bin/lagrange-admin.js',
  });

  for (const packageName of PG_RUNTIME_PACKAGES) {
    const entry = packageLock.packages[`node_modules/${packageName}`];
    t.ok(entry, `${packageName} exists in the lockfile`);
    t.not(entry.dev === true, `${packageName} is retained without dev dependencies`);
  }
  t.end();
});
