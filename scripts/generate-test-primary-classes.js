#!/usr/bin/env node
// Writes or checks test/shards/primary-classes.json, the single primary
// classification census (developer-velocity epic V2a). Modes:
//   (default)   write the manifest derived from the live filesystem census
//   --check     fail closed if the committed manifest differs from the census
//   --verify    fail closed on any census/duplicate/unknown-class/drift problem
// The manifest is deterministic (sorted keys), so --check is a byte compare.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  PRIMARY_CLASS_CONVERGENCE_PROBE,
  PRIMARY_CLASS_MANIFEST_PATH,
  buildManifest,
  loadManifest,
  verifyManifest,
} from './checks/test-primary-classification.js';

const MODE_CHECK = '--check';
const MODE_VERIFY = '--verify';
const FAIL_PREFIX = 'FAIL';
const OK_PREFIX = 'primary classification OK';
const WROTE_PREFIX = 'wrote';
const BYTE_DRIFT_PROBLEM =
  'manifest bytes differ from regenerated census (ordering/metadata drift)';
const REGENERATE_HINT = 'rerun node scripts/generate-test-primary-classes.js to regenerate';
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
      Object.keys(manifest.classes).sort().map((key) => [key, manifest.classes[key]])),
  };
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

function formatCounts(counts) {
  return `unit=${counts.unit} integration=${counts.integration} ` +
    `bootstrap=${counts.bootstrap} convergence-probe=${counts[PRIMARY_CLASS_CONVERGENCE_PROBE]} ` +
    `packaging=${counts.packaging}`;
}

if (args.has(MODE_CHECK) || args.has(MODE_VERIFY)) {
  const loaded = loadManifest(root);
  if (!loaded.ok) {
    for (const problem of loaded.problems) console.error(`${FAIL_PREFIX} ${problem}`);
    process.exit(1);
  }
  const problems = verifyManifest(root, loaded.manifest);
  if (args.has(MODE_CHECK) && problems.length === 0) {
    const expected = serialize(buildManifest(root));
    const onDisk = fs.readFileSync(
      path.join(root, PRIMARY_CLASS_MANIFEST_PATH), UTF8_ENCODING);
    if (onDisk !== expected) {
      problems.push(BYTE_DRIFT_PROBLEM);
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`${FAIL_PREFIX} ${problem}`);
    console.error(`primary classification: ${problems.length} problem(s); ${REGENERATE_HINT}`);
    process.exit(1);
  }
  console.log(`${OK_PREFIX}: ${loaded.manifest.censusSize} tests ` +
    `(${formatCounts(loaded.manifest.counts)})`);
  process.exit(0);
}

const manifest = buildManifest(root);
fs.writeFileSync(path.join(root, PRIMARY_CLASS_MANIFEST_PATH), serialize(manifest));
console.log(`${WROTE_PREFIX} ${PRIMARY_CLASS_MANIFEST_PATH}: ${manifest.censusSize} tests, ` +
  `digest ${manifest.digest}`);
