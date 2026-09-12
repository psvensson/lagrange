// Contract for the seven-node cold-formation harness model.
//
// The probe runs real owners, so the model of WHICH owner interactions it
// exercises is the thing that can go stale, and it went stale for a day
// (35 attempts, 2026-09-09) because it was hand-maintained: a stand-in wired
// by hand for a CDC hop kept modelling an interaction the production owners
// had changed. This test makes the registered contracts the oracle. The
// checklist is derived from the registry - every coupled pair, every contract
// with an owner under src/, every invariant's owner - and the harness model
// must account for each with a driver-host that hosts the REAL owner, in the
// shape of test/convergence/membership-publication-owner-driver-host.js:
// production prototype inherited, drive methods sealed against override.
//
// Red at seal: the model module does not exist, and the stand-in family in
// test/integration/membership-consistency-integration-test-helpers.js still
// replaces registered owners with hand-wired objects.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  loadImpactContractRegistry,
} from '../../../../scripts/checks/impact-contract-registry.js';
import * as model from '../owner-interaction-model.js';

// Captured at module load: the harness directory is governed by the
// ambient-intrinsics guideline (a replaced prototype method must not be able
// to invert a checklist).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const ROOT = process.cwd();
const UTF8 = 'utf8';
const SOURCE_PREFIX = 'src/';
const MODEL_PATH = 'test/distributed/harness/owner-interaction-model.js';
const STAND_IN_HELPERS =
  'test/integration/membership-consistency-integration-test-helpers.js';
// Constructors that hand a registered owner's role to an object built by
// hand. Each one is a place the model can drift from production unnoticed.
const STAND_IN_CONSTRUCTORS = Object.freeze([
  'createRealisticCDCService',
  'createMockMessageRouter',
  'createMockRebalanceCoordinator',
  'createMockTablePolicyService',
  'createCacheControlPlaneGateway',
  'createCacheBackedReadinessService',
]);
const INVARIANTS_PATH = 'architecture/contracts/invariants.json';

function registry() {
  const loaded = loadImpactContractRegistry(ROOT);
  assert.deepEqual(loaded.problems, [], 'the registry must load clean');
  return loaded.registry;
}

// The checklist: one entry per registered interaction, derived, never typed.
function registeredInteractions() {
  const reg = registry();
  const entries = [];
  for (const pair of reg.coupledPairs) {
    entries.push({kind: 'pair', id: pair.id,
      owners: arrayFlatMap(pair.endpoints, (endpoint) => endpoint.owners)});
  }
  for (const [id, contract] of Object.entries(reg.manifest.contracts)) {
    const owners = arrayFilter(contract.owners,
      (owner) => stringStartsWith(owner, SOURCE_PREFIX));
    if (owners.length > 0) entries.push({kind: 'contract', id, owners});
  }
  const invariants = JSON.parse(fs.readFileSync(path.join(ROOT, INVARIANTS_PATH), UTF8));
  for (const invariant of invariants.invariants) {
    entries.push({kind: 'invariant', id: invariant.id, owner: invariant.owner});
  }
  return entries;
}

async function loadModel() {
  assert.ok(fs.existsSync(path.join(ROOT, MODEL_PATH)),
    `${MODEL_PATH} must exist: the harness model is derived from the registry, not typed`);
  return model;
}

test('every registered owner interaction is hosted by the harness model', async () => {
  const model = await loadModel();
  const hosted = await model.hostedInteractions(ROOT);
  const missing = arrayFilter(registeredInteractions(),
    (entry) => entry.kind !== 'invariant' && !hosted.has(entry.id));
  assert.deepEqual(arrayMap(missing, (entry) => `${entry.kind}:${entry.id}`), [],
    'a registered interaction absent from the model is exactly the stale ' +
    'model this test exists to catch');
});

test('every hosted interaction hosts the real owner with sealed drive methods', async () => {
  const model = await loadModel();
  for (const [id, host] of await model.hostedInteractions(ROOT)) {
    assert.ok(host.owners.length + host.scopes.length > 0,
      `${id} must name the production owners or scopes it hosts`);
    for (const owner of [...host.owners, ...host.scopes]) {
      assert.ok(fs.existsSync(path.join(ROOT, owner)),
        `${id} hosts ${owner}, which must exist in production`);
    }
    // A module owner has an overridable surface, so it must be sealed; a
    // directory scope has none and is witnessed by the contract's own tests.
    if (host.owners.length > 0) {
      assert.ok(host.sealedMethods.length > 0,
        `${id} must seal the drive methods a stand-in would otherwise override`);
    }
    assert.equal(typeof host.create, 'function',
      `${id} must construct its host from the production prototype`);
    if (host.sealedMethods.length > 0) {
      assert.throws(() => host.create({[host.sealedMethods[0]]: () => null}),
        /must inherit .* from production/u,
        `${id} must refuse a stand-in for ${host.sealedMethods[0]}`);
    }
  }
});

test('every registry-bound invariant is hosted and every unbound citation is named', async () => {
  // Superseded 2026-09-12 from "every invariant owner is hosted": widening
  // the registry by 26 owner-boundary claims to turn a receipt green is the
  // accretion this epic removes elsewhere. The contract now: an invariant
  // whose contract the registry knows binds to that contract's host, and one
  // it does not know appears in the derived model as unbound with its id -
  // a number the harness reports, retired or registered one at a time by
  // formation-contracts-registration, never a silent footnote.
  const model = await loadModel();
  const {bound, unbound, hostedOwners} = await model.invariantBindings(ROOT);
  const invariants = arrayFilter(registeredInteractions(),
    (entry) => entry.kind === 'invariant');
  assert.equal(bound.length + unbound.length, invariants.length,
    'every registered invariant is accounted for as bound or unbound');
  for (const entry of bound) {
    assert.ok(hostedOwners.has(entry.owner),
      `${entry.id} binds to ${entry.contract}, so its owner is hosted`);
  }
  for (const entry of unbound) {
    assert.ok(entry.id && entry.owner && entry.contractRef,
      'an unbound citation names its invariant, owner and the contract it cites');
  }
  assert.ok(bound.length > 0,
    'at least one registered contract binds, or the derivation is broken');
});

test('every seam in the model is contract-bound and points at where the owner is real', async () => {
  // Shape B with a contract attached (decision 2026-09-12): a stand-in is a
  // seam only when the registry pair names its module, the contract cases
  // both legs run, the seam's conformance run and the test where the owner
  // is real; and those must be witnesses of the pair. Anything less is the
  // stale mock with a new name.
  const model = await loadModel();
  const seams = arrayFilter([...await model.hostedInteractions(ROOT)],
    ([, host]) => host.seam);
  assert.ok(seams.length > 0, 'the SQL-engine seam of the membership harness is declared');
  for (const [id, host] of seams) {
    assert.deepEqual(host.seam.problems, [],
      `${id}: a seam pointer dangles or is not a witness of the pair`);
    assert.notEqual(host.seam.realIn, host.seam.conformanceTest,
      `${id}: the real run and the seam run are two different tests`);
  }
});

test('no registered owner is replaced by a hand-wired stand-in', () => {
  const helpers = fs.readFileSync(path.join(ROOT, STAND_IN_HELPERS), UTF8);
  const present = arrayFilter(STAND_IN_CONSTRUCTORS, (name) =>
    stringIncludes(helpers, `function ${name}(`));
  assert.deepEqual(present, [],
    'a stand-in wired by hand is the mechanism by which the model went stale; ' +
    'host the real owner through a driver-host instead');
});
