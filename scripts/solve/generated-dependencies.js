// Deterministic candidate dependencies checked in an isolated exact snapshot.
// Repository-global generated files must never be derived from the ambient
// dirty worktree, because unrelated tests would contaminate their census.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {withCandidateSnapshot} from './candidate-snapshot.js';

const MAX_BUFFER = 64 * 1024 * 1024;
const TEST_PATH_PATTERN = /^test\/.*\.(?:[cm]?js|json)$/u;
const MANIFEST_SCHEMA_VERSION = 1;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const ARGUMENT_SEPARATOR = ' ';
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const bufferEquals = Function.call.bind(Buffer.prototype.equals);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringTrim = Function.call.bind(String.prototype.trim);

const GENERATED_DEPENDENCY_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'test-classification-manifests',
    scope: 'repository-global',
    trigger: TEST_PATH_PATTERN,
    steps: Object.freeze([
      Object.freeze({argv: ['scripts/generate-test-primary-classes.js'],
        output: 'test/shards/primary-classes.json'}),
      Object.freeze({argv: ['scripts/generate-test-resource-classes.js'],
        output: 'test/shards/resource-classes.json'}),
      Object.freeze({argv: ['scripts/generate-test-subsystem-classes.js'],
        output: 'test/shards/subsystem-classes.json'}),
    ]),
  }),
]);

function sha256(bytes) {
  return `sha256:${crypto.createHash(HASH_ALGORITHM).update(bytes).digest(HASH_ENCODING)}`;
}

function run(root, command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: TEXT_ENCODING,
    input: options.input,
    maxBuffer: MAX_BUFFER,
  });
}

function selectedDependencies(paths) {
  return arrayFilter(GENERATED_DEPENDENCY_REGISTRY, (entry) =>
    arraySome(paths, (filePath) => regExpTest(entry.trigger, filePath)));
}

function receiptStepArgv(step) {
  const argv = [process.execPath];
  arrayForEach(step.argv, (argument) => arrayPush(argv, argument));
  return argv;
}

function fail(result, stage) {
  const detail = stringTrim(
    String(result.stderr || result.stdout || result.error?.message || ''),
  );
  throw new Error(`land: generated dependency ${stage} failed${detail ? `: ${detail}` : ''}`);
}

export function generatedDependencyReceiptInSnapshot(snapshot, aggregate) {
  const paths = aggregate.sourcePaths || aggregate.paths || [];
  const selected = selectedDependencies(paths);
  if (selected.length === 0) {
    return {schemaVersion: MANIFEST_SCHEMA_VERSION, registryVersion: 1, entries: []};
  }
  const entries = [];
  arrayForEach(selected, (dependency) => {
    const outputs = [];
    arrayForEach(dependency.steps, (step) => {
      const beforePath = path.join(snapshot, step.output);
      const before = fs.existsSync(beforePath) ? fs.readFileSync(beforePath) : null;
      const generated = run(snapshot, process.execPath, arraySlice(step.argv));
      if (generated.status !== 0) fail(generated, `${dependency.id}/${step.output}`);
      const after = fs.readFileSync(beforePath);
      if (before === null || !bufferEquals(before, after)) {
        throw new Error(
          `land: generated dependency is stale in the exact candidate: ${step.output}; ` +
          `run node ${arrayJoin(step.argv, ARGUMENT_SEPARATOR)} and record a replacement attempt`,
        );
      }
      arrayPush(outputs, {path: step.output, sha256: sha256(after), size: after.length});
    });
    arrayPush(entries, {id: dependency.id, scope: dependency.scope,
      triggerPaths: arraySort(arrayFilter(paths, (filePath) =>
        regExpTest(dependency.trigger, filePath))),
      steps: arrayMap(dependency.steps, (step) => ({
        argv: receiptStepArgv(step),
        output: step.output,
      })), outputs});
  });
  return {schemaVersion: MANIFEST_SCHEMA_VERSION, registryVersion: 1, entries};
}

export function generatedDependencyReceipt(root, aggregate) {
  return withCandidateSnapshot(root, aggregate, (snapshot) =>
    generatedDependencyReceiptInSnapshot(snapshot, aggregate));
}
