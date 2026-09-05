import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  loadImpactContractRegistry,
} from '../../scripts/checks/impact-contract-registry.js';
import {
  PRIMARY_CLASS_MANIFEST_PATH,
  loadManifest as loadPrimaryManifest,
} from '../../scripts/checks/test-primary-classification.js';

// Deterministic witness for the formation-release-handoff-interaction-registry
// quest: the seed-owned formation-release handoff contract and its joiner
// consumer projection are a registered protected interaction in
// test/shards/impact-contracts.json, so the proof cone and the Solver landing
// guard select both witnesses whenever either endpoint changes.
//
// Every scenario name below is anchored to one sealed receipt id so the
// evidence harness can select it with --test-name-pattern. On HEAD (before
// the registry edit) the three registry-presence scenarios are RED; the audit,
// no-owner-semantics-change and determinism scenarios are green on both sides
// and must stay green — a registration that turns them red is rejected.

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REGISTRY_PATH = 'test/shards/impact-contracts.json';
const UTF8_ENCODING = 'utf8';
const AUDIT_SCRIPT = 'scripts/checks/impact-contract-registry.js';
const NODE_EXECUTABLE = 'node';
const GIT_EXECUTABLE = 'git';
const AUDIT_PASS_PREFIX = 'impact-contracts: PASS (';
const EXIT_OK = 0;
const EMPTY_STRING = '';
const NO_PROBLEMS = 0;
const ENDPOINT_COUNT = 2;
const DETERMINISM_RUN_COUNT = 2;

const CONTRACT_ID = 'formation-release-handoff';
const PAIR_ID = 'formation-release-seed-contract-joiner-consumer';
const SEED_ENDPOINT_ID = 'seed-release-authority';
const JOINER_ENDPOINT_ID = 'joiner-consumer-barrier';

const SEED_OWNERS = Object.freeze([
  'src/control-plane/formation-release-handoff-closure-owner.js',
  'src/control-plane/formation-release-handoff-contract.js',
  'src/control-plane/formation-release-handoff-evidence.js',
  'src/control-plane/formation-release-handoff-publication.js',
]);
const JOINER_OWNERS = Object.freeze([
  'src/control-plane/control-plane-readiness-formation-release-methods.js',
  'src/bootstrap/node-joining-operation-ledger-formation-readiness.js',
]);
const CONTRACT_OWNERS = Object.freeze([...SEED_OWNERS, ...JOINER_OWNERS]);
const GIT_OWNER_DELTA_ARGUMENTS = Object.freeze([
  'diff', '--name-only', 'HEAD', '--', ...CONTRACT_OWNERS,
]);
const WITNESS_TESTS = Object.freeze([
  'test/control-plane/formation-release-handoff-closure.test.js',
  'test/control-plane/formation-release-handoff-consumer-parity.test.js',
]);

function readRegistry() {
  return JSON.parse(fs.readFileSync(
    path.join(REPOSITORY_ROOT, REGISTRY_PATH), UTF8_ENCODING));
}

function readPrimaryClasses() {
  const loaded = loadPrimaryManifest(REPOSITORY_ROOT, PRIMARY_CLASS_MANIFEST_PATH);
  assert.equal(loaded.ok, true, loaded.problems.join('; '));
  return loaded.manifest.classes;
}

function contractEntry(registry) {
  const entry = registry.contracts[CONTRACT_ID];
  assert.ok(entry, `registry lacks contract ${CONTRACT_ID}`);
  return entry;
}

function pairEntry(registry) {
  const entry = registry.coupledPairs[PAIR_ID];
  assert.ok(entry, `registry lacks coupled pair ${PAIR_ID}`);
  return entry;
}

function endpointOwners(pair, endpointId) {
  const endpoint = pair.endpoints.find((candidate) =>
    candidate.id === endpointId);
  assert.ok(endpoint, `pair ${PAIR_ID} lacks endpoint ${endpointId}`);
  return endpoint.owners;
}

function assertPathsExist(paths) {
  for (const relative of paths) {
    assert.equal(
      fs.statSync(path.join(REPOSITORY_ROOT, relative)).isFile(),
      true,
      `${relative} must be a file in the tree`,
    );
  }
}

// The registered interaction, projected as plain data so two independent
// loads can be compared byte-for-byte.
function interactionProjection() {
  const registry = readRegistry();
  const loaded = loadImpactContractRegistry(REPOSITORY_ROOT, REGISTRY_PATH);
  return {
    digest: loaded.digest,
    problems: [...loaded.problems],
    contract: registry.contracts[CONTRACT_ID] ?? null,
    pair: registry.coupledPairs[PAIR_ID] ?? null,
  };
}

function runAudit() {
  return spawnSync(NODE_EXECUTABLE, [AUDIT_SCRIPT], {
    cwd: REPOSITORY_ROOT,
    encoding: UTF8_ENCODING,
  });
}

test('registry-contract-formation-release-handoff-present: the registry ' +
  'carries the seed-owned formation-release handoff contract with its six ' +
  'owners and two witnesses', () => {
  const entry = contractEntry(readRegistry());
  assert.equal(typeof entry.description, 'string');
  assert.notEqual(entry.description, EMPTY_STRING);
  assert.deepEqual(entry.owners, CONTRACT_OWNERS);
  assert.deepEqual(entry.tests, WITNESS_TESTS);
  assertPathsExist(CONTRACT_OWNERS);
});

test('registry-pair-seed-contract-joiner-consumer-present: the coupled pair ' +
  'names the seed release authority and the joiner consumer/barrier as its ' +
  'only two endpoints under the formation-release-handoff contract', () => {
  const pair = pairEntry(readRegistry());
  assert.equal(typeof pair.description, 'string');
  assert.notEqual(pair.description, EMPTY_STRING);
  assert.equal(pair.contract, CONTRACT_ID);
  assert.equal(pair.endpoints.length, ENDPOINT_COUNT);
  assert.deepEqual(endpointOwners(pair, SEED_ENDPOINT_ID), SEED_OWNERS);
  assert.deepEqual(endpointOwners(pair, JOINER_ENDPOINT_ID), JOINER_OWNERS);
  assert.deepEqual(pair.witnessTests, WITNESS_TESTS);
});

test('pair-witnesses-are-classified-contract-tests: every pair witness is an ' +
  'exact test of the contract, exists in the tree and is primary-classified',
() => {
  const registry = readRegistry();
  const contract = contractEntry(registry);
  const pair = pairEntry(registry);
  const classes = readPrimaryClasses();
  assertPathsExist(pair.witnessTests);
  for (const witness of pair.witnessTests) {
    assert.ok(
      contract.tests.includes(witness),
      `${witness} must be a test of contract ${CONTRACT_ID}`,
    );
    assert.ok(
      Object.hasOwn(classes, witness),
      `${witness} must be primary-classified`,
    );
  }
});

test('impact-contracts-audit-passes: the registry audit exits 0, prints ' +
  'PASS and reports the digest of the registry on disk', () => {
  const audit = runAudit();
  assert.equal(audit.status, EXIT_OK, audit.stderr);
  assert.equal(audit.stderr, EMPTY_STRING);
  assert.ok(
    audit.stdout.startsWith(AUDIT_PASS_PREFIX),
    `audit output must start with ${AUDIT_PASS_PREFIX}: ${audit.stdout}`,
  );
  const loaded = loadImpactContractRegistry(REPOSITORY_ROOT, REGISTRY_PATH);
  assert.equal(loaded.problems.length, NO_PROBLEMS, loaded.problems.join('; '));
  assert.ok(
    audit.stdout.includes(loaded.digest),
    'the audited digest is the digest of the registry on disk',
  );
});

test('no-owner-semantics-change: the candidate carries no formation-release ' +
  'owner delta against HEAD', () => {
  const delta = execFileSync(GIT_EXECUTABLE, GIT_OWNER_DELTA_ARGUMENTS, {
    cwd: REPOSITORY_ROOT,
    encoding: UTF8_ENCODING,
  }).trim();
  assert.equal(delta, EMPTY_STRING, `unexpected src/ delta: ${delta}`);
});

test('witness-deterministic: two independent loads project the identical ' +
  'registered interaction and registry digest', () => {
  const runs = [];
  for (let index = 0; index < DETERMINISM_RUN_COUNT; index += 1) {
    runs.push(interactionProjection());
  }
  const [first, ...rest] = runs;
  for (const other of rest) {
    assert.deepEqual(other, first,
      'the interaction projection is a pure function of the registry');
  }
  assert.equal(typeof first.digest, 'string');
});
