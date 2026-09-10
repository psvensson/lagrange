import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {TABLES} from '../../src/constants/index.js';
import {MembershipPublicationCoordinatorReconcile} from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {selectChangedTests} from '../../scripts/checks/change-selection.js';
import {REASON_IMPACT_WITNESS} from
  '../../scripts/checks/change-selection-constants.js';
import {
  assertMembershipPublicationOwnerDriverHostsHealthy,
  createMembershipPublicationOwnerDriverHost,
} from './membership-publication-owner-driver-host.js';

const CONTRACT_ID = 'active-gate-convergence';
const EXPECTED_REASON = `${REASON_IMPACT_WITNESS}: ${CONTRACT_ID}`;
const PROVIDER_PATHS = Object.freeze([
  'src/control-plane/control-plane-publications-leadership.js',
  'src/control-plane/membership-publication-coordinator-reconcile.js',
]);
const HANDOFF_BEHAVIORAL_WITNESSES = Object.freeze([
  'test/convergence/dt4-full-chain-scenario.test.js',
  'test/convergence/dt6-control-plane-migration-network.test.js',
  'test/convergence/dt6-publication-failback-network.test.js',
  'test/convergence/dt6-publication-ack-recovery-gate-network.test.js',
  'test/convergence/dt6-publication-quorum-failback-network.test.js',
  'test/convergence/dt6-publication-failback-pct-search.test.js',
]);
const REGISTERED_WITNESSES = Object.freeze([
  ...HANDOFF_BEHAVIORAL_WITNESSES,
  'test/convergence/membership-publication-owner-driver-host.test.js',
]);

function createNullSnapshotHost(overrides = {}) {
  let snapshotReads = 0;
  const coordinator = createMembershipPublicationOwnerDriverHost({
    nodeId: 'owner-node',
    systemTableCache: {get: () => null, find: () => null},
    cdcIntegrationService: {
      canWriteSystemTableLocally: (tableName) =>
        tableName === TABLES.CONTROL_PLANE_PUBLICATIONS,
    },
    assertSingleMembershipPartition() {},
    async readPublicationPlanningSnapshot() {
      snapshotReads += 1;
      return null;
    },
    async reconcileActiveGateMembershipPublication() {},
    _emitConvergenceDecisionTrace() {},
    _buildPublicationReadinessTraceFields() {
      return {};
    },
    logger: {warn() {}, info() {}, debug() {}, error() {}},
    ...overrides,
  });
  return {coordinator, snapshotReads: () => snapshotReads};
}

test('host inherits the complete production owner driver and remains re-entrant',
  async () => {
    const {coordinator, snapshotReads} = createNullSnapshotHost();

    assert.equal(
      Object.getPrototypeOf(coordinator),
      MembershipPublicationCoordinatorReconcile.prototype,
    );
    await coordinator.driveOwnerMembershipReconcile();
    await coordinator.driveOwnerMembershipReconcile();

    assert.equal(snapshotReads(), 2,
      'two owner ticks must reach the real planning boundary');
    assertMembershipPublicationOwnerDriverHostsHealthy([coordinator]);
  });

test('host exposes a rejected tick even when the interval owner swallows it',
  async () => {
    const expected = new Error('synthetic finalizer rejection');
    const {coordinator} = createNullSnapshotHost({
      async refreshDeferredPropagatedCachesFromAuthority() {
        throw expected;
      },
    });

    await coordinator.driveOwnerMembershipReconcile().catch(() => {});

    assert.deepEqual(coordinator.ownerDriverRejectedTicks, [expected]);
    assert.throws(
      () => assertMembershipPublicationOwnerDriverHostsHealthy([coordinator]),
      AggregateError,
    );
  });

test('publication leadership and reconcile changes select the full handoff family',
  () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repositoryRoot = path.resolve(here, '..', '..');
    const registry = JSON.parse(readFileSync(
      path.join(here, '..', 'shards', 'impact-contracts.json'),
      'utf8',
    ));
    const contract = registry.contracts[CONTRACT_ID];

    assert.ok(contract, `registry carries ${CONTRACT_ID}`);
    for (const witnessPath of REGISTERED_WITNESSES) {
      assert.ok(contract.tests.includes(witnessPath),
        `${witnessPath} is registered as an active-gate witness`);
    }
    for (const providerPath of PROVIDER_PATHS) {
      assert.ok(contract.owners.includes(providerPath),
        `${providerPath} owns the publication handoff edge`);
      const selection = selectChangedTests({
        root: repositoryRoot,
        changedPaths: [providerPath],
      });
      for (const witnessPath of REGISTERED_WITNESSES) {
        const witness = selection.tests.find(
          (candidate) => candidate.path === witnessPath,
        );
        assert.ok(witness, `${providerPath} selects ${witnessPath}`);
        assert.ok(witness.reasons.includes(EXPECTED_REASON),
          `${witnessPath} is selected through ${EXPECTED_REASON}`);
      }
    }
  });
