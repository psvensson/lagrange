import t from 'tap';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  UnifiedRebalancer,
  EntityType,
  MoveType,
  TriggerType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  initializeTestEnvironment,
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockCoordinator,
  createMockReadinessService,
} from '../rebalancer/unified-rebalancer-test-support.js';

// Quest formation-ledger-self-move-blocks-cluster-ops — Path E (freshness),
// E-cheap form. DETERMINISTIC reproduction of the ledger self-move limit cycle's
// SOURCE: during cold formation a fresh leader of a priority control-plane
// partition (replica_operations-p1) inherits a STALE CDC cache of the committed
// SERVICES replica rows across a leadership handoff, miscounts activeCount, and
// mints a PHANTOM count-changing move (here: an opposing count-increasing ADD to a
// node that ALREADY holds a committed voter) that fights the in-progress spread
// REPLACE. The cure — modelled on commit c7a3bf19 ("read fresh at the decision
// point, don't detect staleness with a watermark") — is a CACHE-BYPASSING
// authoritative (OWNER_RPC_REQUIRED) read of the SERVICES replica rows at the
// fresh-leader's count decision (unified-rebalancer-rebalance-loop.js:143), so the
// activeCount is correct and no phantom move is minted.
//
// MULTI-NODE FIDELITY: the stale local CDC cache (what getCurrentReplicas reads)
// and the authoritative owner view (what the cache-bypassing owner-RPC read
// returns) are DISTINCT sources here — that split IS the multi-node fidelity. A
// single shared cache would false-pass, so the two are never collapsed.
//
// RED-ON-REVERT: the binding observable is captured off the ACTUAL wiring — the
// currentReplicas fed to movePlanner.calculateMoves at rebalance-loop.js:161,
// sourced from :143. With the fix that input is the fresh (authoritative) view →
// no phantom ADD. Revert ONLY the :143 wiring line and the input is the stale
// cache view → the phantom ADD reappears AND the owner-RPC read never happens.

const LEDGER_PARTITION_ID = 'replica_operations-p1';
const NODE_1 = 'node-1';
const NODE_2 = 'node-2';
const NODE_3 = 'node-3';
const START_MS = 7_000_000;

initializeTestEnvironment();

function partitionVoterRow({replicaId, nodeId, status = 'active'}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: LEDGER_PARTITION_ID,
    service_type: EntityType.PARTITION,
    node_id: nodeId,
    status,
    raft_role: 'voter',
  };
}

// A cache-BYPASSING authoritative SERVICES read: records the read-mode it was
// asked for (so a cache-first read is provably inert) and returns the fresh rows.
function createAuthoritativeServicesGateway(freshRows) {
  const calls = [];
  return {
    calls,
    gateway: {
      async readAuthoritativeRows(tableName, sql, params, options = {}) {
        calls.push({tableName, sql, params, options});
        return {
          success: true,
          rows: freshRows.map((row) => ({...row})),
          rowCount: freshRows.length,
        };
      },
    },
  };
}

function buildLedgerRebalancer({staleVoterRows, freshVoterRows}) {
  const nodes = [
    {node_id: NODE_1, status: 'active'},
    {node_id: NODE_2, status: 'active'},
    {node_id: NODE_3, status: 'active'},
  ];
  const cache = createMockCache(nodes, staleVoterRows);
  const readiness = createMockReadinessService(cache);
  const {gateway, calls} = createAuthoritativeServicesGateway(freshVoterRows);
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const rebalancer = new UnifiedRebalancer({
    entityId: LEDGER_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: NODE_1,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter('connected'),
    rebalanceCoordinator: createMockCoordinator(),
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneSystemTableGateway: gateway,
    controlPlaneReadinessService: readiness,
    nowFn: () => timeSource.now(),
  });
  rebalancer.initialize();
  // Arm the fresh-leader window through the REAL setLeader path (priority
  // partition), with scheduling/enqueue stubbed so no live timers are created.
  rebalancer.scheduleNextCheck = () => {};
  rebalancer.enqueueRebalanceCheck = () => true;
  rebalancer.setLeader(true);
  return {rebalancer, calls};
}

// Drive the REAL rebalance() and capture the currentReplicas + moves at the
// calculateMoves seam (rebalance-loop.js:161), then short-circuit so no live
// operation executes. The capture reflects the :143 input exactly.
async function captureCountDecision(rebalancer) {
  const originalCalculateMoves =
    rebalancer.movePlanner.calculateMoves.bind(rebalancer.movePlanner);
  const capture = {input: null, moves: null};
  rebalancer.movePlanner.calculateMoves = (currentReplicas, targetState) => {
    capture.input = currentReplicas;
    capture.moves = originalCalculateMoves(currentReplicas, targetState);
    const stop = new Error('__count_decision_captured__');
    stop.__captured = true;
    throw stop;
  };
  try {
    await rebalancer.rebalance(TriggerType.PERIODIC);
  } catch (error) {
    if (error?.__captured !== true) {
      throw error;
    }
  }
  return capture;
}

function activeVoterNodeIds(replicas) {
  return new Set(
    (Array.isArray(replicas) ? replicas : [])
      .filter((replica) => String(replica?.status || 'active').toLowerCase() ===
        'active')
      .map((replica) => replica?.node_id)
      .filter(Boolean),
  );
}

// activeCount is a count of VOTERS (replica ids), not distinct nodes — an extra
// voter co-located on an existing node still over-counts. Sorted list (not a Set)
// so a duplicated voter is visible.
function activeVoterReplicaIds(replicas) {
  return (Array.isArray(replicas) ? replicas : [])
    .filter((replica) => String(replica?.status || 'active').toLowerCase() ===
      'active')
    .map((replica) => replica?.replica_id)
    .filter(Boolean)
    .sort();
}

t.test(
  'fresh leader with a STALE SERVICES cache does NOT mint a phantom ' +
    'count-increasing ADD (the committed prior-REPLACE voter is read ' +
    'authoritatively) — RED on head when :143 reads the stale cache',
  async (t) => {
    // Stale local CDC cache lags the committed spread REPLACE: it shows only 2
    // voters (node-1, node-2). The committed truth (authoritative owner view)
    // already has the 3rd voter on node-3.
    const staleVoterRows = [
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r1`, nodeId: NODE_1}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r2`, nodeId: NODE_2}),
    ];
    const freshVoterRows = [
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r1`, nodeId: NODE_1}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r2`, nodeId: NODE_2}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r3`, nodeId: NODE_3}),
    ];
    const {rebalancer, calls} = buildLedgerRebalancer({
      staleVoterRows,
      freshVoterRows,
    });

    // Control: the STALE cache view genuinely produces a phantom count-increasing
    // ADD (proves the harness reproduces the defect, not a vacuous pass).
    const staleReplicas = rebalancer.getCurrentReplicas();
    const policy = await rebalancer.getPolicy();
    const staleTargetState =
      await rebalancer.movePlanner.calculateTargetState(staleReplicas, policy);
    const staleMoves =
      rebalancer.movePlanner.calculateMoves(staleReplicas, staleTargetState);
    t.ok(
      staleMoves.some((move) => move.type === MoveType.ADD),
      'stale cache view mints a phantom count-increasing ADD (defect present)',
    );

    const capture = await captureCountDecision(rebalancer);

    t.same(
      [...activeVoterNodeIds(capture.input)].sort(),
      [NODE_1, NODE_2, NODE_3],
      'the count decision consumed the FRESH authoritative 3-voter view',
    );
    t.notOk(
      capture.moves.some((move) => move.type === MoveType.ADD),
      'no phantom count-increasing ADD is minted on the fresh view',
    );
    // The over-count REMOVE leg is exercised by the dedicated stale-HIGH tests
    // below; on THIS at-target (3-voter) fresh view no REMOVE fires either way,
    // so asserting its absence here would be vacuous.
    t.ok(
      calls.length >= 1,
      'the fresh-leader count decision issued an authoritative SERVICES read',
    );
    t.equal(
      calls[0].options.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'the read used a CACHE-BYPASSING owner-RPC mode (a cache-first read ' +
        'would be inert against the frozen cache)',
    );
    t.equal(
      calls[0].tableName,
      'services',
      'the authoritative read targets the SERVICES replica rows',
    );
  },
);

t.test(
  'stale-HIGH (SOFT drain): a stale cache shows an EXTRA voter still ACTIVE ' +
    'whose authoritative row is present but non-ACTIVE (removing) — the ' +
    'authoritative-over-cache field overwrite drops it from the count, ' +
    'correcting the over-count INPUT that would mint a phantom REMOVE',
  async (t) => {
    // Over-target: the cache lags a drain and shows 4 ACTIVE voters (r4 is the
    // draining voter, still shown active). The committed truth has r4 in the
    // REMOVING state (its row still exists), i.e. 3 active voters = at target.
    // Asserted at the fix's OUTPUT (resolveFreshCurrentReplicasForCountDecision),
    // the corrected currentReplicas input the count legs consume — the merge
    // semantics ARE the union-vs-replace question, independent of whether the
    // downstream planner stages a REMOVE in this minimal unit harness.
    const staleVoterRows = [
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r1`, nodeId: NODE_1}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r2`, nodeId: NODE_2}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r3`, nodeId: NODE_3}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r4`, nodeId: NODE_3}),
    ];
    const freshVoterRows = [
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r1`, nodeId: NODE_1}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r2`, nodeId: NODE_2}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r3`, nodeId: NODE_3}),
      partitionVoterRow({
        replicaId: `${LEDGER_PARTITION_ID}-r4`,
        nodeId: NODE_3,
        status: 'removing',
      }),
    ];
    const {rebalancer, calls} = buildLedgerRebalancer({
      staleVoterRows,
      freshVoterRows,
    });

    // Control: the STALE cache view counts 4 ACTIVE voters (the over-count that
    // drives a phantom REMOVE).
    t.same(
      activeVoterReplicaIds(rebalancer.getCurrentReplicas()),
      [
        `${LEDGER_PARTITION_ID}-r1`,
        `${LEDGER_PARTITION_ID}-r2`,
        `${LEDGER_PARTITION_ID}-r3`,
        `${LEDGER_PARTITION_ID}-r4`,
      ],
      'stale cache view over-counts 4 active voters (defect present)',
    );

    const resolved =
      await rebalancer.resolveFreshCurrentReplicasForCountDecision();

    t.same(
      activeVoterReplicaIds(resolved),
      [
        `${LEDGER_PARTITION_ID}-r1`,
        `${LEDGER_PARTITION_ID}-r2`,
        `${LEDGER_PARTITION_ID}-r3`,
      ],
      'the corrected input drops the draining r4 (authoritative REMOVING status ' +
        'overwrites the stale ACTIVE) → at target, no over-count',
    );
    t.equal(
      calls[0].options.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'the over-count correction is a cache-bypassing owner-RPC read',
    );
  },
);

t.test(
  'stale-HIGH (HARD delete) — DOCUMENTED RESIDUAL: a stale ACTIVE cache ghost ' +
    'whose authoritative row is GONE has no collision to overwrite, so it ' +
    'survives the union and the over-count INPUT is NOT corrected. Complementary ' +
    'fix (follow-up): read the terminal-REPLACE retirement ops authoritatively ' +
    '(c7a3bf19 pattern on the count path).',
  {todo: 'hard-deleted drain-handoff ghost — tracked follow-up, not this change'},
  async (t) => {
    const staleVoterRows = [
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r1`, nodeId: NODE_1}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r2`, nodeId: NODE_2}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r3`, nodeId: NODE_3}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r4`, nodeId: NODE_3}),
    ];
    // The authoritative owner has HARD-DELETED r4's row (drain committed).
    const freshVoterRows = [
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r1`, nodeId: NODE_1}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r2`, nodeId: NODE_2}),
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r3`, nodeId: NODE_3}),
    ];
    const {rebalancer} = buildLedgerRebalancer({staleVoterRows, freshVoterRows});

    const resolved =
      await rebalancer.resolveFreshCurrentReplicasForCountDecision();

    // DESIRED behaviour (fails today — the ghost survives the union): once the
    // complementary authoritative retire-filter lands, this flips to passing.
    t.same(
      activeVoterReplicaIds(resolved),
      [
        `${LEDGER_PARTITION_ID}-r1`,
        `${LEDGER_PARTITION_ID}-r2`,
        `${LEDGER_PARTITION_ID}-r3`,
      ],
      'the hard-deleted r4 ghost is dropped from the corrected input',
    );
  },
);

t.test(
  'a GENUINE deficit still spreads: when the authoritative view is also ' +
    'short, the fresh-leader count decision still mints the spread ADDs',
  async (t) => {
    // Both the stale cache and the authoritative owner view agree: only 1 voter
    // exists (genuinely under target). The fix must NOT suppress the real spread.
    const staleVoterRows = [
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r1`, nodeId: NODE_1}),
    ];
    const freshVoterRows = [
      partitionVoterRow({replicaId: `${LEDGER_PARTITION_ID}-r1`, nodeId: NODE_1}),
    ];
    const {rebalancer, calls} = buildLedgerRebalancer({
      staleVoterRows,
      freshVoterRows,
    });

    const capture = await captureCountDecision(rebalancer);

    t.same(
      [...activeVoterNodeIds(capture.input)],
      [NODE_1],
      'the genuine 1-voter view is preserved (no phantom voters merged in)',
    );
    t.ok(
      capture.moves.some((move) => move.type === MoveType.ADD),
      'the genuine deficit still mints spread ADD moves',
    );
    t.ok(
      calls.length >= 1,
      'the fresh-leader window still issued the authoritative read',
    );
    t.equal(
      calls[0].options.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'the genuine-deficit read is also a cache-bypassing owner-RPC read',
    );
  },
);

t.test(
  'off the hot path: a non-priority partition never issues the authoritative ' +
    'count read (no behavior change, no owner-RPC)',
  async (t) => {
    const staleVoterRows = [
      partitionVoterRow({replicaId: 'user_table-p1-r1', nodeId: NODE_1}),
      partitionVoterRow({replicaId: 'user_table-p1-r2', nodeId: NODE_2}),
    ].map((row) => ({...row, partition_id: 'user_table-p1'}));
    const nodes = [
      {node_id: NODE_1, status: 'active'},
      {node_id: NODE_2, status: 'active'},
      {node_id: NODE_3, status: 'active'},
    ];
    const cache = createMockCache(nodes, staleVoterRows);
    const readiness = createMockReadinessService(cache);
    const {gateway, calls} = createAuthoritativeServicesGateway([]);
    const timeSource = new VirtualTimeSource({startMs: START_MS});
    const rebalancer = new UnifiedRebalancer({
      entityId: 'user_table-p1',
      entityType: EntityType.PARTITION,
      nodeId: NODE_1,
      systemTableCache: cache,
      cdcIntegrationService: createMockCdcService(),
      tablePolicyService: createMockPolicyService(),
      messageRouter: createMockMessageRouter('connected'),
      rebalanceCoordinator: createMockCoordinator(),
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: []};
        },
      },
      controlPlaneSystemTableGateway: gateway,
      controlPlaneReadinessService: readiness,
      nowFn: () => timeSource.now(),
    });
    rebalancer.initialize();
    rebalancer.scheduleNextCheck = () => {};
    rebalancer.enqueueRebalanceCheck = () => true;
    rebalancer.setLeader(true);

    const resolved =
      await rebalancer.resolveFreshCurrentReplicasForCountDecision();

    t.equal(
      calls.length,
      0,
      'a non-priority partition issues no authoritative owner-RPC read',
    );
    t.same(
      [...activeVoterNodeIds(resolved)].sort(),
      [NODE_1, NODE_2],
      'the cache view is returned unchanged off the hot path',
    );
  },
);
