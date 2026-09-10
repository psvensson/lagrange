// Deterministic witnesses for the active-gate-authoritative-repair-convergence
// quest. These tests drive the REAL product owner path — the
// authoritative-discovery repair owner (src/admin/admin-service-discovery.js +
// admin-service-discovery-repair-methods.js +
// admin-service-discovery-repair-cache-methods.js) and the snapshot observation
// owner that the startup active-gate owner reads
// (src/control-plane/control-plane-snapshot-owner.js) — not a re-implementation.
// The only test doubles sit at the genuine collaborator boundaries: the CDC
// authoritative-read transport (a real repair-failure injector), the
// cache-mutation target, and the AdminControlSnapshot collaborator whose
// rebuild freshness is honestly derived from the recorded repair mutations.
//
// One combined matrix, two coupled witnesses on the SAME owner interaction:
//   * anti-storm (GREEN today, must stay green): a persistent repair failure
//     keeps the e2797b6c8 failure backoff binding; callers (including the
//     forceAuthoritativeRepair/bypassReuse:true harness escalation) cannot
//     bypass the failure deferral, and the repair attempt count stays bounded.
//   * convergence-after-evidence-advances (must stay green): after a transient
//     repair failure defers, the underlying authoritative/cache/discovery
//     evidence advances; the active-gate owner must be re-driven by that
//     evidence and converge cluster-ACTIVE WITHOUT weakening the backoff and
//     WITHOUT waiting for the deferral to time out. The fixture keeps the
//     repair owner's backoff clock fixed while advancing the distinct remote
//     serving-leader observation clock, so it exercises the real causal edge.
//
// The file uses raw node:test (not tap) so each top-level scenario remains
// independently selectable with --test-name-pattern. The paired behavioral
// witness and its proof-selection binding are kept in one deterministic file.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {AdminServiceDiscovery} from '../../src/admin/admin-service-discovery.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  ControlPlaneSnapshotOwner,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  AUTHORITATIVE_REPAIR_TRIGGER,
} from '../../src/admin/admin-authoritative-repair-policy.js';
import {selectChangedTests} from
  '../../scripts/checks/change-selection.js';
import {REASON_IMPACT_WITNESS} from
  '../../scripts/checks/change-selection-constants.js';

// ── hoisted constants ──────────────────────────────────────────────────────
const REPAIR_NODE_ID = 'active-gate-repair-owner-node';
const FAILURE_PARTITION_ID = 'services-p1';
const FAILURE_PARTICIPANT_NODE_ID = 'node-under-repair';
const FAILURE_ERROR_CODE = 'DISTRIBUTED_PARTICIPANT_FAILURE';
const FAILURE_PARTICIPANT_ERROR_CODE = 'CONTROL_PLANE_PRESSURE_DEGRADED';
const FAILURE_ERROR_MESSAGE =
  'Distributed operation failed due to participant failures';
const FAILURE_PARTICIPANT_MESSAGE = 'timeout waiting for participant';
const AUTHORITATIVE_READ_SOURCE = 'local_partition_replica';
const AUTHORITATIVE_LEADER_WITNESS_STATE = 'observed';
const OFF_PATH_SQL_ERROR = 'witness must stay on the authoritative read path';
const TRANSIENT_RETRY_HINT_MS = 250;
const CLUSTER_START_MS = 1_000_000;
const COVERAGE_GAP_TRIGGER =
  AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP;
const STALE_WATERMARK_TRIGGER =
  AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK;
const STUCK_TRIGGER_CODES = Object.freeze([
  STALE_WATERMARK_TRIGGER,
  COVERAGE_GAP_TRIGGER,
]);
const STATE_FRESH = CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH;
const CONTRACT_READY = OWNER_CONTRACT_STATE.READY;
const CONTRACT_PENDING = OWNER_CONTRACT_STATE.PENDING;
const CONTRACT_DEFERRED = OWNER_CONTRACT_STATE.DEFERRED;
const REASON_BASE = 'active-gate-witness';
const EXPECTED_FIRST_FAILURE_CLASS = 'pressure_or_timeout';
const MIN_DEFER_RETRY_AFTER_MS = 1;
const CALLER_ROUNDS = 5;
const ACTIVE_GATE_CONTRACT_ID = 'active-gate-convergence';
const ACTIVE_GATE_PAIR_ID = 'active-gate-authoritative-repair-backoff';
const ACTIVE_GATE_WITNESS_PATH =
  'test/active-gate/active-gate-authoritative-repair-convergence.test.js';
const EXPECTED_IMPACT_REASON =
  `${REASON_IMPACT_WITNESS}: ${ACTIVE_GATE_CONTRACT_ID}`;
const AUTHORITATIVE_OBSERVATION_PROVIDER_PATHS = Object.freeze([
  'src/control-plane/control-plane-authoritative-read-witness.js',
  'src/control-plane/control-plane-system-table-gateway-read-dispatch.js',
  'src/control-plane/control-plane-system-table-gateway-read-strategies.js',
]);
const INVENTORY_RELATIVE_PATH = path.join(
  '..',
  '..',
  'architecture',
  'active-definitions-inventory.md',
);
const IMPACT_CONTRACTS_RELATIVE_PATH = path.join(
  '..',
  'shards',
  'impact-contracts.json',
);
const REPOSITORY_ROOT_RELATIVE_PATH = path.join('..', '..');

// ── controllable clock (fake timers via the owner's injected nowFn) ────────
function createControllableClock(startMs) {
  let nowMs = startMs;
  return {
    nowFn() {
      return nowMs;
    },
    advance(deltaMs) {
      nowMs += deltaMs;
    },
    read() {
      return nowMs;
    },
  };
}

// ── controllable authoritative-read failure injector ───────────────────────
// This is the REAL repair-failure injection point: the gateway's CDC
// integration service. Flipping `behavior.fail` models the transient vs
// persistent authoritative-read outcome without touching product code.
function createAuthoritativeReadTransport(behavior, authorityClock) {
  const readTableNames = [];
  return {
    readTableNames,
    async executeAuthoritativeSystemTableRead(tableName) {
      readTableNames.push(tableName);
      if (behavior.fail === true && tableName === TABLES.SERVICES) {
        return {
          success: false,
          errorCode: FAILURE_ERROR_CODE,
          error: FAILURE_ERROR_MESSAGE,
          retryAfterMs: behavior.retryHintMs,
          participantFailures: [{
            partitionId: FAILURE_PARTITION_ID,
            participantNodeId: FAILURE_PARTICIPANT_NODE_ID,
            errorCode: FAILURE_PARTICIPANT_ERROR_CODE,
            error: FAILURE_PARTICIPANT_MESSAGE,
            retryAfterMs: behavior.retryHintMs,
            backpressured: true,
            failedTable: TABLES.SERVICES,
          }],
        };
      }
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      return {
        success: true,
        tableName,
        rows: [],
        count: 0,
        source: AUTHORITATIVE_READ_SOURCE,
        readAuthorityWitness: {
          state: AUTHORITATIVE_LEADER_WITNESS_STATE,
          partitionId,
          role: RAFT_ROLE.LEADER,
          servingNodeId: REPAIR_NODE_ID,
          servingReplicaId: `${partitionId}-r1`,
          observedAtMs: authorityClock.read(),
        },
      };
    },
  };
}

// ── honest AdminControlSnapshot collaborator double ────────────────────────
// The snapshot owner decides freshness by re-evaluating the REBUILT snapshot
// (control-plane-snapshot-owner.js buildAppliedControlSnapshotRepairObservation
// -> evaluateAuthoritativeControlSnapshotRepair). It never consults
// repair.applied. This double therefore derives the rebuilt snapshot's
// staleness from the recorded repair mutations: when a repair is deferred the
// cache never advances, so the rebuilt snapshot honestly stays stale and the
// evaluation returns shouldRepair:true. When the underlying evidence advances
// (a repair actually applies rows) the watermark moves and the rebuilt
// snapshot becomes fresh. This is the faithful stuck-shape reproduction.
function createControlSnapshotCollaborator(state) {
  return {
    canRunAuthoritativeControlSnapshotRepair() {
      return true;
    },
    // The rebuilt snapshot is FRESH only when the local authoritative cache
    // has genuinely advanced past the watermark the stuck observation was
    // taken at. The cache advances ONLY through an applied repair mutation,
    // so while the repair owner holds a failure deferral (no reads, no
    // mutations) the rebuilt snapshot honestly stays stale and the evaluation
    // keeps returning shouldRepair:true — this is the faithful stuck shape.
    evaluateAuthoritativeControlSnapshotRepair(snapshot) {
      return snapshot.cacheWatermarkMs > state.stuckWatermarkMs ?
        {shouldRepair: false, triggerCodes: []} :
        {shouldRepair: true, triggerCodes: [...STUCK_TRIGGER_CODES]};
    },
    async buildLocalControlSnapshot() {
      return {
        nodeId: REPAIR_NODE_ID,
        capturedAt: state.clock.read(),
        cacheWatermarkMs: state.cacheMutationCount,
      };
    },
    attachAuthoritativeRepairDiagnostics(snapshot, options = {}) {
      snapshot.authoritativeRepair = {
        applied: options.repair?.applied === true,
        deferred: options.repair?.deferred === true,
        forced: options.forceAuthoritativeRepair === true,
      };
      return snapshot;
    },
  };
}

// ── real-path harness ──────────────────────────────────────────────────────
function createActiveGateRepairHarness(options = {}) {
  const clock = createControllableClock(CLUSTER_START_MS);
  const authorityClock = createControllableClock(CLUSTER_START_MS);
  const behavior = {
    fail: options.startFailing === true,
    retryHintMs: TRANSIENT_RETRY_HINT_MS,
  };
  const state = {
    clock,
    cacheMutationCount: 0,
    stuckWatermarkMs: 0,
  };
  const transport = createAuthoritativeReadTransport(
    behavior,
    authorityClock,
  );
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: REPAIR_NODE_ID,
    now: clock.nowFn,
    cdcIntegrationService: transport,
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error(OFF_PATH_SQL_ERROR);
      },
    },
  });
  const discovery = new AdminServiceDiscovery({
    nodeId: REPAIR_NODE_ID,
    nowFn: clock.nowFn,
    systemTableCache: {
      getAll() {
        return [];
      },
    },
    cacheMutationTarget: {
      applySystemTableChange() {
        state.cacheMutationCount += 1;
      },
    },
    controlPlaneSystemTableGateway: gateway,
  });
  const controlSnapshot = createControlSnapshotCollaborator(state);
  const snapshotOwner = new ControlPlaneSnapshotOwner({
    controlSnapshot,
    serviceDiscovery: discovery,
  });
  return {
    clock,
    authorityClock,
    behavior,
    state,
    transport,
    discovery,
    snapshotOwner,
  };
}

async function forceActiveGateSnapshot(snapshotOwner, clock) {
  return snapshotOwner.resolveControlSnapshot(
    {nodeId: REPAIR_NODE_ID, capturedAt: clock.read()},
    {forceAuthoritativeRepair: true},
  );
}

// ── Deliverable 3: anti-ping-pong witness (GREEN today, must stay green) ──
test('anti-storm: persistent repair failure keeps the e2797b6c8 failure backoff binding and bounded',
  async () => {
    const harness = createActiveGateRepairHarness({startFailing: true});

    // First authoritative repair attempt persistently fails -> the repair
    // owner enters DEFER_REPAIR with a real retryAfterMs.
    const firstRepair = await harness.discovery
      .ensureAuthoritativeDiscoveryCacheRepair({reason: `${REASON_BASE}-first`});
    assert.equal(firstRepair.applied, false,
      'persistent failure must not apply the repair');
    assert.equal(firstRepair.failureClass, EXPECTED_FIRST_FAILURE_CLASS,
      'the timeout/backpressure shape classifies as pressure_or_timeout');
    assert.ok(
      Number.isFinite(firstRepair.retryAfterMs) &&
        firstRepair.retryAfterMs >= MIN_DEFER_RETRY_AFTER_MS,
      'the repair owner returns a real bounded retryAfterMs',
    );
    const readsAfterFirstAttempt = harness.transport.readTableNames.length;
    assert.ok(readsAfterFirstAttempt > 0,
      'the admitted attempt did read through the authoritative path');

    // Many harness/admin reads occur during the backoff, including the
    // forceAuthoritativeRepair -> bypassReuse:true escalation. Only the repair
    // owner admits repair work; the attempt count must stay bounded and the
    // failure deferral must NOT be bypassable.
    for (let round = 0; round < CALLER_ROUNDS; round += 1) {
      const deferred = await harness.discovery
        .ensureAuthoritativeDiscoveryCacheRepair({
          reason: `${REASON_BASE}-force-${round}`,
          bypassReuse: true,
        });
      assert.equal(deferred.deferred, true,
        `caller round ${round}: bypassReuse:true must NOT bypass the ` +
        'failure-deferral branch (resolveRecentAuthoritativeDiscoveryRepairFailure)');
      assert.equal(deferred.applied, false,
        `caller round ${round}: a deferred repair never applies`);
      assert.equal(deferred.reused, true,
        `caller round ${round}: the deferral is the reused owner decision`);
    }
    assert.equal(
      harness.transport.readTableNames.length,
      readsAfterFirstAttempt,
      'no caller (even forceAuthoritativeRepair/bypassReuse:true) may admit ' +
      'new repair work during the failure backoff — bounded attempt count, ' +
      'no recursive/parallel repair amplification',
    );

    // The forced snapshot-owner escalation still cannot break the deferral:
    // the gate observation stays non-converged, proving the harness FORCE is
    // not binding against the product backoff.
    const forcedSnapshot = await forceActiveGateSnapshot(
      harness.snapshotOwner,
      harness.clock,
    );
    assert.equal(forcedSnapshot.authoritativeRepair.deferred, true,
      'the forced control-snapshot repair still observes the owner deferral');
    assert.notEqual(forcedSnapshot.snapshotObservation.contractState,
      CONTRACT_READY,
      'the active-gate observation must NOT be forced to ready during backoff');
  });

// ── Deliverable 2: deterministic RED witness (the stuck shape) ────────────
test('convergence-after-evidence-advances: the active-gate owner is re-driven and converges after evidence advances, without weakening the backoff',
  async () => {
    const harness = createActiveGateRepairHarness({startFailing: true});

    // (1) An authoritative repair attempt transiently fails -> DEFER_REPAIR.
    const firstRepair = await harness.discovery
      .ensureAuthoritativeDiscoveryCacheRepair({reason: `${REASON_BASE}-stuck`});
    assert.equal(firstRepair.applied, false,
      'the transient repair failure does not apply');
    const stuckRetryAfterMs = firstRepair.retryAfterMs;
    assert.ok(stuckRetryAfterMs >= MIN_DEFER_RETRY_AFTER_MS,
      'the repair owner holds a real backoff');

    // (2) The active-gate owner's last snapshot observation is the older
    // stuck shape: repair_deferred / stale_usable / pending. We do NOT advance
    // the clock, so the deferral is still binding.
    const stuckSnapshot = await forceActiveGateSnapshot(
      harness.snapshotOwner,
      harness.clock,
    );
    assert.equal(stuckSnapshot.authoritativeRepair.deferred, true,
      'the stuck observation reflects the deferred repair');
    assert.ok(
      stuckSnapshot.snapshotObservation.contractState === CONTRACT_PENDING ||
        stuckSnapshot.snapshotObservation.contractState === CONTRACT_DEFERRED,
      'the stuck observation is pending/deferred, not ready',
    );
    assert.notEqual(stuckSnapshot.snapshotObservation.state, STATE_FRESH,
      'the stuck observation is not fresh');
    // Pin the stuck watermark to the cache state the stuck observation was
    // built from: the cache has not advanced (no applied repair), so any
    // honest rebuild from the still-deferred cache stays at or below it.
    harness.state.stuckWatermarkMs = harness.state.cacheMutationCount;

    // (3) The underlying authoritative/cache/discovery evidence SUBSEQUENTLY
    // advances: the authoritative source now has the rows (nodes ready,
    // coverage gap closed), modeled by the authoritative read now succeeding
    // with a serving-leader observation newer than the failed repair. The
    // repair backoff itself has NOT expired: its separate owner-local clock
    // remains fixed. The local cache is still stale until repair applies rows.
    harness.behavior.fail = false;
    harness.authorityClock.advance(1);

    // (4) WITHOUT weakening the backoff, the active-gate
    // owner is re-driven by the advanced evidence and cluster-ACTIVE converges
    // (a fresh/READY observation). The gateway, not this fixture, derives the
    // complete-table observation from the canonical serving-leader witness;
    // the repair owner then exposes that advanced revision to the sole ACTIVE
    // owner without re-admitting repair.
    const convergedSnapshot = await forceActiveGateSnapshot(
      harness.snapshotOwner,
      harness.clock,
    );
    assert.equal(
      convergedSnapshot.snapshotObservation.state,
      STATE_FRESH,
      'after the evidence advances, the active-gate owner must converge to a ' +
      'fresh observation WITHOUT waiting for the repair backoff to expire',
    );
    assert.equal(
      convergedSnapshot.snapshotObservation.contractState,
      CONTRACT_READY,
      'the converged observation carries the READY contract state',
    );
  });

test('proof-selection: authoritative-observation gateway changes select the ' +
  'combined active-gate witness and the protected pair registers it', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(here, REPOSITORY_ROOT_RELATIVE_PATH);
  const registry = JSON.parse(readFileSync(
    path.join(here, IMPACT_CONTRACTS_RELATIVE_PATH),
    'utf8',
  ));
  const contract = registry.contracts[ACTIVE_GATE_CONTRACT_ID];
  const pair = registry.coupledPairs[ACTIVE_GATE_PAIR_ID];

  assert.ok(contract, `registry carries ${ACTIVE_GATE_CONTRACT_ID}`);
  assert.ok(pair, `registry carries ${ACTIVE_GATE_PAIR_ID}`);
  assert.ok(contract.tests.includes(ACTIVE_GATE_WITNESS_PATH),
    'the combined witness is an exact test of the impact contract');
  assert.ok(pair.witnessTests.includes(ACTIVE_GATE_WITNESS_PATH),
    'the protected pair requires the combined anti-storm/liveness witness');

  for (const providerPath of AUTHORITATIVE_OBSERVATION_PROVIDER_PATHS) {
    assert.ok(contract.owners.includes(providerPath),
      `${providerPath} owns the authoritative-observation contract edge`);
    const selection = selectChangedTests({
      root: repositoryRoot,
      changedPaths: [providerPath],
    });
    const witness = selection.tests.find(
      (candidate) => candidate.path === ACTIVE_GATE_WITNESS_PATH,
    );
    assert.ok(witness,
      `${providerPath} must select the combined active-gate witness`);
    assert.ok(witness.reasons.includes(EXPECTED_IMPACT_REASON),
      `${providerPath} selects it through ${EXPECTED_IMPACT_REASON}`);
  }
});

// ── Deliverable 1 (receipt target): the inventory doc exists & classifies ──
test('active-definitions-inventory: the inventory doc exists and classifies the four ACTIVE definitions',
  () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const inventoryPath = path.join(here, INVENTORY_RELATIVE_PATH);
    const inventory = readFileSync(inventoryPath, 'utf8');

    assert.ok(inventory.includes('nodes.status'),
      'classifies nodes.status=active');
    assert.ok(inventory.includes('publishedActive'),
      'classifies publishedActive membership');
    assert.ok(inventory.includes('snapshot active'),
      'classifies the snapshot active=N/M projection');
    assert.ok(inventory.includes('cluster-ACTIVE'),
      'classifies the cluster-ACTIVE gate as the sole authority');
    assert.ok(inventory.includes('startup_active_gate_owner'),
      'names the startup active-gate owner');
    assert.ok(inventory.includes('no-ambiguous-active-owner'),
      'references the no-ambiguous-active-owner invariant');
  });
