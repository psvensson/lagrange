import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {defineService} from '../../src/authoring/define-service.js';
import {distributed} from '../../src/authoring/distributed-operation.js';
import {http} from '../../src/authoring/request-handler.js';
import {sql} from '../../src/authoring/sql-template.js';
import {
  DEPLOYMENT_BINDING_ERROR_CODE,
  bindDeploymentArtifact,
  canonicalJson,
  normalizeDeploymentBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  normalizePolicyInput,
} from '../../src/control-plane/owners/runtime-access-policy-owner.js';
// Imported through the package index on purpose: these are the
// generator's public re-exported names, and this import keeps that
// surface exercised.
import {
  DEPLOYMENT_RECORD_ERROR_CODE,
  DEPLOYMENT_RECORD_STATUS,
  buildDeploymentRecords,
  normalizeExternalServiceManifest,
  normalizeServiceDefinition,
  restampDeploymentBindings,
  writeDeploymentTree,
} from '../../src/service/index.js';

const ARTIFACT = Object.freeze({
  digest: `sha256:${'a'.repeat(64)}`,
  ref: 'registry.example.test/ride-stats:1.0.0',
  sizeBytes: 4096,
});

const EXPECTED_NAME = Object.freeze({
  CALL: 'ride-stats--call--count-rides',
  HEALTH_REQUEST: 'ride-stats--request--health-check',
  STATS_REQUEST: 'ride-stats--request--ride-stats',
});
const GENERATED_NAME_INFIXES = Object.freeze(['--request--', '--call--']);
const DEPLOYMENT_FILES = Object.freeze([
  'access-policy.json',
  'bindings.json',
  'deployment-plan.json',
  'manifest.json',
]);

// A real authored definition normalized through the rung-2 contract:
// two handlers (one with calls, one health route without) and one
// distributed operation.
function makeIr({healthPath = '/health'} = {}) {
  const countRides = distributed({
    statement: sql`SELECT id, account_id FROM rides`,
    run: (rows) => rows.length,
    reduce: (counts) => counts.reduce((sum, count) => sum + count, 0),
  });
  const definition = defineService({
    name: 'ride-stats',
    version: '1.0.0',
    operations: {countRides},
    handlers: {
      healthCheck: http.get(healthPath, {
        handle: () => ({ok: true}),
      }),
      rideStats: http.post('/stats', {
        calls: [countRides],
        handle: async (request, context) => context,
      }),
    },
  });
  const normalized = normalizeServiceDefinition(definition);
  assert.equal(normalized.status, 'accepted');
  return normalized.ir;
}

function buildAccepted() {
  const result = buildDeploymentRecords({artifact: ARTIFACT, ir: makeIr()});
  assert.equal(result.status, DEPLOYMENT_RECORD_STATUS.ACCEPTED);
  return result;
}

function deploymentDirectory(outputRoot) {
  return path.join(outputRoot, '.lagrange', 'deployment');
}

function collectUnfrozen(value, pointer, unfrozen, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (!Object.isFrozen(value)) unfrozen.push(pointer);
  for (const [key, child] of Object.entries(value)) {
    collectUnfrozen(child, `${pointer}/${key}`, unfrozen, seen);
  }
}

describe('service deployment record generator', () => {
  it('reproduces a byte-identical .lagrange tree from the same fixed IR',
    async () => {
      const firstRoot = await mkdtemp(path.join(tmpdir(), 'lagrange-tree-'));
      const secondRoot = await mkdtemp(path.join(tmpdir(), 'lagrange-tree-'));
      const firstResult = buildAccepted();
      const secondResult = buildAccepted();
      const firstWritten =
        await writeDeploymentTree(firstResult.records, firstRoot);
      const secondWritten =
        await writeDeploymentTree(secondResult.records, secondRoot);
      assert.deepEqual(
        firstWritten.map((file) => path.relative(firstRoot, file)),
        DEPLOYMENT_FILES.map((file) =>
          path.relative(firstRoot, path.join(deploymentDirectory(firstRoot),
            file))),
      );
      assert.equal(firstWritten.length, DEPLOYMENT_FILES.length);
      for (const [index, firstFile] of firstWritten.entries()) {
        const firstBytes = await readFile(firstFile);
        const secondBytes = await readFile(secondWritten[index]);
        assert.equal(firstBytes.equals(secondBytes), true,
          `bytes differ for ${path.basename(firstFile)}`);
        const text = firstBytes.toString('utf8');
        assert.equal(text.endsWith('\n'), true);
        assert.equal(text.endsWith('\n\n'), false);
      }
    });

  it('writes each record as canonical key-sorted JSON', async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'lagrange-tree-'));
    const {records} = buildAccepted();
    await writeDeploymentTree(records, outputRoot);
    const contentByFile = {
      'access-policy.json': records.accessPolicies,
      'bindings.json': records.bindings,
      'deployment-plan.json': records.deploymentPlan,
      'manifest.json': records.manifest,
    };
    for (const [fileName, record] of Object.entries(contentByFile)) {
      const text = await readFile(
        path.join(deploymentDirectory(outputRoot), fileName), 'utf8');
      assert.equal(text, `${canonicalJson(record)}\n`);
    }
  });

  it('restamps every binding target digest to the stamped manifest and ' +
    'rewrites the bindings file canonically', async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'lagrange-tree-'));
    const {records} = buildAccepted();
    await writeDeploymentTree(records, outputRoot);
    const generateDigest = records.bindings[0].target.manifest_digest;
    // The build stage finalizes the artifact descriptor; the bindings
    // pin the manifest digest, so the tree's bindings file must follow.
    const stamped = {
      ...records.manifest,
      artifact: {
        ...records.manifest.artifact,
        digest: `sha256:${'b'.repeat(64)}`,
        size_bytes: 553,
      },
    };
    const normalized = normalizeExternalServiceManifest(stamped);
    assert.equal(normalized.status, 'accepted');
    const restamped =
      await restampDeploymentBindings(outputRoot, normalized.manifest);
    const stampedDigest = `sha256:${createHash('sha256')
      .update(canonicalJson(normalized.manifest))
      .digest('hex')}`;
    assert.notEqual(stampedDigest, generateDigest);
    assert.equal(restamped.length, records.bindings.length);
    for (const binding of restamped) {
      assert.equal(binding.target.manifest_digest, stampedDigest);
    }
    // Only the pinned digest changes; every other binding byte is kept.
    assert.deepEqual(
      restamped.map((binding) => ({
        ...binding,
        target: {...binding.target, manifest_digest: generateDigest},
      })),
      records.bindings.map((binding) => ({
        ...binding,
        target: {...binding.target},
      })),
    );
    const text = await readFile(
      path.join(deploymentDirectory(outputRoot), 'bindings.json'), 'utf8');
    assert.equal(text, `${canonicalJson(restamped)}\n`);
  });

  it('emits only records the owning contracts accept, unchanged', () => {
    const {records} = buildAccepted();
    const manifestResult = normalizeExternalServiceManifest(records.manifest);
    assert.equal(manifestResult.status, 'accepted');
    assert.deepEqual(manifestResult.manifest, records.manifest);
    const expectedDigest = `sha256:${createHash('sha256')
      .update(canonicalJson(records.manifest))
      .digest('hex')}`;
    assert.equal(records.bindings.length, 3);
    for (const binding of records.bindings) {
      assert.deepEqual(normalizeDeploymentBinding(binding), binding);
      assert.equal(binding.target.manifest_digest, expectedDigest);
      assert.equal(binding.target.package_id,
        records.deploymentPlan.package_id_placeholder);
      const bound = bindDeploymentArtifact(binding, {
        manifest: records.manifest,
        manifestDigest: binding.target.manifest_digest,
        packageId: binding.target.package_id,
      });
      assert.equal(bound.name, binding.name);
    }
    for (const policy of records.accessPolicies) {
      const normalized = normalizePolicyInput(policy);
      assert.equal(normalized.bindingName, policy.binding_name);
    }
  });

  it('maps each handler calls entry to exactly one policy binding and ' +
    'each logical id to exactly one plan entry', () => {
    const {records} = buildAccepted();
    assert.equal(records.accessPolicies.length, 1);
    const [policy] = records.accessPolicies;
    assert.equal(policy.binding_name, EXPECTED_NAME.STATS_REQUEST);
    assert.deepEqual(policy.calls, [{binding: EXPECTED_NAME.CALL}]);
    assert.deepEqual(policy.tables, []);
    assert.deepEqual(records.deploymentPlan.handlers, {
      healthCheck: {binding: EXPECTED_NAME.HEALTH_REQUEST},
      rideStats: {binding: EXPECTED_NAME.STATS_REQUEST},
    });
    assert.deepEqual(records.deploymentPlan.operations, {
      countRides: {binding: EXPECTED_NAME.CALL},
    });
    // Every plan entry resolves to exactly one emitted binding.
    const bindingNames = records.bindings.map((binding) => binding.name);
    assert.deepEqual([...bindingNames].sort(), [
      EXPECTED_NAME.CALL,
      EXPECTED_NAME.HEALTH_REQUEST,
      EXPECTED_NAME.STATS_REQUEST,
    ]);
    const planNames = [
      ...Object.values(records.deploymentPlan.handlers),
      ...Object.values(records.deploymentPlan.operations),
    ].map((entry) => entry.binding);
    for (const name of planNames) {
      assert.equal(
        bindingNames.filter((bindingName) => bindingName === name).length, 1);
    }
    // The health handler declared no calls, so it gets NO policy record.
    assert.equal(records.accessPolicies.some(
      (entry) => entry.binding_name === EXPECTED_NAME.HEALTH_REQUEST), false);
  });

  it('propagates the binding contract rejection instead of pre-checking',
    () => {
      // The source contract accepts any '/'-prefixed path; the binding
      // grammar refuses the uppercase segment. The generator must surface
      // the binding contract's own typed error, proving there is no
      // duplicated pre-check in front of the owner.
      const ir = makeIr({healthPath: '/Health'});
      const result = buildDeploymentRecords({artifact: ARTIFACT, ir});
      assert.equal(result.status, DEPLOYMENT_RECORD_STATUS.REJECTED);
      assert.equal(result.records, undefined);
      assert.equal(result.errors.length, 1);
      const [error] = result.errors;
      assert.equal(error.code, DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD);
      assert.equal(error.path, '/source');
      assert.equal(typeof error.message, 'string');
    });

  it('keeps generated names out of every developer-facing surface', () => {
    const ir = makeIr();
    const result = buildDeploymentRecords({artifact: ARTIFACT, ir});
    const generatedNames = result.records.bindings.map(
      (binding) => binding.name);
    assert.equal(generatedNames.length, 3);
    // The IR (the developer-facing input) contains no generated name and
    // no generated-name infix; the names exist only in the records.
    const irJson = JSON.stringify(ir);
    for (const name of generatedNames) {
      assert.equal(irJson.includes(name), false);
    }
    for (const infix of GENERATED_NAME_INFIXES) {
      assert.equal(irJson.includes(infix), false);
    }
    const recordsJson = canonicalJson(result.records);
    for (const name of generatedNames) {
      assert.equal(recordsJson.includes(name), true);
    }
  });

  it('returns a deeply frozen result', () => {
    const result = buildAccepted();
    const unfrozen = [];
    collectUnfrozen(result, '', unfrozen);
    assert.deepEqual(unfrozen, []);
    const rejected =
      buildDeploymentRecords({artifact: ARTIFACT, ir: makeIr({
        healthPath: '/Health'})});
    const unfrozenRejected = [];
    collectUnfrozen(rejected, '', unfrozenRejected);
    assert.deepEqual(unfrozenRejected, []);
  });

  it('refuses to write a tree without the full records object', async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'lagrange-tree-'));
    const rejected = buildDeploymentRecords({artifact: ARTIFACT, ir: makeIr({
      healthPath: '/Health'})});
    await assert.rejects(
      () => writeDeploymentTree(rejected.records, outputRoot),
      TypeError,
    );
  });

  it('rejects logical ids that kebab-collide onto one generated name', () => {
    // rideAB and rideAb are distinct handler keys the source contract
    // accepts, but both kebab-fold to ride-ab; emitting two bindings under
    // one generated name would be an un-installable, non-injective tree.
    const definition = defineService({
      name: 'ride-stats',
      version: '1.0.0',
      operations: {},
      handlers: {
        rideAB: http.get('/a', {handle: () => ({ok: true})}),
        rideAb: http.get('/b', {handle: () => ({ok: true})}),
      },
    });
    const normalized = normalizeServiceDefinition(definition);
    assert.equal(normalized.status, 'accepted');
    const result =
      buildDeploymentRecords({artifact: ARTIFACT, ir: normalized.ir});
    assert.equal(result.status, DEPLOYMENT_RECORD_STATUS.REJECTED);
    const codes = result.errors.map((error) => error.code);
    assert.deepEqual(
      codes, [DEPLOYMENT_RECORD_ERROR_CODE.GENERATED_NAME_COLLISION]);
    assert.equal(
      result.errors[0].path, '/bindings/ride-stats--request--ride-ab');
  });
});
