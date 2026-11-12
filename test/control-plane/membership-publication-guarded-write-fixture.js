// The surface the publication guarded-write witnesses drive: the real
// control_plane_publications partition (a lone rs-raft leader behind the
// production engine, CDC routed write path and control-plane gateway), the
// real ControlPlanePublicationsOwner and MembershipPublicationCoordinator.
// Each coordinator reaches the one gateway through its own seam, where a
// witness holds a write, loses its answer or makes the authoritative read
// unavailable.
import {TABLES} from '../../src/constants/index.js';
// LOAD-ORDER WORKAROUND (2026-11-11, not this unit's defect): the working
// tree's table-creation-service modules import this module, which reads
// SQL_QUERY_ENGINE_SHARED at load; any entry that reaches the engine first
// dies in that cycle (test/cdc/cdc-routed-write-transport-answer-retry.test.js
// fails the same way). Loading it first resolves the cycle. Remove this
// import once the cycle is repaired by its owner.
import '../../src/query/sql-query-engine-metadata-authority-refresh.js';
import {
  authoritativeLeaderReads,
  selectRows,
  withSurface,
} from '../query/unknown-outcome-surface-fixture.js';
import {ControlPlanePublicationsOwner} from
  '../../src/control-plane/owners/control-plane-publications-owner.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';

const PUBLICATIONS = TABLES.CONTROL_PLANE_PUBLICATIONS;
const PUBLICATION_ID = 'membership-publication:7:witness';
const MEMBER_NODE_IDS = Object.freeze(['node-1', 'node-2', 'node-3']);
const SEEDED_AT_MS = 1000;
const WRITE_METHODS = Object.freeze([
  'insertSystemTableRow',
  'updateSystemTableRow',
  'upsertSystemTableRow',
]);
const READ_UNAVAILABLE = Object.freeze({
  success: false,
  error: 'authoritative read unavailable (witness)',
});

function publicationRow(overrides = {}) {
  return {
    publication_id: PUBLICATION_ID,
    publication_kind: 'cluster_membership',
    publication_epoch: 7,
    publisher_node_id: 'node-1',
    published_active_node_ids: [...MEMBER_NODE_IDS],
    required_ack_node_ids: [...MEMBER_NODE_IDS],
    acknowledged_node_ids: [],
    status: 'OPEN',
    reason_code: 'witness',
    created_at: SEEDED_AT_MS,
    updated_at: SEEDED_AT_MS,
    transition_history: [],
    ...overrides,
  };
}

// The durable row as an independent reader of the leader's store sees it,
// its list columns decoded.
function durableRow(surface, publicationId = PUBLICATION_ID) {
  const row = selectRows(surface.dbPath,
    `SELECT * FROM ${PUBLICATIONS} WHERE publication_id = ?`,
    [publicationId])[0];
  if (!row) {
    return null;
  }
  return {
    ...row,
    acknowledged_node_ids: JSON.parse(row.acknowledged_node_ids),
    transition_history: JSON.parse(row.transition_history),
    priority_partition_summary: row.priority_partition_summary === null ?
      null : JSON.parse(row.priority_partition_summary),
    membership_lifecycle_summary: row.membership_lifecycle_summary === null ?
      null : JSON.parse(row.membership_lifecycle_summary),
  };
}

// One coordinator's seam onto the shared gateway: `beforeWrite` runs between
// the coordinator's reads and each of its writes; `loseWriteAnswer` applies
// the write and then fails its answer; `readsUnavailable` answers every
// authoritative read as unavailable.
function gatewaySeam(gateway) {
  const seam = Object.create(gateway);
  const control = {beforeWrite: null, loseWriteAnswer: null,
    readsUnavailable: false, writes: [], reads: 0};
  for (const method of WRITE_METHODS) {
    seam[method] = async (...args) => {
      control.writes.push({method, args});
      if (control.beforeWrite) {
        await control.beforeWrite({method, args});
      }
      const answer = await gateway[method](...args);
      if (control.loseWriteAnswer) {
        throw control.loseWriteAnswer({method, args, answer});
      }
      return answer;
    };
  }
  seam.readAuthoritativeRows = async (...args) => {
    control.reads += 1;
    return control.readsUnavailable ? {...READ_UNAVAILABLE} :
      gateway.readAuthoritativeRows(...args);
  };
  return {seam, control};
}

// A coordinator of `nodeId` over its own seam: the real owner, the real
// coordinator; its cache is the witness's `cacheRows`.
function coordinatorOver(gateway, nodeId, options = {}) {
  const {seam, control} = gatewaySeam(gateway);
  const owner = new ControlPlanePublicationsOwner({
    controlPlaneSystemTableGateway: seam,
    controlPlaneWriteRetryTimeoutMs: 0,
  });
  const coordinator = new MembershipPublicationCoordinator({
    nodeId,
    controlPlanePublicationsOwner: owner,
    systemTableCache: {
      getAll: (tableName) => (tableName === PUBLICATIONS &&
        typeof options.cacheRows === 'function' ? options.cacheRows() : []),
    },
    logger: {info() {}, warn() {}, error() {}, debug() {},
      logConsoleOnly() {}},
    ...(options.coordinatorOptions || {}),
  });
  return {coordinator, owner, control};
}

// The publication owner's coordinator (the publications write leader). Its
// reconcile runs the production path; only the candidate derivation (the
// readiness planning evidence, not under test here) is the witness's.
function ownerCoordinatorOver(gateway, nodeId, candidateOf) {
  const built = coordinatorOver(gateway, nodeId, {coordinatorOptions: {
    resolveIsControlPlanePublicationsWriteLeader: () => true,
  }});
  built.coordinator.readClusterMembershipCandidate = async (options) => {
    const latestPublicationRow = await built.coordinator.getLatestPublicationRow(options);
    const latestPublishedPublicationRow =
      await built.coordinator.getLatestPublishedPublicationRow(options);
    const planningSnapshot = {latestPublicationRow, latestPublishedPublicationRow};
    return {planningSnapshot, candidate: candidateOf({...options, ...planningSnapshot})};
  };
  // The reconcile's own re-asks (its declared self-requeue), observed.
  built.requeues = [];
  built.coordinator.enqueueClusterMembershipReconcile =
    (reason, context, queueOptions) => {
      built.requeues.push({reason, context, queueOptions});
      return true;
    };
  return built;
}

// An unchanged candidate over `row`: the owner refreshes the row with it.
function refreshCandidate(row, refresh = {}) {
  return {
    publicationKind: row.publication_kind,
    publicationEpoch: row.publication_epoch,
    publicationStatus: refresh.publicationStatus ?? row.status,
    publisherNodeId: row.publisher_node_id,
    publishedActiveNodeIds: [...row.published_active_node_ids],
    requiredAckNodeIds: [...row.required_ack_node_ids],
    acknowledgedNodeIds: refresh.acknowledgedNodeIds ??
      [...row.acknowledged_node_ids],
    changed: false,
    priorityPartitionSummaryChanged:
      refresh.priorityPartitionSummary !== undefined,
    priorityPartitionSummary: refresh.priorityPartitionSummary ?? null,
    membershipLifecycleSummaryChanged:
      refresh.membershipLifecycleSummary !== undefined,
    membershipLifecycleSummary: refresh.membershipLifecycleSummary ?? null,
    reasonCode: 'witness',
  };
}

// A candidate for a publication that does not exist yet.
function newPublicationCandidate(overrides = {}) {
  return {
    publicationKind: 'cluster_membership',
    publicationEpoch: 8,
    publisherNodeId: 'node-1',
    publishedActiveNodeIds: [...MEMBER_NODE_IDS],
    requiredAckNodeIds: [...MEMBER_NODE_IDS],
    acknowledgedNodeIds: [],
    changed: true,
    reasonCode: 'witness',
    ...overrides,
  };
}

// The change-data rows the publications partition derives for the statements
// delivered to it: the same derivation its CDC generator runs when it emits
// an event for the applied statement (it looks the stored row up by the
// statement's predicate, taking a predicate column's SET value when the
// statement also sets it).
function captureDeliveredStatements(messageRouter) {
  const statements = [];
  const deliver = messageRouter.deliver.bind(messageRouter);
  messageRouter.deliver = async (address, message, ...rest) => {
    statements.push({sql: message.sql, params: message.params});
    return deliver(address, message, ...rest);
  };
  return statements;
}

function changeDataOf(surface, statement) {
  return surface.partition.syncCDCGeneratorDependencies()
    .extractParamUpdateData(statement.sql, statement.params, PUBLICATIONS);
}

async function withPublicationSurface(body) {
  await withSurface([PUBLICATIONS], async (context) => {
    const surface = context.of(PUBLICATIONS);
    authoritativeLeaderReads(context.gateway, surface);
    const readAuthoritativeRows = context.gateway.readAuthoritativeRows;
    // An absent row is an answer (no rows), not a wait for one to appear.
    context.gateway.readAuthoritativeRows = async (table, sql, params) => {
      surface.partition.raft.readStatus();
      const rows = selectRows(surface.dbPath, sql, params);
      return rows.length > 0 ? readAuthoritativeRows(table, sql, params) :
        {success: true, rows};
    };
    try {
      await body({...context, surface});
    } finally {
      context.gateway.shutdown?.();
    }
  }, {cdc: true});
}

export {
  MEMBER_NODE_IDS,
  PUBLICATIONS,
  PUBLICATION_ID,
  captureDeliveredStatements,
  changeDataOf,
  coordinatorOver,
  durableRow,
  newPublicationCandidate,
  ownerCoordinatorOver,
  publicationRow,
  refreshCandidate,
  withPublicationSurface,
};
