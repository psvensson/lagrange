/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE} from
  '../../../../src/admin/admin-constants.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../../../src/control-plane/control-plane-snapshot-owner.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../../src/control-plane/owner-contract-outcome.js';
import {SERVICE_STATUS} from '../../../../src/constants/index.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE = 5;
const SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS = 5000;
const SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS = 1777976837236;
const SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS = 1777976838250;
const SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH = 2;
const SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH = 3;
const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
const SNAPSHOT_REPLAY_TEST_EMPTY_LOG = '';
const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE =
  'discovery_node_coverage_gap';
const SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS = 250;
const SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING = 'pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE = false;
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK =
  'durable_readback_pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED = true;
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS = 1000;
const SNAPSHOT_REPLAY_TEST_AUTHORITY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps admin-ready authority over ' +
  'stronger publication when 102455Z coverage ties';
const SNAPSHOT_REPLAY_TEST_DEFERRED_AUTHORITY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage exposes deferred owner observation ' +
  'for admin-ready stale 102455Z witness';
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage replays pending handoff reconcile ' +
  'after selected timeout reduction';
const SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects published active membership ' +
  'into startup snapshot coverage under publication lag';
const SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION =
  'same-coverage active-gate selection should keep the admin-ready authority ' +
  'witness';
const SNAPSHOT_REPLAY_TEST_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  BASELINE: '11601fe0-72d6-5853-8590-ec2881853e72',
  ADMIN_READY_STALE: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  STRONG_EXTRA: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  STALE_EXTRA: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
const SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR =
  'Control snapshot reachability probe timed out for ' +
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
const SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_PROJECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
/**
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * *For any* cluster configuration with `docker.hosts` of length H and
 * `nodesPerHost` limit P, no single Docker host SHALL have more than P
 * containers, and the total container count SHALL equal the requested
 * cluster size (up to H * P).
 *
 * **Validates: Requirements 2.3**
 */
test(SNAPSHOT_REPLAY_TEST_AUTHORITY_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  const createNode = (
    nodeId,
    role,
    options,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: options.reachable,
        adminReady: options.adminReady,
        ...(options.reachableBy ? {reachableBy: options.reachableBy} : {}),
        ...(options.reachabilityError ?
          {lastError: options.reachabilityError} :
          {}),
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: options.observedNodeIds,
          capturedAtMs: options.capturedAtMs,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: options.publicationEpoch,
              publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds: options.publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: options.publishedActiveNodeIds,
              ...(options.membershipPublicationHandoffOutcome ?
                {
                  membershipPublicationHandoffOutcome:
                    options.membershipPublicationHandoffOutcome,
                } :
                {}),
            },
            ...(options.publicationActiveGateHandoff ?
              {
                publicationActiveGateHandoff:
                  options.publicationActiveGateHandoff,
              } :
              {}),
            ...(options.membershipPublicationHandoffOutcome ?
              {
                membershipPublicationHandoffOutcome:
                  options.membershipPublicationHandoffOutcome,
              } :
              {}),
          },
        }],
      };
    },
    async getLogs() {
      return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
    },
  });

  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      NODE_ROLES.SEED,
      {
        reachable: false,
        adminReady: false,
        reachabilityError: SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
        publicationActiveGateHandoff: {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
          reasonCode:
            SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
          nextAction: SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
          runtimePromotionAllowed:
            SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
          publishedActiveNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
          missingPublishedNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
          pendingReconcileNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
          pendingReconcileCount:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS.length,
        },
        membershipPublicationHandoffOutcome: {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
          reasonCode: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
          enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
          retryAfterMs: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS,
        },
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const seedWitness = coverage.probeWitnesses.find((witness) =>
    witness.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  );

  assert.strictEqual(
    coverage.selectedNodeId,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION,
  );
  assert.strictEqual(coverage.selectedSnapshotAdminReady, true);
  assert.deepStrictEqual(
    coverage.selectedPublishedActiveNodeIds,
    SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
  );
  assert.ok(seedWitness);
  assert.strictEqual(
    seedWitness.publicationEpoch,
    SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
  );
  assert.deepStrictEqual(
    seedWitness.publishedActiveNodeIds,
    SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS,
  );
  assert.deepStrictEqual(
    seedWitness.missingPublishedNodeIds,
    SNAPSHOT_REPLAY_TEST_STRONG_MISSING_NODE_IDS,
  );
});

test(SNAPSHOT_REPLAY_TEST_DEFERRED_AUTHORITY_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  const createNode = (
    nodeId,
    role,
    options,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: options.reachable,
        adminReady: options.adminReady,
        ...(options.reachableBy ? {reachableBy: options.reachableBy} : {}),
        ...(options.reachabilityError ?
          {lastError: options.reachabilityError} :
          {}),
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: options.observedNodeIds,
          capturedAtMs: options.capturedAtMs,
          ...(options.observationMode ?
            {observationMode: options.observationMode} :
            {}),
          ...(options.snapshotObservation ?
            {snapshotObservation: options.snapshotObservation} :
            {}),
          ...(options.adminObservation ?
            {adminObservation: options.adminObservation} :
            {}),
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: options.publicationEpoch,
              publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds: options.publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: options.publishedActiveNodeIds,
              ...(options.membershipPublicationHandoffOutcome ?
                {
                  membershipPublicationHandoffOutcome:
                    options.membershipPublicationHandoffOutcome,
                } :
                {}),
            },
            ...(options.publicationActiveGateHandoff ?
              {
                publicationActiveGateHandoff:
                  options.publicationActiveGateHandoff,
              } :
              {}),
            ...(options.membershipPublicationHandoffOutcome ?
              {
                membershipPublicationHandoffOutcome:
                  options.membershipPublicationHandoffOutcome,
              } :
              {}),
          },
        }],
      };
    },
    async getLogs() {
      return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
    },
  });

  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      NODE_ROLES.SEED,
      {
        reachable: false,
        adminReady: false,
        reachabilityError: SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        observationMode:
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
        snapshotObservation: {
          state:
            CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
          contractState: OWNER_CONTRACT_STATE.DEFERRED,
          nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
          reasonCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
          retryAfterMs: SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS,
          refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
        },
        adminObservation: {
          repair: {
            deferred: true,
            triggerCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
          },
        },
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
        publicationActiveGateHandoff: {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
          reasonCode:
            SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
          nextAction: SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
          runtimePromotionAllowed:
            SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
          publishedActiveNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
          missingPublishedNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
          pendingReconcileNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
          pendingReconcileCount:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS.length,
        },
        membershipPublicationHandoffOutcome: {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
          reasonCode: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
          enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
          retryAfterMs: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS,
        },
      },
    ),
  );

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const seedWitness = coverage.probeWitnesses.find((witness) =>
    witness.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  );
  const selectedWitness = coverage.probeWitnesses.find((witness) =>
    witness.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  );

  assert.strictEqual(
    coverage.selectedNodeId,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationMode,
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationState,
    CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationContractState,
    OWNER_CONTRACT_STATE.DEFERRED,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationNextAction,
    OWNER_CONTRACT_NEXT_ACTION.RETRY,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationRefreshState,
    CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
  );
  assert.deepStrictEqual(
    coverage.selectedSnapshotObservationReasonCodes,
    [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationRetryAfterMs,
    SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS,
  );
  assert.strictEqual(coverage.selectedSnapshotRepairDeferred, true);
  assert.strictEqual(
    coverage.selectedPublicationActiveGateHandoff?.nextAction,
    SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
  );
  assert.strictEqual(
    coverage.selectedMembershipPublicationHandoffOutcome?.state,
    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
  );
  assert.strictEqual(
    coverage.selectedMembershipPublicationHandoffOutcome?.reasonCode,
    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
  );
  assert.ok(seedWitness);
  assert.strictEqual(
    seedWitness.publicationEpoch,
    SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
  );
  assert.ok(selectedWitness);
  assert.strictEqual(
    selectedWitness.snapshotObservationMode,
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
  );
  assert.strictEqual(selectedWitness.snapshotRepairDeferred, true);
  assert.strictEqual(
    selectedWitness.publicationActiveGateHandoff?.nextAction,
    SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
  );
  assert.strictEqual(
    selectedWitness.membershipPublicationHandoffOutcome?.state,
    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
  );
});

test(SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  const createNode = (
    nodeId,
    role,
    options,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: options.reachable,
        adminReady: options.adminReady,
        ...(options.reachableBy ? {reachableBy: options.reachableBy} : {}),
        ...(options.reachabilityError ?
          {lastError: options.reachabilityError} :
          {}),
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: options.observedNodeIds,
          capturedAtMs: options.capturedAtMs,
          ...(options.observationMode ?
            {observationMode: options.observationMode} :
            {}),
          ...(options.snapshotObservation ?
            {snapshotObservation: options.snapshotObservation} :
            {}),
          ...(options.adminObservation ?
            {adminObservation: options.adminObservation} :
            {}),
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: options.publicationEpoch,
              publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds: options.publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: options.publishedActiveNodeIds,
            },
            publicationActiveGateHandoff:
              options.publicationActiveGateHandoff,
          },
        }],
      };
    },
    async getLogs() {
      return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
    },
  });

  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      NODE_ROLES.SEED,
      {
        reachable: false,
        adminReady: false,
        reachabilityError: SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds:
          SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        observationMode:
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
        snapshotObservation: {
          state:
            CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
          contractState: OWNER_CONTRACT_STATE.DEFERRED,
          nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
          reasonCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
          retryAfterMs: SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS,
          refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
        },
        adminObservation: {
          repair: {
            deferred: true,
            triggerCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
          },
        },
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
        publicationActiveGateHandoff: {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
          reasonCode:
            SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
          nextAction: SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
          runtimePromotionAllowed:
            SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
          publishedActiveNodeIds:
            SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
          missingPublishedNodeIds:
            SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS,
          pendingReconcileNodeIds:
            SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS,
          pendingReconcileCount:
            SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS.length,
        },
      },
    ),
  );

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const selectedWitness = coverage.probeWitnesses.find((witness) =>
    witness.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  );

  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.length - 1,
  );
  assert.strictEqual(
    coverage.completeCoverage,
    false,
  );
  assert.strictEqual(
    coverage.selectedNodeId,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION,
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_MISSING_NODE_IDS,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationMode,
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationState,
    CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
  );
  assert.deepStrictEqual(
    coverage.selectedSnapshotObservationReasonCodes,
    [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationRetryAfterMs,
    SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS,
  );
  assert.strictEqual(
    coverage.selectedPublicationActiveGateHandoff?.reasonCode,
    SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
  );
  assert.deepStrictEqual(
    coverage.selectedPublicationActiveGateHandoff?.pendingReconcileNodeIds,
    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS,
  );
  assert.strictEqual(
    coverage.selectedPublicationActiveGateHandoff?.pendingReconcileCount,
    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS.length,
  );
  assert.ok(selectedWitness);
  assert.strictEqual(selectedWitness.snapshotRepairDeferred, true);
  assert.deepStrictEqual(
    selectedWitness.publicationActiveGateHandoff?.pendingReconcileNodeIds,
    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS,
  );
});

test(SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_PROJECTION_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
    {
      id: SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
      role: NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: true,
          adminReady: true,
          reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_OBSERVED_NODE_IDS,
            capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
            observationMode:
              ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
            snapshotObservation: {
              state:
                CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
              contractState: OWNER_CONTRACT_STATE.DEFERRED,
              nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
              reasonCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
              retryAfterMs: SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS,
              refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
            },
            adminObservation: {
              repair: {
                deferred: true,
                triggerCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
              },
            },
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
                publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
                publishedActiveNodeIds:
                  SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
                pendingAckNodeIds: [],
                acknowledgedNodeIds:
                  SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
              },
              publicationActiveGateHandoff: {
                state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
                reasonCode:
                  SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
                nextAction: SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
                runtimePromotionAllowed:
                  SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
                publishedActiveNodeIds:
                  SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
                missingPublishedNodeIds:
                  SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS,
                pendingReconcileNodeIds:
                  SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS,
                pendingReconcileCount:
                  SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS
                    .length,
              },
              membershipPublicationHandoffOutcome: {
                state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
                reasonCode: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
                enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
                retryAfterMs:
                  SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS,
              },
            },
          }],
        };
      },
      async getLogs() {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    },
  );

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );

  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.length,
  );
  assert.strictEqual(coverage.completeCoverage, true);
  assert.deepStrictEqual(
    coverage.selectedObservedNodeIds,
    SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_PROJECTED_NODE_IDS,
  );
  assert.deepStrictEqual(
    coverage.selectedPublicationActiveGateHandoff?.pendingReconcileNodeIds,
    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS,
  );
  assert.strictEqual(
    coverage.selectedPublicationActiveGateHandoff?.pendingReconcileCount,
    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS.length,
  );
  assert.strictEqual(
    coverage.selectedPublicationActiveGateHandoff?.runtimePromotionAllowed,
    SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
  );
});

