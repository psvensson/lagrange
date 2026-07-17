/**
 * Quest formation-priority-spread-without-exclusive-self-move-cost —
 * deterministic reproduction of the self-move takeover tax.
 *
 * Live decomposition (2026-07-16T21:52 run): after the ledger self-move's
 * directed election, the new leader's own remove-safety evaluation kept
 * deferring for 5.5-7.2s although the owner-local canonical leader seed
 * (partition-service-metadata-delivery-methods.js, the PARTITIONS-row
 * sibling of CL-035) had made the won election locally visible immediately.
 * Root: getCriticalPartitionRowForSafety merged the authoritative PARTITIONS
 * row OVER the cached row, so the stale durable leader_node_id (the durable
 * leader publication lags the election by the full control-plane round-trip
 * during formation) re-clobbered the sanctioned local seed on every 1s
 * safety retry until the publication landed.
 *
 * The fixed merge prefers the cached leader_node_id ONLY when it names this
 * node — an election won here is this node's own committed raft decision
 * (demotion clears the seed; supersession is guarded) — while any cached row
 * naming another node keeps deferring to the authoritative read.
 */
import t from 'tap';
import {
  PriorityPublicationSafetyRows,
} from '../../src/rebalancer/priority-publication-safety-rows.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';

const LOCAL_NODE = 'node-new-leader';
const STALE_LEADER = 'node-old-leader';
const OTHER_NODE = 'node-bystander';
const PARTITION_ID = 'replica_operations-p1';

function makeSafetyRows({cachedRow, authoritativeRow, nodeId = LOCAL_NODE}) {
  const instance = Object.create(PriorityPublicationSafetyRows.prototype);
  instance.repository = {
    nodeId,
    systemTableCache: {
      get: (tableName, key) =>
        tableName === SYSTEM_TABLE_NAME.PARTITIONS && key === PARTITION_ID ?
          cachedRow :
          null,
    },
    controlPlaneSystemTableGateway: authoritativeRow === undefined ?
      null :
      {},
  };
  return instance;
}

function cachedSeededRow(leaderNodeId) {
  return {
    partition_id: PARTITION_ID,
    leader_node_id: leaderNodeId,
    created_at: 1_000,
    updated_at: 2_000,
  };
}

function authoritativeStaleRow() {
  return {
    partition_id: PARTITION_ID,
    leader_node_id: STALE_LEADER,
    created_at: 1_000,
    updated_at: 2_000,
  };
}

t.test(
  'a locally-won election survives the authoritative merge: the seeded ' +
    'leader_node_id naming THIS node is not re-clobbered by the stale ' +
    'durable leader',
  async (t) => {
    const safetyRows = makeSafetyRows({
      cachedRow: cachedSeededRow(LOCAL_NODE),
    });
    const merged = safetyRows.mergePartitionRowForSafety(
      authoritativeStaleRow(),
      cachedSeededRow(LOCAL_NODE),
    );
    t.equal(
      merged.leader_node_id,
      LOCAL_NODE,
      'the owner-local canonical leader observation wins over the lagging ' +
        'durable publication',
    );
    t.equal(
      merged.partition_id,
      PARTITION_ID,
      'every other field keeps authoritative-wins merge semantics',
    );
  },
);

t.test(
  'a cached row naming ANOTHER node still defers to the authoritative read',
  async (t) => {
    const safetyRows = makeSafetyRows({
      cachedRow: cachedSeededRow(OTHER_NODE),
    });
    const merged = safetyRows.mergePartitionRowForSafety(
      authoritativeStaleRow(),
      cachedSeededRow(OTHER_NODE),
    );
    t.equal(
      merged.leader_node_id,
      STALE_LEADER,
      'only this node\'s own committed election is trusted over durable; ' +
        'third-party cache claims keep authoritative-wins',
    );
  },
);

t.test(
  'agreement and absence cases are unchanged',
  async (t) => {
    const safetyRows = makeSafetyRows({
      cachedRow: cachedSeededRow(LOCAL_NODE),
    });
    const agreeing = safetyRows.mergePartitionRowForSafety(
      {...authoritativeStaleRow(), leader_node_id: LOCAL_NODE},
      cachedSeededRow(LOCAL_NODE),
    );
    t.equal(agreeing.leader_node_id, LOCAL_NODE, 'agreement passes through');

    const noCached = safetyRows.mergePartitionRowForSafety(
      authoritativeStaleRow(),
      null,
    );
    t.equal(
      noCached.leader_node_id,
      STALE_LEADER,
      'no cached row: authoritative stands alone',
    );

    const noAuthoritative = safetyRows.mergePartitionRowForSafety(
      null,
      cachedSeededRow(LOCAL_NODE),
    );
    t.equal(
      noAuthoritative.leader_node_id,
      LOCAL_NODE,
      'no authoritative row: the cached projection stands alone',
    );

    t.equal(
      safetyRows.mergePartitionRowForSafety(null, null),
      null,
      'both absent stays null',
    );
  },
);

t.test(
  'end-to-end: getCriticalPartitionRowForSafety serves the locally-won ' +
    'leadership to the safety evaluation despite a stale authoritative read',
  async (t) => {
    const instance = Object.create(PriorityPublicationSafetyRows.prototype);
    instance.repository = {
      nodeId: LOCAL_NODE,
      systemTableCache: {
        get: (tableName, key) =>
          tableName === SYSTEM_TABLE_NAME.PARTITIONS && key === PARTITION_ID ?
            cachedSeededRow(LOCAL_NODE) :
            null,
      },
      controlPlaneSystemTableGateway: {
        executeRead: async () => ({
          success: true,
          rows: [{
            ...authoritativeStaleRow(),
            authoritative_only_marker: 'durable-read-happened',
          }],
        }),
      },
    };
    const row = await instance.getCriticalPartitionRowForSafety(PARTITION_ID);
    t.equal(
      row.authoritative_only_marker,
      'durable-read-happened',
      'the authoritative read genuinely participated (this is the merge ' +
        'path, not the read-failure fallback)',
    );
    t.equal(
      row.leader_node_id,
      LOCAL_NODE,
      'the safety consumer observes the committed local election at the ' +
        'next 1s retry instead of waiting out the durable publication lag',
    );
  },
);
