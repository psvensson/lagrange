// Witness for the learner-promotion-guard-inputs-observed quest.
// Raw node:test so the anchored receipt runner selects exactly one scenario.
//
// SCOPE. Two of the inputs the learner-side count check decides on cannot be
// read off the answer it holds: WHICH of the two priority-partition summaries
// the membership-publication derivation chose (its own derived one, or the
// closure witness's refreshed one), and where the planning answer came from
// (a fresh build, a memo, or the retained active snapshot). Both are stated by
// their owners here, and both are stated OUTSIDE the objects they describe —
// a field on a summary or a planning answer would reach the memo keys,
// generation digests and equality comparisons that decide publication reuse
// (quest constraint diagnostics-never-decide).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  arePriorityPartitionSummariesEqual,
  chooseMoreAdvancedPriorityPartitionSummary,
  normalizePriorityPartitionSummary,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  normalizeNodeIdList,
  normalizePositiveInteger,
} from '../../src/control-plane/membership-publication-row-helpers.js';
import {
  PRIORITY_PARTITION_SUMMARY_BASE_SOURCE,
  PRIORITY_PARTITION_SUMMARY_SOURCE,
  chooseClosureRefreshedPriorityPartitionSummary,
  choosePriorityPartitionSummaryBase,
  readPriorityPartitionSummaryClosureChoice,
  readPriorityPartitionSummarySource,
} from '../../src/control-plane/priority-partition-summary-source.js';
import {
  PRIORITY_RECOVERY_CLOSURE_EVIDENCE_ROUTE,
} from '../../src/control-plane/membership-publication-readiness-repair.js';
import {
  buildMembershipPublicationRow,
  deriveMembershipPublicationCandidate,
  serializeMembershipPublicationRow,
} from '../../src/control-plane/membership-publication-planning-evidence.js';
import {
  buildPriorityRecoveryBlockedPartitionIds,
} from '../../src/control-plane/priority-recovery-planning-intent.js';
import {
  CLOSURE_ROUTE_CASE,
  CLOSURE_ROUTE_CASE_IDS,
  LEARNER_NODE,
  NOW_MS,
  SUBJECT_PARTITION_ID,
  buildClosureRouteCacheRows,
  buildClosureRouteCaseInput,
} from './closure-witness-route-cases.js';
import {
  PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN,
  beginPriorityRecoveryPlanningAnswer,
  readPriorityRecoveryPlanningAnswerOrigin,
  recordPriorityRecoveryPlanningProjectionReuse,
  statePriorityRecoveryPlanningAnswerOrigin,
} from '../../src/control-plane/priority-recovery-planning-answer-origin.js';
import {
  ControlPlaneReadinessPublicationPlanningSnapshot,
} from '../../src/control-plane/control-plane-readiness-publication-planning-snapshot.js';
import {
  createPartitionServiceLearnerPromotionMethods,
} from '../../src/partition/partition-service-learner-promotion-methods.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  createVirtualNetwork,
} from '../distributed/harness/virtual-network.js';
import {
  createSimulatedNodeHosts,
} from '../simulation/formation-sim-node-hosts.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS];
const SUMMARY_HELPERS = Object.freeze({
  normalizeNodeIdList,
  normalizePositiveInteger,
});
const PUBLISHER_NODE_ID = 'seed';
const GUARD_NODE_ID = 'node-2';
const GUARD_PARTITION_ID = SUBJECT_PARTITION_ID;
const GUARD_REPLICA_ID = `${GUARD_PARTITION_ID}-r5`;
const GUARD_CHECK_LIMIT = 6;
const OTHER_NODE_ID = 'node-2';
const T0 = Date.parse('2026-09-19T06:00:00.000Z');
const STALE_GRACE_MS = 15_000;

function semanticBlock(overrides = {}) {
  return {
    partitionId: PARTITION_ID,
    requiredDistinctNodeCount: 3,
    readyDistinctNodeCount: 2,
    readyReplicaCount: 2,
    spreadGap: 1,
    exclusionReasonCounts: {},
    ...overrides,
  };
}

function semanticSummary(blockedPartition) {
  return {
    satisfied: false,
    requiredDistinctNodeCount: 3,
    readyEligibleNodeCount: 3,
    totalPriorityPartitionCount: 1,
    missingPartitionIds: [PARTITION_ID],
    blockedPartitions: [blockedPartition],
  };
}

// A readiness planning owner whose heavy builders are counted stand-ins, in
// the shape test/control-plane/cl-033-planning-projection-memo.test.js uses.
function planningOwner(overrides = {}) {
  let clock = T0;
  const builds = [];
  const owner = Object.create(
    ControlPlaneReadinessPublicationPlanningSnapshot.prototype,
  );
  Object.assign(owner, {
    nodeId: PUBLISHER_NODE_ID,
    now: () => (clock += 1),
    membershipPublicationPlanningActiveStaleGraceMs: STALE_GRACE_MS,
    membershipPublicationPlanningSourceRevision: 0,
    priorityRecoveryPlanningProjectionMemoByNodeId: new Map(),
    getMembershipPublicationPlanningSnapshotSync: (nodeId) => ({read: nodeId}),
    buildTrackedPriorityRecoveryPlanningProjection: (snapshot) => {
      builds.push(snapshot?.read ?? null);
      return Object.freeze({
        projectionFor: snapshot?.read ?? null,
        build: builds.length,
      });
    },
    isPriorityControlPlaneRecoveryActive: () => true,
    storeActivePriorityRecoveryPlanningSnapshot: () => {},
    clearActivePriorityRecoveryPlanningSnapshot: () => {},
    ...overrides,
  });
  return {owner, builds};
}

// The same owner with its REAL projection builder: this host is used only to
// show what the builder does to the summary object it is handed.
function projectionCarrierOwner() {
  const owner = Object.create(
    ControlPlaneReadinessPublicationPlanningSnapshot.prototype,
  );
  Object.assign(owner, {
    nodeId: PUBLISHER_NODE_ID,
    now: () => T0,
    planningPublicationRecoveryGateMemo: new WeakMap(),
    planningProjectionByInputSnapshot: new WeakMap(),
    systemTableCache: null,
    membershipPublicationService: null,
    getLocalClusterIncarnationFence: () => null,
  });
  return owner;
}

// The same owner with the planning-ANSWER memo live: only the retention
// decision is forced, the memo machinery is the real one. A non-null planning
// generation is what lets that memo store and serve (the projection host above
// has none), so this host is the one that reaches the answer-memo path.
//
// `shape` selects which of the three retention returns the uncached resolver
// takes: the complete-and-retain branch, the incomplete branch whose own
// resolution is not an object, and the incomplete branch that MERGES the
// retained gate into a fresh projection - the common product in production.
const RETENTION_SHAPE = Object.freeze({
  COMPLETE_RETAIN: 'complete-retain',
  INCOMPLETE_NO_RESOLUTION: 'incomplete-no-resolution',
  INCOMPLETE_MERGED: 'incomplete-merged',
});

function retentionOwner(shape = RETENTION_SHAPE.COMPLETE_RETAIN) {
  const retainedSnapshot = Object.freeze({retained: true, publicationEpoch: 3});
  const uncachedCalls = [];
  const incomplete = shape !== RETENTION_SHAPE.COMPLETE_RETAIN;
  const {owner} = planningOwner({
    isPriorityControlPlaneRecoveryActive: () => false,
    buildPriorityRecoveryPlanningProjection: (snapshot) =>
      shape === RETENTION_SHAPE.INCOMPLETE_NO_RESOLUTION ? null : snapshot,
    isPriorityRecoveryPlanningSnapshotIncomplete: () => incomplete,
    getActivePriorityRecoveryPlanningSnapshot: () => retainedSnapshot,
    shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot: () => true,
    buildRetainedPriorityRecoveryPlanningGate: () => Object.freeze({}),
    readPlanningProjectionGenerationForCall: () => 'generation-1',
  });
  const uncached = owner.resolvePriorityRecoveryPlanningAnswerUncached;
  owner.resolvePriorityRecoveryPlanningAnswerUncached = function(...args) {
    uncachedCalls.push(args[0]);
    return uncached.apply(this, args);
  };
  return {owner, uncachedCalls, retainedSnapshot, merged: incomplete &&
    shape === RETENTION_SHAPE.INCOMPLETE_MERGED};
}

// The learner-side guard, reading a REAL ControlPlaneReadinessService: the
// simulated node hosts build one over a virtual network, with its real cache,
// CDC service, publication coordinator and planning memos. Only the guard's
// own system-table rows are a fixture, because the subject here is the
// planning owner, not the census.
function learnerGuardOver(readinessService, systemTableCache, nodeId) {
  const lines = [];
  const guard = {
    ...createPartitionServiceLearnerPromotionMethods(),
    role: 'learner',
    leaderId: `${GUARD_PARTITION_ID}-r1`,
    partitionId: GUARD_PARTITION_ID,
    replicaId: GUARD_REPLICA_ID,
    nodeId,
    isJoiningExistingGroup: false,
    isShutdown: false,
    learnerPromotionTimer: null,
    learnerPromotionCountCheckInputsLogged: false,
    learnerCatchUpCheckIntervalMs: 1000,
    logger: {info: (msg, fields) => lines.push({msg, fields}),
      warn() {}, debug() {}},
    systemTableCache,
    controlPlaneReadinessService: readinessService,
    metadataPublicationReadinessState: {
      getSnapshot: () => ({phase: 'warming', ready: false, draining: false,
        reasons: ['READINESS_STABLE_WINDOW_PENDING']}),
    },
    scheduleLearnerPromotion() {},
    async applyLearnerPromotionProofGate() {},
  };
  return {guard, lines};
}

function simulatedReadinessService(nodeId, startMs) {
  const network = createVirtualNetwork({startMs});
  network.registerNode(nodeId, () => undefined);
  return createSimulatedNodeHosts({
    network,
    nodeId,
    randomSource: {random: () => 0.5},
  });
}

function guardOverRealPlanningOwner() {
  const hosts = simulatedReadinessService(GUARD_NODE_ID, Date.now());
  const serviceRow = (index, raftRole, nodeId) => ({
    partition_id: GUARD_PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: 'active',
    raft_role: raftRole,
    node_id: nodeId,
    replica_id: `${GUARD_PARTITION_ID}-r${index}`,
    service_id: `${GUARD_PARTITION_ID}-r${index}`,
  });
  const services = [
    serviceRow(1, 'leader', 'node-0'), serviceRow(2, 'follower', 'node-0'),
    serviceRow(3, 'follower', 'node-1'), serviceRow(4, 'follower', 'node-1'),
    serviceRow(5, 'learner', GUARD_NODE_ID),
  ];
  return learnerGuardOver(hosts.controlPlaneReadinessService, {
    get: (table) => (table === TABLES.PARTITIONS ?
      {partition_id: GUARD_PARTITION_ID, replica_count: 3} : null),
    filter: (table, predicate) =>
      (table === TABLES.SERVICES ? services : []).filter(predicate),
  }, GUARD_NODE_ID);
}

// The same real owner, with the recorded refusal's rows in its own cache: it
// derives the candidate itself, so the route the guard's payload names is the
// route that service's derivation took, end to end.
function guardOverSeededPlanningOwner(caseId) {
  const rows = buildClosureRouteCacheRows(caseId);
  const hosts = simulatedReadinessService(LEARNER_NODE, rows.nowMs);
  const seed = (table, tableRows) => {
    for (const row of tableRows) {
      hosts.cache.applySystemTableChange(table, 'INSERT', row, rows.nowMs);
    }
  };
  seed(TABLES.NODES, rows.nodeRows);
  seed(TABLES.PARTITIONS, rows.partitionRows);
  seed(TABLES.SERVICES, rows.serviceRows);
  seed(TABLES.REPLICA_OPERATIONS, rows.replicaOperationRows);
  seed(TABLES.CONTROL_PLANE_PUBLICATIONS, [rows.publicationRow]);
  return learnerGuardOver(hosts.controlPlaneReadinessService, {
    get: (table, key) => (table === TABLES.PARTITIONS ?
      rows.partitionRows.find((row) => row.partition_id === key) || null :
      null),
    filter: (table, predicate) => (table === TABLES.SERVICES ?
      rows.serviceRows :
      table === TABLES.REPLICA_OPERATIONS ? rows.replicaOperationRows : [])
      .filter(predicate),
  }, LEARNER_NODE);
}

test('the summary source and the planning answer origin are named by their owners',
  async () => {
    // ---- which summary was chosen -------------------------------------
    const derived = semanticSummary(semanticBlock());
    const closureRefreshed = semanticSummary(semanticBlock({
      expectedReplicaCount: 3,
      exclusionReasonCounts: {row_absent: 1},
    }));

    const refreshedWins = chooseClosureRefreshedPriorityPartitionSummary(
      derived, closureRefreshed, SUMMARY_HELPERS);
    assert.equal(
      readPriorityPartitionSummarySource(refreshedWins),
      PRIORITY_PARTITION_SUMMARY_SOURCE.CLOSURE_REFRESHED,
      'the closure-refreshed summary names itself when it wins');

    const derivedWins = chooseClosureRefreshedPriorityPartitionSummary(
      closureRefreshed, derived, SUMMARY_HELPERS);
    assert.equal(
      readPriorityPartitionSummarySource(derivedWins),
      PRIORITY_PARTITION_SUMMARY_SOURCE.DERIVED,
      'the derivation names its own summary when the refresh does not win');

    const withoutRefresh = chooseClosureRefreshedPriorityPartitionSummary(
      derived, undefined, SUMMARY_HELPERS);
    assert.equal(
      readPriorityPartitionSummarySource(withoutRefresh),
      PRIORITY_PARTITION_SUMMARY_SOURCE.DERIVED,
      'no closure refresh leaves the derived summary as the choice');

    assert.equal(
      readPriorityPartitionSummarySource(semanticSummary(semanticBlock())),
      PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED,
      'a summary nobody chose reads as unrecorded, never as derived');
    assert.equal(
      readPriorityPartitionSummarySource(null),
      PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED);

    // The choice is unchanged and the chosen object carries no new field: the
    // provenance lives beside the summary, not on it.
    assert.deepStrictEqual(
      refreshedWins,
      normalizePriorityPartitionSummary(
        closureRefreshed, {}, SUMMARY_HELPERS),
      'the recorded choice is byte-identical to the unrecorded normal form');
    assert.deepStrictEqual(
      refreshedWins,
      chooseMoreAdvancedPriorityPartitionSummary(
        derived, closureRefreshed, SUMMARY_HELPERS),
      'recording changes nothing about which summary is chosen');
    assert.equal(
      arePriorityPartitionSummariesEqual(
        refreshedWins, closureRefreshed, SUMMARY_HELPERS),
      true,
      'publication equality still sees the two summaries as equal');

    // The chosen summary reaches a consumer BY REFERENCE, so the recorded
    // source is still readable off the answer the guard holds: the planning
    // projection carries the summary object through, it does not rebuild it.
    const projection =
      projectionCarrierOwner().buildTrackedPriorityRecoveryPlanningProjection(
        Object.freeze({
          nodeId: PUBLISHER_NODE_ID,
          publisherNodeId: PUBLISHER_NODE_ID,
          publicationEpoch: 7,
          publicationStatus: 'published',
          priorityPartitionSummary: refreshedWins,
        }),
      );
    assert.equal(projection.priorityPartitionSummary, refreshedWins,
      'the projection carries the chosen summary object itself');
    assert.equal(
      readPriorityPartitionSummarySource(projection.priorityPartitionSummary),
      PRIORITY_PARTITION_SUMMARY_SOURCE.CLOSURE_REFRESHED,
      'so a consumer of the answer reads the source the derivation recorded');

    // ---- where the planning answer came from --------------------------
    assert.deepStrictEqual(
      readPriorityRecoveryPlanningAnswerOrigin({}, PUBLISHER_NODE_ID),
      {origin: PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.UNSTATED,
        servedFromMemo: false},
      'an owner that stated no origin reads as unstated');

    const fresh = planningOwner();
    const firstAnswer = fresh.owner.getPriorityRecoveryPlanningAnswerSync(
      PUBLISHER_NODE_ID, new Date(T0 + 1).toISOString());
    assert.ok(firstAnswer, 'the owner answered');
    assert.equal(fresh.builds.length, 1, 'the projection was built once');
    assert.equal(
      readPriorityRecoveryPlanningAnswerOrigin(
        fresh.owner, PUBLISHER_NODE_ID).origin,
      PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.FRESH,
      'a built answer is named fresh');
    assert.equal(
      readPriorityRecoveryPlanningAnswerOrigin(
        fresh.owner, PUBLISHER_NODE_ID).servedFromMemo,
      false, 'and it was not served from a memo');

    const secondAnswer = fresh.owner.getPriorityRecoveryPlanningAnswerSync(
      PUBLISHER_NODE_ID, new Date(T0 + 2).toISOString());
    assert.equal(secondAnswer, firstAnswer, 'the memo served the same object');
    assert.equal(fresh.builds.length, 1, 'and built nothing');
    assert.deepStrictEqual(
      readPriorityRecoveryPlanningAnswerOrigin(
        fresh.owner, PUBLISHER_NODE_ID),
      {nodeId: PUBLISHER_NODE_ID,
        origin: PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.MEMOIZED,
        servedFromMemo: true},
      'a reused projection is named memoized');
    assert.equal(
      readPriorityRecoveryPlanningAnswerOrigin(
        fresh.owner, OTHER_NODE_ID).origin,
      PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.UNSTATED,
      'an origin stated for one node is never read as another node\'s');

    // The retention path, THROUGH the planning-answer memo. The memo caches
    // whatever the retention layer produced, so every read after the first is
    // a memo hit; a retained answer must still read as retained (round-1
    // verification measured 609 of 616 such reads reporting only "memoized").
    const retained = retentionOwner();
    const answers = [];
    const origins = [];
    for (let call = 1; call <= 3; call += 1) {
      answers.push(retained.owner.getPriorityRecoveryPlanningAnswerSync(
        PUBLISHER_NODE_ID, new Date(T0 + call).toISOString()));
      origins.push(readPriorityRecoveryPlanningAnswerOrigin(
        retained.owner, PUBLISHER_NODE_ID));
    }
    assert.equal(retained.uncachedCalls.length, 1,
      'the planning-answer memo served the second and third reads');
    for (const answer of answers) {
      assert.equal(answer, retained.retainedSnapshot,
        'every read returned the retained snapshot itself');
    }
    assert.deepStrictEqual(
      origins.map((record) => record.origin),
      Array.from({length: 3},
        () => PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.RETAINED),
      'a retained answer reads as retained on every read, memo hit or not');
    assert.deepStrictEqual(
      origins.map((record) => record.servedFromMemo),
      [false, true, true],
      'and the reuse half still reports which reads were served from a memo');

    // Each of the three retention returns states retained on its own. The
    // third is the merged projection, which is the common product live.
    for (const shape of Object.values(RETENTION_SHAPE)) {
      const host = retentionOwner(shape);
      const answer = host.owner.getPriorityRecoveryPlanningAnswerSync(
        PUBLISHER_NODE_ID, new Date(T0 + 4).toISOString());
      assert.ok(answer, `${shape} answered`);
      assert.equal(
        readPriorityRecoveryPlanningAnswerOrigin(
          host.owner, PUBLISHER_NODE_ID).origin,
        PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.RETAINED,
        `the ${shape} retention return states retained`);
    }

    // THE LEAK. The retention layer hands back the node's ACTIVE snapshot,
    // and that same object is what the projection memo serves everybody
    // else. A guard read that took the early return never consulted
    // retention, so it must never inherit another path's retention - round-2
    // verification measured exactly this on real owners.
    // The node's active snapshot: whatever its first guard read produced.
    let activeSnapshot = null;
    const shared = planningOwner({
      buildTrackedPriorityRecoveryPlanningProjection: () =>
        Object.freeze({priorityRecoveryActive: true, publicationEpoch: 1}),
      isPriorityControlPlaneRecoveryActive: (snapshot) =>
        snapshot?.priorityRecoveryActive === true,
      buildPriorityRecoveryPlanningProjection: (snapshot) => snapshot,
      isPriorityRecoveryPlanningSnapshotIncomplete: () => false,
      storeActivePriorityRecoveryPlanningSnapshot: () => {},
      getActivePriorityRecoveryPlanningSnapshot: () => activeSnapshot,
      shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot: () => true,
      readPlanningProjectionGenerationForCall: () => 'generation-1',
    });
    activeSnapshot = shared.owner.getPriorityRecoveryPlanningAnswerSync(
      PUBLISHER_NODE_ID, new Date(T0 + 5).toISOString());
    assert.equal(
      readPriorityRecoveryPlanningAnswerOrigin(
        shared.owner, PUBLISHER_NODE_ID).origin,
      PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.FRESH,
      'the guard read built the projection and took the early return');

    // Another consumer's readiness evaluation resolves a NON-active snapshot;
    // the retention rule hands it that very object.
    const otherPathAnswer = shared.owner.resolvePriorityRecoveryPlanningAnswer(
      PUBLISHER_NODE_ID, new Date(T0 + 6).toISOString(),
      Object.freeze({priorityRecoveryActive: false}));
    assert.equal(otherPathAnswer, activeSnapshot,
      'the other path was handed the object the projection memo serves');

    const afterLeak = shared.owner.getPriorityRecoveryPlanningAnswerSync(
      PUBLISHER_NODE_ID, new Date(T0 + 7).toISOString());
    assert.equal(afterLeak, activeSnapshot,
      'the next guard read is the same memoized projection');
    assert.deepStrictEqual(
      {...readPriorityRecoveryPlanningAnswerOrigin(
        shared.owner, PUBLISHER_NODE_ID), nodeId: undefined},
      {nodeId: undefined,
        origin: PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.MEMOIZED,
        servedFromMemo: true},
      'and it reads memoized - retention it never consulted cannot reach it');

    // The call facts belong to the node they were taken for.
    const nodeScoped = planningOwner().owner;
    beginPriorityRecoveryPlanningAnswer(nodeScoped, PUBLISHER_NODE_ID);
    recordPriorityRecoveryPlanningProjectionReuse(
      nodeScoped, OTHER_NODE_ID, true);
    statePriorityRecoveryPlanningAnswerOrigin(
      nodeScoped, PUBLISHER_NODE_ID, {});
    assert.equal(
      readPriorityRecoveryPlanningAnswerOrigin(
        nodeScoped, PUBLISHER_NODE_ID).servedFromMemo,
      false,
      'a reuse record taken for another node never answers for this one');

    // END TO END against a REAL planning owner: the guard's own log payload
    // carries the origin and the reuse half, and both are true of the owner
    // that answered.
    const real = guardOverRealPlanningOwner();
    const observed = [];
    for (let check = 1; check <= GUARD_CHECK_LIMIT; check += 1) {
      await real.guard.runLearnerPromotionCheck();
      const {planningAnswer} = real.lines[real.lines.length - 1]
        .fields.countCheckInputs.priorityRecovery;
      observed.push(planningAnswer);
      if (planningAnswer.servedFromMemo === true) break;
    }
    assert.equal(observed[0].present, true,
      'a real planning owner answered the guard');
    assert.equal(observed[0].origin,
      PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.FRESH,
      'the first read of a real owner is fresh');
    assert.equal(observed[0].servedFromMemo, false);
    const reused = observed[observed.length - 1];
    assert.equal(reused.servedFromMemo, true,
      'a later read is served from the real projection memo');
    assert.equal(reused.origin,
      PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.MEMOIZED,
      'and the payload names it memoized');
    for (const payload of observed) {
      assert.notEqual(payload.origin,
        PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.UNSTATED,
        'a real owner always states an origin');
      assert.notEqual(payload.origin,
        PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.RETAINED,
        'nothing on this path came out of the retention layer');
    }
  });

// ---------------------------------------------------------------------------
// Witness for the closure-witness-route-observed quest.
//
// SCOPE. The refusal payload names WHICH summary won, never WHY. The closure
// evidence owner has three routes - a witness retained from the planning
// snapshot outright, one built from the node's own rows, or none at all - and
// which one ran is not observable, so a reproduction cannot know which live
// input it lacks. The three cases below reach the owner THROUGH the real
// candidate derivation, never by calling it, and the route, the witness, this
// partition's own decision and the base summary the choice was made against
// are read back from beside the chosen summary.
// ---------------------------------------------------------------------------

function deriveRouteCase(caseId, retainedClosureWitness = null) {
  const candidate = deriveMembershipPublicationCandidate(
    buildClosureRouteCaseInput(caseId, retainedClosureWitness));
  return {
    candidate,
    choice: readPriorityPartitionSummaryClosureChoice(
      candidate.priorityPartitionSummary),
  };
}

// Main's own output for each case, captured on f9d388499 before this quest
// changed a line: the sha256 of the whole candidate, of the row the
// publication writer persists from it, and the change flag the publication
// comparison produced. A candidate that gained one field breaks all three.
const MAIN_ORACLE = Object.freeze({
  [CLOSURE_ROUTE_CASE.BUILT_CLOSURE_REFRESHED]: Object.freeze({
    candidate: 'f05bab25eec0db2f67b44db18c42d878',
    publicationRow: 'd3eb80b95cfe8ef064ca4c74cd96be01',
    summaryChanged: true,
  }),
  [CLOSURE_ROUTE_CASE.BUILT_CLOSURE_PENDING]: Object.freeze({
    candidate: 'a7be6ca34e622d7a59f987ea485505d7',
    publicationRow: 'fd981c81009a272eddfcadb4eda11de4',
    summaryChanged: true,
  }),
  [CLOSURE_ROUTE_CASE.NONE_NO_OPERATION_ROWS]: Object.freeze({
    candidate: '1eb5518fae1f4820c0382c7c65264f70',
    publicationRow: 'fd981c81009a272eddfcadb4eda11de4',
    summaryChanged: true,
  }),
  [CLOSURE_ROUTE_CASE.RETAINED_SATISFIED_WITNESS]: Object.freeze({
    candidate: 'bc27d9eca791bb4e75d381ae63ccd586',
    publicationRow: 'd3eb80b95cfe8ef064ca4c74cd96be01',
    summaryChanged: true,
  }),
});
const ORACLE_DIGEST_LENGTH = 32;

function oracleDigest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, ORACLE_DIGEST_LENGTH);
}

test('the closure evidence route is stated on every route the derivation takes',
  async () => {
    // The names are what a log reader sees, so they are pinned as literals
    // rather than through the constant the payload is built from.
    assert.deepStrictEqual({...PRIORITY_RECOVERY_CLOSURE_EVIDENCE_ROUTE},
      {RETAINED: 'retained', BUILT: 'built', NONE: 'none'},
      'the three route names are the ones the log will carry');

    // BUILT: replica-operation rows and no retained witness, so the owner
    // builds the decision snapshots from the node's own rows.
    const built = deriveRouteCase(CLOSURE_ROUTE_CASE.BUILT_CLOSURE_REFRESHED);
    assert.equal(built.choice.closureRoute,
      PRIORITY_RECOVERY_CLOSURE_EVIDENCE_ROUTE.BUILT,
      'rows and no retained witness is the built route');
    assert.ok(built.candidate.priorityRecoveryDecisionSnapshots,
      'the built route produced decision snapshots');
    assert.equal(built.choice.decisionSnapshots,
      built.candidate.priorityRecoveryDecisionSnapshots,
      'and recorded the very snapshots the derivation produced');
    assert.equal(built.choice.closureWitness,
      built.candidate.priorityRecoveryClosureWitness,
      'and the witness object the derivation chose against');
    assert.equal(built.choice.source,
      PRIORITY_PARTITION_SUMMARY_SOURCE.CLOSURE_REFRESHED,
      'this is the recorded refusal shape: the refreshed summary won');

    // NONE: no replica-operation rows at all, so there is no witness to have.
    const none = deriveRouteCase(CLOSURE_ROUTE_CASE.NONE_NO_OPERATION_ROWS);
    assert.equal(none.choice.closureRoute,
      PRIORITY_RECOVERY_CLOSURE_EVIDENCE_ROUTE.NONE,
      'no operation rows is the none route');
    assert.equal(none.candidate.priorityRecoveryClosureWitness, null);
    assert.equal(none.choice.closureWitness, null);
    assert.equal(none.choice.decisionSnapshots, null);

    // RETAINED: the planning snapshot already carries a witness, and the
    // owner takes it outright before it reads a local row.
    const retained = deriveRouteCase(
      CLOSURE_ROUTE_CASE.RETAINED_SATISFIED_WITNESS,
      built.candidate.priorityRecoveryClosureWitness);
    assert.equal(retained.choice.closureRoute,
      PRIORITY_RECOVERY_CLOSURE_EVIDENCE_ROUTE.RETAINED,
      'a witness on the planning snapshot is the retained route');
    assert.equal(retained.candidate.priorityRecoveryDecisionSnapshots, null,
      'the retained route builds no decision snapshots');
    assert.equal(retained.choice.decisionSnapshots, null);
    assert.equal(retained.choice.closureWitness,
      built.candidate.priorityRecoveryClosureWitness,
      'the retained witness is the one that was handed in');
    assert.equal(retained.choice.source,
      PRIORITY_PARTITION_SUMMARY_SOURCE.CLOSURE_REFRESHED,
      'a retained satisfied witness wins the choice with no local evidence');

    // A summary no derivation chose is UNRECORDED, never a route by default.
    assert.equal(
      readPriorityPartitionSummaryClosureChoice(semanticSummary(
        semanticBlock())).closureRoute,
      PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED);
    assert.equal(
      readPriorityPartitionSummaryClosureChoice(null).closureRoute,
      PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED);

    // END TO END through a REAL ControlPlaneReadinessService holding the
    // recorded refusal's rows: the service derives the candidate itself, and
    // the guard's payload names the route that derivation took.
    const seeded = guardOverSeededPlanningOwner(
      CLOSURE_ROUTE_CASE.BUILT_CLOSURE_REFRESHED);
    await seeded.guard.runLearnerPromotionCheck();
    const {closure, prioritySummary, completion} =
      seeded.lines[seeded.lines.length - 1]
        .fields.countCheckInputs.priorityRecovery;
    assert.equal(prioritySummary.satisfied, true);
    assert.equal(prioritySummary.source,
      PRIORITY_PARTITION_SUMMARY_SOURCE.CLOSURE_REFRESHED);
    assert.equal(completion.temporaryOverflowVoterBudget, 0,
      'this is the recorded refusal reading, produced by a real owner');
    assert.equal(closure.route,
      PRIORITY_RECOVERY_CLOSURE_EVIDENCE_ROUTE.BUILT,
      'and the payload now says which route produced the witness it read');
    assert.equal(closure.witnessMatchesAnswer, true,
      'the record is the one the answer the guard decided on carries');

    // The same real owner with no operation rows in its cache takes the
    // none route, so the end-to-end route is not a constant.
    const empty = guardOverRealPlanningOwner();
    await empty.guard.runLearnerPromotionCheck();
    assert.equal(
      empty.lines[empty.lines.length - 1]
        .fields.countCheckInputs.priorityRecovery.closure.route,
      PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED,
      'a real service that chose no summary at all records no route');
  });

test('the base summary the closure choice was made against is stated',
  async () => {
    // The base is itself a choice: the planning snapshot's own summary,
    // normalized, against the one derived from this node's service rows.
    const derived = semanticSummary(semanticBlock());
    const published = semanticSummary(semanticBlock({
      readyDistinctNodeCount: 3, spreadGap: 0}));
    assert.equal(
      choosePriorityPartitionSummaryBase(published, derived, SUMMARY_HELPERS)
        .source,
      PRIORITY_PARTITION_SUMMARY_BASE_SOURCE.PUBLISHED_NORMALIZED,
      'the planning snapshot\'s own summary names itself when it wins');
    assert.equal(
      choosePriorityPartitionSummaryBase(derived, published, SUMMARY_HELPERS)
        .source,
      PRIORITY_PARTITION_SUMMARY_BASE_SOURCE.DERIVED,
      'the locally derived census names itself when it wins');
    // The choice itself is still main's, on every ordering and on null.
    for (const [left, right] of [[published, derived], [derived, published],
      [null, derived], [published, null], [null, null]]) {
      assert.deepStrictEqual(
        choosePriorityPartitionSummaryBase(left, right, SUMMARY_HELPERS)
          .summary,
        chooseMoreAdvancedPriorityPartitionSummary(
          left, right, SUMMARY_HELPERS),
        'the base choice is the one main\'s owner makes');
    }

    // Through the real derivation: the base the closure choice compared
    // against is recorded beside the chosen summary, with this partition's
    // blocked flag readable off it.
    for (const caseId of [CLOSURE_ROUTE_CASE.BUILT_CLOSURE_REFRESHED,
      CLOSURE_ROUTE_CASE.BUILT_CLOSURE_PENDING]) {
      const {choice} = deriveRouteCase(caseId);
      assert.ok(choice.baseSummary,
        `${caseId} recorded the base summary it compared against`);
      assert.equal(choice.baseSummary.satisfied, false,
        `${caseId} base summary still shows the spread gap`);
      assert.equal(choice.baseSummarySource,
        PRIORITY_PARTITION_SUMMARY_BASE_SOURCE.DERIVED,
        `${caseId} base summary came from this node's own census`);
      assert.ok(
        buildPriorityRecoveryBlockedPartitionIds(choice.baseSummary)
          .includes(GUARD_PARTITION_ID),
        `${caseId} base summary blocks the subject partition`);
    }

    // END TO END: the payload block, from a real owner that derived the
    // recorded refusal's candidate itself.
    const seeded = guardOverSeededPlanningOwner(
      CLOSURE_ROUTE_CASE.BUILT_CLOSURE_REFRESHED);
    await seeded.guard.runLearnerPromotionCheck();
    const payload = seeded.lines[seeded.lines.length - 1]
      .fields.countCheckInputs.priorityRecovery;
    assert.equal(payload.prioritySummary.satisfied, true,
      'the summary the guard read says satisfied');
    assert.deepStrictEqual({...payload.closure.baseSummary}, {
      satisfied: false,
      source: PRIORITY_PARTITION_SUMMARY_BASE_SOURCE.DERIVED,
      thisPartitionBlocked: true,
    }, 'while the base it was chosen over still blocked this partition');

    // The recorded base summary is the object the derivation held, never a
    // copy, and it never became a field of the chosen summary.
    const {candidate, choice} = deriveRouteCase(
      CLOSURE_ROUTE_CASE.BUILT_CLOSURE_REFRESHED);
    assert.notEqual(choice.baseSummary, candidate.priorityPartitionSummary,
      'the base and the chosen summary are different objects here');
    assert.equal(
      Object.keys(candidate.priorityPartitionSummary)
        .includes('baseSummary'), false,
      'and nothing about the base is a field of the chosen summary');
  });

test('the candidate derivation and the row it is persisted as are unchanged',
  async () => {
    const seed = deriveMembershipPublicationCandidate(
      buildClosureRouteCaseInput(
        CLOSURE_ROUTE_CASE.BUILT_CLOSURE_REFRESHED));
    const retainedWitness = seed.priorityRecoveryClosureWitness;
    for (const caseId of CLOSURE_ROUTE_CASE_IDS) {
      const candidate = deriveMembershipPublicationCandidate(
        buildClosureRouteCaseInput(caseId, retainedWitness));
      const expected = MAIN_ORACLE[caseId];
      assert.equal(oracleDigest(candidate), expected.candidate,
        `${caseId}: the whole candidate is main's, field for field`);
      assert.equal(
        oracleDigest(serializeMembershipPublicationRow(
          buildMembershipPublicationRow({candidate, nowMs: NOW_MS}))),
        expected.publicationRow,
        `${caseId}: the persisted publication row is byte-identical`);
      assert.equal(candidate.priorityPartitionSummaryChanged,
        expected.summaryChanged,
        `${caseId}: the publication change comparison is unchanged`);
      assert.equal(
        Object.keys(candidate).includes('priorityRecoveryClosureRoute'),
        false,
        `${caseId}: the route never became a field of the candidate`);
      assert.deepStrictEqual(
        candidate.priorityPartitionSummary,
        normalizePriorityPartitionSummary(
          candidate.priorityPartitionSummary, {}, SUMMARY_HELPERS),
        `${caseId}: the chosen summary is its own normal form, field for field`);
      // The chosen summary carries no diagnostic field, so the equality the
      // publication writer compares on cannot see one.
      assert.equal(
        arePriorityPartitionSummariesEqual(
          candidate.priorityPartitionSummary,
          normalizePriorityPartitionSummary(
            candidate.priorityPartitionSummary, {}, SUMMARY_HELPERS),
          SUMMARY_HELPERS),
        true,
        `${caseId}: summary equality still sees the normal form as equal`);
    }
  });
