import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

import tap from 'tap';

const PACKAGE_PATH = 'package.json';
const ARCHITECTURE_PATH = 'architecture/runtime-lifecycle.md';
const AUDIT_SCRIPT = 'node scripts/check-service-portability-claims.js';
const STATIC_AUDIT_STEP = 'npm run audit:service-portability-claims';

function readPackage() {
  return JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
}

tap.test('static quality gate invokes the portability claims audit', (t) => {
  const packageJson = readPackage();

  t.equal(packageJson.scripts['audit:service-portability-claims'], AUDIT_SCRIPT);
  t.match(packageJson.scripts['test:static'],
    /npm run audit:service-portability-claims/u);
  t.end();
});

tap.test('portability claims audit CLI passes the checked-in surface', (t) => {
  const result = spawnSync(process.execPath,
    ['scripts/check-service-portability-claims.js'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

  t.equal(result.status, 0, result.stderr);
  t.equal(result.stdout, 'service-portability claims: valid\n');
  t.end();
});

tap.test('runtime architecture points to the truthful capability owner', (t) => {
  const architecture = fs.readFileSync(ARCHITECTURE_PATH, 'utf8');

  t.match(architecture, /docs\/service-portability-capabilities\.json/u);
  t.match(architecture,
    /Lifecycle scaffold; current callback example is a JavaScript envelope/u);
  t.match(architecture,
    /Descriptor and in-memory lifecycle scaffold; no real container activation/u);
  t.end();
});

tap.test('static script names one canonical audit step', (t) => {
  const staticScript = readPackage().scripts['test:static'];
  const occurrences = staticScript.split(STATIC_AUDIT_STEP).length - 1;

  t.equal(occurrences, 1);
  t.end();
});
