#!/usr/bin/env node
// Runs every test that proves one product subsystem.
//
//   node scripts/check-subsystem.js <subsystem-id> [--list]
//
// This is the explicit whole-subsystem proof: the conservative middle layer
// between a focused change proof and the complete release suite. It answers
// "prove the membership subsystem", which neither the primary axis (what kind
// of test) nor the resource axis (how it may execute) can express.
//
// FAIL CLOSED. An unknown subsystem id is an error naming the valid ids, never
// an empty run - selecting zero tests looks exactly like selecting the right
// zero tests. The classification is verified fresh before it is trusted, so a
// stale manifest cannot silently narrow the selection.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  SUBSYSTEM_MANIFEST_PATH,
  SUBSYSTEMS,
} from './checks/test-subsystem-classification-constants.js';

const LIST_FLAG = '--list';
const UTF8 = 'utf8';
const GENERATOR = 'scripts/generate-test-subsystem-classes.js';
const RUNNER = 'scripts/run-test-files.js';
const CHECK_FLAG = '--check';
const USAGE =
  'usage: node scripts/check-subsystem.js <subsystem-id> [--list]\n';
const UNKNOWN_SUBSYSTEM_PROBLEM = 'unknown subsystem';
const OUTPUT_PREFIX = 'check:subsystem';
const NEWLINE = '\n';
const LIST_SEPARATOR = ', ';
const FLAG_PREFIX = '-';
const KNOWN_SUBSYSTEMS_LABEL = '  known subsystems: ';
const SUBSYSTEMS_LABEL = 'subsystems: ';
const SELECTED_LABEL = ' test(s)';
const EMPTY_SELECTION_PROBLEM =
  'subsystem selected no tests; refusing to report success on an empty run';
const STALE_CLASSIFICATION_PROBLEM =
  'subsystem classification is stale; run node ' +
  'scripts/generate-test-subsystem-classes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  process.stderr.write(`${OUTPUT_PREFIX}: ${message}${NEWLINE}`);
  process.exitCode = 1;
}

function verifyClassificationFresh() {
  const result = spawnSync(process.execPath, [GENERATOR, CHECK_FLAG],
    {cwd: root, stdio: 'pipe'});
  return result.status === 0;
}

function testsForSubsystem(subsystem) {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, SUBSYSTEM_MANIFEST_PATH), UTF8));
  return Object.keys(manifest.classes).sort()
    .filter((testPath) => manifest.classes[testPath] === subsystem);
}

function main() {
  const args = process.argv.slice(2);
  const list = args.includes(LIST_FLAG);
  const subsystem = args.find(
    (argument) => !argument.startsWith(FLAG_PREFIX));
  if (!subsystem) {
    process.stderr.write(USAGE);
    process.stderr.write(
      `${SUBSYSTEMS_LABEL}${SUBSYSTEMS.join(LIST_SEPARATOR)}${NEWLINE}`);
    process.exitCode = 1;
    return;
  }
  if (!SUBSYSTEMS.includes(subsystem)) {
    fail(`${UNKNOWN_SUBSYSTEM_PROBLEM}: ${subsystem}${NEWLINE}` +
      `${KNOWN_SUBSYSTEMS_LABEL}${SUBSYSTEMS.join(LIST_SEPARATOR)}`);
    return;
  }
  if (!verifyClassificationFresh()) {
    fail(STALE_CLASSIFICATION_PROBLEM);
    return;
  }
  const tests = testsForSubsystem(subsystem);
  if (tests.length === 0) {
    fail(`${EMPTY_SELECTION_PROBLEM}: ${subsystem}`);
    return;
  }
  if (list) {
    process.stdout.write(`${tests.join(NEWLINE)}${NEWLINE}`);
    return;
  }
  process.stdout.write(
    `${OUTPUT_PREFIX} ${subsystem} — ${tests.length}${SELECTED_LABEL}${NEWLINE}`);
  const result = spawnSync(process.execPath, [RUNNER, ...tests],
    {cwd: root, stdio: 'inherit'});
  process.exitCode = result.status === null ? 1 : result.status;
}

main();
