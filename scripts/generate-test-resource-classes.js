#!/usr/bin/env node
// Writes or checks test/shards/resource-classes.json, the single resource
// classification census. Modes:
//   (default)   write the manifest derived from the live census + shards
//   --check     fail closed if the committed manifest differs from the census
//   --verify    fail closed on any census/duplicate/unknown-class/drift problem
// The manifest is deterministic (sorted keys), so --check is a byte compare.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  buildResourceManifest,
  verifyResourceManifest,
} from './checks/test-resource-classification.js';
import {
  RESOURCE_CLASS_MANIFEST_PATH,
} from './checks/test-resource-classification-constants.js';

const MODE_CHECK = '--check';
const MODE_VERIFY = '--verify';
const FAIL_PREFIX = 'FAIL';
const OK_PREFIX = 'resource classification OK';
const WROTE_PREFIX = 'wrote';
const BYTE_DRIFT_PROBLEM =
  'manifest bytes differ from regenerated census (ordering/metadata drift)';
const REGENERATE_HINT =
  'rerun node scripts/generate-test-resource-classes.js to regenerate';
const UTF8_ENCODING = 'utf8';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

function serialize(manifest) {
  const sorted = {
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    counts: manifest.counts,
    censusSize: manifest.censusSize,
    digest: manifest.digest,
    classes: Object.fromEntries(
      Object.keys(manifest.classes).sort()
        .map((key) => [key, manifest.classes[key]])),
  };
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

function reportProblems(problems) {
  for (const problem of problems) {
    process.stderr.write(`${FAIL_PREFIX} ${problem}\n`);
  }
  process.stderr.write(`${REGENERATE_HINT}\n`);
  process.exitCode = 1;
}

function main() {
  const manifestFile = path.join(root, RESOURCE_CLASS_MANIFEST_PATH);
  const manifest = buildResourceManifest(root);
  if (manifest.problems.length > 0) {
    reportProblems(manifest.problems);
    return;
  }
  const serialized = serialize(manifest);

  if (args.has(MODE_VERIFY)) {
    const verdict = verifyResourceManifest(root, RESOURCE_CLASS_MANIFEST_PATH);
    if (!verdict.ok) {
      reportProblems(verdict.problems);
      return;
    }
    process.stdout.write(
      `${OK_PREFIX} — ${manifest.censusSize} tests, digest ${manifest.digest}\n`);
    return;
  }

  if (args.has(MODE_CHECK)) {
    const committed = fs.existsSync(manifestFile) ?
      fs.readFileSync(manifestFile, UTF8_ENCODING) : '';
    if (committed !== serialized) {
      reportProblems([BYTE_DRIFT_PROBLEM]);
      return;
    }
    process.stdout.write(
      `${OK_PREFIX} — ${manifest.censusSize} tests, digest ${manifest.digest}\n`);
    return;
  }

  fs.writeFileSync(manifestFile, serialized, UTF8_ENCODING);
  process.stdout.write(
    `${WROTE_PREFIX} ${RESOURCE_CLASS_MANIFEST_PATH} — ` +
    `${manifest.censusSize} tests, digest ${manifest.digest}\n`);
}

main();
