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
import {
  applyReplicaLeadership,
  applyReplicaDemotion,
} from '../../src/raft/replica-leadership-state.js';
import {
  createPartitionServiceMetadataDeliveryMethods,
} from '../../src/partition/partition-service-metadata-delivery-methods.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

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

// A row seeded by the LIVE local tenure: carries the local-only claim
// annotations the projection stamps at election time (term-bound).
function cachedSeededRow(leaderNodeId, {claimTerm = 7} = {}) {
  return {
    partition_id: PARTITION_ID,
    leader_node_id: leaderNodeId,
    leader_claim_node_id: leaderNodeId,
    leader_claim_raft_term: claimTerm,
    leader_claim_minted_against_updated_at: 2_000,
    created_at: 1_000,
    updated_at: 2_000,
  };
}

// A fossil: a row NAMING a node as leader without any tenure claim — the
// shape every CDC round-trip of a durable row has (durable columns cannot
// carry the local-only claim annotations), and the shape a stale replay of
// an old tenure leaves behind after the teardown clear.
function fossilRow(leaderNodeId) {
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
  'replay fossil: a cached row merely NAMING this node without a live ' +
    'tenure claim is never preferred over the authoritative read',
  async (t) => {
    // The external review's replay window: an equal-version CDC round-trip
    // of an old durable row naming this node (the local claim was nulled at
    // demotion/teardown, and durable rows cannot carry claim annotations).
    // Content-based precedence resurrects the fossil; tenure-binding must
    // not.
    const safetyRows = makeSafetyRows({
      cachedRow: fossilRow(LOCAL_NODE),
    });
    const merged = safetyRows.mergePartitionRowForSafety(
      authoritativeStaleRow(),
      fossilRow(LOCAL_NODE),
    );
    t.equal(
      merged.leader_node_id,
      STALE_LEADER,
      'an old-tenure fossil naming this node defers to authoritative truth',
    );
    const withoutTerm = safetyRows.mergePartitionRowForSafety(
      authoritativeStaleRow(),
      {...cachedSeededRow(LOCAL_NODE), leader_claim_raft_term: null},
    );
    t.equal(
      withoutTerm.leader_node_id,
      STALE_LEADER,
      'a claim without its raft term is not a live tenure and is not preferred',
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

// ---------------------------------------------------------------------------
// PRODUCTION-PATH regression (verifier rejection of attempt-1): the claim
// must be minted by the REAL leadership event chain — applyReplicaLeadership
// (the exact function the partition-service LEADER event invokes) through the
// real metadata-delivery mixin into a real SystemTableCache — not by a
// fabricated row. Attempt-1 wired the term into a raft base class the real
// PartitionService never extends; every gate stayed green while the claim
// was never stamped in production and the preference was dead.
// ---------------------------------------------------------------------------

function buildElectionReplica({term = 11, withTermResolver = true} = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const cache = new SystemTableCache();
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.PARTITIONS,
    'INSERT',
    {
      partition_id: PARTITION_ID,
      leader_node_id: STALE_LEADER,
      created_at: 1_000,
      updated_at: 2_000,
    },
    {causeId: 'cdc:durable-partition-row'},
  );
  const replica = Object.assign(
    Object.create(null),
    createPartitionServiceMetadataDeliveryMethods(),
    {
      nodeId: LOCAL_NODE,
      partitionId: PARTITION_ID,
      replicaId: `${PARTITION_ID}-r9`,
      isLeader: false,
      role: null,
      systemTableCache: cache,
      leaderNodeMutationHelper: {queue() {}},
      queueRoleUpdate() {},
      logger: LoggingService.getInstance().forSubsystem('test'),
    },
  );
  if (withTermResolver) {
    replica.resolveCurrentTermSafe = () => term;
  }
  return {replica, cache};
}

t.test(
  'the REAL leadership event mints the tenure claim and the safety merge ' +
    'prefers it over the lagging durable leader',
  async (t) => {
    const {replica, cache} = buildElectionReplica({term: 11});
    applyReplicaLeadership(replica, 'leader');
    const seededRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID);
    t.equal(
      seededRow.leader_node_id,
      LOCAL_NODE,
      'the election projection names this node in the local cache row',
    );
    t.equal(
      seededRow.leader_claim_node_id,
      LOCAL_NODE,
      'the production election path stamps the claim node',
    );
    t.equal(
      seededRow.leader_claim_raft_term,
      11,
      'the production election path stamps the raft term it won at',
    );
    const safetyRows = makeSafetyRows({cachedRow: seededRow});
    const merged = safetyRows.mergePartitionRowForSafety(
      authoritativeStaleRow(),
      seededRow,
    );
    t.equal(
      merged.leader_node_id,
      LOCAL_NODE,
      'the preference FIRES off the production-minted claim (the parent ' +
        'quest recognition fix is alive, not vacuously retired)',
    );

    // Demotion through the same real chain kills the claim.
    applyReplicaDemotion(replica, 'follower');
    const demotedRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID);
    t.equal(
      demotedRow.leader_claim_node_id ?? null,
      null,
      'the real demotion chain nulls the claim',
    );
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  },
);

t.test(
  'a replica without a term resolver mints NO claim — fail-closed, the ' +
    'preference stays off',
  async (t) => {
    const {replica, cache} = buildElectionReplica({withTermResolver: false});
    applyReplicaLeadership(replica, 'leader');
    const seededRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID);
    t.equal(
      seededRow.leader_node_id,
      LOCAL_NODE,
      'the leadership projection still lands',
    );
    t.equal(
      seededRow.leader_claim_node_id ?? null,
      null,
      'no term, no claim',
    );
    const safetyRows = makeSafetyRows({cachedRow: seededRow});
    const merged = safetyRows.mergePartitionRowForSafety(
      authoritativeStaleRow(),
      seededRow,
    );
    t.equal(
      merged.leader_node_id,
      STALE_LEADER,
      'without a minted tenure the authoritative read stands',
    );
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  },
);

t.test(
  'demotion during the in-flight authoritative read cannot resurrect the ' +
    'captured self-belief: the post-await cache state governs the preference',
  async (t) => {
    // External-review TOCTOU case: this node believed it led when the safety
    // read started; it was demoted (the seed lifecycle nulled the cached
    // leader and a successor publication landed) while the authoritative
    // read was in flight. The stale pre-await capture must not override the
    // fresher authoritative successor.
    const SUCCESSOR = 'node-successor';
    let cachedNow = cachedSeededRow(LOCAL_NODE);
    let releaseRead;
    const readGate = new Promise((resolve) => {
      releaseRead = resolve;
    });
    const instance = Object.create(PriorityPublicationSafetyRows.prototype);
    instance.repository = {
      nodeId: LOCAL_NODE,
      systemTableCache: {
        get: (tableName, key) =>
          tableName === SYSTEM_TABLE_NAME.PARTITIONS && key === PARTITION_ID ?
            cachedNow :
            null,
      },
      controlPlaneSystemTableGateway: {
        executeRead: async () => {
          await readGate;
          return {
            success: true,
            rows: [{
              partition_id: PARTITION_ID,
              leader_node_id: SUCCESSOR,
              created_at: 1_000,
              updated_at: 3_000,
            }],
          };
        },
      },
    };

    const pendingRead = instance.getCriticalPartitionRowForSafety(PARTITION_ID);
    // Demotion lands while the authoritative read is in flight: the seed
    // lifecycle clears the local claim and the successor publication reaches
    // the cache.
    cachedNow = cachedSeededRow(SUCCESSOR);
    releaseRead();
    const row = await pendingRead;

    t.equal(
      row.leader_node_id,
      SUCCESSOR,
      'the captured pre-await self-belief must not override the ' +
        'authoritative successor after an in-flight demotion',
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
