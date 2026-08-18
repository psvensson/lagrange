#!/usr/bin/env node
// Writes or checks test/shards/subsystem-classes.json, the single subsystem
// classification census. Modes:
//   (default)        write the manifest derived from the live census + taxonomy
//   --check          fail closed if the committed manifest differs from the census
//   --explain <test> print which rule placed one test, derived live
//
// ONE correctness command. --check independently enumerates the live tests,
// classifies every one, requires exactly one match, rejects dead rules and dead
// overrides, builds the expected manifest in memory and byte-compares it with
// the committed artifact. An earlier --verify mode existed alongside it and was
// three times found to be weaker than it claimed; --check strictly dominates it,
// so the second command is gone rather than repaired again.
//
// Stage 1 of the modular proof hierarchy: this establishes a sealed semantic
// home for every test and changes nothing about which tests CI selects.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  buildSubsystemManifest,
  explainSubsystemClassification,
} from './checks/test-subsystem-classification.js';
import {
  SUBSYSTEM_CENSUS_MISMATCH_PROBLEM,
  SUBSYSTEM_MANIFEST_PATH,
} from './checks/test-subsystem-classification-constants.js';

const MODE_CHECK = '--check';
const MODE_EXPLAIN = '--explain';
const FAIL_PREFIX = 'FAIL';
const OK_PREFIX = 'subsystem classification OK';
const WROTE_PREFIX = 'wrote';
const BYTE_DRIFT_PROBLEM =
  'manifest bytes differ from regenerated census (ordering/metadata drift)';
const REGENERATE_HINT =
  'rerun node scripts/generate-test-subsystem-classes.js to regenerate';
const UTF8_ENCODING = 'utf8';
const PRIMARY_MANIFEST_PATH = 'test/shards/primary-classes.json';
const RESOURCE_MANIFEST_PATH = 'test/shards/resource-classes.json';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

function serialize(manifest) {
  const sortedKeys = Object.keys(manifest.classes).sort();
  const sorted = {
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    counts: manifest.counts,
    censusSize: manifest.censusSize,
    digest: manifest.digest,
    classes: Object.fromEntries(
      sortedKeys.map((key) => [key, manifest.classes[key]])),
  };
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

// The three axes must describe exactly the same population, or a selector
// could run a subsystem that silently omits tests the other axes know about.
function censusEqualityProblems(manifest) {
  const problems = [];
  for (const siblingPath of [PRIMARY_MANIFEST_PATH, RESOURCE_MANIFEST_PATH]) {
    const absolute = path.join(root, siblingPath);
    if (!fs.existsSync(absolute)) continue;
    const sibling = JSON.parse(fs.readFileSync(absolute, UTF8_ENCODING));
    if (sibling.censusSize !== manifest.censusSize) {
      problems.push(
        `${SUBSYSTEM_CENSUS_MISMATCH_PROBLEM}: ${siblingPath} has ` +
        `${sibling.censusSize}, subsystem census has ${manifest.censusSize}`);
      continue;
    }
    for (const testPath of Object.keys(sibling.classes)) {
      if (manifest.classes[testPath] === undefined) {
        problems.push(
          `${SUBSYSTEM_CENSUS_MISMATCH_PROBLEM}: ${siblingPath} names ` +
          `${testPath}, which has no subsystem`);
      }
    }
  }
  return problems;
}

function reportProblems(problems) {
  for (const problem of problems) {
    process.stderr.write(`${FAIL_PREFIX} ${problem}\n`);
  }
  process.stderr.write(`${REGENERATE_HINT}\n`);
  process.exitCode = 1;
}

function summary(manifest) {
  return `${OK_PREFIX} — ${manifest.censusSize} tests, ` +
    `${Object.keys(manifest.counts).length} subsystems, ` +
    `digest ${manifest.digest}\n`;
}

function explain(argv) {
  const testPath = argv[argv.indexOf(MODE_EXPLAIN) + 1];
  if (!testPath) {
    process.stderr.write(`${FAIL_PREFIX} ${MODE_EXPLAIN} requires a test path\n`);
    process.exitCode = 1;
    return;
  }
  const verdict = explainSubsystemClassification(testPath);
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  if (!verdict.subsystem) process.exitCode = 1;
}

function main() {
  const argv = process.argv.slice(2);
  if (args.has(MODE_EXPLAIN)) {
    explain(argv);
    return;
  }
  const manifestFile = path.join(root, SUBSYSTEM_MANIFEST_PATH);
  const manifest = buildSubsystemManifest(root);
  const problems = [...manifest.problems, ...censusEqualityProblems(manifest)];
  if (problems.length > 0) {
    reportProblems(problems);
    return;
  }
  const serialized = serialize(manifest);

  if (args.has(MODE_CHECK)) {
    const committed = fs.existsSync(manifestFile) ?
      fs.readFileSync(manifestFile, UTF8_ENCODING) : '';
    if (committed !== serialized) {
      reportProblems([BYTE_DRIFT_PROBLEM]);
      return;
    }
    process.stdout.write(summary(manifest));
    return;
  }

  fs.writeFileSync(manifestFile, serialized, UTF8_ENCODING);
  process.stdout.write(
    `${WROTE_PREFIX} ${SUBSYSTEM_MANIFEST_PATH} — ${manifest.censusSize} ` +
    `tests, ${Object.keys(manifest.counts).length} subsystems, ` +
    `digest ${manifest.digest}\n`);
}

main();
