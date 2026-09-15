// Which planning contract each consumer reads, and what happens when the two
// disagree.
//
// The defect these seal: one generic reader served both narration and
// REMOVE-safety, and two class families each defined it, so the mode a caller
// got was decided by mixin installation order. Making REMOVE safety
// authoritative therefore converted every narration consumer to
// authoritative-or-nothing as a side effect and collapsed recovery narration
// wholesale (251 red rows across 18 suites).
//
// Two named contracts now exist and callers name the one they want:
//   readAvailablePriorityRecoveryPlanningSnapshot                  - narration
//   readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety - safety
//
// These are directed witnesses on the owner boundary. The end-to-end
// narration and safety suites remain the witnesses for the semantics each
// contract feeds.
import {test} from '../../src/test-helpers/tap.js';

import {
  PriorityPublicationHandoff,
} from '../../src/rebalancer/priority-publication-handoff.js';
import {
  PriorityRecoverySupersededTarget,
} from '../../src/rebalancer/priority-recovery-superseded-target.js';
import {
  evaluateRemoveSafety,
} from '../../src/rebalancer/operation-workflow-remove-safety-evaluator.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED,
} from '../../src/rebalancer/priority-publication-safety-shared.js';

const {OperationType, REMOVE_SAFETY_EVALUATION_CLASSIFICATION} = SHARED;

const PARTITION_ID = 'replica_operations-p1';
const SOURCE_NODE_ID = 'node-seed';
const TARGET_NODE_ID = 'node-target';
const PEER_NODE_ID = 'node-peer';
const SOURCE_REPLICA_ID = `${PARTITION_ID}-r3`;
const LEADER_REPLICA_ID = `${PARTITION_ID}-r1`;
const PEER_REPLICA_ID = `${PARTITION_ID}-r2`;
const TARGET_REPLICA_ID = `${PARTITION_ID}-r4`;

// Evidence that says "this removal may proceed" and evidence that says
// "defer", distinguishable in any answer by the marker they carry.
const PROCEED = Object.freeze({
  publicationStatus: 'PUBLISHED',
  mode: 'available-says-proceed',
  semanticState: 'recovering_in_flight',
});
const DEFER = Object.freeze({
  publicationStatus: 'ACK_PENDING',
  mode: 'authoritative-says-defer',
});

function replicaRow({replicaId, nodeId, raftRole}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: 'partition',
    partition_id: PARTITION_ID,
    node_id: nodeId,
    raft_role: raftRole,
    status: 'active',
    address: `${nodeId}/partition/${replicaId}`,
  };
}

const sourceFollowerRow = replicaRow({
  replicaId: SOURCE_REPLICA_ID, nodeId: SOURCE_NODE_ID, raftRole: 'follower'});
const coLocatedLeaderRow = replicaRow({
  replicaId: LEADER_REPLICA_ID, nodeId: SOURCE_NODE_ID, raftRole: 'leader'});
const peerFollowerRow = replicaRow({
  replicaId: PEER_REPLICA_ID, nodeId: PEER_NODE_ID, raftRole: 'follower'});
const replacementFollowerRow = replicaRow({
  replicaId: TARGET_REPLICA_ID, nodeId: TARGET_NODE_ID, raftRole: 'follower'});

function replaceOperation() {
  return {
    operationId: 'replace-planning-read-scope',
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    sourceNodeId: SOURCE_NODE_ID,
    sourceReplicaId: SOURCE_REPLICA_ID,
    targetNodeId: TARGET_NODE_ID,
    targetReplicaId: TARGET_REPLICA_ID,
    replicaId: TARGET_REPLICA_ID,
  };
}

// A readiness service whose two contracts are separately observable. A
// surface is absent unless this fixture is asked for it, so "the owner-read
// method does not exist" is expressible as well as "it answers null".
function readinessService({
  available,
  authoritative,
  omitAvailable = false,
  omitAuthoritative = false,
  forbidAvailable = false,
  forbidAuthoritative = false,
}) {
  const calls = {available: 0, authoritative: 0};
  const service = {};
  if (!omitAvailable) {
    service.getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
      calls.available += 1;
      if (forbidAvailable) {
        throw new Error('the AVAILABLE contract must not be read here');
      }
      return available === undefined ? null : available;
    };
  }
  if (!omitAuthoritative) {
    service.getPriorityRecoveryPlanningAnswerForOwnerRead = async () => {
      calls.authoritative += 1;
      if (forbidAuthoritative) {
        throw new Error('the AUTHORITATIVE contract must not be read here');
      }
      return authoritative === undefined ? null : authoritative;
    };
  }
  return {service, calls};
}

// A workflow owner wired for one complete remove-safety evaluation, with the
// REAL planning readers in place: only the readiness service is a fixture, so
// the contract split itself is what these witnesses exercise.
function makeOwner(service, {prototype = PriorityRecoverySupersededTarget} = {}) {
  const rows = [
    sourceFollowerRow, coLocatedLeaderRow, peerFollowerRow,
    replacementFollowerRow,
  ];
  const owner = Object.create(prototype.prototype);
  owner.nodeId = SOURCE_NODE_ID;
  owner.controlPlaneReadinessService = service;
  owner.repository = {
    getOperationsByEntity: async () => [],
    getReplaceSourceReplicaId: (operation) => operation?.sourceReplicaId || null,
    getReplaceTargetReplicaId: (operation) => operation?.targetReplicaId || null,
    isOperationTerminal: () => false,
    isReplaceRemovePhase: () => true,
  };
  owner.messageRouter = null;
  owner.isRemoveInitialDispatchPhase = () => false;
  owner.resolveTimeoutCheckNowMs = () => 0;
  owner.isConcurrentOperationTargetUncontactable = async () => false;
  owner.getCriticalReplicaRowsForSafety = async () => rows;
  owner.isNodeReadyForRouting = () => true;
  owner.resolvePriorityPublicationReplacementLeaderCandidateRow = async () =>
    replacementFollowerRow;
  owner.hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound =
    () => false;
  owner.isReplaceSourceLeaderHandoffRequiredPartition = () => true;
  owner.getCriticalMinReplicaCount = async () => 3;
  owner.getCriticalPartitionRowForSafety = async () => ({
    partition_id: PARTITION_ID,
    leader_node_id: SOURCE_NODE_ID,
  });
  // Completion safety runs for real; these are its collaborators, and they
  // read the planning snapshot the safety contract handed them.
  owner.buildPriorityRecoveryAssessmentContextForOperation =
    (_operation, planningSnapshot) => ({planningSnapshot});
  owner.isPriorityRecoveryRemoveSafetySatisfied = () => false;
  owner.getPriorityRecoverySupersededTargetErrorFromContext = () => null;
  owner.resolvePriorityRemoveSafetyMembershipSnapshot = (
    _planningSnapshot, _priorityRecoveryContext, projectedVoterReadyRows,
  ) => ({
    publishedActiveNodeIdsPresent: true,
    recoveryProjectionNodeIds: [SOURCE_NODE_ID, PEER_NODE_ID, TARGET_NODE_ID],
    projectedVoterReadyNodeIds: [
      ...new Set((projectedVoterReadyRows || []).map((row) => row.node_id)),
    ],
    membershipSource: 'recovery projection membership',
    missingMembershipNodeIds: [],
    useRecoveryProjectionMembership: true,
  });
  owner.getPriorityPublicationLeaderHandoffEvidence = () => null;
  owner.isPriorityPublicationLeaderHandoffRetrySuppressed = () => false;
  owner.getPriorityPublicationReplacementLeaderElectionEvidence = () => null;
  owner.isPriorityActiveReplaceTopologyVoterEvidenceSufficient = () => true;
  owner.getPriorityPublicationSourceLeaderHandoffStallMs = () => null;
  return owner;
}

test('1. a narration consumer reads AVAILABLE evidence and makes no owner read',
  async (t) => {
    const {service, calls} = readinessService({
      available: PROCEED, omitAuthoritative: true});
    const owner = makeOwner(service);
    // The production narration entry point; its snapshot builder is stubbed
    // to surface the evidence the read actually delivered, because what this
    // witness proves is the ROUTING, not the classifier downstream of it.
    owner.buildPriorityRecoveryDecisionSnapshotForOperations =
      (partitionId, _operations, planningSnapshot) => ({
        partitionId, semanticState: planningSnapshot?.semanticState || null});
    const snapshot =
      await owner.getPriorityRecoveryDecisionSnapshotForOperation(
        replaceOperation());
    t.equal(snapshot?.semanticState, 'recovering_in_flight',
      'recovery narration is served by the AVAILABLE contract');
    t.equal(calls.available, 1, 'and it read that contract exactly once');
    t.equal(calls.authoritative, 0,
      'a narration read never reaches the owner surface');
    t.end();
  });

test('2. when the two contracts disagree, the authoritative one decides removal',
  async (t) => {
    const {service, calls} = readinessService({
      available: PROCEED, authoritative: DEFER});
    const evaluation = await evaluateRemoveSafety(
      makeOwner(service), replaceOperation());
    t.not(evaluation?.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      'AVAILABLE evidence saying "proceed" cannot make a removal safe');
    t.ok(calls.authoritative > 0, 'the owner surface was read');
    t.equal(calls.available, 0,
      'and the AVAILABLE surface took no part in the safety decision');
    t.end();
  });

test('3. absent authoritative evidence defers; it never falls back to AVAILABLE',
  async (t) => {
    for (const [name, options] of Object.entries({
      'owner read answers null': {available: PROCEED, authoritative: null},
      'owner read is not implemented': {
        available: PROCEED, omitAuthoritative: true},
    })) {
      const {service, calls} = readinessService(options);
      const evaluation = await evaluateRemoveSafety(
        makeOwner(service), replaceOperation());
      t.not(evaluation?.classification,
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
        `${name}: removal must not be classified safe`);
      t.equal(calls.available, 0,
        `${name}: and no AVAILABLE read is attempted to make progress`);
    }
    t.end();
  });

test('4. leader-handoff safety is governed by the authoritative answer too',
  async (t) => {
    const {service, calls} = readinessService({
      available: PROCEED, authoritative: DEFER});
    // Invoked directly, as a focused caller does: it resolves its own
    // authoritative snapshot because none was supplied.
    const owner = makeOwner(service, {prototype: PriorityPublicationHandoff});
    owner.normalizePriorityPublicationStatus = (planningSnapshot) =>
      planningSnapshot?.publicationStatus || null;
    owner.buildPriorityPublicationLeaderRemoveSafetySnapshot = (
      _operation, _sourceRow, _replacementRow, _partitionRow, planningSnapshot,
    ) => ({state: 'observed', publicationStatus:
      owner.normalizePriorityPublicationStatus(planningSnapshot)});
    const snapshot =
      await owner.buildPriorityPublicationLeaderRemoveSafetySnapshot(
        replaceOperation(), sourceFollowerRow, replacementFollowerRow, null,
        await owner
          .readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety(
            replaceOperation()),
      );
    t.equal(snapshot.publicationStatus, DEFER.publicationStatus,
      'leader safety sees the authoritative publication status');
    t.equal(calls.available, 0,
      'and never the AVAILABLE one, which disagreed');
    t.ok(calls.authoritative > 0);
    t.end();
  });

test('5. one remove-safety evaluation performs one authoritative planning read',
  async (t) => {
    const {service, calls} = readinessService({
      available: PROCEED, authoritative: DEFER});
    await evaluateRemoveSafety(makeOwner(service), replaceOperation());
    t.equal(calls.authoritative, 1,
      'completion, published-membership, projected-quorum and leader safety ' +
      'share one owner read rather than deriving the same answer four times');
    t.end();
  });

test('6. the modes are bound to their callers, not merely available to them',
  async (t) => {
    // A safety evaluation must complete with the AVAILABLE surface booby
    // trapped, and narration must complete with the owner surface booby
    // trapped. Either binding slipping turns one of these into a throw.
    const safety = readinessService({
      forbidAvailable: true, authoritative: DEFER});
    const evaluation = await evaluateRemoveSafety(
      makeOwner(safety.service), replaceOperation());
    t.ok(evaluation, 'remove safety completed without touching AVAILABLE');
    t.equal(safety.calls.available, 0);

    const narration = readinessService({
      available: PROCEED, forbidAuthoritative: true});
    const owner = makeOwner(narration.service);
    owner.buildPriorityRecoveryDecisionSnapshotForOperations =
      (partitionId, _operations, planningSnapshot) => ({
        partitionId, semanticState: planningSnapshot?.semanticState || null});
    const snapshot =
      await owner.getPriorityRecoveryDecisionSnapshotForOperation(
        replaceOperation());
    t.equal(snapshot?.semanticState, 'recovering_in_flight',
      'narration completed without touching the owner surface');
    t.equal(narration.calls.authoritative, 0);
    t.end();
  });

test('7. the fail-closed contract holds through the remove-safety owner, not ' +
  'only through the read module', async (t) => {
  // The end-to-end pin. The old control_plane_publications cases believed
  // they were exercising an authoritative path, but their fixtures supplied
  // no owner-read provider and were silently rescued by the AVAILABLE
  // fallback, so the contract was never actually tested. One witness drives
  // the same scenario twice through the real evaluateRemoveSafety: once with
  // AVAILABLE evidence alone, and once with the same snapshot on the owner
  // surface.
  const converged = Object.freeze({...PROCEED, publicationStatus: 'PUBLISHED'});
  const withoutOwnerEvidence = readinessService({
    available: converged, omitAuthoritative: true});
  const deferred = await evaluateRemoveSafety(
    makeOwner(withoutOwnerEvidence.service), replaceOperation());
  t.not(deferred?.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
    'AVAILABLE evidence alone cannot authorize a priority-control-plane ' +
    'removal, however converged it says the formation is');
  t.equal(withoutOwnerEvidence.calls.available, 0,
    'and the AVAILABLE surface is not consulted by remove safety at all');

  // The same fixture, the same snapshot, now presented where the safety
  // contract looks for it.
  const withOwnerEvidence = readinessService({
    available: converged, authoritative: converged});
  const owner = makeOwner(withOwnerEvidence.service);
  // Completion safety is satisfied on this run, which is what lets the
  // downstream evaluation reach its SAFE result.
  owner.isPriorityRecoveryRemoveSafetySatisfied = () => true;
  const evaluation = await evaluateRemoveSafety(owner, replaceOperation());
  t.equal(evaluation?.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
    'with owner evidence the downstream remove-safety result is restored');
  t.equal(withOwnerEvidence.calls.authoritative, 1,
    'and it took exactly one owner read to get there');
  t.equal(withOwnerEvidence.calls.available, 0);
  t.end();
});
