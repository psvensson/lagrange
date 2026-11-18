/**
 * Durable rejoin reaches READY: the registration / durable-rejoin verb owns
 * the boot-incarnation transition (one CAS on the observed older incarnation
 * writing this boot's), so the lifecycle owner's READY CAS for this boot can
 * match. Without the advance the READY CAS could never apply.
 */
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import {test} from '../../src/test-helpers/tap.js';
import {NodeRegistrationOwner} from
  '../../src/bootstrap/shared/node-registration-owner.js';
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
import {NODE_REGISTRATION_OUTCOME} from
  '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {ServicesOwner} from
  '../../src/control-plane/owners/services-owner.js';
import {buildClusterIncarnationFence} from
  '../../src/bootstrap/cluster-incarnation-fence.js';
import {
  syncNodeJoiningBootIncarnation,
} from '../../src/bootstrap/node-joining-delegate-bundles.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NODE_STATE,
  SERVICE_STATUS,
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
function createDurableNodes(initialRow) {
  const tables = new Map([
    [TABLES.NODES, new Map([[initialRow[COLUMN.NODE_ID], {...initialRow}]])],
    [TABLES.NODE_ENDPOINTS, new Map([['ep', {endpoint_id: 'ep',
      node_id: NODE_ID, address: 'ws://rejoin:8082',
      boot_incarnation: initialRow[COLUMN.BOOT_INCARNATION]}]])],
    [TABLES.SERVICE_ENDPOINTS, new Map([['svc-postgres-wire', {
      endpoint_id: 'svc-postgres-wire', node_id: NODE_ID,
      address: 'rejoin', boot_incarnation: initialRow[COLUMN.BOOT_INCARNATION],
    }]])],
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
    current: () => rowsOf(TABLES.NODES).get(initialRow[COLUMN.NODE_ID]),
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
      getJoinLifecycleIntentType: () =>
        MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
      getClusterIncarnationFence: () => ({allowed: true}),
    },
  });
  owner.seedJoinTimeCacheRow = () => {};
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

const TEST_WS_PORT = 8082;
const TEST_UNAVAILABLE_READ_ROWS = async () => ({
  success: false,
  error: 'authoritative_row_source_unavailable',
});

function createWipedStorageDelegates() {
  return {
    getLogger: () => ({info() {}, warn() {}, error() {}}),
    getNow: () => () => NOW,
    getSleep: () => async () => {},
    getNodeCapabilities: () => [],
    getWsPort: () => TEST_WS_PORT,
    getWirePort: () => null,
    getBootIncarnation: () => 1,
    getNodeStorageBudgetService: () => ({
      resolveBudgetRow: (nodeRow) => ({
        budgetRow: {
          ...nodeRow,
          storage_budget_bytes: 1024,
          storage_budget_source: 'test',
          storage_budget_updated_at: nodeRow[COLUMN.CREATED_AT],
        },
        resolution: {
          isValid: true,
          budgetBytes: 1024,
          source: 'test',
          diskBytes: 1024,
        },
      }),
    }),
    getCdcIntegrationService: () => ({
      sqlQueryEngine: {},
      executeAuthoritativeSystemTableRead: async () => ({
        success: true,
        rows: [],
        source: 'owner_rpc_lane',
      }),
    }),
  };
}

function stubAuthoritativeViewReads(owner, readRows) {
  owner.getAuthoritativeControlPlaneView = () => ({
    canRead: () => true,
    readRows,
  });
}

function buildPublicationOwnerRecorder(calls) {
  return {
    registerJoinNodeAtIncarnation: async (row, bootIncarnation, options) => {
      calls.push({kind: 'node', row, bootIncarnation, options});
      return {
        outcome: NODE_REGISTRATION_OUTCOME.ACCEPTED,
        observedRow: null,
        error: null,
      };
    },
    writeJoinEndpointAtIncarnation: async (
      tableName,
      row,
      bootIncarnation,
      options,
    ) => {
      calls.push({
        kind:
          tableName === TABLES.NODE_ENDPOINTS ?
            'node_endpoint' :
            'service_endpoint',
        tableName,
        row,
        bootIncarnation,
        options,
      });
      return {outcome: 'applied', result: {success: true}};
    },
  };
}

async function captureReconcileLostStorageError(owner) {
  try {
    await owner.reconcileLostStoragePartitionReplicas(NOW);
    return null;
  } catch (error) {
    return error;
  }
}

async function assertWipedStorageReconciliationFailureModes(t, owner) {
  const unappliedSeededRows = [];
  const unappliedServicesOwner = new ServicesOwner({
    controlPlaneSystemTableGateway: {
      updateSystemTableRow: async () => ({
        success: true,
        changes: 0,
        partitionResult: {affectedRows: 0},
      }),
    },
  });
  owner.membershipPublicationRuntimeOwner = {
    ...buildPublicationOwnerRecorder([]),
    servicesOwner: unappliedServicesOwner,
  };
  owner.seedJoinTimeCacheRow = (tableName, row) => {
    unappliedSeededRows.push({tableName, row});
  };
  const unappliedError = await captureReconcileLostStorageError(owner);
  t.ok(
    unappliedError,
    'unapplied ServicesOwner.updateService result must throw',
  );
  t.equal(
    unappliedError?.deferRetry,
    true,
    'unapplied ServicesOwner.updateService error is retryable deferred',
  );
  t.equal(
    unappliedSeededRows.some((entry) => entry.tableName === TABLES.SERVICES),
    false,
    'local SERVICES cache is never seeded when authoritative update did not apply',
  );

  stubAuthoritativeViewReads(owner, TEST_UNAVAILABLE_READ_ROWS);
  const unavailableServicesError =
    await captureReconcileLostStorageError(owner);
  t.ok(
    unavailableServicesError,
    'unavailable authoritative SERVICES read must throw',
  );
  t.equal(
    unavailableServicesError?.authoritativeRowReadState,
    AUTHORITATIVE_ROW_READ_STATE.UNAVAILABLE,
    'unavailable SERVICES read surfaces typed UNAVAILABLE read state',
  );
}

test(
  'NodeRegistrationOwner advances wiped-storage bootIncarnation and ' +
  'storageIncarnation above cluster-observed incarnation when local ' +
  'boot reservation resets to 1, and updates lost SERVICES rows via ' +
  '4-argument ServicesOwner.updateService',
  async (t) => {
    const publicationCalls = [];
    const updateWhereCalls = [];
    const seededRows = [];
    let currentBootIncarnation = 1;
    let raisedFloor = null;
    const servicesOwner = new ServicesOwner({
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async (
          tableName,
          whereClause,
          data,
          options,
        ) => {
          updateWhereCalls.push({tableName, whereClause, data, options});
          return {
            success: true,
            changes: 1,
            partitionResult: {affectedRows: 1},
          };
        },
      },
    });
    const membershipPublicationRuntimeOwner = {
      ...buildPublicationOwnerRecorder(publicationCalls),
      servicesOwner,
    };
    const owner = new NodeRegistrationOwner({
      hostId: LOCAL_MACHINE_HOST_ID,
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      membershipPublicationRuntimeOwner,
      delegates: {
        ...createWipedStorageDelegates(),
        getBootIncarnation: () => currentBootIncarnation,
        raiseBootIncarnationFloor: async (nextFloor) => {
          raisedFloor = nextFloor;
          currentBootIncarnation = nextFloor;
        },
        getJoinLifecycleIntentType: () =>
          MEMBERSHIP_LIFECYCLE_INTENT.FRESH_BOOT_ADMISSION,
        getClusterIncarnationFence: () =>
          buildClusterIncarnationFence({durableStateDetected: false}),
      },
    });
    owner.seedJoinTimeCacheRow = (tableName, row) => {
      seededRows.push({tableName, row});
    };
    stubAuthoritativeViewReads(owner, async (tableName) => {
      if (tableName === TABLES.NODES) {
        return {
          success: true,
          rows: [
            {
              [COLUMN.NODE_ID]: NODE_ID,
              [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
              [COLUMN.STATUS]: NODE_STATE.ACTIVE,
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.BOOT_INCARNATION]: 1,
              [COLUMN.CREATED_AT]: NOW - 5000,
              [COLUMN.LAST_HEARTBEAT]: NOW - 1000,
            },
          ],
        };
      }
      if (tableName === TABLES.NODE_ENDPOINTS) {
        return {
          success: true,
          rows: [
            {
              [COLUMN.ENDPOINT_ID]: `ep-${NODE_ID}-ws`,
              [COLUMN.NODE_ID]: NODE_ID,
              [COLUMN.TRANSPORT_TYPE]: 'websocket',
              [COLUMN.ADDRESS]: `ws://rejoin-host:${TEST_WS_PORT}`,
              [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
              [COLUMN.BOOT_INCARNATION]: 1,
              [COLUMN.METADATA]: JSON.stringify({storageIncarnation: 1}),
            },
          ],
        };
      }
      if (tableName === TABLES.SERVICES) {
        return {
          success: true,
          rows: [
            {
              [COLUMN.SERVICE_ID]: 'replica_operations-p1-r2',
              [COLUMN.REPLICA_ID]: 'replica_operations-p1-r2',
              [COLUMN.PARTITION_ID]: 'replica_operations-p1-r2',
              [COLUMN.NODE_ID]: NODE_ID,
              [COLUMN.SERVICE_TYPE]: 'partition',
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
              [COLUMN.RAFT_ROLE]: 'follower',
            },
          ],
        };
      }
      return {success: true, rows: []};
    });

    const result = await owner.registerNodeInCluster();

    t.equal(
      raisedFloor,
      2,
      'complete data-dir wipe resetting local boot to 1 advances floor to 2',
    );
    const nodeCalls = publicationCalls.filter((call) => call.kind === 'node');
    t.equal(
      nodeCalls.length,
      1,
      'wiped-storage registration must not reuse prior boot=1 NODES row',
    );
    t.equal(
      nodeCalls[0]?.row?.[COLUMN.BOOT_INCARNATION],
      2,
      'fresh NODES row publishes advanced boot_incarnation = 2',
    );
    const endpointCalls = publicationCalls.filter(
      (call) => call.kind === 'node_endpoint',
    );
    t.equal(
      JSON.parse(endpointCalls[0]?.row?.[COLUMN.METADATA] || '{}')
        .storageIncarnation,
      2,
      'fresh NODE_ENDPOINTS row publishes advanced storageIncarnation = 2',
    );
    t.equal(
      updateWhereCalls.length,
      1,
      'real ServicesOwner.updateService executes 4-argument updateWhere once',
    );
    t.same(
      updateWhereCalls[0]?.whereClause,
      {
        [COLUMN.SERVICE_ID]: 'replica_operations-p1-r2',
        [COLUMN.NODE_ID]: NODE_ID,
        [COLUMN.SERVICE_TYPE]: 'partition',
      },
      'ServicesOwner.updateService receives expectedIdentity in WHERE clause',
    );
    t.equal(
      updateWhereCalls[0]?.data?.[COLUMN.STATUS],
      'failed',
      'ServicesOwner.updateService receives FAILED row data in 3rd argument',
    );
    t.equal(
      result.lostStorageReplicas.length,
      1,
      'lostStorageReplicas reports the reconciled replica',
    );
    await assertWipedStorageReconciliationFailureModes(t, owner);
  },
);

test(
  'NodeRegistrationOwner preserves latched bootIncarnation and ' +
  'storageIncarnation across same-process retry after NODES write when ' +
  'NODE_ENDPOINTS fails transiently on attempt 1, and syncs runtime owners',
  async (t) => {
    const clusterStore = {
      [TABLES.NODES]: [
        {
          [COLUMN.NODE_ID]: NODE_ID,
          [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
          [COLUMN.STATUS]: NODE_STATE.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
          [COLUMN.BOOT_INCARNATION]: 1,
          [COLUMN.CREATED_AT]: NOW - 5000,
          [COLUMN.LAST_HEARTBEAT]: NOW - 1000,
        },
      ],
      [TABLES.NODE_ENDPOINTS]: [
        {
          [COLUMN.ENDPOINT_ID]: `ep-${NODE_ID}-ws`,
          [COLUMN.NODE_ID]: NODE_ID,
          [COLUMN.TRANSPORT_TYPE]: 'websocket',
          [COLUMN.ADDRESS]: `ws://rejoin-host:${TEST_WS_PORT}`,
          [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
          [COLUMN.BOOT_INCARNATION]: 1,
          [COLUMN.METADATA]: JSON.stringify({storageIncarnation: 1}),
        },
      ],
      [TABLES.SERVICE_ENDPOINTS]: [],
      [TABLES.SERVICES]: [
        {
          [COLUMN.SERVICE_ID]: 'replica_operations-p1-r2',
          [COLUMN.REPLICA_ID]: 'replica_operations-p1-r2',
          [COLUMN.PARTITION_ID]: 'replica_operations-p1-r2',
          [COLUMN.NODE_ID]: NODE_ID,
          [COLUMN.SERVICE_TYPE]: 'partition',
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.RAFT_ROLE]: 'follower',
        },
      ],
    };
    const runtimeSurface = {
      bootIncarnation: 1,
      nodeStatePublicationOwner: {bootIncarnation: 1},
      heartbeatService: {bootIncarnation: 1},
      messageRouter: {
        bootIncarnation: 1,
        syncedIncarnations: [],
        syncBootIncarnation(next) {
          this.bootIncarnation = next;
          this.syncedIncarnations.push(next);
          return this.bootIncarnation;
        },
      },
      messageGroupServiceHandler: {
        replicaCreateAdmissionOwner: {ownerIncarnation: 1},
      },
      rebalanceCoordinator: {
        repository: {membershipOwnerBootIncarnation: 1},
      },
    };
    const floorRaises = [];
    let endpointAttempts = 0;
    const nodeWrites = [];
    const endpointWrites = [];
    const servicesUpdates = [];
    const servicesOwner = new ServicesOwner({
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async (tableName, whereClause, data) => {
          servicesUpdates.push({tableName, whereClause, data});
          clusterStore[TABLES.SERVICES] = clusterStore[TABLES.SERVICES].map(
            (row) =>
              row[COLUMN.SERVICE_ID] === whereClause[COLUMN.SERVICE_ID] ?
                {...row, ...data} :
                row,
          );
          return {
            success: true,
            changes: 1,
            partitionResult: {affectedRows: 1},
          };
        },
      },
    });
    const membershipPublicationRuntimeOwner = {
      servicesOwner,
      registerJoinNodeAtIncarnation: async (row, bootIncarnation) => {
        const stamped = {...row, [COLUMN.BOOT_INCARNATION]: bootIncarnation};
        nodeWrites.push(stamped);
        clusterStore[TABLES.NODES] = [stamped];
        return {
          outcome: NODE_REGISTRATION_OUTCOME.ACCEPTED,
          observedRow: null,
          error: null,
        };
      },
      advanceJoinNodeBootIncarnation: async (_whereClause, nextNodeRow) => {
        clusterStore[TABLES.NODES] = [nextNodeRow];
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      writeJoinEndpointAtIncarnation: async (
        tableName,
        row,
        bootIncarnation,
      ) => {
        if (tableName === TABLES.NODE_ENDPOINTS) {
          endpointAttempts += 1;
          if (endpointAttempts === 1) {
            const transientError = new Error('transient_node_endpoint_failure');
            transientError.deferRetry = true;
            throw transientError;
          }
          const stamped = {
            ...row,
            [COLUMN.BOOT_INCARNATION]: bootIncarnation,
          };
          endpointWrites.push(stamped);
          clusterStore[TABLES.NODE_ENDPOINTS] = [stamped];
          return {outcome: 'applied', result: {success: true}};
        }
        const stamped = {...row, [COLUMN.BOOT_INCARNATION]: bootIncarnation};
        clusterStore[TABLES.SERVICE_ENDPOINTS].push(stamped);
        return {outcome: 'applied', result: {success: true}};
      },
    };
    const owner = new NodeRegistrationOwner({
      hostId: LOCAL_MACHINE_HOST_ID,
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      membershipPublicationRuntimeOwner,
      delegates: {
        ...createWipedStorageDelegates(),
        getBootIncarnation: () => runtimeSurface.bootIncarnation,
        raiseBootIncarnationFloor: async (nextFloor) => {
          floorRaises.push(nextFloor);
          return syncNodeJoiningBootIncarnation(runtimeSurface, nextFloor);
        },
        getJoinLifecycleIntentType: () =>
          MEMBERSHIP_LIFECYCLE_INTENT.FRESH_BOOT_ADMISSION,
        getClusterIncarnationFence: () =>
          buildClusterIncarnationFence({durableStateDetected: false}),
      },
    });
    owner.seedJoinTimeCacheRow = () => {};
    owner.getJoinAdmissionWriteRetryTimeoutMs = () => 0;
    stubAuthoritativeViewReads(owner, async (tableName) => ({
      success: true,
      rows: (clusterStore[tableName] || []).map((row) => ({...row})),
    }));

    let attempt1Error = null;
    try {
      await owner.registerNodeInCluster();
    } catch (error) {
      attempt1Error = error;
    }
    t.ok(attempt1Error, 'attempt 1 fails when NODE_ENDPOINTS throws');
    t.equal(
      nodeWrites.length,
      1,
      'attempt 1 writes NODES at incarnation 2 before endpoint failure',
    );
    t.equal(nodeWrites[0]?.[COLUMN.BOOT_INCARNATION], 2);

    const attempt2Result = await owner.registerNodeInCluster();
    t.same(
      floorRaises,
      [2],
      'same-process retry does not advance the incarnation floor a second time',
    );
    t.equal(
      nodeWrites.length,
      1,
      'same-process retry resumes existing join progress without rewriting NODES',
    );
    t.equal(
      attempt2Result.nodeRow[COLUMN.BOOT_INCARNATION],
      2,
      'resumed NODES row stays at latched boot_incarnation = 2',
    );
    t.equal(
      endpointWrites[0]?.[COLUMN.BOOT_INCARNATION],
      2,
      'NODE_ENDPOINTS row is published at latched boot_incarnation = 2',
    );
    t.equal(
      JSON.parse(endpointWrites[0]?.[COLUMN.METADATA] || '{}')
        .storageIncarnation,
      2,
      'NODE_ENDPOINTS row preserves latched storageIncarnation = 2',
    );
    t.equal(
      servicesUpdates.length,
      1,
      'same-process retry still reconciles lost-storage SERVICES rows',
    );
    t.equal(
      runtimeSurface.heartbeatService.bootIncarnation,
      2,
      'syncNodeJoiningBootIncarnation updates heartbeatService.bootIncarnation',
    );
    t.equal(
      runtimeSurface.messageRouter.bootIncarnation,
      2,
      'syncNodeJoiningBootIncarnation updates messageRouter.bootIncarnation',
    );
    t.same(
      runtimeSurface.messageRouter.syncedIncarnations,
      [2],
      'syncNodeJoiningBootIncarnation delegates to messageRouter.syncBootIncarnation',
    );
    t.equal(
      runtimeSurface.messageGroupServiceHandler.replicaCreateAdmissionOwner
        .ownerIncarnation,
      2,
      'syncNodeJoiningBootIncarnation updates messageGroupServiceHandler.replicaCreateAdmissionOwner.ownerIncarnation',
    );
    t.equal(
      runtimeSurface.rebalanceCoordinator.repository
        .membershipOwnerBootIncarnation,
      2,
      'syncNodeJoiningBootIncarnation updates repository.membershipOwnerBootIncarnation',
    );
  },
);

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
    MEMBERSHIP_LIFECYCLE_INTENT.FRESH_BOOT_ADMISSION;
  progressOwner.delegates.getClusterIncarnationFence = () => ({
    allowed: true,
    durableMembershipState: 'present',
  });
  progressOwner.seedJoinTimeCacheRow = (tableName, row) => {
    progressSeeded.set(tableName, row);
  };
  progressOwner.readExistingPartitionServiceRowsForNode = async () => [];

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
  '(updated_at_hlc) across NODES, NODE_ENDPOINTS, SERVICE_ENDPOINTS, and ' +
  'SERVICES return values and SystemTableCache seeds',
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

    // Lost-storage SERVICES reconciliation path (reconcileLostStoragePartitionReplicas)
    const servicesHlc = '1710000000000-0100-services';
    const servicesSeeded = [];
    progressOwner.seedJoinTimeCacheRow = (tableName, row) => {
      servicesSeeded.push({tableName, row});
    };
    progressOwner.readExistingPartitionServiceRowsForNode = async () => [
      {
        [COLUMN.SERVICE_ID]: 'svc-lost-p1',
        [COLUMN.REPLICA_ID]: 'svc-lost-p1',
        [COLUMN.PARTITION_ID]: 'svc-lost-p1',
        [COLUMN.NODE_ID]: NODE_ID,
        [COLUMN.SERVICE_TYPE]: 'partition',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      },
    ];
    progressOwner.upsertSystemTableRowWithRetry = async () => ({
      success: true,
      changes: 1,
      originHlc: servicesHlc,
      partitionResult: {affectedRows: 1, originHlc: servicesHlc},
    });
    const reconciled =
      await progressOwner.reconcileLostStoragePartitionReplicas(NOW);
    t.equal(
      reconciled[0]?.[COLUMN.UPDATED_AT_HLC],
      servicesHlc,
      'reconcileLostStoragePartitionReplicas returns HLC-stamped failed SERVICES row',
    );
    t.equal(
      servicesSeeded[0]?.row?.[COLUMN.UPDATED_AT_HLC],
      servicesHlc,
      'reconcileLostStoragePartitionReplicas seeds SystemTableCache with HLC-stamped failed SERVICES row',
    );
  },
);
