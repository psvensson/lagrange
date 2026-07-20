import t from 'tap';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  createLeaderNodeMutationHelper,
} from '../../src/partition/partition-service-metadata-mutation-helpers.js';
import {applyReplicaDemotion, applyReplicaLeadership} from
  '../../src/raft/replica-leadership-state.js';

// CL-036: a locally won Raft election is already authoritative local truth, but
// the canonical PARTITIONS row currently changes only after a durable write
// traverses the control plane being recovered.  The REPLACE remove-safety gate
// reads that row, so the replacement can be leader while the gate waits for the
// old leader_node_id for minutes.  The existing metadata publication owner must
// expose the local fact immediately and still prove/reassert durable convergence.

const PARTITION_ID = 'replica_operations-p1';
const SOURCE_NODE_ID = 'node-source';
const REPLACEMENT_NODE_ID = 'node-replacement';

function makePartitionRowCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.PARTITIONS,
    'INSERT',
    {
      partition_id: PARTITION_ID,
      table_id: 'replica_operations',
      leader_node_id: SOURCE_NODE_ID,
      created_at: 1000,
      updated_at: 1000,
    },
    {causeId: 'durable-before-election'},
  );
  return cache;
}

function makeLocalLeaderContext(cache, options = {}) {
  const queued = [];
  const context = Object.create(PartitionService.prototype);
  context.partitionId = PARTITION_ID;
  context.nodeId = REPLACEMENT_NODE_ID;
  context.isLeader = options.isLeader ?? true;
  context._systemTableCache = cache;
  context.hlcClock = {
    update: () => {},
    now: () => ({
      physical: 2000,
      toString: () => `2000-0-${REPLACEMENT_NODE_ID}`,
    }),
  };
  context.leaderNodeMutationHelper = {
    queue: (leaderNodeId) => queued.push(leaderNodeId),
  };
  context.roleMutationHelper = {queue: () => {}};
  return {context, queued};
}

t.test(
  'CL-036 local seed: the actual leader transition updates the existing canonical row before durable delivery',
  (t) => {
    const cache = makePartitionRowCache();
    const {context, queued} = makeLocalLeaderContext(cache);

    context.queueLeaderNodeUpdate(REPLACEMENT_NODE_ID);

    const row = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID);
    t.equal(
      row.leader_node_id,
      REPLACEMENT_NODE_ID,
      'node-local canonical row observes the won election immediately',
    );
    t.equal(
      row.updated_at,
      1000,
      'local visibility preserves the durable causal version',
    );
    t.equal(row.table_id, 'replica_operations', 'row fields are preserved');
    t.same(
      queued,
      [REPLACEMENT_NODE_ID],
      'the same owner still queues durable convergence',
    );
    t.end();
  },
);

t.test('CL-036 wiring: the shared Raft leader transition reaches the row owner', (t) => {
  const cache = makePartitionRowCache();
  const {context, queued} = makeLocalLeaderContext(cache, {isLeader: false});
  context.replicaId = `${PARTITION_ID}-r4`;
  context.replicaIds = [context.replicaId, `${PARTITION_ID}-r2`];

  applyReplicaLeadership(context, 'leader');

  t.equal(context.isLeader, true, 'Raft transition establishes local ownership');
  t.equal(
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID).leader_node_id,
    REPLACEMENT_NODE_ID,
    'the real transition reaches the local canonical-row seed',
  );
  t.same(queued, [REPLACEMENT_NODE_ID], 'durable convergence remains queued');
  t.end();
});

t.test('CL-036 local seed: a non-leader cannot publish local ownership', (t) => {
  const cache = makePartitionRowCache();
  const {context} = makeLocalLeaderContext(cache, {isLeader: false});

  context.queueLeaderNodeUpdate(REPLACEMENT_NODE_ID);

  t.equal(
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID).leader_node_id,
    SOURCE_NODE_ID,
    'row remains on the observed leader when this replica is not leader',
  );
  t.end();
});

t.test('CL-036 local seed: it never synthesizes an incomplete partition row', (t) => {
  const cache = new SystemTableCache();
  const {context, queued} = makeLocalLeaderContext(cache);

  context.queueLeaderNodeUpdate(REPLACEMENT_NODE_ID);

  t.equal(
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID),
    undefined,
    'missing durable identity remains missing',
  );
  t.same(
    queued,
    [REPLACEMENT_NODE_ID],
    'durable publication is still attempted',
  );
  t.end();
});

t.test('CL-036 level trigger: only the current leader can reassert durability', (t) => {
  const cache = makePartitionRowCache();
  const {context, queued} = makeLocalLeaderContext(cache);

  t.equal(
    context.reassertDurableLeaderNodeId(),
    true,
    'current ownership derives a durable reassert from state',
  );
  context.isLeader = false;
  t.equal(
    context.reassertDurableLeaderNodeId(),
    false,
    'demotion suppresses the reassert',
  );
  t.same(queued, [REPLACEMENT_NODE_ID], 'only the leader invocation queued');
  t.end();
});

t.test('CL-036 activation wiring: stable leader ownership level-triggers reassertion', (t) => {
  const context = Object.create(PartitionService.prototype);
  let reassertions = 0;
  context.isLeader = true;
  context.isShutdown = false;
  context.isJoiningExistingGroup = true;
  context.lastPreparedStateReconstructionTerm = 7;
  context.replicaId = `${PARTITION_ID}-r4`;
  context.replicaIds = [context.replicaId, `${PARTITION_ID}-r2`];
  context.partitionId = PARTITION_ID;
  context.rebalancer = null;
  context.logger = {info: () => {}};
  context.emit = () => {};
  context.reassertDurableLeaderNodeId = () => {
    reassertions += 1;
    return true;
  };
  context.leaderActivationGate = {
    schedule: (_term, activate) => activate(),
  };

  context.scheduleLeaderOwnedActivation(7);

  t.equal(
    reassertions,
    1,
    'stable activation derives another durable publish from current ownership',
  );
  t.end();
});

t.test('CL-036 replay: equal-version durable history is re-projected without a version bump', (t) => {
  const cache = makePartitionRowCache();
  const {context} = makeLocalLeaderContext(cache);
  context.queueLeaderNodeUpdate(REPLACEMENT_NODE_ID);

  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.PARTITIONS,
    'UPDATE',
    {
      partition_id: PARTITION_ID,
      leader_node_id: SOURCE_NODE_ID,
      updated_at: 1000,
    },
    {causeId: 'equal-version-durable-replay'},
  );
  const replayedRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID);
  t.equal(replayedRow.leader_node_id, SOURCE_NODE_ID, 'replay engages');

  t.equal(
    context.handleCanonicalLeaderRowCacheChange(replayedRow),
    true,
    'the publication owner re-projects actual local Raft ownership',
  );
  const reprojectedRow = cache.get(
    SYSTEM_TABLE_NAME.PARTITIONS,
    PARTITION_ID,
  );
  t.equal(reprojectedRow.leader_node_id, REPLACEMENT_NODE_ID);
  t.equal(reprojectedRow.updated_at, 1000, 're-projection still mints no version');
  t.end();
});

t.test('CL-036 demotion: stale local ownership clears but a clock-skewed successor row survives', (t) => {
  const cache = makePartitionRowCache();
  const {context} = makeLocalLeaderContext(cache);
  context.replicaId = `${PARTITION_ID}-r4`;
  context.queueLeaderNodeUpdate(REPLACEMENT_NODE_ID);

  applyReplicaDemotion(context, 'follower');
  t.equal(
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID).leader_node_id,
    null,
    'demotion clears this node only while it still owns the local row',
  );

  context.isLeader = true;
  context.queueLeaderNodeUpdate(REPLACEMENT_NODE_ID);
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.PARTITIONS,
    'UPDATE',
    {
      partition_id: PARTITION_ID,
      leader_node_id: 'node-successor',
      // The successor clock is behind the election observer's HLC physical
      // time (2000), but its durable version is newer than the pre-election
      // row (1000). A local wall-clock seed must not fence it.
      updated_at: 1999,
      updated_at_hlc: '1999-0-node-successor',
    },
    {causeId: 'clock-skewed-newer-successor'},
  );
  const successorRow = cache.get(
    SYSTEM_TABLE_NAME.PARTITIONS,
    PARTITION_ID,
  );
  t.equal(successorRow.leader_node_id, 'node-successor', 'successor CDC wins');
  t.equal(
    context.handleCanonicalLeaderRowCacheChange(successorRow),
    false,
    'strictly newer successor suppresses local re-projection',
  );
  context.queueLeaderNodeUpdate(REPLACEMENT_NODE_ID);
  t.equal(
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID).leader_node_id,
    'node-successor',
    'later same-tenure queue cannot reseed over the successor',
  );
  applyReplicaDemotion(context, 'follower');
  t.equal(
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID).leader_node_id,
    'node-successor',
    'late demotion cannot erase a newer successor observation',
  );
  t.end();
});

t.test('CL-036 demotion replay: an equal-version delayed self publication is cleared again', (t) => {
  const cache = makePartitionRowCache();
  const {context} = makeLocalLeaderContext(cache);
  context.replicaId = `${PARTITION_ID}-r4`;
  context.queueLeaderNodeUpdate(REPLACEMENT_NODE_ID);

  const durableSelfRow = {
    partition_id: PARTITION_ID,
    leader_node_id: REPLACEMENT_NODE_ID,
    updated_at: 2000,
    updated_at_hlc: '2000-0-node-replacement',
  };
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.PARTITIONS,
    'UPDATE',
    durableSelfRow,
    {causeId: 'durable-self-before-demotion'},
  );

  applyReplicaDemotion(context, 'follower');
  t.equal(
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID).leader_node_id,
    null,
    'demotion clears the observed durable self row',
  );
  t.equal(
    context.localCanonicalLeaderObservation.demoted,
    true,
    'demotion retains bounded projection provenance for delayed replay',
  );

  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.PARTITIONS,
    'UPDATE',
    durableSelfRow,
    {causeId: 'equal-version-delayed-self-replay'},
  );
  const replayedSelfRow = cache.get(
    SYSTEM_TABLE_NAME.PARTITIONS,
    PARTITION_ID,
  );
  t.equal(replayedSelfRow.leader_node_id, REPLACEMENT_NODE_ID, 'replay engages');
  t.equal(
    context.handleCanonicalLeaderRowCacheChange(replayedSelfRow),
    true,
    'the demoted publication owner clears its own delayed replay',
  );
  t.equal(
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, PARTITION_ID).leader_node_id,
    null,
    'a demoted replica cannot remain canonical owner after replay',
  );

  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.PARTITIONS,
    'UPDATE',
    {
      partition_id: PARTITION_ID,
      leader_node_id: 'node-successor',
      updated_at: 2001,
      updated_at_hlc: '2001-0-node-successor',
    },
    {causeId: 'newer-successor-after-demotion'},
  );
  const successorRow = cache.get(
    SYSTEM_TABLE_NAME.PARTITIONS,
    PARTITION_ID,
  );
  t.equal(
    context.handleCanonicalLeaderRowCacheChange(successorRow),
    false,
    'demotion cleanup does not clear a different successor',
  );
  t.equal(successorRow.leader_node_id, 'node-successor');
  t.end();
});

t.test(
  'CL-036 durable reassert: a local seed is not mistaken for durable proof or used as the CAS guard',
  async (t) => {
    const cache = makePartitionRowCache();
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.PARTITIONS,
      'UPSERT',
      {
        partition_id: PARTITION_ID,
        leader_node_id: REPLACEMENT_NODE_ID,
        updated_at: 2000,
      },
      {causeId: 'local-leader-seed'},
    );

    const mutations = [];
    const owner = {
      partitionId: PARTITION_ID,
      replicaId: `${PARTITION_ID}-r4`,
      nodeId: REPLACEMENT_NODE_ID,
      isLeader: true,
      systemTableCache: cache,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, data, options) => {
          mutations.push({tableName, whereClause, data, options});
          return {success: true, affectedRows: 1};
        },
      },
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: async () => ({
          success: true,
          rows: [{
            partition_id: PARTITION_ID,
            leader_node_id: SOURCE_NODE_ID,
            updated_at: 1000,
          }],
        }),
        // The mutation helper writes through the owner-supplied gateway (not a
        // lazily built cdcIntegrationService bundle) since af8b982a; without
        // this, flush throws and the retry loop holds the event loop to the
        // tap timeout.
        submitMutation: async ({tableName, whereClause, data}, options) => {
          mutations.push({tableName, whereClause, data, options});
          return {success: true, partitionResult: {affectedRows: 1}};
        },
      },
      getMetadataPublicationDeliveryPriority: () => 'critical',
      getMetadataPublicationWorkClass: () => 'critical',
      shouldMetadataPublicationAllowPressureDefer: () => false,
      getMetadataPublicationReadinessDimension: () =>
        'control-plane-recovery-eligible',
      isPartitionsLeaderAvailable: () => true,
      refreshMetadataPublicationGuardRow: async () => true,
      logger: {warn: () => {}},
    };
    const helper = createLeaderNodeMutationHelper(owner);
    helper.pendingValue = REPLACEMENT_NODE_ID;

    const result = await helper.flush();

    t.equal(result.reason, 'applied', 'durable reassert is issued');
    t.equal(mutations.length, 1, 'one authoritative mutation is submitted');
    t.same(
      mutations[0].whereClause,
      {
        partition_id: PARTITION_ID,
        leader_node_id: SOURCE_NODE_ID,
        updated_at: 1000,
      },
      'CAS guard comes from the durable row, not the newer local seed',
    );
    t.equal(
      mutations[0].data.leader_node_id,
      REPLACEMENT_NODE_ID,
      'durable row converges to the actual local leader',
    );
  },
);

t.test(
  'CL-036 durable fence: demotion during the authoritative read prevents a stale owner write',
  async (t) => {
    const cache = makePartitionRowCache();
    let releaseRead;
    const readGate = new Promise((resolve) => {
      releaseRead = resolve;
    });
    const mutations = [];
    const owner = {
      partitionId: PARTITION_ID,
      replicaId: `${PARTITION_ID}-r4`,
      nodeId: REPLACEMENT_NODE_ID,
      isLeader: true,
      systemTableCache: cache,
      cdcIntegrationService: {
        updateSystemTableRow: async (...args) => {
          mutations.push(args);
          return {success: true, affectedRows: 1};
        },
      },
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: async () => {
          await readGate;
          return {
            success: true,
            rows: [{
              partition_id: PARTITION_ID,
              leader_node_id: SOURCE_NODE_ID,
              updated_at: 1000,
            }],
          };
        },
      },
      getMetadataPublicationDeliveryPriority: () => 'critical',
      getMetadataPublicationWorkClass: () => 'critical',
      shouldMetadataPublicationAllowPressureDefer: () => false,
      getMetadataPublicationReadinessDimension: () =>
        'control-plane-recovery-eligible',
      isPartitionsLeaderAvailable: () => true,
      refreshMetadataPublicationGuardRow: async () => true,
      logger: {warn: () => {}},
    };
    const helper = createLeaderNodeMutationHelper(owner);
    helper.pendingValue = REPLACEMENT_NODE_ID;
    const flush = helper.flush();
    await Promise.resolve();

    owner.isLeader = false;
    helper.pendingValue = null;
    releaseRead();
    const result = await flush;

    t.equal(result.reason, 'not-owner', 'pre-submit ownership is rechecked');
    t.equal(mutations.length, 0, 'demoted owner submits no stale mutation');
  },
);
