/**
 * Durable rejoin reaches READY: the registration / durable-rejoin verb owns
 * the boot-incarnation transition (one CAS on the observed older incarnation
 * writing this boot's), so the lifecycle owner's READY CAS for this boot can
 * match. Without the advance the READY CAS could never apply.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeRegistrationOwner} from
  '../../src/bootstrap/shared/node-registration-owner.js';
import {buildNodeRegistrationRow} from
  '../../src/bootstrap/shared/node-registration-owner-row-builder.js';
import {getSchemaByTableName} from
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
  NODE_IDENTITY_TWIN_SUSPECTED,
  NODE_REGISTRATION_CLOCK_REQUIRED,
  NODE_REGISTRATION_INCARNATION_REQUIRED,
  NODE_REGISTRATION_ISSUE_RECORD_REQUIRED,
  NODE_REGISTRATION_OUTCOME,
  buildSupersededRegistrationError,
  classifyNodeIncarnationRelation,
  createNodeRegistrationIssueRecord,
  recordNodeRegistrationIssue,
  writeNodeRegistrationAtIncarnation,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {buildClusterIncarnationFence} from
  '../../src/bootstrap/cluster-incarnation-fence.js';
import {
  PARTITION_REPLICA_STORAGE_STATE,
  getPartitionDbPath,
  readPartitionReplicaStorageState,
} from '../../src/storage/data-directory-manager.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {NodeStorageBudgetService} from
  '../../src/rebalancer/node-storage-budget-service.js';
import {NODE_HOST_ID_ERROR_CODE} from '../../src/topology/node-host-identity.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  COLUMN,
  NODE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';

const NODE_ID = 'node-durable-rejoin';
const NODE_ADDRESS = 'rejoin-host:8080';
const NOW = 1_710_000_000_000;
const PREVIOUS_BOOT = 2;
const THIS_BOOT = 3;

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

function publishReady(durable) {
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
  });
}

test('durable rejoin advances the boot incarnation and the new boot reaches ' +
  'READY', async (t) => {
  const durable = createDurableNodes(previousBootRow());

  const result = await createRejoiningOwner(durable).registerNodeInCluster();
  t.equal(result?.reusedExistingMembership, true,
    'the durable membership is reused');
  t.match(durable.current(), {
    [COLUMN.BOOT_INCARNATION]: THIS_BOOT,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.READY_LEASE_EXPIRES_AT]: null,
  }, 'reentry writes this boot incarnation with a cleared lease');
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
  const registered = JSON.stringify(durable.current());

  // The registration retry loop re-enters later in the same boot.
  owner.delegates.getNow = () => () => NOW + 5_000;
  const again = await owner.registerNodeInCluster();
  t.equal(again?.reusedExistingMembership, true);
  t.equal(nodeWrites.length, 1,
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
// M3.2 + M4.2 + M4.3: strict parameter/issueRecord validation and T3/T5/storage
// witnesses.

test('M3.2 + M4.2: issueRecord rejects missing, malformed, Proxy and getter ' +
  'shapes; clock and declaredHostId are required across D-7 entrypoints',
async (t) => {
  const validRecord = createNodeRegistrationIssueRecord();
  const proxyRecord = new Proxy(createNodeRegistrationIssueRecord(), {});
  const getterRecord = {};
  Object.defineProperty(getterRecord, 'issuedAtIncarnation', {
    get: () => null,
    set: () => {},
    enumerable: true,
  });
  const frozenRecord = Object.freeze({issuedAtIncarnation: null});

  for (const badRecord of [
    undefined,
    null,
    {},
    {issuedAtIncarnation: 0},
    {issuedAtIncarnation: -1},
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

test('M4.3: readPartitionReplicaStorageState, T3 ownerIncarnation seal, and ' +
  'T5 NODES row schema subset', async (t) => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'lagrange-storage-state-'));
  t.teardown(() => fs.rmSync(tmpDir, {recursive: true, force: true}));

  t.equal(
    readPartitionReplicaStorageState(tmpDir, 'p1', 'rep-missing'),
    PARTITION_REPLICA_STORAGE_STATE.ABSENT,
    'ENOENT classifies as ABSENT',
  );
  const dbPath = getPartitionDbPath(tmpDir, 'p1', 'rep-present');
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  fs.writeFileSync(dbPath, '');
  t.equal(
    readPartitionReplicaStorageState(tmpDir, 'p1', 'rep-present'),
    PARTITION_REPLICA_STORAGE_STATE.PRESENT,
    'existing replica db classifies as PRESENT',
  );
  const blockerFile = path.join(tmpDir, 'partitions', 'p-not-dir');
  fs.mkdirSync(path.dirname(blockerFile), {recursive: true});
  fs.writeFileSync(blockerFile, 'not-a-directory');
  t.throws(
    () => readPartitionReplicaStorageState(tmpDir, 'p-not-dir', 'rep-err'),
    {code: 'ENOTDIR'},
    'non-ENOENT filesystem failure rethrows instead of collapsing to ABSENT',
  );

  // T3: ReplicaStateMachine.ownerIncarnation is non-configurable and read-only.
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  t.teardown(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  const rsm = new ReplicaStateMachine({
    nodeId: NODE_ID,
    ownerIncarnation: THIS_BOOT,
    cdcIntegrationService: {},
  });
  const desc = Object.getOwnPropertyDescriptor(rsm, 'ownerIncarnation');
  t.equal(desc?.value, THIS_BOOT);
  t.equal(desc?.writable, false);
  t.equal(desc?.configurable, false);
  t.throws(() => Object.defineProperty(rsm, 'ownerIncarnation', {value: 99}),
    TypeError);
  t.throws(() => {
    rsm.ownerIncarnation = 99;
  }, TypeError);

  // T5: buildNodeRegistrationRow keys are a strict subset of NODES schema.
  const schemaColumns = new Set(
    getSchemaByTableName(TABLES.NODES).columns.map((column) => column.name),
  );
  const rowKeys = Object.keys(buildNodeRegistrationRow({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    hostId: LOCAL_MACHINE_HOST_ID,
    nodeCapabilities: [],
    bootIncarnation: THIS_BOOT,
    now: NOW,
  }));
  t.same(
    rowKeys.filter((key) => !schemaColumns.has(key)),
    [],
    'every buildNodeRegistrationRow column belongs to the NODES schema',
  );
  t.equal(rowKeys.includes('storage_incarnation'), false);
});
