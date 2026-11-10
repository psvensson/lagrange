/**
 * The readers that told a column a row lacked from a stored NULL keep HEAD's
 * decisions on seeded rows (quest system-table-row-decoders, round 3; reader
 * census in the notes). Every row comes from the real seeder and passes
 * through a real SystemTableCache, which stores it exactly as written: a
 * cache that completed rows (round 2) turns "never written" into NULL and
 * fails the "never written" witnesses; a decoded reader that dropped its
 * ROW_NOT_OBSERVED mapping leaks the named state and fails its witness.
 */
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {BootstrapRequestOwner} from '../../src/bootstrap/owners/bootstrap-request-owner.js';
import {
  assignReplicaHandlerCreateStatusMethods,
} from '../../src/node/replica-handler-create-status-methods.js';
import {
  NODE_LIVENESS_SEMANTIC_STATE,
  projectNodeLivenessSemantics,
} from '../../src/control-plane/node-liveness-semantic-projection.js';
import {isNodeReadyLeaseExplicitlyCleared} from '../../src/node/node-readiness-policy.js';
import {buildSafeTargets} from '../../src/topology/cdc-group-propagation-routing.js';
import {decodeServicesRow} from '../../src/control-plane/services-row-decoder.js';
import {
  buildPlanningServiceRecord,
} from '../../src/control-plane/readiness-planning-global-projection.js';
import {projectReplicaFromServicesRow} from '../../src/rebalancer/projected-replica.js';
import {isVoterRaftRole} from '../../src/raft/replica-voter-readiness.js';
import {
  ROW_ABSENT,
  ROW_NOT_OBSERVED,
} from '../../src/control-plane/system-table-row-decoding.js';
import {nodesRow, servicesRow} from '../test-helpers/system-table-row-fixture.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

const PEER_ID = 'node-peer';
const NOW_MS = 1_000_000;

// The admitted-peer hint row the seed hands a joiner, as the joiner's cache
// holds it after hydration.
function cachedPeerHintRow(cache = new SystemTableCache()) {
  const owner = new BootstrapRequestOwner({delegates: {
    getBootstrapAdmissionPeerHints: () => [{nodeId: PEER_ID, nodeAddress: 'ws://10.0.0.9:8080'}],
  }});
  const [hint] = owner.attachBootstrapAdmissionPeerHints({systemTableSnapshots: {}})
    .systemTableSnapshots[TABLES.NODES];
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT, hint);
  return cache.get(TABLES.NODES, PEER_ID);
}

// A nodes row whose writer cleared the ready lease explicitly (the joiner's
// own seed and the durable-rejoin reentry row write NULL), as cached.
function cachedClearedLeaseRow(overrides = {}) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT,
    nodesRow({node_id: PEER_ID, ready_lease_expires_at: null, ...overrides}));
  return cache.get(TABLES.NODES, PEER_ID);
}

// The priority local-create services row (CL-016 seed), as the cache holds it.
function cachedPriorityLocalCreateRow() {
  class Handler {}
  assignReplicaHandlerCreateStatusMethods(Handler);
  const handler = new Handler();
  handler.systemTableCache = new SystemTableCache();
  handler.nodeId = 'node-1';
  handler.buildTrackedServiceAddress = (replicaId) => `node-1/partition/${replicaId}`;
  handler.replicaStateMachine = null;
  handler.seedLocalPriorityServiceRow('replica-1', 'partition-1', 'active');
  return handler.systemTableCache.get(TABLES.SERVICES, 'replica-1');
}

function leaseOf(nodeRow) {
  return projectNodeLivenessSemantics({nodeRow, nodeId: PEER_ID, nowMs: NOW_MS})
    .projection.leaseSemantics;
}

test('projectLease: a lease never written is UNKNOWN, a cleared lease CLEARED (HEAD)',
  async (t) => {
    const hint = cachedPeerHintRow();
    t.notOk(Object.hasOwn(hint, 'ready_lease_expires_at'), 'the hint carries no lease key');
    t.equal(leaseOf(hint).state, NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN);
    t.equal(leaseOf(hint).explicitlyCleared, false);
    t.equal(leaseOf(cachedClearedLeaseRow()).state, NODE_LIVENESS_SEMANTIC_STATE.CLEARED);
    t.equal(leaseOf(cachedClearedLeaseRow()).explicitlyCleared, true);
  });

test('isNodeReadyLeaseExplicitlyCleared: never written is not cleared (HEAD)', async (t) => {
  t.equal(isNodeReadyLeaseExplicitlyCleared(cachedPeerHintRow(), {requireActiveStatus: false}),
    false, 'the hint row never had a lease');
  t.equal(isNodeReadyLeaseExplicitlyCleared(cachedClearedLeaseRow({status: 'active'})), true,
    'an active row whose lease was written NULL is explicitly cleared');
});

test('propagation route: a peer hint carries no boot incarnation (HEAD null)', async (t) => {
  const cache = new SystemTableCache();
  cachedPeerHintRow(cache);
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.INSERT, servicesRow({
    service_id: 'mg-1-r1', service_type: 'message_group', group_id: 'mg-1', node_id: PEER_ID,
    status: 'active', address: `${PEER_ID}/message-group/mg-1-r1`,
  }));
  const [target] = buildSafeTargets({systemTableCache: cache});
  t.equal(target.nodeBootIncarnation, null, 'missing remote facts, not the DDL default 0');
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT,
    nodesRow({node_id: PEER_ID, boot_incarnation: 7}));
  t.equal(buildSafeTargets({systemTableCache: cache})[0].nodeBootIncarnation, 7,
    'the delivered row supplies it');
});

test('projected replica: unobserved columns of the priority seed read as ROW_ABSENT',
  async (t) => {
    const row = cachedPriorityLocalCreateRow();
    const decoded = decodeServicesRow(row);
    t.equal(decoded.raftRole, ROW_NOT_OBSERVED, 'the decoder names the state');
    const replica = projectReplicaFromServicesRow(decoded);
    for (const field of ['raftRole', 'groupId', 'stateEnteredAt', 'previousState',
      'cleanupToken', 'createAttemptToken']) {
      t.equal(replica[field], ROW_ABSENT, `${field}: HEAD read the missing column as NULL`);
    }
    t.equal(replica.replicaId, 'replica-1', 'replica id falls back to the service id');
    t.equal(replica.status, 'active');
  });

test('planning record: the priority seed records as the same row with stored NULLs',
  async (t) => {
    const seeded = cachedPriorityLocalCreateRow();
    const stored = servicesRow(Object.fromEntries(Object.entries(seeded)
      .filter(([key]) => key !== 'seed_projection')));
    t.same(buildPlanningServiceRecord(decodeServicesRow(seeded)),
      buildPlanningServiceRecord(decodeServicesRow(stored)),
      'NOT_OBSERVED and NULL are one planning record, as at HEAD');
  });

test('comparison-only readers: NOT_OBSERVED decides as HEAD\'s missing role', async (t) => {
  t.equal(isVoterRaftRole(ROW_NOT_OBSERVED), false);
  t.equal(isVoterRaftRole(ROW_NOT_OBSERVED), isVoterRaftRole(undefined));
  t.equal(isVoterRaftRole(ROW_ABSENT), isVoterRaftRole(null));
});
