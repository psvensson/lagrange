import {PLACEMENT_RESOURCE_COLUMNS} from '../../src/diagnostics/placement-resource-sample.js';
import {readRemoteHeartbeatObservation} from '../../src/rebalancer/replica-placement-owner-capacity.js';
import {deriveParticipantEntryId} from '../../src/query/distributed/distributed-write-coordinator.js';
/**
 * Durable rejoin reaches READY: the registration / durable-rejoin verb owns
 * the boot-incarnation transition (one CAS on the observed older incarnation
 * writing this boot's), so the lifecycle owner's READY CAS for this boot can
 * match. Without the advance the READY CAS could never apply.
 */
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeRegistrationOwner} from
  '../../src/bootstrap/shared/node-registration-owner.js';
import {
  buildAuthoritativeRowSourceUnavailableError,
  buildNodeRegistrationRow,
} from '../../src/bootstrap/shared/node-registration-owner-row-builder.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {MembershipPublicationRuntimeOwner} from
  '../../src/control-plane/owners/membership-publication-runtime-owner.js';
import {
  NODE_LIFECYCLE_PUBLICATION_OUTCOME as OUTCOME,
  NodeLifecyclePublication,
} from '../../src/control-plane/node-lifecycle-publication.js';
import {NodeReadyLeaseAuthority} from
  '../../src/control-plane/node-ready-lease-authority.js';
import {STALE_NODE_INCARNATION_CODE} from
  '../../src/control-plane/control-plane-error-classification.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
  AUTHORITATIVE_ROW_READ_STATE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  ISSUE_INDETERMINATE_MODE,
  NODE_IDENTITY_TWIN_SUSPECTED,
  NODE_REGISTRATION_CLOCK_REQUIRED,
  NODE_REGISTRATION_INCARNATION_REQUIRED,
  NODE_REGISTRATION_ISSUE_RECORD_REQUIRED,
  NODE_REGISTRATION_OUTCOME,
  buildSupersededRegistrationError,
  classifyNodeIncarnationRelation,
  createNodeRegistrationIssueRecord,
  matchesIndeterminateAttemptRow,
  recordNodeRegistrationIssue,
  requireRegistrationClockReading,
  writeNodeRegistrationAtIncarnation,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {runControlPlaneWrite} from
  '../../src/control-plane/control-plane-write-identity.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {buildClusterIncarnationFence} from
  '../../src/bootstrap/cluster-incarnation-fence.js';
import {
  PARTITION_REPLICA_STORAGE_STATE,
} from '../../src/storage/data-directory-manager.js';
import {NodeStorageBudgetService} from
  '../../src/rebalancer/node-storage-budget-service.js';
import {NODE_HOST_ID_ERROR_CODE} from '../../src/topology/node-host-identity.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  COLUMN,
  META_SERVICE_ID,
  NODE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';

import {
  NODE_ADDRESS, NODE_ID, NOW, PREVIOUS_BOOT, THIS_BOOT,
} from './durable-rejoin-incarnation-fixture.js';

function previousBootRow(overrides = {}) {
  return {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: STATE.READY,
    [COLUMN.LAST_HEARTBEAT]: NOW - 60_000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW - 45_000,
    [COLUMN.BOOT_INCARNATION]: PREVIOUS_BOOT,
    [COLUMN.CREATED_AT]: NOW - 600_000,
    ...overrides,
  };
}

// Durable rows behind a gateway that honors the CAS predicate: the NODES row
// and the endpoint rows the previous boot published (at its incarnation).
// An absent initialRow is a cluster that never saw this node id.
function createDurableNodes(initialRow) {
  const tables = new Map([
    [TABLES.NODES, new Map(initialRow ?
      [[initialRow[COLUMN.NODE_ID], {...initialRow}]] : [])],
    [TABLES.NODE_ENDPOINTS, new Map(initialRow ? [['ep', {endpoint_id: 'ep',
      node_id: NODE_ID, address: 'ws://rejoin:8082',
      boot_incarnation: initialRow[COLUMN.BOOT_INCARNATION]}]] : [])],
    [TABLES.SERVICE_ENDPOINTS, new Map(initialRow ? [['svc-postgres-wire', {
      endpoint_id: 'svc-postgres-wire', node_id: NODE_ID,
      address: 'rejoin', boot_incarnation: initialRow[COLUMN.BOOT_INCARNATION],
    }]] : [])],
  ]);
  const rowsOf = (tableName) => tables.get(tableName) || new Map();
  const gateway = {
    async readAuthoritativeRows(tableName = TABLES.NODES) {
      return {success: true,
        rows: [...rowsOf(tableName).values()].map((row) => ({...row}))};
    },
    async insertSystemTableRow(tableName, row) {
      const key = row.endpoint_id ?? row[COLUMN.NODE_ID];
      if (rowsOf(tableName).has(key)) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      rowsOf(tableName).set(key, {...row});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const rows = rowsOf(tableName);
      const [key, row] = [...rows.entries()].find(([, candidate]) =>
        Object.entries(whereClause).every(([column, value]) =>
          (candidate[column] ?? null) === value)) || [];
      if (!row) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      rows.set(key, {...row, ...data});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
  return {
    gateway,
    current: () => rowsOf(TABLES.NODES).get(NODE_ID),
    endpoints: () => [...rowsOf(TABLES.NODE_ENDPOINTS).values(),
      ...rowsOf(TABLES.SERVICE_ENDPOINTS).values()],
  };
}

function createRejoiningOwner(durable, bootIncarnation = THIS_BOOT) {
  const owner = new NodeRegistrationOwner({
    hostId: LOCAL_MACHINE_HOST_ID,
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    membershipPublicationRuntimeOwner: new MembershipPublicationRuntimeOwner({
      nodeId: NODE_ID,
      controlPlaneSystemTableGateway: durable.gateway,
    }),
    delegates: {
      getLogger: () => ({info() {}, warn() {}, error() {}}),
      getNow: () => () => NOW,
      getNodeCapabilities: () => [],
      getBootIncarnation: () => bootIncarnation,
      getSystemTableCache: () => ({applySystemTableChange() {}}),
      getJoinLifecycleIntentType: () =>
        MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
      getClusterIncarnationFence: () => ({allowed: true}),
    },
  });
  owner.seedJoinTimeCacheRow = () => {};
  owner.readAuthoritativeRows = async (tableName) => ({
    state: AUTHORITATIVE_ROW_READ_STATE.READABLE,
    rows: [],
    tableName,
  });
  owner.readAuthoritativeDurableRejoinNodeRow = async () =>
    ({...durable.current()});
  owner.readAuthoritativeNodeEndpointRowOutcome = async () => ({
    state: 'readable',
    row: {endpoint_id: 'ep', node_id: NODE_ID},
  });
  owner.readAuthoritativeMetaEndpointRowsOutcome = async () => ({
    state: 'readable',
    rows: [{endpoint_id: 'svc-postgres-wire', node_id: NODE_ID}],
  });
  return owner;
}

function publishReady(durable, telemetry) {
  return new NodeLifecyclePublication({
    gateway: durable.gateway,
    leaseAuthority: new NodeReadyLeaseAuthority({readyLeaseMs: 15_000}),
    now: () => NOW,
  }).publish({
    nodeId: NODE_ID,
    bootIncarnation: THIS_BOOT,
    state: STATE.READY,
    heartbeatOnly: true,
    heartbeatAt: NOW,
    nodeAddress: NODE_ADDRESS,
    telemetry,
  });
}

test('durable rejoin advances the boot incarnation and the new boot reaches ' +
  'READY', async (t) => {
  const sampled = Object.fromEntries(Object.values(PLACEMENT_RESOURCE_COLUMNS)
    .map((column) => [column, 99]));
  const durable = createDurableNodes(previousBootRow({...sampled, telemetry_sample_id: 7,
    telemetry_sampled_at: NOW - 1, memory_mb: 1024, memory_usage_percent: 30}));
  t.equal(readRemoteHeartbeatObservation(durable.current()).pressureSensorsComplete, true);

  const result = await createRejoiningOwner(durable).registerNodeInCluster();
  t.equal(result?.reusedExistingMembership, true,
    'the durable membership is reused');
  t.match(durable.current(), {
    [COLUMN.BOOT_INCARNATION]: THIS_BOOT,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.READY_LEASE_EXPIRES_AT]: null,
  }, 'reentry writes this boot incarnation with a cleared lease');
  for (const column of [...Object.keys(sampled), 'telemetry_sample_id', 'telemetry_sampled_at']) {
    t.equal(durable.current()[column], null, `new boot explicitly clears ${column}`);
  }
  t.equal(readRemoteHeartbeatObservation(durable.current()).pressureSensorsComplete, false);
  t.same(durable.endpoints().map((row) => row[COLUMN.BOOT_INCARNATION]),
    [THIS_BOOT, THIS_BOOT],
    'the reused endpoint rows advance to this boot with the node row');

  const ready = await publishReady(durable);
  t.equal(ready.outcome, OUTCOME.APPLIED,
    'the READY CAS for the new boot matches the advanced row');
  t.match(durable.current(), {
    [COLUMN.BOOT_INCARNATION]: THIS_BOOT,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: STATE.READY,
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW + 15_000,
  }, 'the rejoined node is READY with an owner-granted lease');
});

test('join registration CAS clears a recent sample when replacing an older boot', async (t) => {
  const durable = createDurableNodes(previousBootRow({main_thread_cpu_percent: 99,
    resource_sample_interval_ms: 100, telemetry_sampled_at: NOW - 1, telemetry_sample_id: 41}));
  const registration = new MembershipPublicationRuntimeOwner({
    nodeId: NODE_ID, controlPlaneSystemTableGateway: durable.gateway,
  });
  const next = buildNodeRegistrationRow({nodeId: NODE_ID, nodeAddress: NODE_ADDRESS,
    hostId: LOCAL_MACHINE_HOST_ID, bootIncarnation: THIS_BOOT, now: NOW});
  const result = await registration.registerJoinNodeAtIncarnation(next, THIS_BOOT,
    createNodeRegistrationIssueRecord(), {nowMs: NOW});
  t.equal(result.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED);
  t.match(durable.current(), {boot_incarnation: THIS_BOOT, main_thread_cpu_percent: null,
    resource_sample_interval_ms: null, telemetry_sampled_at: null, telemetry_sample_id: null});
});

test('without the registration advance, the new boot can never publish READY',
  async (t) => {
    const durable = createDurableNodes(previousBootRow());
    const ready = await publishReady(durable);
    t.equal(ready.outcome, OUTCOME.REFUSED_SOURCE_CHANGED,
      'lifecycle publication never advances an incarnation itself');
    t.equal(durable.current()[COLUMN.BOOT_INCARNATION], PREVIOUS_BOOT);
  });

test('a zombie boot cannot advance over a newer registered incarnation',
  async (t) => {
    const durable = createDurableNodes(previousBootRow({
      [COLUMN.BOOT_INCARNATION]: THIS_BOOT + 1,
    }));
    const error = await t.rejects(
      createRejoiningOwner(durable).registerNodeInCluster(),
    );
    t.equal(error?.cause?.code ?? error?.code, STALE_NODE_INCARNATION_CODE,
      'the advance refuses a lower boot with the typed terminal error');
    t.equal(durable.current()[COLUMN.BOOT_INCARNATION], THIS_BOOT + 1,
      'the newer registration is untouched');
  });

test('N4: a repeated same-boot durable-rejoin registration is CURRENT and ' +
  'issues no NODES write', async (t) => {
  const durable = createDurableNodes(previousBootRow());
  const nodeWrites = [];
  const update = durable.gateway.updateSystemTableRow;
  durable.gateway.updateSystemTableRow = (tableName, ...rest) => {
    if (tableName === TABLES.NODES) nodeWrites.push(rest);
    return update(tableName, ...rest);
  };
  const owner = createRejoiningOwner(durable);
  await owner.registerNodeInCluster();
  t.equal(nodeWrites.length, 1, 'the first registration advances once');
  const ready = await publishReady(durable, {telemetry_sampled_at: NOW, telemetry_sample_id: 8,
    resource_sample_interval_ms: 150, main_thread_cpu_percent: 0});
  t.equal(ready.outcome, OUTCOME.APPLIED);
  const writesBeforeReentry = nodeWrites.length;
  const registered = JSON.stringify(durable.current());

  // The registration retry loop re-enters later in the same boot.
  owner.delegates.getNow = () => () => NOW + 5_000;
  const again = await owner.registerNodeInCluster();
  t.equal(again?.reusedExistingMembership, true);
  t.equal(again.nodeRow.telemetry_sample_id, 8);
  t.equal(again.nodeRow.main_thread_cpu_percent, 0);
  t.equal(nodeWrites.length, writesBeforeReentry,
    'the same-boot re-entry issues no NODES write');
  t.equal(JSON.stringify(durable.current()), registered,
    'the durable row is byte-for-byte unchanged');
});

function attachOriginHlcStamping(gateway, {prefix, startCounter = 0}) {
  let hlcCounter = startCounter;
  const baseUpdate = gateway.updateSystemTableRow;
  gateway.updateSystemTableRow = async (tableName, whereClause, data) => {
    const res = await baseUpdate(tableName, whereClause, data);
    if (Number(res?.partitionResult?.affectedRows) > 0) {
      hlcCounter += 1;
      const originHlc = `${prefix}${hlcCounter}-${tableName}`;
      return {
        ...res,
        originHlc,
        partitionResult: {...res.partitionResult, originHlc},
      };
    }
    return res;
  };
}

async function verifyDurableRejoinOriginHlc(t) {
  const durable = createDurableNodes(previousBootRow({
    [COLUMN.UPDATED_AT_HLC]: '1710000000000-0000-old',
  }));
  attachOriginHlcStamping(durable.gateway, {prefix: '1710000000000-000'});

  const durableSeeded = new Map();
  const rejoinOwner = createRejoiningOwner(durable);
  rejoinOwner.seedJoinTimeCacheRow = (tableName, row) => {
    durableSeeded.set(tableName, row);
  };

  const rejoinResult = await rejoinOwner.registerNodeInCluster();
  const expectedNodesHlc = `1710000000000-0001-${TABLES.NODES}`;
  const expectedNodeEpHlc = `1710000000000-0002-${TABLES.NODE_ENDPOINTS}`;
  const expectedSvcEpHlc = `1710000000000-0003-${TABLES.SERVICE_ENDPOINTS}`;

  t.equal(
    rejoinResult.nodeRow[COLUMN.UPDATED_AT_HLC],
    expectedNodesHlc,
    'durable rejoin returns NODES row stamped with new updated_at_hlc',
  );
  t.equal(
    rejoinResult.endpointRow[COLUMN.UPDATED_AT_HLC],
    expectedNodeEpHlc,
    'durable rejoin returns NODE_ENDPOINTS row stamped with new updated_at_hlc',
  );
  t.equal(
    rejoinResult.metaEndpointRows[0]?.[COLUMN.UPDATED_AT_HLC],
    expectedSvcEpHlc,
    'durable rejoin returns SERVICE_ENDPOINTS row stamped with new updated_at_hlc',
  );
  t.equal(
    durableSeeded.get(TABLES.NODES)?.[COLUMN.UPDATED_AT_HLC],
    expectedNodesHlc,
    'durable rejoin seeds SystemTableCache NODES with new updated_at_hlc',
  );
  t.equal(
    durableSeeded.get(TABLES.NODE_ENDPOINTS)?.[COLUMN.UPDATED_AT_HLC],
    expectedNodeEpHlc,
    'durable rejoin seeds SystemTableCache NODE_ENDPOINTS with new updated_at_hlc',
  );
  t.equal(
    durableSeeded.get(TABLES.SERVICE_ENDPOINTS)?.[COLUMN.UPDATED_AT_HLC],
    expectedSvcEpHlc,
    'durable rejoin seeds SystemTableCache SERVICE_ENDPOINTS with new updated_at_hlc',
  );
}

async function verifyResumedJoinProgressOriginHlc(t) {
  const progressDurable = createDurableNodes(previousBootRow({
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
  }));
  attachOriginHlcStamping(progressDurable.gateway, {
    prefix: '1710000000000-00',
    startCounter: 10,
  });

  const progressSeeded = new Map();
  const progressOwner = createRejoiningOwner(progressDurable, THIS_BOOT);
  progressOwner.delegates.getJoinLifecycleIntentType = () =>
    MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION;
  progressOwner.delegates.getClusterIncarnationFence = () => ({
    allowed: true,
    durableMembershipState: 'present',
  });
  progressOwner.seedJoinTimeCacheRow = (tableName, row) => {
    progressSeeded.set(tableName, row);
  };

  const progressResult = await progressOwner.registerNodeInCluster();
  const expectedProgNodesHlc = `1710000000000-0011-${TABLES.NODES}`;
  const expectedProgNodeEpHlc = `1710000000000-0012-${TABLES.NODE_ENDPOINTS}`;
  const expectedProgSvcEpHlc =
    `1710000000000-0013-${TABLES.SERVICE_ENDPOINTS}`;

  t.equal(
    progressResult.nodeRow?.[COLUMN.UPDATED_AT_HLC],
    expectedProgNodesHlc,
    'resumed join progress returns budgetRow stamped with advanced updated_at_hlc',
  );
  t.equal(
    progressResult.endpointRow?.[COLUMN.UPDATED_AT_HLC],
    expectedProgNodeEpHlc,
    'resumed join progress returns endpointRow stamped with advanced updated_at_hlc',
  );
  t.equal(
    progressResult.metaEndpointRows?.[0]?.[COLUMN.UPDATED_AT_HLC],
    expectedProgSvcEpHlc,
    'resumed join progress returns metaEndpointRows stamped with advanced updated_at_hlc',
  );
  t.equal(
    progressSeeded.get(TABLES.NODES)?.[COLUMN.UPDATED_AT_HLC],
    expectedProgNodesHlc,
    'registerNodeInCluster seeds TABLES.NODES with HLC-stamped budgetRow',
  );
  t.equal(
    progressSeeded.get(TABLES.NODE_ENDPOINTS)?.[COLUMN.UPDATED_AT_HLC],
    expectedProgNodeEpHlc,
    'registerNodeInCluster seeds TABLES.NODE_ENDPOINTS with HLC-stamped endpointRow',
  );
  t.equal(
    progressSeeded.get(TABLES.SERVICE_ENDPOINTS)?.[COLUMN.UPDATED_AT_HLC],
    expectedProgSvcEpHlc,
    'registerNodeInCluster seeds TABLES.SERVICE_ENDPOINTS with HLC-stamped metaEndpointRow',
  );
  return progressOwner;
}

test(
  'durable rejoin and resumed join-admission progress preserve originHlc ' +
  '(updated_at_hlc) across NODES, NODE_ENDPOINTS and SERVICE_ENDPOINTS ' +
  'return values and SystemTableCache seeds',
  async (t) => {
    await verifyDurableRejoinOriginHlc(t);

    // Resumed join-admission progress path (advanceStaleJoinAdmissionIncarnation)
    const progressOwner = await verifyResumedJoinProgressOriginHlc(t);

    // Readback resolution path (resolveNodeBootIncarnationAdvanceByReadback)
    const readbackHlc = '1710000000000-0099-readback';
    progressOwner.readAuthoritativeDurableRejoinNodeRow = async () => ({
      ...previousBootRow(),
      [COLUMN.BOOT_INCARNATION]: THIS_BOOT,
      [COLUMN.UPDATED_AT_HLC]: readbackHlc,
    });
    const resolvedByReadback =
      await progressOwner.resolveNodeBootIncarnationAdvanceByReadback(
        {
          [COLUMN.NODE_ID]: NODE_ID,
          [COLUMN.BOOT_INCARNATION]: THIS_BOOT,
        },
        THIS_BOOT,
      );
    t.equal(
      resolvedByReadback?.[COLUMN.UPDATED_AT_HLC],
      readbackHlc,
      'resolveNodeBootIncarnationAdvanceByReadback preserves observedRow.updated_at_hlc',
    );
  },
);

// ---------------------------------------------------------------------------
// R1: one boot lifecycle owns its NODES row. A data directory reserves above
// every incarnation it issued, so a row at this lifecycle's own number that
// it never wrote belongs to another storage's life of the node id (a wiped
// data directory reserved the number again). That row supersedes this
// lifecycle exactly as a newer row does: no write, no adoption of the earlier
// life's endpoint rows, and a new lifecycle reserves above it.

// Count every durable write the gateway receives.
function recordDurableWrites(durable) {
  const writes = [];
  const {insertSystemTableRow, updateSystemTableRow} = durable.gateway;
  durable.gateway.insertSystemTableRow = (tableName, ...rest) => {
    writes.push({op: 'insert', tableName});
    return insertSystemTableRow(tableName, ...rest);
  };
  durable.gateway.updateSystemTableRow = (tableName, ...rest) => {
    writes.push({op: 'update', tableName});
    return updateSystemTableRow(tableName, ...rest);
  };
  return writes;
}

// A lifecycle that starts on a data directory with no durable state. In real
// startJoinNode, persistJoinSeedRejoinHints runs BEFORE the local cluster
// incarnation fence is resolved, so durableMembershipState is 'present' even
// on a wiped joiner while joinLifecycleIntentType stays JOIN_ADMISSION.
function createFreshStorageOwner(durable, bootIncarnation) {
  const owner = createRejoiningOwner(durable, bootIncarnation);
  owner.delegates.getJoinLifecycleIntentType = () =>
    MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION;
  owner.delegates.getClusterIncarnationFence = () =>
    buildClusterIncarnationFence({
      durableStateDetected: true,
      localIdentityMatched: true,
      peerProofRequired: true,
      peerAddresses: [NODE_ADDRESS],
    });
  owner.delegates.getNodeStorageBudgetService = () => ({
    resolveBudgetRow: (nodeRow) => ({
      budgetRow: {...nodeRow, storage_budget_bytes: 1024,
        storage_budget_source: 'test'},
      resolution: {isValid: true, budgetBytes: 1024, source: 'test'},
    }),
  });
  owner.readAuthoritativeDurableRejoinNodeRow = async () =>
    (durable.current() ? {...durable.current()} : null);
  return owner;
}

function earlierLifeRow(overrides = {}) {
  return previousBootRow({
    [COLUMN.BOOT_INCARNATION]: THIS_BOOT,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
    ...overrides,
  });
}

test('R1 (main\'s hole): a fresh-storage lifecycle whose existing-progress ' +
  'path observes an earlier life\'s CONNECTED row at its own number is ' +
  'superseded, writes nothing and adopts none of that life\'s endpoints',
async (t) => {
  const durable = createDurableNodes(earlierLifeRow());
  const before = JSON.stringify([durable.current(), durable.endpoints()]);
  const writes = recordDurableWrites(durable);
  const error = await t.rejects(
    createFreshStorageOwner(durable, THIS_BOOT).registerNodeInCluster());
  t.equal(error?.code, STALE_NODE_INCARNATION_CODE,
    'typed superseded refusal, not CURRENT');
  t.equal(error?.knownIncarnation, THIS_BOOT,
    'the join failure carries the superseding incarnation to the reattempt');
  t.equal(error?.retryable, true, 'retryable by a new lifecycle only');
  t.same(writes, [], 'no NODES, NODE_ENDPOINTS or SERVICE_ENDPOINTS write');
  t.equal(JSON.stringify([durable.current(), durable.endpoints()]), before,
    'the earlier life\'s rows are untouched');
});

test('R1 (fresh birth): a lifecycle whose birth observes an earlier life\'s ' +
  'row at its own number is refused by the registration write itself',
async (t) => {
  const durable = createDurableNodes(earlierLifeRow({
    [COLUMN.STATUS]: NODE_STATE.STOPPED,
  }));
  const writes = recordDurableWrites(durable);
  const error = await t.rejects(
    createFreshStorageOwner(durable, THIS_BOOT).registerNodeInCluster());
  t.equal(error?.code, STALE_NODE_INCARNATION_CODE);
  t.equal(error?.knownIncarnation, THIS_BOOT);
  t.same(writes, [], 'the D-7 write issues neither a birth nor a CAS');
  t.equal(durable.current()[COLUMN.STATUS], NODE_STATE.STOPPED,
    'the terminal row of the earlier life stays terminal');
});

test('R1: the same lifecycle re-entering after its own birth is CURRENT ' +
  'and issues no second NODES write', async (t) => {
  const durable = createDurableNodes(null);
  const writes = recordDurableWrites(durable);
  const owner = createFreshStorageOwner(durable, THIS_BOOT);
  owner.delegates.getClusterIncarnationFence = () => ({allowed: true});
  await owner.registerNodeInCluster();
  const nodeWrites = () => writes.filter((w) => w.tableName === TABLES.NODES);
  t.equal(nodeWrites().length, 1, 'the lifecycle births its row once');
  t.equal(durable.current()[COLUMN.BOOT_INCARNATION], THIS_BOOT);

  // The registration re-enters later in the same boot lifecycle.
  owner.delegates.getNow = () => () => NOW + 5_000;
  await owner.registerNodeInCluster();
  t.equal(nodeWrites().length, 1, 'its own row is CURRENT: no second write');
});

test('R1: the superseded lifecycle\'s successor reserves above the ' +
  'superseding incarnation and advances the earlier life\'s row by one CAS',
async (t) => {
  const durable = createDurableNodes(earlierLifeRow());
  const error = await t.rejects(
    createFreshStorageOwner(durable, THIS_BOOT).registerNodeInCluster());
  const successor = error.knownIncarnation + 1;
  const writes = recordDurableWrites(durable);
  const owner = createFreshStorageOwner(durable, successor);
  owner.readAuthoritativeRows = async (tableName) =>
    ({state: AUTHORITATIVE_ROW_READ_STATE.READABLE, rows: [], tableName});
  await owner.registerNodeInCluster();
  t.equal(durable.current()[COLUMN.BOOT_INCARNATION], successor,
    'the new lifecycle owns the row');
  t.same(writes.filter((w) => w.tableName === TABLES.NODES),
    [{op: 'update', tableName: TABLES.NODES}],
    'one CAS from the observed earlier incarnation');
});

test('O-K1: a superseding row with a valid READY lease that declares another ' +
  'host is a suspected twin, refused for an operator; the same host or a ' +
  'lapsed lease is an earlier life, superseded', async (t) => {
  const liveElsewhere = createDurableNodes(earlierLifeRow({
    [COLUMN.HOST_ID]: 'other-host',
    [COLUMN.CONNECTION_STATE]: STATE.READY,
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW + 10_000,
  }));
  const writes = recordDurableWrites(liveElsewhere);
  const twin = await t.rejects(
    createFreshStorageOwner(liveElsewhere, THIS_BOOT).registerNodeInCluster());
  t.equal(twin?.code, NODE_IDENTITY_TWIN_SUSPECTED, 'operator-gated refusal');
  t.equal(twin?.retryable, false, 'never retried by a new lifecycle');
  t.equal(twin?.knownIncarnation, undefined,
    'carries no superseded incarnation: no floor raise');
  t.equal(twin?.observedHostId, 'other-host', 'preserves observedHostId');
  t.equal(twin?.declaredHostId, LOCAL_MACHINE_HOST_ID,
    'preserves declaredHostId');
  t.equal(twin?.nodeId, NODE_ID, 'preserves nodeId');
  t.equal(twin?.receivedIncarnation, THIS_BOOT,
    'preserves receivedIncarnation');
  const directTwin = buildSupersededRegistrationError({
    nodeId: NODE_ID,
    receivedIncarnation: THIS_BOOT,
    observedRow: liveElsewhere.current(),
    declaredHostId: LOCAL_MACHINE_HOST_ID,
    nowMs: NOW,
  });
  t.equal('knownIncarnation' in directTwin, false,
    'direct buildSupersededRegistrationError omits knownIncarnation on twin');
  t.same(writes, [], 'nothing written');

  for (const [label, overrides] of [
    ['same host', {[COLUMN.READY_LEASE_EXPIRES_AT]: NOW + 10_000}],
    ['lapsed lease', {[COLUMN.HOST_ID]: 'other-host',
      [COLUMN.READY_LEASE_EXPIRES_AT]: NOW - 1}],
    ['non-active status on other host', {[COLUMN.HOST_ID]: 'other-host',
      [COLUMN.STATUS]: NODE_STATE.STOPPED,
      [COLUMN.READY_LEASE_EXPIRES_AT]: NOW + 10_000}],
  ]) {
    const durable = createDurableNodes(earlierLifeRow(overrides));
    const error = await t.rejects(
      createFreshStorageOwner(durable, THIS_BOOT).registerNodeInCluster());
    t.equal(error?.code, STALE_NODE_INCARNATION_CODE,
      `${label}: an earlier life, superseded`);
  }
});

// ---------------------------------------------------------------------------
// Lost partition-replica storage on a fresh-storage registration: a replica
// whose row proves prior existence while this data directory holds no
// database for it goes to FAILED through its lifecycle owner, with the
// open-time refusal's reason.

function partitionServiceRow(serviceId, status, nodeId = NODE_ID) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: `p-${serviceId}`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: status,
  };
}

function attachLostStorageProbe(owner, {rows, presentReplicaIds = []}) {
  const reads = [];
  const transitions = [];
  owner.readAuthoritativeRows = async (tableName, sql, params) => {
    reads.push({tableName, params});
    return {state: AUTHORITATIVE_ROW_READ_STATE.READABLE, rows, tableName};
  };
  owner.delegates.readLocalReplicaStorageState = ({replicaId}) =>
    (presentReplicaIds.includes(replicaId) ?
      PARTITION_REPLICA_STORAGE_STATE.PRESENT :
      PARTITION_REPLICA_STORAGE_STATE.ABSENT);
  owner.delegates.getReplicaStateMachine = () => ({
    transitionAuthoritativeReplicaGeneration: async (row, state, context) => {
      transitions.push({serviceId: row[COLUMN.SERVICE_ID], state, context});
      return true;
    },
  });
  return {reads, transitions};
}

test('S4: a fresh-storage registration fails exactly the partition replicas ' +
  'whose prior existence is proven while their storage is absent',
async (t) => {
  const durable = createDurableNodes(previousBootRow({
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
  }));
  const owner = createFreshStorageOwner(durable, THIS_BOOT);
  const {reads, transitions} = attachLostStorageProbe(owner, {
    rows: [
      partitionServiceRow('lost-active', ReplicaStatus.ACTIVE),
      partitionServiceRow('lost-syncing', ReplicaStatus.SYNCING),
      partitionServiceRow('kept-present', ReplicaStatus.ACTIVE),
      partitionServiceRow('create-in-flight', ReplicaStatus.PENDING),
      partitionServiceRow('already-failed', ReplicaStatus.FAILED),
      partitionServiceRow('other-node', ReplicaStatus.ACTIVE, 'node-other'),
    ],
    presentReplicaIds: ['kept-present'],
  });
  const result = await owner.registerNodeInCluster();
  t.same(reads.map((read) => read.tableName), [TABLES.SERVICES],
    'one authoritative read of the node\'s partition rows');
  t.same(reads[0].params, [NODE_ID, SERVICE_TYPE.PARTITION]);
  t.same(transitions.map((tr) => tr.serviceId),
    ['lost-active', 'lost-syncing'],
    'only proven-lost replicas: storage present, no prior existence, ' +
    'already failed and other nodes\' rows are untouched');
  for (const transition of transitions) {
    t.equal(transition.state, ReplicaStatus.FAILED);
    t.equal(transition.context.reason,
      COMMITTED_MEMBERSHIP_REFUSAL.DURABLE_RECORD_MISSING,
      'with the open-time refusal\'s own reason');
    t.equal(transition.context.timestamp, NOW);
  }
  t.same(result.lostStorageReplicas, ['lost-active', 'lost-syncing']);
});

test('S4: a registration on durable storage never probes or fails replicas',
  async (t) => {
    const durable = createDurableNodes(previousBootRow({
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
    }));
    const owner = createFreshStorageOwner(durable, THIS_BOOT);
    owner.delegates.getJoinLifecycleIntentType = () =>
      MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY;
    // Missing node endpoint forces RESTART_REENTRY onto the progress path,
    // exercising failLostStoragePartitionReplicas on a durable-storage boot.
    owner.readAuthoritativeNodeEndpointRowOutcome = async () => ({
      state: AUTHORITATIVE_ROW_READ_STATE.READABLE,
      row: null,
    });
    const {reads, transitions} = attachLostStorageProbe(owner, {
      rows: [partitionServiceRow('lost-active', ReplicaStatus.ACTIVE)],
    });
    const result = await owner.registerNodeInCluster();
    t.same(reads, [], 'no SERVICES read');
    t.same(transitions, [], 'no lifecycle transition');
    t.same(result.lostStorageReplicas, []);
  });

// ---------------------------------------------------------------------------
// M1 (1A + 1B): unapplied or blind registration attempts never poison
// issueRecord.issuedAtIncarnation.

test('M1-1A: concurrent twin INSERT race and blind BIRTH over STOPPED row ' +
  'never poison issuedAtIncarnation', async (t) => {
  // 1A-i: both twins observe ABSENT; Twin A commits READY on other-host;
  // Twin B's INSERT fails UNIQUE and its reread sees Twin A -> twin refusal.
  const twinRow = earlierLifeRow({
    [COLUMN.HOST_ID]: 'other-host',
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: STATE.READY,
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW + 10_000,
  });
  let observations = 0;
  const twinIssueRecord = createNodeRegistrationIssueRecord();
  const racedTwin = await writeNodeRegistrationAtIncarnation({
    row: {[COLUMN.NODE_ID]: NODE_ID, [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
      [COLUMN.STATUS]: NODE_STATE.JOINING},
    bootIncarnation: THIS_BOOT,
    issueRecord: twinIssueRecord,
    nowMs: NOW,
    observe: async () => {
      observations += 1;
      return observations === 1 ?
        {available: true, row: null} :
        {available: true, row: twinRow};
    },
    insert: async () => ({success: false, error: 'UNIQUE constraint failed'}),
    advance: async () => ({success: true, partitionResult: {affectedRows: 0}}),
  });
  t.equal(racedTwin.outcome, NODE_REGISTRATION_OUTCOME.REFUSED_STALE,
    'lost INSERT race against Twin A is REFUSED_STALE, never ACCEPTED');
  t.equal(twinIssueRecord.issuedAtIncarnation, null,
    'issueRecord stays un-stamped after UNIQUE failure');
  const twinError = buildSupersededRegistrationError({
    nodeId: NODE_ID,
    receivedIncarnation: THIS_BOOT,
    observedRow: racedTwin.observedRow,
    declaredHostId: LOCAL_MACHINE_HOST_ID,
    nowMs: NOW,
  });
  t.equal(twinError.code, NODE_IDENTITY_TWIN_SUSPECTED);
  t.equal('knownIncarnation' in twinError, false);

  // 1A-ii: wiped Life 2 at THIS_BOOT when initial observe() is unavailable
  // and Life 1's STOPPED row holds THIS_BOOT.
  const stoppedLife1 = earlierLifeRow({[COLUMN.STATUS]: NODE_STATE.STOPPED});
  let blindObs = 0;
  const wipedIssueRecord = createNodeRegistrationIssueRecord();
  const blindWiped = await writeNodeRegistrationAtIncarnation({
    row: {[COLUMN.NODE_ID]: NODE_ID, [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
      [COLUMN.STATUS]: NODE_STATE.JOINING},
    bootIncarnation: THIS_BOOT,
    issueRecord: wipedIssueRecord,
    nowMs: NOW,
    observe: async () => {
      blindObs += 1;
      return blindObs === 1 ?
        {available: false, row: null} :
        {available: true, row: stoppedLife1};
    },
    insert: async () => ({success: false, error: 'UNIQUE constraint failed'}),
    advance: async () => ({success: true, partitionResult: {affectedRows: 0}}),
  });
  t.equal(blindWiped.outcome, NODE_REGISTRATION_OUTCOME.REFUSED_STALE,
    'blind BIRTH over Life 1 STOPPED row refuses stale instead of resurrecting');
  t.equal(wipedIssueRecord.issuedAtIncarnation, null);

  // 1A-iii: concurrent twin CAS race in advanceNodeBootIncarnation.
  const olderDurable = createDurableNodes(previousBootRow({
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
  }));
  const casRacedOwner = createFreshStorageOwner(olderDurable, THIS_BOOT);
  olderDurable.gateway.updateSystemTableRow = async () => ({
    success: true,
    partitionResult: {affectedRows: 0},
  });
  let rejoinReads = 0;
  casRacedOwner.readAuthoritativeDurableRejoinNodeRow = async () => {
    rejoinReads += 1;
    return rejoinReads === 1 ? {...olderDurable.current()} : twinRow;
  };
  const casTwinErr = await t.rejects(casRacedOwner.registerNodeInCluster());
  t.equal(casTwinErr?.code, NODE_IDENTITY_TWIN_SUSPECTED,
    'CAS miss in advanceNodeBootIncarnation surfaces concurrent twin refusal');
  t.equal(casRacedOwner.registrationIssueRecord.issuedAtIncarnation, null);
});

test('M1-1B: transient observe + insert + reread failure leaves the same ' +
  'NodeRegistrationOwner unpoisoned for its next retry', async (t) => {
  const stoppedLife1 = earlierLifeRow({[COLUMN.STATUS]: NODE_STATE.STOPPED});
  const durable = createDurableNodes(stoppedLife1);
  let authorityDown = true;
  durable.gateway.readAuthoritativeRows = async () =>
    authorityDown ?
      {success: false, error: 'leader_not_ready'} :
      {success: true, rows: [{...stoppedLife1}]};
  durable.gateway.insertSystemTableRow = async () => ({
    success: false,
    error: 'No leader available for write',
  });
  const owner = createFreshStorageOwner(durable, THIS_BOOT);
  owner.readAuthoritativeDurableRejoinNodeRow = async () =>
    (authorityDown ? null : {...stoppedLife1});

  const firstErr = await t.rejects(owner.registerNodeInCluster());
  t.match(firstErr?.message || '', /No leader available/,
    'first attempt fails transiently while authority is down');
  t.equal(owner.registrationIssueRecord.issuedAtIncarnation, null,
    'transient unapplied attempt leaves issuedAtIncarnation null');

  authorityDown = false;
  const secondErr = await t.rejects(owner.registerNodeInCluster());
  t.equal(secondErr?.code, STALE_NODE_INCARNATION_CODE,
    'retry on the same owner refuses Life 1 STOPPED row as STALE, not CURRENT');
  t.equal(secondErr?.knownIncarnation, THIS_BOOT);
});

// ---------------------------------------------------------------------------
// R2-1 (4A, 4B, 4C) + R2-2a: cross-call same-lifecycle retry after lost ACK +
// failed inline readback settles via R07 named indeterminate state instead of
// self-fencing as REFUSED_STALE / STALE_NODE_INCARNATION.

test('R2-1 (4A) + R2-2a: cross-call authoritative OLDER advance after lost ' +
  'ACK + unavailable inline reread promotes on healed retry, while address ' +
  'or host mismatch refuses stale', async (t) => {
  const attemptedRow = {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
    [COLUMN.STATUS]: NODE_STATE.JOINING,
    [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
  };
  let committedRow = previousBootRow({[COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID});
  let advanceCalls = 0;
  let observeCalls = 0;
  const issueRecord = createNodeRegistrationIssueRecord();

  const callRegistration = () => writeNodeRegistrationAtIncarnation({
    row: attemptedRow,
    bootIncarnation: THIS_BOOT,
    issueRecord,
    nowMs: NOW,
    observe: async () => {
      observeCalls += 1;
      if (observeCalls === 2) {
        return {available: false, row: null};
      }
      return {available: true, row: committedRow ? {...committedRow} : null};
    },
    insert: async () => ({success: true, partitionResult: {affectedRows: 1}}),
    advance: async (_where, stamped) => {
      advanceCalls += 1;
      committedRow = {
        ...stamped,
        [COLUMN.UPDATED_AT_HLC]: '1710000000000-004a-nodes',
      };
      throw new Error('acknowledgement lost');
    },
  });

  const first = await callRegistration();
  t.equal(first.outcome, NODE_REGISTRATION_OUTCOME.UNRESOLVED,
    'Call 1 ends UNRESOLVED when both ACK and inline reread fail');
  t.equal(issueRecord.issuedAtIncarnation, null);
  t.equal(issueRecord.indeterminateMode, ISSUE_INDETERMINATE_MODE.AUTHORITATIVE);
  t.equal(issueRecord.indeterminateAtIncarnation, THIS_BOOT);
  t.same(issueRecord.indeterminateRow, {
    [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
    [COLUMN.STATUS]: NODE_STATE.JOINING,
    [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
  });

  const second = await callRegistration();
  t.equal(second.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
    'healed Call 2 promotes authoritative indeterminate issue to ACCEPTED');
  t.equal(second.originHlc, '1710000000000-004a-nodes',
    'healed Call 2 preserves committed updated_at_hlc');
  t.equal(advanceCalls, 1, 'no duplicate CAS write on Call 2');
  t.equal(issueRecord.issuedAtIncarnation, THIS_BOOT);
  t.equal(issueRecord.indeterminateMode, null);
  t.equal(issueRecord.indeterminateAtIncarnation, null);
  t.equal(issueRecord.indeterminateRow, null);

  // R2-2a: a row at THIS_BOOT whose node_address differs does NOT match the
  // pending indeterminate attempt and is refused stale.
  t.equal(
    matchesIndeterminateAttemptRow(
      attemptedRow,
      {
        ...attemptedRow,
        [COLUMN.BOOT_INCARNATION]: THIS_BOOT,
        [COLUMN.NODE_ADDRESS]: 'twin-host:9090',
      },
      THIS_BOOT,
    ),
    false,
    'R2-2a: mismatched node_address rejects indeterminate promotion',
  );
  const mismatchedIssue = createNodeRegistrationIssueRecord();
  let mismatchObs = 0;
  await writeNodeRegistrationAtIncarnation({
    row: attemptedRow,
    bootIncarnation: THIS_BOOT,
    issueRecord: mismatchedIssue,
    nowMs: NOW,
    observe: async () => {
      mismatchObs += 1;
      return mismatchObs === 1 ?
        {available: true, row: previousBootRow()} :
        {available: false, row: null};
    },
    insert: async () => ({success: true, partitionResult: {affectedRows: 1}}),
    advance: async () => {
      throw new Error('acknowledgement lost');
    },
  });
  const mismatchedRetry = await writeNodeRegistrationAtIncarnation({
    row: attemptedRow,
    bootIncarnation: THIS_BOOT,
    issueRecord: mismatchedIssue,
    nowMs: NOW,
    observe: async () => ({
      available: true,
      row: {
        ...attemptedRow,
        [COLUMN.BOOT_INCARNATION]: THIS_BOOT,
        [COLUMN.NODE_ADDRESS]: 'twin-host:9090',
      },
    }),
    insert: async () => ({success: true, partitionResult: {affectedRows: 1}}),
    advance: async () => ({success: true, partitionResult: {affectedRows: 0}}),
  });
  t.equal(mismatchedRetry.outcome, NODE_REGISTRATION_OUTCOME.REFUSED_STALE,
    'mismatched node_address on Call 2 clears indeterminate state and refuses');
  t.equal(mismatchedIssue.issuedAtIncarnation, null);
  t.equal(mismatchedIssue.indeterminateMode, null);

  // Continuing read outage across Call 2: an unresolved authoritative advance
  // must not fall into a blind birth INSERT that clears or overwrites the
  // pending AUTHORITATIVE issue record before reads recover on Call 3.
  const outageIssue = createNodeRegistrationIssueRecord();
  let outageReads = 0;
  let outageInserts = 0;
  let outageAdvances = 0;
  const outageCall1 = await writeNodeRegistrationAtIncarnation({
    row: attemptedRow,
    bootIncarnation: THIS_BOOT,
    issueRecord: outageIssue,
    nowMs: NOW,
    observe: async () => {
      outageReads += 1;
      return outageReads === 1 ?
        {available: true, row: previousBootRow()} :
        {available: false, row: null};
    },
    insert: async () => {
      outageInserts += 1;
      throw Object.assign(new Error('UNIQUE constraint failed: nodes.node_id'),
        {code: 'SQLITE_CONSTRAINT_UNIQUE'});
    },
    advance: async () => {
      outageAdvances += 1;
      throw new Error('acknowledgement lost after durable CAS commit');
    },
  });
  t.equal(outageCall1.outcome, NODE_REGISTRATION_OUTCOME.UNRESOLVED);
  t.equal(outageIssue.indeterminateMode, ISSUE_INDETERMINATE_MODE.AUTHORITATIVE);

  const outageCall2 = await writeNodeRegistrationAtIncarnation({
    row: attemptedRow,
    bootIncarnation: THIS_BOOT,
    issueRecord: outageIssue,
    nowMs: NOW,
    observe: async () => ({available: false, row: null}),
    insert: async () => {
      outageInserts += 1;
      throw Object.assign(new Error('UNIQUE constraint failed: nodes.node_id'),
        {code: 'SQLITE_CONSTRAINT_UNIQUE'});
    },
    advance: async () => {
      outageAdvances += 1;
      return {success: true, partitionResult: {affectedRows: 0}};
    },
  });
  t.equal(outageCall2.outcome, NODE_REGISTRATION_OUTCOME.UNRESOLVED,
    'continuing read outage remains UNRESOLVED without attempting blind birth');
  t.equal(outageInserts, 0, 'no blind birth INSERT attempted while authoritative issue is pending');
  t.equal(outageIssue.indeterminateMode, ISSUE_INDETERMINATE_MODE.AUTHORITATIVE,
    'pending AUTHORITATIVE issue record survives continuing read outage');

  const outageCall3 = await writeNodeRegistrationAtIncarnation({
    row: attemptedRow,
    bootIncarnation: THIS_BOOT,
    issueRecord: outageIssue,
    nowMs: NOW,
    observe: async () => ({
      available: true,
      row: {...attemptedRow, [COLUMN.BOOT_INCARNATION]: THIS_BOOT},
    }),
    insert: async () => ({success: true, partitionResult: {affectedRows: 1}}),
    advance: async () => ({success: true, partitionResult: {affectedRows: 0}}),
  });
  t.equal(outageCall3.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
    'when reads recover on Call 3, the preserved authoritative attempt settles as ACCEPTED');
  t.equal(outageIssue.issuedAtIncarnation, THIS_BOOT);
  t.equal(outageIssue.indeterminateMode, null);
  t.equal(outageAdvances, 1, 'no second advance CAS was needed');
});

test('R2-1 (4B): intact DURABLE_REJOIN lost-ACK + unavailable readback ' +
  'recovers on healed Call 2 on the same NodeRegistrationOwner', async (t) => {
  const durable = createDurableNodes(previousBootRow({
    [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
    [COLUMN.UPDATED_AT_HLC]: '1710000000000-0000-prev',
  }));
  let nodesUpdates = 0;
  let loseAckOnce = true;
  let failReadbackOnce = false;
  const rawUpdate = durable.gateway.updateSystemTableRow;
  attachOriginHlcStamping(durable.gateway, {prefix: '1710000000000-004b-'});
  const stampedUpdate = durable.gateway.updateSystemTableRow;
  durable.gateway.updateSystemTableRow = async (tableName, whereClause, data) => {
    const res = await stampedUpdate(tableName, whereClause, data);
    if (tableName === TABLES.NODES) {
      if (res?.originHlc) {
        await rawUpdate(tableName, {[COLUMN.NODE_ID]: NODE_ID},
          {[COLUMN.UPDATED_AT_HLC]: res.originHlc});
      }
      nodesUpdates += 1;
      if (loseAckOnce) {
        loseAckOnce = false;
        failReadbackOnce = true;
        throw new Error('acknowledgement lost after durable CAS commit');
      }
    }
    return res;
  };

  const owner = createRejoiningOwner(durable, THIS_BOOT);
  owner.readAuthoritativeDurableRejoinNodeRow = async () => {
    if (failReadbackOnce) {
      failReadbackOnce = false;
      throw buildAuthoritativeRowSourceUnavailableError(TABLES.NODES);
    }
    return durable.current() ? {...durable.current()} : null;
  };

  const firstErr = await t.rejects(owner.registerNodeInCluster());
  t.equal(firstErr?.deferRetry, true, 'Call 1 defers when inline readback fails');
  t.equal(owner.registrationIssueRecord.issuedAtIncarnation, null);
  t.equal(owner.registrationIssueRecord.indeterminateMode,
    ISSUE_INDETERMINATE_MODE.AUTHORITATIVE);
  t.equal(owner.registrationIssueRecord.indeterminateAtIncarnation, THIS_BOOT);

  const second = await owner.registerNodeInCluster();
  t.equal(second?.reusedExistingMembership, true,
    'healed Call 2 on the same NodeRegistrationOwner succeeds');
  t.equal(nodesUpdates, 1, 'exactly one NODES CAS write across both calls');
  t.equal(owner.registrationIssueRecord.issuedAtIncarnation, THIS_BOOT);
  t.equal(owner.registrationIssueRecord.indeterminateMode, null);
  t.equal(second.nodeRow?.[COLUMN.UPDATED_AT_HLC],
    `1710000000000-004b-1-${TABLES.NODES}`,
    'Call 2 preserves the committed updated_at_hlc from Call 1');
  t.same(durable.endpoints().map((row) => row[COLUMN.BOOT_INCARNATION]),
    [THIS_BOOT, THIS_BOOT]);
});

function createBlindBirthReplayHarness(initialRow) {
  const base = createDurableNodes(initialRow);
  const outcomesByKey = new Map();
  let authorityDown = true;
  let dropInsertAckOnce = true;
  let physicalInserts = 0;

  const readStoredRows = base.gateway.readAuthoritativeRows;
  base.gateway.readAuthoritativeRows = async (tableName = TABLES.NODES, _sql, params = []) => {
    if (tableName === TABLES.NODES && authorityDown) {
      return {success: false, error: 'leader_not_ready'};
    }
    const stored = await readStoredRows(tableName);
    const keyColumn = tableName === TABLES.NODES ? COLUMN.NODE_ID : COLUMN.ENDPOINT_ID;
    const rows = params.length === 0 ? stored.rows :
      stored.rows.filter((row) => row[keyColumn] === params[0]);
    return {...stored, rows, rowSetComplete: true};
  };

  const rawInsert = base.gateway.insertSystemTableRow;
  base.gateway.insertSystemTableRow = (tableName, row, options = {}) => {
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    return runControlPlaneWrite(options, {tableName, row}, {id: tableName, partitionId},
      async ({row}, idempotencyKey) => {
        const entryId = deriveParticipantEntryId(idempotencyKey, partitionId);
        if (tableName !== TABLES.NODES) {
          const inserted = await rawInsert(tableName, row);
          return {...inserted, committed: true,
            partitionResult: {...inserted.partitionResult, success: inserted.success, partitionId,
              durableCommitWitness: {partitionId, entryId, term: 1, logIndex: 1}}};
        }
        let replayed = true;
        if (!outcomesByKey.has(idempotencyKey)) {
          replayed = false;
          physicalInserts += 1;
          if (base.current()) {
            outcomesByKey.set(idempotencyKey, {
              success: false,
              error: 'UNIQUE constraint failed: nodes.node_id',
              failureCode: 'SQLITE_CONSTRAINT_PRIMARYKEY',
              outcome: 'statement_failed', committed: true, logIndex: 1, partitionId, entryId,
            });
          } else {
            await rawInsert(tableName, {
              ...row,
              [COLUMN.UPDATED_AT_HLC]: '1710000000000-004c-nodes',
            });
            outcomesByKey.set(idempotencyKey, {
              success: true, committed: true,
              originHlc: '1710000000000-004c-nodes',
              partitionResult: {
                success: true, partitionId,
                durableCommitWitness: {partitionId, entryId, term: 1, logIndex: 1},
                affectedRows: 1,
                originHlc: '1710000000000-004c-nodes',
              },
            });
          }
        }
        if (dropInsertAckOnce) {
          dropInsertAckOnce = false;
          return {
            success: false,
            error: 'write_outcome_unknown',
            failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
            entryId, partitionId,
          };
        }
        const stored = outcomesByKey.get(idempotencyKey);
        return replayed && stored.success ?
          {...stored, settledReplay: 'outcome_retained'} :
          {...stored};
      });
  };

  return {
    durable: base,
    setAuthorityDown: (down) => {
      authorityDown = down;
    },
    getPhysicalInserts: () => physicalInserts,
  };
}

test('R2-1 (4C): blind BIRTH lost-ACK + unavailable reread replays held ' +
  'writeIdentity when observe heals (ACCEPTED if ours, REFUSED_STALE if ' +
  'foreign wiped life)', async (t) => {
  // 4C-ours: blind BIRTH commits on Call 1, ACK + reread fail; on Call 2
  // authority heals AND fence allows progress reuse AND clock advances (rebuilt
  // row digest), yet pending blind_birth forces registerJoinNodeRow -> replay!
  const ours = createBlindBirthReplayHarness(null);
  const oursOwner = createFreshStorageOwner(ours.durable, THIS_BOOT);
  let fenceAllowed = false;
  oursOwner.delegates.getClusterIncarnationFence = () =>
    (fenceAllowed ? {allowed: true} : null);

  const firstOursErr = await t.rejects(oursOwner.registerNodeInCluster());
  t.match(firstOursErr?.message || '', /write_outcome_unknown/);
  t.equal(oursOwner.registrationIssueRecord.issuedAtIncarnation, null);
  t.equal(oursOwner.registrationIssueRecord.indeterminateMode,
    ISSUE_INDETERMINATE_MODE.BLIND_BIRTH);
  t.equal(oursOwner.registrationIssueRecord.indeterminateAtIncarnation,
    THIS_BOOT);
  t.equal(oursOwner.registrationIssueRecord.indeterminateRow, null);

  ours.setAuthorityDown(false);
  fenceAllowed = true;
  oursOwner.delegates.getNow = () => () => NOW + 5_000;
  const secondOurs = await oursOwner.registerNodeInCluster();
  t.equal(secondOurs.nodeRow?.[COLUMN.BOOT_INCARNATION], THIS_BOOT);
  t.equal(secondOurs.nodeRow?.[COLUMN.UPDATED_AT_HLC],
    '1710000000000-004c-nodes',
    '4C-ours preserves Call 1 committed updated_at_hlc');
  t.equal(ours.getPhysicalInserts(), 1,
    '4C-ours executes one physical INSERT and settles Call 2 by replay');
  const nodeEndpoints = await ours.durable.gateway.readAuthoritativeRows(TABLES.NODE_ENDPOINTS);
  t.same(nodeEndpoints.rows.map((row) =>
    [row[COLUMN.ENDPOINT_ID], row[COLUMN.BOOT_INCARNATION]]), [[`ep-${NODE_ID}-ws`, THIS_BOOT]],
  'the healed boot owns its WebSocket endpoint');
  const serviceEndpoints = await ours.durable.gateway.readAuthoritativeRows(
    TABLES.SERVICE_ENDPOINTS);
  t.same(serviceEndpoints.rows.map((row) =>
    [row[COLUMN.SERVICE_ID], row[COLUMN.ENDPOINT_ID], row[COLUMN.BOOT_INCARNATION]]), [
    [META_SERVICE_ID.WASM_META, `${META_SERVICE_ID.WASM_META}-ep-${NODE_ID}`, THIS_BOOT],
    [META_SERVICE_ID.ADMIN_META, `${META_SERVICE_ID.ADMIN_META}-ep-${NODE_ID}`, THIS_BOOT],
  ], 'the healed boot owns both boot-time meta service endpoints');
  t.equal(oursOwner.registrationIssueRecord.issuedAtIncarnation, THIS_BOOT);
  t.equal(oursOwner.registrationIssueRecord.indeterminateMode, null);

  // 4C-foreign: wiped Life 1 already holds node_id at THIS_BOOT (even with
  // identical host_id, node_address, and JOINING status); Call 1 blind BIRTH
  // loses ACK before hearing UNIQUE; healed Call 2 replays writeIdentity,
  // settles unapplied, and refuses STALE_NODE_INCARNATION!
  const foreignRow = earlierLifeRow({
    [COLUMN.STATUS]: NODE_STATE.JOINING,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
    [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
  });
  const foreign = createBlindBirthReplayHarness(foreignRow);
  const foreignOwner = createFreshStorageOwner(foreign.durable, THIS_BOOT);
  let foreignFenceAllowed = false;
  foreignOwner.delegates.getClusterIncarnationFence = () =>
    (foreignFenceAllowed ? {allowed: true} : null);

  await t.rejects(foreignOwner.registerNodeInCluster(), /write_outcome_unknown/);
  t.equal(foreignOwner.registrationIssueRecord.indeterminateMode,
    ISSUE_INDETERMINATE_MODE.BLIND_BIRTH);

  foreign.setAuthorityDown(false);
  foreignFenceAllowed = true;
  const foreignErr = await t.rejects(foreignOwner.registerNodeInCluster());
  t.equal(foreignErr?.code, STALE_NODE_INCARNATION_CODE,
    '4C-foreign refuses wiped Life 1 row as STALE after writeIdentity replay');
  t.equal(foreignErr?.knownIncarnation, THIS_BOOT);
  t.equal(foreignOwner.registrationIssueRecord.issuedAtIncarnation, null);
  t.equal(foreignOwner.registrationIssueRecord.indeterminateMode, null);
  t.same(foreign.durable.current(), foreignRow, 'the unrelated NODES owner stays intact');
});

// ---------------------------------------------------------------------------
// M3.2 + M4.2 + M4.3: strict parameter/issueRecord validation and T3/T5/storage
// witnesses.

test('M3.2 + M4.2 + R2-2b: issueRecord rejects missing, malformed, Proxy, ' +
  'getter and inconsistent 4-field tuples; clock requires non-negative safe ' +
  'integer and rejects -0/floats/negatives',
async (t) => {
  const validRecord = createNodeRegistrationIssueRecord();
  t.equal(Object.isSealed(validRecord), true, 'issueRecord is sealed');
  const proxyRecord = new Proxy(createNodeRegistrationIssueRecord(), {});
  const getterRecord = {
    indeterminateAtIncarnation: null,
    indeterminateMode: null,
    indeterminateRow: null,
  };
  Object.defineProperty(getterRecord, 'issuedAtIncarnation', {
    get: () => null,
    set: () => {},
    enumerable: true,
  });
  const frozenRecord = Object.freeze({
    issuedAtIncarnation: null,
    indeterminateAtIncarnation: null,
    indeterminateMode: null,
    indeterminateRow: null,
  });

  for (const badRecord of [
    undefined,
    null,
    {},
    {issuedAtIncarnation: null},
    {...createNodeRegistrationIssueRecord(), issuedAtIncarnation: 0},
    {...createNodeRegistrationIssueRecord(), issuedAtIncarnation: -1},
    {...createNodeRegistrationIssueRecord(), indeterminateMode: 'bogus'},
    {...createNodeRegistrationIssueRecord(), indeterminateAtIncarnation: 3},
    {
      ...createNodeRegistrationIssueRecord(),
      indeterminateMode: ISSUE_INDETERMINATE_MODE.BLIND_BIRTH,
      indeterminateAtIncarnation: 3,
      indeterminateRow: {[COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID},
    },
    {
      ...createNodeRegistrationIssueRecord(),
      indeterminateMode: ISSUE_INDETERMINATE_MODE.AUTHORITATIVE,
      indeterminateAtIncarnation: 3,
      indeterminateRow: null,
    },
    proxyRecord,
    getterRecord,
    frozenRecord,
  ]) {
    t.throws(
      () => classifyNodeIncarnationRelation(null, THIS_BOOT, badRecord),
      {code: NODE_REGISTRATION_ISSUE_RECORD_REQUIRED},
    );
    t.throws(
      () => recordNodeRegistrationIssue(badRecord, THIS_BOOT),
      {code: NODE_REGISTRATION_ISSUE_RECORD_REQUIRED},
    );
  }

  // R2-2b: requireRegistrationClockReading accepts 0 and positive safe
  // integers, while rejecting -0, negatives, floats, and > MAX_SAFE_INTEGER.
  t.equal(requireRegistrationClockReading(0), 0);
  t.equal(requireRegistrationClockReading(NOW), NOW);
  for (const badClock of [
    undefined,
    null,
    -0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '1000',
  ]) {
    t.throws(
      () => requireRegistrationClockReading(badClock),
      {code: NODE_REGISTRATION_CLOCK_REQUIRED},
    );
  }

  for (const badIncarnation of [0, -1, 1.5, Number.NaN, '1', null]) {
    t.throws(
      () => classifyNodeIncarnationRelation(null, badIncarnation, validRecord),
      {code: NODE_REGISTRATION_INCARNATION_REQUIRED},
    );
    t.throws(
      () => recordNodeRegistrationIssue(validRecord, badIncarnation),
      {code: NODE_REGISTRATION_INCARNATION_REQUIRED},
    );
  }

  await t.rejects(
    writeNodeRegistrationAtIncarnation({
      row: {[COLUMN.NODE_ID]: NODE_ID, [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID},
      bootIncarnation: THIS_BOOT,
      issueRecord: createNodeRegistrationIssueRecord(),
      nowMs: undefined,
      observe: async () => ({available: true, row: null}),
      insert: async () => ({success: true, partitionResult: {affectedRows: 1}}),
      advance: async () => ({success: true, partitionResult: {affectedRows: 0}}),
    }),
    {code: NODE_REGISTRATION_CLOCK_REQUIRED},
  );
  await t.rejects(
    writeNodeRegistrationAtIncarnation({
      row: {[COLUMN.NODE_ID]: NODE_ID},
      bootIncarnation: THIS_BOOT,
      issueRecord: createNodeRegistrationIssueRecord(),
      nowMs: NOW,
      observe: async () => ({available: true, row: null}),
      insert: async () => ({success: true, partitionResult: {affectedRows: 1}}),
      advance: async () => ({success: true, partitionResult: {affectedRows: 0}}),
    }),
    {code: NODE_HOST_ID_ERROR_CODE.REQUIRED},
  );
  t.throws(
    () => buildSupersededRegistrationError({
      nodeId: NODE_ID,
      receivedIncarnation: THIS_BOOT,
      observedRow: earlierLifeRow(),
      declaredHostId: LOCAL_MACHINE_HOST_ID,
      nowMs: Number.NaN,
    }),
    {code: NODE_REGISTRATION_CLOCK_REQUIRED},
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  t.teardown(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  const budgetService = new NodeStorageBudgetService({
    nodeId: NODE_ID,
    cdcIntegrationService: {upsertSystemTableRow: async () => ({success: true})},
  });
  budgetService.initialize({
    nodeId: NODE_ID,
    cdcIntegrationService: budgetService.cdcIntegrationService,
  });
  await t.rejects(
    budgetService.registerNodeBudget({
      nodeRow: earlierLifeRow(),
      issueRecord: createNodeRegistrationIssueRecord(),
    }),
    {code: NODE_REGISTRATION_CLOCK_REQUIRED},
  );
});
