// Deterministic candidate dependencies checked in an isolated exact snapshot.
// Repository-global generated files must never be derived from the ambient
// dirty worktree, because unrelated tests would contaminate their census.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {withCandidateSnapshot} from './candidate-snapshot.js';
import {GENERATED_OUTPUT_COVERAGE} from './constants.js';
import {
  IMPORT_GRAPH_SEAL_PATH,
} from '../checks/impact-proof-cone-constants.js';

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

// The tracked import-graph seal is rewritten by the landing's own inventory
// refresh (handoff.js, the --refresh fallback) AFTER the top-of-land union
// guard ran and BEFORE the commit gate's audit, so the first land after
// such a refresh stopped at commit-gate naming the seal and the operator
// had to restore it and land again (2026-08-30, verified on 81c30686e).
// The seal is a pure digest projection of the candidate's JavaScript
// sources, so it is registered here as a generated output whose fresh
// regeneration from the exact candidate is the only thing that covers it.
const IMPORT_GRAPH_SEAL_REFRESH_ARGUMENT = '--refresh-import-graph-only';
const IMPORT_GRAPH_SEAL_STEP = Object.freeze({
  argv: ['scripts/generate-global-owner-debt-inventory.js',
    IMPORT_GRAPH_SEAL_REFRESH_ARGUMENT],
  output: IMPORT_GRAPH_SEAL_PATH,
});
const REGISTERED_GENERATED_OUTPUT_STEPS = Object.freeze([
  ...arrayMap(GENERATED_DEPENDENCY_REGISTRY, (entry) => entry.steps)
    .flat(),
  IMPORT_GRAPH_SEAL_STEP,
]);
const COVERAGE_KEY_SEPARATOR = '\n';
const GENERATOR_FAILURE_DETAIL_SEPARATOR = ': ';
const NO_DETAIL = '';
// Typed regeneration outcome for one registered output in the snapshot.
const REGENERATION = Object.freeze({
  REGENERATED: 'regenerated',
  FAILED: 'failed',
});
// Typed reasons a coverage verdict carries; never a raw null.
const COVERAGE_REASON = Object.freeze({
  BYTE_IDENTICAL:
    'ambient bytes equal a fresh regeneration from the exact candidate',
  BYTES_DIFFER:
    'ambient bytes differ from a fresh regeneration from the exact candidate',
  AMBIENT_MISSING: 'ambient output file is missing',
  GENERATOR_FAILED: 'generator failed',
  OUTPUT_MISSING: 'generator produced no output file',
  CANDIDATE_UNAVAILABLE:
    'landing candidate has no reachable base or content to regenerate from',
});
// Fresh regenerations are a pure function of (base, candidate fingerprint,
// output): memoized per process so the union guard, the commit gate audit
// and the handoff scope evaluate one landing without re-running a producer.
const regenerationDigests = new Map();
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);

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

function registeredGeneratedOutputStep(filePath) {
  for (let index = 0; index < REGISTERED_GENERATED_OUTPUT_STEPS.length; index += 1) {
    if (REGISTERED_GENERATED_OUTPUT_STEPS[index].output === filePath) {
      return REGISTERED_GENERATED_OUTPUT_STEPS[index];
    }
  }
  return null;
}

// Lightweight registry surface for consumers that only need to know WHICH
// paths are generated collateral (template suggestion, path filtering) —
// never the snapshot machinery.
export function registeredGeneratedOutputPaths() {
  return arrayMap(REGISTERED_GENERATED_OUTPUT_STEPS, (step) => step.output);
}

export function isRegisteredGeneratedOutput(filePath) {
  return registeredGeneratedOutputStep(filePath) !== null;
}

function regenerationKey(aggregate, output) {
  return arrayJoin(
    [aggregate.baseCommit, aggregate.fingerprint, output],
    COVERAGE_KEY_SEPARATOR,
  );
}

// Regeneration outcome rules, first match wins: a non-zero producer exit,
// then a producer that exited clean without writing its output, else the
// fresh bytes' digest.
const REGENERATION_RULES = Object.freeze([
  Object.freeze({
    matches: ({generated}) => generated.status !== 0,
    outcome: ({generated}) => ({
      status: REGENERATION.FAILED,
      reason: COVERAGE_REASON.GENERATOR_FAILED +
        GENERATOR_FAILURE_DETAIL_SEPARATOR + stringTrim(String(
        generated.stderr || generated.stdout ||
          generated.error?.message || NO_DETAIL)),
    }),
  }),
  Object.freeze({
    matches: ({file}) => !fs.existsSync(file),
    outcome: () => ({
      status: REGENERATION.FAILED,
      reason: COVERAGE_REASON.OUTPUT_MISSING,
    }),
  }),
  Object.freeze({
    matches: () => true,
    outcome: ({file}) => ({
      status: REGENERATION.REGENERATED,
      digest: sha256(fs.readFileSync(file)),
    }),
  }),
]);

const EXHAUSTIVE_RULES_PROBLEM =
  'generated output rules must end with a catch-all rule';

function firstMatchingRule(rules, context) {
  for (let index = 0; index < rules.length; index += 1) {
    if (rules[index].matches(context)) return rules[index].outcome(context);
  }
  throw new Error(EXHAUSTIVE_RULES_PROBLEM);
}

// Regenerate one registered output inside the exact candidate snapshot and
// return its typed regeneration outcome.
function regenerateInSnapshot(snapshot, step) {
  const generated = run(snapshot, process.execPath, arraySlice(step.argv));
  return firstMatchingRule(REGENERATION_RULES, {
    generated,
    file: path.join(snapshot, step.output),
  });
}

function freshDigests(root, aggregate, steps) {
  const pending = arrayFilter(steps, (step) =>
    !mapHas(regenerationDigests, regenerationKey(aggregate, step.output)));
  if (pending.length > 0) {
    withCandidateSnapshot(root, aggregate, (snapshot) => {
      arrayForEach(pending, (step) => {
        mapSet(regenerationDigests, regenerationKey(aggregate, step.output),
          regenerateInSnapshot(snapshot, step));
      });
    });
  }
  return arrayMap(steps, (step) => ({
    step,
    fresh: mapGet(regenerationDigests, regenerationKey(aggregate, step.output)),
  }));
}

function ambientDigest(root, output) {
  const file = path.join(root, output);
  return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
}

// Coverage verdict rules, first match wins: an unregenerable output, a
// missing ambient file, byte-identical bytes, else differing bytes.
const COVERAGE_RULES = Object.freeze([
  Object.freeze({
    matches: ({fresh}) => fresh.status !== REGENERATION.REGENERATED,
    outcome: ({fresh}) => ({
      coverage: GENERATED_OUTPUT_COVERAGE.UNAVAILABLE,
      reason: fresh.reason,
    }),
  }),
  Object.freeze({
    matches: ({ambient}) => ambient === null,
    outcome: () => ({
      coverage: GENERATED_OUTPUT_COVERAGE.STALE,
      reason: COVERAGE_REASON.AMBIENT_MISSING,
    }),
  }),
  Object.freeze({
    matches: ({fresh, ambient}) => ambient === fresh.digest,
    outcome: () => ({
      coverage: GENERATED_OUTPUT_COVERAGE.FRESH,
      reason: COVERAGE_REASON.BYTE_IDENTICAL,
    }),
  }),
  Object.freeze({
    matches: () => true,
    outcome: () => ({
      coverage: GENERATED_OUTPUT_COVERAGE.STALE,
      reason: COVERAGE_REASON.BYTES_DIFFER,
    }),
  }),
]);

function coverageEntry(root, output, fresh) {
  const verdict = firstMatchingRule(COVERAGE_RULES, {
    fresh,
    ambient: ambientDigest(root, output),
  });
  return {path: output, ...verdict};
}

// Landing coverage for dirty registered generated outputs: each path is
// FRESH (covered) only when the ambient bytes equal the bytes a fresh
// regeneration from the exact candidate (base + recorded delta, in an
// isolated snapshot) produces; STALE or UNAVAILABLE paths stay uncovered.
// Unregistered paths are never evaluated here.
export function generatedOutputCoverage(root, aggregate, outputPaths) {
  const steps = [];
  arrayForEach(outputPaths, (output) => {
    const step = registeredGeneratedOutputStep(output);
    if (step) arrayPush(steps, step);
  });
  if (steps.length === 0) return [];
  if (!aggregate || !aggregate.ok || !aggregate.baseCommit ||
    !aggregate.fingerprint || typeof aggregate.content !== 'string') {
    return arrayMap(steps, (step) => ({
      path: step.output,
      coverage: GENERATED_OUTPUT_COVERAGE.UNAVAILABLE,
      reason: COVERAGE_REASON.CANDIDATE_UNAVAILABLE,
    }));
  }
  return arrayMap(freshDigests(root, aggregate, steps), ({step, fresh}) =>
    coverageEntry(root, step.output, fresh));
}
