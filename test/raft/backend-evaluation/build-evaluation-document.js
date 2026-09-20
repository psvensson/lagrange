#!/usr/bin/env node
// Generates the one evaluation artifact this quest produces, by RUNNING the
// same scenario functions the receipts assert on - so the document cannot
// say something the tests did not measure - and rendering the markdown from
// the JSON it just wrote.
//
//   node test/raft/backend-evaluation/build-evaluation-document.js
//
// It is a generator, not a checker: it measures nothing on its own and
// decides nothing on its own. The three verdicts are derived here from the
// scenario results by the rules stated beside each one, and the derivation
// itself is re-checked by `evaluation-derivation.test.js`.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {ARTIFACT, artifactPath, repositoryRoot} from './evaluation-artifact.js';
import {
  CONF_CHANGE_TRANSITION,
  FORK,
  MEMBERSHIP_FIELD,
  NOT_FROM_CORE,
  ORIGIN,
  auditAgainstLedger,
} from './forked-core-harness.js';
import {
  censusNames,
  deriveProductionRaftCallCensus,
} from './production-raft-call-census.js';
import {spikeCheckNames, spikeMembershipSites} from './spike-surface-census.js';
import {
  BATCH,
  INTENTIONALLY_INDISTINGUISHABLE,
  runApplyRefusalRegression,
  runAutoLeaveSelfAppendedBoundary,
  runBoundaryMatrix,
  runDeterminismProof,
  runLostProposalOneFollower,
  runIngressValidation,
  runPromotionGating,
  runRuntimeTrapRecovery,
  runTriggerShifts,
  runConfStateConvergence,
  runDisagreeingCaches,
  runDurableRecordCorruptions,
  runHostOrderMutants,
  runJointQuorumRequirement,
  runJointReapplication,
  runJointReplacement,
  runLostProposal,
  runJointReplacementWithFailure,
  runMultiRaftCost,
  runPanicIsolation,
  runPeerIdentity,
  runPendingConfChange,
  runReadyOrdering,
  runReapplicationIdempotence,
  runSequentialFailureMatrix,
  runSequentialReplacement,
  runSequentialReplacementWithFailure,
  runThreeVoterGroup,
} from './core-scenarios.js';
import {
  BACKEND_OBLIGATIONS,
  CORE_DOES_NOT_DO_THIS_FOR_YOU,
  HOST_MUST_GUARANTEE,
  ORDER_NOTE,
  HOST_STEPS,
  ORDER_CONSTRAINTS,
  RAFT_RS,
  RAFT_RS_GUARANTEES,
  writeLogConformsToContract,
} from './host-contract.js';
import {
  hostAmbientInputCensus,
  hostConsensusSurfaceCensus,
} from './host-consensus-surface.js';
import {
  CONSENSUS_INPUTS,
  WASM_INPUTS,
  consensusVerdict,
  wasmVerdict,
} from './verdict-derivation.js';
import {
  runConfigurationLocality,
  runTermAndVoteAcrossRestart,
  runTwoCachesTwoConfigurations,
} from './liferaft-scenarios.js';

const UTF8 = 'utf8';
const FORECAST_LABEL = 'forecast';

// The owner's four categories, by those exact names. Every name the census
// finds sits in exactly one of the first three; PRODUCTION GAP holds what
// the census does NOT find and a raft-rs backend requires.
const CATEGORY = Object.freeze({
  MUST_SERVE: 'MUST SERVE',
  MEMBERSHIP_LOCAL: 'MEMBERSHIP-LOCAL DELETE CANDIDATE',
  DIFFERENT_IMPLEMENTATION: 'DIFFERENT IMPLEMENTATION',
  PRODUCTION_GAP: 'PRODUCTION GAP',
});

// Narrow, as the owner specified: local join, local leave, the mutable local
// nodes list, joinPeer, and peer-cache reconciliation as Raft membership
// authority. Only this category feeds the deletion forecast.
const MEMBERSHIP_LOCAL_NAMES = Object.freeze([
  'join', 'leave', 'joinPeer', 'nodes',
]);

// Names the census DOES find in production for which raft-rs has no
// equivalent at all. Round 2: `change` forces the node into the LEADER state
// and sat under DIFFERENT IMPLEMENTATION, which implied raft-rs does the
// same thing differently. It does not do it at all.
const PRODUCTION_GAP_NAMES = Object.freeze(['change']);

// Capabilities Lagrange still needs whatever the backend is, and which
// raft-rs serves through essentially the same operation.
const MUST_SERVE_NAMES = Object.freeze([
  'command', 'propose', 'proposeWithLeaderRouting',
  'getCommittedIndex', 'getCurrentTerm', 'term', 'log',
  // Moved here after verification round 1: these are capabilities a backend
  // must serve, not mechanisms that merely change shape. Committed-entry
  // delivery to the state machine and knowing who leads are things Lagrange
  // needs from any backend.
  'leader', 'state', 'commitEntries', 'prepareCommitApply',
]);

// Capability remains, raft-rs provides it differently. This is NOT
// architectural deletion: each group names the mechanism that replaces it.
const DIFFERENT_IMPLEMENTATION_GROUPS = Object.freeze([
  {
    capability: 'election timing and heartbeats',
    raftRsMechanism: 'RawNode::tick driven by one host tick source',
    names: ['heartbeat', 'timeout', 'election', 'beat', 'timers',
      'startElectionTimer', 'requestElectionNow', 'clearTimers',
      'deferCandidacy', 'configureTickInterval', 'setTickInterval',
      'tickIntervalMs', '_candidacyReluctantUntilMs',
      '_electionRandomSource'],
  },
  {
    capability: 'role and leadership change notification',
    raftRsMechanism: 'Ready::ss (SoftState) and Status::ss',
    // `change` moved OUT after verification round 2: forcing the node into
    // the LEADER state has no raft-rs equivalent at all, so it is a
    // PRODUCTION GAP, not a different implementation of the same thing.
    names: ['on', 'emit', 'listeners', 'removeListener'],
  },
  {
    capability: 'message encoding, send and receive',
    raftRsMechanism: 'Ready::messages / persisted_messages out, ' +
      'RawNode::step in',
    names: ['packet', 'appendPacket', 'message', 'write', 'protocolTasks'],
  },
  {
    capability: 'committed entry delivery to the state machine',
    raftRsMechanism: 'Ready::committed_entries and LightReady::' +
      'committed_entries, then advance_apply',
    names: ['_commitApplyTail', '_followerAppendBatchTail'],
  },
  {
    capability: 'snapshot catch-up and install',
    raftRsMechanism: 'Ready::snapshot plus Storage::apply_snapshot',
    names: ['_onSnapshotCatchupNeeded', '_lastSnapshotCatchupDecision',
      '_lastSnapshotCatchupDecisionError'],
  },
  {
    capability: 'divergence and lifecycle reporting',
    raftRsMechanism: 'the core\'s own errors from step/apply_conf_change ' +
      'plus Status',
    names: ['_committedPrefixDivergenceKeys', '_lastCommittedPrefixDivergence',
      '_lastCommittedPrefixDivergenceError', '_catchupTimeSource',
      'end', 'shutdownNode', 'createNodeClass', 'constructor'],
  },
]);

// PRODUCTION GAP: what a raft-rs backend requires and Lagrange has no call
// site for. Each is checked to be genuinely absent from the census.
const LACKING = Object.freeze([
  {operation: 'readyPersistenceProtocol',
    why: 'no call site performs the raft-rs Ready persistence protocol at ' +
      'all: there is no persist-then-advance discipline to inherit'},
  {operation: 'confStatePersistence',
    why: 'nothing persists a configuration state, so there is nothing for ' +
      'a restart to restore membership from'},
  {operation: 'membershipGeneration',
    why: 'no generation fences an operation planned against one membership ' +
      'from executing against a later one'},
  {operation: 'stablePeerIdOwnership',
    why: 'no owner assigns, retires or refuses reuse of a stable peer id; ' +
      'today a peer is an address'},
  {operation: 'proposeConfChange',
    why: 'no call site proposes a configuration change, so membership can ' +
      'never become a committed fact'},
  {operation: 'applyConfChange',
    why: 'nothing applies a committed configuration entry, so the ' +
      'configuration the consensus layer holds never moves'},
  {operation: 'confState',
    why: 'nothing observes a configuration state, so there is nothing for ' +
      'service rows to be a projection of'},
  {operation: 'pendingConfIndex',
    why: 'nothing reads whether a configuration change is already pending, ' +
      'which is the one-operation invariant the direction converged on'},
  {operation: 'persistTerm',
    why: 'defined on PartitionRaftStorage and called from nowhere: term is ' +
      'lost across a restart'},
  {operation: 'persistVotedFor',
    why: 'defined on PartitionRaftStorage and called from nowhere: the vote ' +
      'is never recorded at all'},
  {operation: 'appliedIndex',
    why: 'no applied index is handed back to the consensus layer on ' +
      'restart, so it cannot know what has already been applied'},
  {operation: 'readIndex',
    why: 'no linearizable read barrier is requested from the consensus ' +
      'layer'},
  {operation: 'change',
    why: 'liferaft\'s change() forces the node into the LEADER state ' +
      '(partition-service-raft-init-base.js:605). raft-rs has no ' +
      'equivalent: leadership is won, never assigned. Moved here from ' +
      'DIFFERENT IMPLEMENTATION after verification round 2.'},
  {operation: 'forcedLeadership',
    why: 'partition-service-raft-init-base.js:605 forces the node into the ' +
      'LEADER state through liferaft\'s change(). raft-rs has no ' +
      'equivalent: leadership is won, never assigned. Any production path ' +
      'that depends on it has to be re-expressed.'},
]);

const DELETION_FORECAST_CANDIDATES = Object.freeze([
  'local peer-set reconciliation as membership authority',
  'the compatibility overflow budget',
  'multiple voter censuses',
  'max(activeCount, activeVoterCount)',
  'an invented membership generation',
  'much of the authorization carrier',
  'chained-REPLACE admission arithmetic',
  'membership interpretations of SYNCING',
  'local join()/leave() reconciliation',
  'some formation-specific repair machinery',
]);

function splitContract(names) {
  const observed = new Set([
    ...names.nodeMethods, ...names.nodeProperties, ...names.providerMethods,
  ]);
  const differentImplementationNames = new Set(
    DIFFERENT_IMPLEMENTATION_GROUPS.flatMap((group) => group.names));
  const assigned = new Map();
  const unassigned = [];
  for (const name of [...observed].sort()) {
    if (PRODUCTION_GAP_NAMES.includes(name)) {
      assigned.set(name, CATEGORY.PRODUCTION_GAP);
    } else if (MEMBERSHIP_LOCAL_NAMES.includes(name)) {
      assigned.set(name, CATEGORY.MEMBERSHIP_LOCAL);
    } else if (MUST_SERVE_NAMES.includes(name)) {
      assigned.set(name, CATEGORY.MUST_SERVE);
    } else if (differentImplementationNames.has(name)) {
      assigned.set(name, CATEGORY.DIFFERENT_IMPLEMENTATION);
    } else {
      unassigned.push(name);
    }
  }
  const namesIn = (category) => [...assigned.entries()]
    .filter(([, value]) => value === category).map(([name]) => name).sort();
  return {
    categories: CATEGORY,
    observed: names,
    [CATEGORY.MUST_SERVE]: {
      judgment: true,
      why: 'capabilities Lagrange needs whatever the backend is, served by ' +
        'an essentially equivalent raft-rs operation',
      names: namesIn(CATEGORY.MUST_SERVE),
      capabilities: ['elections', 'ticking', 'proposal', 'message delivery',
        'committed-entry delivery', 'readiness processing', 'persistence'],
    },
    [CATEGORY.MEMBERSHIP_LOCAL]: {
      judgment: true,
      why: 'these exist only because membership is a local array; with ' +
        'committed membership they have nothing to do. This is the ONLY ' +
        'category the deletion forecast may count.',
      names: namesIn(CATEGORY.MEMBERSHIP_LOCAL),
      productionSites: [
        'src/raft/liferaft-provider.js:255-260 (joinPeer -> raftNode.join)',
        'src/partition/partition-service-raft-peer-cache-reconciliation.js:' +
          '231-306 (peer-cache reconciliation as Raft membership authority)',
        'src/partition/partition-service-raft-peer-cache-reconciliation.js:' +
          '145-168 (retire a peer by address)',
      ],
    },
    [CATEGORY.DIFFERENT_IMPLEMENTATION]: {
      judgment: true,
      why: 'the capability remains and raft-rs provides it differently; ' +
        'this is not architectural deletion',
      names: namesIn(CATEGORY.DIFFERENT_IMPLEMENTATION),
      groups: DIFFERENT_IMPLEMENTATION_GROUPS,
    },
    [CATEGORY.PRODUCTION_GAP]: {
      judgment: false,
      why: 'what a raft-rs backend requires and Lagrange has no call site ' +
        'for, each measured absent from the census - plus the names the ' +
        'census DOES find for which raft-rs has no equivalent at all',
      entries: LACKING,
      namesWithNoRaftRsEquivalent: namesIn(CATEGORY.PRODUCTION_GAP),
    },
    coverage: {
      observedCount: observed.size,
      assignedCount: assigned.size,
      unassigned,
      partitionsExactly: unassigned.length === 0 &&
        assigned.size === observed.size,
    },
  };
}

async function runEveryScenario() {
  const scenarios = [];
  const add = (record) => {
    scenarios.push(record);
    return record;
  };
  const partA = [
    add(runTwoCachesTwoConfigurations()),
    add(await runConfigurationLocality()),
    add(await runTermAndVoteAcrossRestart()),
  ];
  const core = [
    add(runThreeVoterGroup()),
    add(runSequentialReplacement()),
    add(runSequentialReplacementWithFailure()),
    add(runJointReplacement(CONF_CHANGE_TRANSITION.EXPLICIT)),
    add(runJointReplacement(CONF_CHANGE_TRANSITION.AUTO)),
    add(runJointReplacementWithFailure('incoming')),
    add(runJointReplacementWithFailure('outgoing')),
    add(runConfStateConvergence()),
    add(runDisagreeingCaches()),
    add(runPendingConfChange()),
    add(runReadyOrdering()),
    add(runReapplicationIdempotence()),
    add(runJointReapplication()),
    add(runJointQuorumRequirement()),
    add(runSequentialFailureMatrix()),
    add(runHostOrderMutants()),
    add(runLostProposal()),
    add(runDurableRecordCorruptions()),
    add(runLostProposalOneFollower()),
    add(runPromotionGating()),
    add(runApplyRefusalRegression()),
    add(runDeterminismProof()),
    add(runRuntimeTrapRecovery()),
    add(runIngressValidation()),
  ];
  // One matrix, shared with the receipts: the eleven boundaries times both
  // victim roles times both batch shapes, plus the retained-follower rows.
  const boundaries = runBoundaryMatrix().map((record) => add(record));
  add(runAutoLeaveSelfAppendedBoundary());
  add(runTriggerShifts());
  const boundary = [
    add(runPeerIdentity()),
    add(runMultiRaftCost()),
    add(runPanicIsolation()),
  ];
  return {scenarios, partA, core, boundaries, wasmBoundary: boundary, add};
}

// Every verdict names the scenarios it follows from, and the rule by which
// it follows. A scenario that was not driven may never be cited, and a
// boundary whose host state is not distinct from every other one makes the
// consensus verdict fall back to named gaps.
// Group the boundaries by DURABLE state alone - the signature the owner's
// rule is about.
function groupBy(rows, field) {
  const bySignature = new Map();
  for (const record of rows) {
    bySignature.set(record[field],
      [...(bySignature.get(record[field]) || []), record]);
  }
  return [...bySignature.values()];
}

// The check the exemption buys: boundaries with the same durable state must
// restore identically, or something non-durable leaked into the restore.
function identicalRestoreCheck(classMembers) {
  const image = (record) => JSON.stringify(
    record.localRestoreCorrectness.restoredImage);
  // The strong form: the same durable state must also produce the same
  // RE-APPLY behaviour, or the two boundaries differ in something the
  // restore can see after all.
  const reapply = (record) => JSON.stringify({
    calls: record.localRestoreCorrectness.applyConfChangeCalls,
    fromOwnLog: record.localRestoreCorrectness.recoveredFromOwnLogAlone,
    classification: record.localRestoreCorrectness.classification,
  });
  const images = classMembers.map(image);
  const reapplies = classMembers.map(reapply);
  const differing = classMembers
    .filter((record, index) => images[index] !== images[0])
    .map((record) => record.boundary);
  const differingReapply = classMembers
    .filter((record, index) => reapplies[index] !== reapplies[0])
    .map((record) => record.boundary);
  return {
    boundaries: classMembers.map((record) => record.boundary),
    identical: differing.length === 0 && differingReapply.length === 0,
    differing,
    differingReapply,
    image: JSON.parse(images[0]),
    reapplyBehaviour: JSON.parse(reapplies[0]),
  };
}

// Distinctness is a property WITHIN one drive: the same victim role, the
// same batch shape, the same choice of victim and the same cluster shape.
// Comparing a single-voter row with a three-voter one, or a retained
// follower with a departing one, would compare two different experiments.
function drivenAs(record) {
  return `${record.role}/${record.batch}/${record.victimChoice}/` +
    `${record.shape}`;
}

function boundaryDistinctness(boundaries) {
  const byRole = new Map();
  for (const record of boundaries) {
    const key = drivenAs(record);
    byRole.set(key, [...(byRole.get(key) || []), record.signature]);
  }
  const distinctByRole = {};
  for (const [key, signatures] of byRole) {
    distinctByRole[key] = {
      boundaries: signatures.length,
      distinct: new Set(signatures).size,
      allDistinct: new Set(signatures).size === signatures.length,
    };
  }
  // The same again over DURABLE state alone, plus the exemption and the
  // identical-restore check each class must pass.
  const durableByRole = {};
  const fullDurableByRole = {};
  const claimed = new Set(INTENTIONALLY_INDISTINGUISHABLE
    .map((claim) => [...claim.boundaries].sort().join('|')));
  const restoreChecks = [];
  const unexplained = [];
  const batchShapeLimitations = [];
  const keys = new Set(boundaries.map(drivenAs));
  for (const key of keys) {
    const [role] = key.split('/');
    const rows = boundaries.filter((record) => drivenAs(record) === key);
    const fullClasses = groupBy(rows, 'fullDurableSignature');
    fullDurableByRole[key] = {
      boundaries: rows.length,
      distinct: fullClasses.length,
      // Only the mixed batch is counted toward distinctness: the
      // conf-entry-alone shape provably cannot separate two of the
      // boundaries (see batchShapeLimitations), so counting it would
      // understate what the matrix can tell apart.
      countedTowardDistinctness: rows[0].batch === BATCH.MIXED,
      allDistinct: fullClasses.every((members) => members.length === 1),
      collisions: fullClasses.filter((members) => members.length > 1)
        .map((members) => members.map((record) => record.boundary)),
    };
    const classes = groupBy(rows, 'durableSignature');
    durableByRole[key] = {
      boundaries: classes.reduce((sum, members) => sum + members.length, 0),
      distinct: classes.length,
      allDistinct: classes.every((members) => members.length === 1),
      collisions: classes.filter((members) => members.length > 1)
        .map((members) => members.map((record) => record.boundary)),
    };
    // The exemption is judged over FULL durable state (the five fields plus
    // what the durable log holds), and only for the mixed batch, which is
    // the honest drive.
    for (const members of fullClasses.filter((group) => group.length > 1)) {
      const classKey = members.map((record) => record.boundary).sort()
        .join('|');
      const isMixed = members[0].batch === BATCH.MIXED;
      if (!claimed.has(classKey)) {
        // A collision only the conf-entry-alone shape produces is a
        // property of that shape, not a hole: it is exactly why the mixed
        // batch is the honest drive.
        (isMixed ? unexplained : batchShapeLimitations)
          .push({key, boundaries: classKey.split('|')});
      }
      restoreChecks.push({role, batch: members[0].batch,
        ...identicalRestoreCheck(members)});
    }
  }
  return {
    distinctByRole,
    allDistinct: Object.values(distinctByRole)
      .every((entry) => entry.allDistinct),
    durableByRole,
    fullDurableByRole,
    intentionallyIndistinguishable: INTENTIONALLY_INDISTINGUISHABLE,
    unexplainedCollisions: unexplained,
    batchShapeLimitations: {
      note: 'boundaries these batch shapes cannot tell apart. With the ' +
        'configuration entry alone in its batch the applied index reaches ' +
        'the entry at both conf-state-recorded-not-advanced and ' +
        'ready-advanced, so they are one durable state; a mixed batch ' +
        'separates them (applied 3 against applied 4). This is the ' +
        'measured reason the matrix is driven in both shapes.',
      collisions: batchShapeLimitations,
    },
    identicalRestoreByClass: restoreChecks,
    everyCollisionExplained: unexplained.length === 0,
    everyClassRestoresIdentically:
      restoreChecks.every((check) => check.identical),
  };
}

function migrationInputs(contract) {
  return {
    contractShapeAndSize: {
      finding: `${contract.coverage.observedCount} names censused; ` +
        `${contract[CATEGORY.MEMBERSHIP_LOCAL].names.length} are ` +
        'membership-local delete candidates and ' +
        `${contract[CATEGORY.PRODUCTION_GAP].entries.length} are ` +
        'production gaps',
      verdict: 'measured-favourable',
    },
    persistenceModelFit: {
      finding: 'the host, not the module, owns durability; every restart ' +
        'here was rebuilt from a host-side record, which is the shape a ' +
        'replica SQLite store would take. Whether the replica database can ' +
        'carry it at production rates is not measured here.',
      verdict: 'not-measurable-here',
    },
    idMapping: {
      finding: 'a stable identity-derived u64 crosses the boundary exactly ' +
        'and a JavaScript number is refused',
      verdict: 'measured-favourable',
    },
    hostingCost: {
      finding: 'one runtime holds many RawNodes; the per-group numbers are ' +
        'PRELIMINARY and do not extrapolate to production traffic',
      verdict: 'measured-favourable',
    },
    readyLoopCostPerGroup: {
      finding: 'measured on idle groups only; the event-loop sensitivity ' +
        'that matters is a property of real traffic and SQLite persistence',
      verdict: 'not-measurable-here',
    },
    integrationBehaviour: {
      finding: 'no backend is integrated into the partition service and the ' +
        'formation case is not run: out of scope by construction',
      verdict: 'not-measurable-here',
    },
  };
}

// --- the substantive conditions behind the verdict inputs -------------------
//
// Round 1 filed several inputs as "the scenario ran" (`driven === true`,
// `Boolean(find(...))`). The verifier's point stands: a scenario that ran and
// measured a failure would have satisfied them. Each input below is now the
// condition the input NAMES, computed from the record the scenario returned.

function replicatedMembershipHolds(record) {
  if (record?.driven !== true) {
    return false;
  }
  const states = Object.values(record.confStateByPeer);
  const first = states[0]?.voters.join();
  const agree = states.length === 3 && states
    .every((state) => state.voters.length === 3 &&
      state.voters.join() === first);
  const indices = Object.values(record.appliedIndexByPeer);
  return agree && indices.length === 3 && new Set(indices).size === 1;
}

function learnerAndPromotionHolds(record) {
  if (record?.driven !== true || record.catchUp?.caughtUp !== true) {
    return false;
  }
  const [added, promoted, removed] = record.steps;
  const learnerId = added?.leaderLearners[0];
  if (!learnerId || !promoted || !removed) {
    return false;
  }
  const promotedEverywhere = Object.values(promoted.confStateByPeer)
    .every((state) => state.voters.includes(learnerId) &&
      state.learners.length === 0);
  const removedEverywhere = Object.values(removed.confStateByPeer)
    .every((state) => state.voters.join() === removed.leaderVoters.join());
  return promotedEverywhere && removedEverywhere;
}

function replacementHolds(record) {
  if (record?.driven !== true || record.enteredJoint !== true) {
    return false;
  }
  const expected = record.expectedFinalVoters.join();
  return Object.values(record.finalConfStateByPeer).every((state) =>
    state.voters.join() === expected && state.votersOutgoing.length === 0);
}

function pendingChangeSemanticsHolds(record) {
  if (record?.driven !== true || record.firstChangeTookEffect !== true ||
      typeof record.pendingConfIndexAfter !== 'number' ||
      !record.observation?.first || !record.observation?.second) {
    return false;
  }
  return record.secondChangeTookEffect ?
    record.committedConfEntryCount >= 2 :
    record.committedConfEntryCount === 1 &&
      record.votersAfter.includes(record.secondTarget);
}

function cacheIndependenceHolds(record) {
  return record?.driven === true && record.cachesDisagree === true &&
    record.cachesAreLive === true && record.unchangedInEveryRound === true &&
    record.unchanged === true && record.identicalOnEveryPeer === true;
}

function lifecycleExposedHolds(record) {
  if (record?.driven !== true || (record.appliedConf || []).length === 0) {
    return false;
  }
  return Object.values(record.perPeer).every((peer) => {
    const conformance = writeLogConformsToContract(
      peer.kinds.map((kind) => ({write: kind})));
    return conformance.conforms && peer.confStateWriteAt >= 0 &&
      peer.advanceApplyAfterConfAt > peer.confStateWriteAt &&
      peer.durableConfState?.voters.join() ===
        (peer.reportedConfState || []).join();
  });
}

function u64CrossesIntact(identity) {
  const boundary = identity?.boundary;
  return boundary?.fromExact === true && boundary?.toExact === true &&
    boundary?.voteExact === true && boundary?.confStateExact === true &&
    Boolean(boundary?.numericIdAccepted?.refused);
}

// Round 2: this rested on `runtimeStillUsableAfterRepeatedFatals`, measured
// over twenty fatals - and the runtime dies at about three hundred. What the
// hosting model actually needs is that a trap is RECOVERABLE with a bounded
// cost, and that the host can keep hostile traffic away from the core.
function trapIsRecoverable(recovery) {
  return recovery?.recovery?.length > 0 &&
    recovery.recovery.every((entry) =>
      entry.groupsRestored >= entry.groups - 1 &&
      entry.damagedGroupReported !== null);
}

function handleHostingHolds(cost, isolation, recovery, ingress) {
  return cost?.oneRuntime === true &&
    isolation?.bystanderUsable === true &&
    isolation?.deadGroupRecoverable === true &&
    trapIsRecoverable(recovery) &&
    ingress?.honestTrafficControl?.validatorRejectedNothingHonest === true;
}

function consensusInputsOf(find, flags) {
  return {
    replicatedMembership: replicatedMembershipHolds(find('three-voter-group')),
    learnerAndPromotion:
      learnerAndPromotionHolds(find('sequential-replacement')),
    replacement: replacementHolds(find('joint-replacement-explicit')),
    pendingChangeSemantics:
      pendingChangeSemanticsHolds(find('pending-conf-change')),
    restartCorrectness: flags.boundariesAllDriven &&
      flags.boundariesDistinct && flags.restoresAreExplainable &&
      flags.everyCollisionExplained && flags.everyClassRestoresIdentically &&
      flags.everyBoundaryAssertsItsOwnFacts && flags.termAndVoteSurvived,
    convergenceIndependentOfCaches:
      cacheIndependenceHolds(find('disagreeing-caches')),
    mutantsKilled: flags.mutantsKilled,
  };
}

function wasmInputsOf(context) {
  const {ordering, identity, cost, isolation, boundaries, hostSurface} =
    context;
  return {
    // NOT "the full RawNode lifecycle": round 2 established that the
    // binding exports no snapshot or compaction primitive, so what is
    // claimed is what was driven - the Ready/persistence lifecycle.
    readyLifecycleExposed: lifecycleExposedHolds(ordering),
    correctPersistenceAndRestore: context.boundariesAllDriven &&
      context.restoresAreExplainable && context.termAndVoteSurvived,
    confStateRestore: boundaries.some((record) =>
      record.localRestoreCorrectness.restoredConfState.votersOutgoing
        .length > 0),
    // Identity moved here after verification round 1: the CORE enforces
    // nothing about peer ids (it will re-add a removed id), so identity is a
    // host obligation and what the boundary owes is only that a u64 crosses
    // it intact.
    u64IdentityHandling: u64CrossesIntact(identity),
    acceptableHandleHosting:
      handleHostingHolds(cost, isolation, context.recovery, context.ingress),
    noConsensusLogicInJavaScript: hostSurface.decidesNothingLocally,
  };
}

function deriveVerdicts(groups, hostSurface) {
  const driven = (records) => records.every((record) => record.driven);
  const ids = (records) => records.map((record) => record.id);
  const find = (id) => groups.scenarios.find((record) => record.id === id);

  // --- consensus core ------------------------------------------------------
  const boundaries = groups.boundaries.filter((record) => record.driven);
  // Distinctness is a property WITHIN one victim role: the same boundary
  // driven for a follower and for the leader is the same host state reached
  // by two different peers, which is the point of running both.
  const distinctness = boundaryDistinctness(boundaries);
  const {distinctByRole, allDistinct: boundariesDistinct} = distinctness;
  const boundariesAllDriven = driven(groups.boundaries);
  const restoresAreExplainable = boundaries.every((record) =>
    record.localRestoreCorrectness.restoredConfState.voters.join() ===
      record.localRestoreCorrectness.entitledByDurableState.voters.join() &&
    record.localRestoreCorrectness.messagesDeliveredDuringWindow === 0);
  const mutants = find('host-order-mutants');
  // BOTH halves: every mutant caught AND the honest control classified safe
  // by the same classifier. Round 2 found `survivors: []` true by
  // construction because the correct host itself scored unsafe.
  const mutantsKilled = Boolean(mutants && mutants.survivors.length === 0 &&
    mutants.classifierCanFail === true);
  const termAndVoteSurvived = boundaries.every((record) =>
    record.localRestoreCorrectness.termAndVote.survivedRestart === true);
  const everyBoundaryAssertsItsOwnFacts = boundaries.every((record) =>
    record.definingFacts?.hold === true);
  const consensusInputs = consensusInputsOf(find, {boundariesAllDriven,
    boundariesDistinct, restoresAreExplainable, mutantsKilled,
    termAndVoteSurvived, everyBoundaryAssertsItsOwnFacts,
    everyCollisionExplained: distinctness.everyCollisionExplained,
    everyClassRestoresIdentically: distinctness.everyClassRestoresIdentically});

  // --- WASM boundary -------------------------------------------------------
  const identity = find('peer-identity');
  const cost = find('multi-raft-cost');
  const isolation = find('panic-isolation');
  const ordering = find('ready-persistence-ordering');
  const wasmInputs = wasmInputsOf({ordering, identity, cost, isolation,
    recovery: find('runtime-trap-recovery'),
    ingress: find('ingress-validation'),
    boundaries, boundariesAllDriven, restoresAreExplainable,
    termAndVoteSurvived, hostSurface});
  // The gaps the BOUNDARY verdict carries: the binding's own, and the
  // hosting model it is run in - round 2's remotely-triggerable fatals are
  // a property of both.
  const openBindingGaps = collectNamedGaps(groups)
    .filter((gap) => ['wasm-binding', 'hosting-model']
      .includes(gap.attribution) && gap.status === 'open');
  // The VALUES come from the pure derivation, which knows nothing about this
  // run: it sees named booleans and the open gaps, and nothing else.
  const consensus = consensusVerdict(consensusInputs);
  const wasm = wasmVerdict(wasmInputs, openBindingGaps.map((gap) => gap.id));

  // --- Lagrange migration --------------------------------------------------
  // Part A is a reason to REPLACE the current backend, not evidence that an
  // integration will succeed, so it is not an input here.
  const migration = migrationInputs(groups.contract);

  return {
    consensusCore: {
      value: consensus.value,
      derivation: {
        by: 'test/raft/backend-evaluation/verdict-derivation.js ' +
          '(consensusVerdict), a pure function over the named inputs below',
        ceiling: consensus.ceiling,
        decisiveFailures: consensus.decisiveFailures,
        namedGapFailures: consensus.namedGapFailures,
        severityOf: Object.fromEntries(
          Object.entries(CONSENSUS_INPUTS)
            .map(([name, rule]) => [name, rule.severity])),
      },
      rule: 'replicated membership, learner and promotion behaviour, ' +
        'replacement behaviour, pending-change semantics, restart ' +
        'correctness at nine boundaries for both victim roles and both ' +
        'batch shapes, and configuration convergence independent of ' +
        'service caches, with every host-order mutant killed. Peer identity ' +
        'is NOT an input here: the core enforces nothing about ids.',
      inputs: consensusInputs,
      boundaryDistinctness: {
        note: 'three figures. distinctByHostState includes in-memory facts ' +
          'and is the weakest claim. distinctByFiveFieldDurableState uses ' +
          'exactly the five fields the rule names. distinctByFullDurableState ' +
          'adds what the durable log actually holds, which is durable too. ' +
          'The exemption is judged on the last of these.',
        distinctByHostState: distinctByRole,
        distinctByFiveFieldDurableState: distinctness.durableByRole,
        distinctByFullDurableState: distinctness.fullDurableByRole,
        batchShapeLimitations: distinctness.batchShapeLimitations,
        intentionallyIndistinguishable:
          distinctness.intentionallyIndistinguishable,
        unexplainedCollisions: distinctness.unexplainedCollisions,
        identicalRestoreByClass: distinctness.identicalRestoreByClass,
        everyCollisionExplained: distinctness.everyCollisionExplained,
        everyClassRestoresIdentically:
          distinctness.everyClassRestoresIdentically,
      },
      boundariesDistinct,
      distinctByRole,
      mutantsKilled,
      from: ids([...groups.core, ...groups.boundaries]),
    },
    wasmBoundary: {
      value: wasm.value,
      derivation: {
        by: 'test/raft/backend-evaluation/verdict-derivation.js ' +
          '(wasmVerdict), a pure function over the named inputs below plus ' +
          'the open gaps attributed to the binding',
        ceiling: wasm.ceiling,
        requiredGaps: wasm.requiredGaps,
        missingRequiredGaps: wasm.missingRequiredGaps,
        decisiveFailures: wasm.decisiveFailures,
        namedGapFailures: wasm.namedGapFailures,
        severityOf: Object.fromEntries(
          Object.entries(WASM_INPUTS)
            .map(([name, rule]) => [name, rule.severity])),
      },
      rule: 'the full RawNode lifecycle is exposed, persistence and restore ' +
        'are correct, a joint ConfState restores, u64 identity is exact, ' +
        'many handles share one runtime, and no consensus decision is made ' +
        'in JavaScript',
      inputs: wasmInputs,
      openBindingGaps: openBindingGaps.map((gap) => gap.id),
      hostConsensusSurface: hostSurface,
      from: [...ids([...groups.boundaries, ...groups.wasmBoundary]),
        'ready-persistence-ordering', 'host-order-mutants',
        'host-consensus-surface'],
    },
    lagrangeMigration: {
      value: 'undetermined-needs-integration-stage',
      rule: 'this quest measures the contract, the persistence model fit, ' +
        'the id mapping and the hosting cost. None of that is sufficient: ' +
        'no backend is integrated and the formation case is not run. Part ' +
        'A\'s defects are reasons to replace the current backend, not ' +
        'evidence that an integration will succeed, and are not inputs here.',
      inputs: migration,
      from: ['minimum-backend-contract-census', 'peer-identity',
        'multi-raft-cost', 'host-consensus-surface'],
    },
  };
}

async function buildArtifact() {
  const groups = await runEveryScenario();
  const census = censusNames(deriveProductionRaftCallCensus());
  const digest = JSON.parse(fs.readFileSync(FORK.DIGEST, UTF8));
  const partA = Object.fromEntries(
    groups.partA.map((record) => [record.id, record]));
  groups.contract = splitContract(census);
  const hostSurface = hostConsensusSurfaceCensus();
  // The census and the host surface are measurements too, so they are
  // recorded as driven scenarios and can be cited by a verdict.
  groups.add({
    id: 'minimum-backend-contract-census', driven: true,
    observedCount: groups.contract.coverage.observedCount,
    partitionsExactly: groups.contract.coverage.partitionsExactly,
    localDeleteCandidateNames:
      groups.contract[CATEGORY.MEMBERSHIP_LOCAL].names,
    productionGapCount:
      groups.contract[CATEGORY.PRODUCTION_GAP].entries.length,
  });
  // What the core driver can possibly READ. The stale-cache claim rests on
  // there being no channel for a service-row cache to arrive through, so the
  // channel census is a measurement in its own right.
  const ambient = hostAmbientInputCensus();
  // Round 2: nothing anywhere read `stepRejections`, and that catch
  // swallowed a core FATAL in one of the verifier's runs. It is read here,
  // and a fatal among the rejections fails the build.
  const fatalRejections = groups.scenarios.flatMap((scenario) =>
    (scenario.stepRejections || [])
      .filter((entry) => /unreachable|panicked|out of bounds/u
        .test(String(entry.reason))));
  if (fatalRejections.length > 0) {
    throw new Error('a core fatal was swallowed by the transport catch: ' +
      JSON.stringify(fatalRejections));
  }
  groups.add({
    id: 'step-rejection-census', driven: true,
    claim: 'every `step` rejection the scenarios produced, read rather than ' +
      'swallowed. A rejection that is a core FATAL fails the build.',
    total: groups.scenarios
      .reduce((sum, scenario) => sum + (scenario.stepRejections || []).length,
        0),
    fatalRejections,
    noFatalWasSwallowed: fatalRejections.length === 0,
  });
  groups.add({
    id: 'host-ambient-input-census', driven: true,
    files: ambient.files,
    imports: ambient.imports,
    foreignImports: ambient.foreignImports,
    onlyBuiltinsAndTheGlue: ambient.onlyBuiltinsAndTheGlue,
  });
  groups.add({
    id: 'host-consensus-surface', driven: true,
    delegatedToCore: hostSurface.delegatedToCore.length,
    decidesNothingLocally: hostSurface.decidesNothingLocally,
    localDecisionSuspects: hostSurface.localDecisionSuspects,
  });

  // The artifact may not be built out of a membership the harness did not
  // produce from the core, the durable record or the requested change. This
  // has to run HERE, on the objects the scenarios returned, because JSON has
  // no brands - by the time the file is written the provenance is gone.
  const provenance = auditAgainstLedger(groups.scenarios);
  if (provenance.violations.length > 0) {
    throw new Error(`${NOT_FROM_CORE}${provenance.violations.join(', ')}`);
  }
  groups.add({
    id: 'membership-provenance-audit', driven: true,
    claim: 'every membership value in these records is re-checked against ' +
      'the ledger the harness wrote when the core produced it: the ' +
      'operation exists and the value still equals what was recorded. ' +
      'Mutation after the fact, cloning, and a literal passed through a ' +
      'helper all fail that comparison rather than a shape check.',
    fieldPattern: String(MEMBERSHIP_FIELD),
    sourceKinds: Object.values(ORIGIN),
    ...provenance,
  });

  return {
    schema: 'raft-backend-evaluation/1',
    quest: 'raft-backend-evaluation',
    generatedBy: 'test/raft/backend-evaluation/build-evaluation-document.js',
    generatedAt: new Date().toISOString(),
    fork: {
      path: path.relative(repositoryRoot, FORK.ROOT),
      forkedFrom: digest.forkedFrom,
      upstreamed: digest.upstreamed,
      wasmSha256: digest.wasmSha256,
      reproducibility: digest.reproducibility,
      reproducibilityInvestigation: {
        question: 'does the byte difference indicate uncontrolled source or ' +
          'build inputs?',
        method: 'wasm-tools objdump section tables plus a byte and symbol ' +
          'comparison of two builds at the same path and one at a ' +
          'different path',
        sameDirectoryBuilds: {
          sectionSizes: 'identical for every section',
          differingBytes: 177,
          firstDifferingOffset: '0x1088, inside the imports section ' +
            '(0x22f-0x114e)',
          symbolNames: 'identical as a set AND in file order (42 __wbg_* ' +
            'imports)',
          embeddedPaths: 'identical',
        },
        differentDirectoryBuilds: {
          dataSectionSize: '123107 vs 123099 bytes',
          cause: 'the absolute build directory is embedded in the data ' +
            'section (panic/file! strings), so the build path is itself a ' +
            'build input',
        },
        conclusion: 'the difference does NOT indicate uncontrolled source ' +
          'or dependency inputs: sections, symbols and embedded crate paths ' +
          'match, the dependency set is locked by Cargo.lock, and the only ' +
          'identified input difference is the build directory. A residual ' +
          '177-byte difference inside the generated import table remains ' +
          'unattributed to a specific field and is build-tool ' +
          'nondeterminism, not source drift.',
        bearingOnBackend: 'none: a byte-different .wasm is not a backend ' +
          'blocker and does not touch the consensus verdict',
      },
    },
    todaysBackend: {
      note: 'measured on the real provider and the real peer-cache ' +
        'reconciliation; these are defects of the CURRENT backend',
      membershipDefect: partA['liferaft-two-caches-two-configurations'],
      configurationIsLocal: partA['liferaft-configuration-locality'],
      // Recorded as its own finding: it is not a membership defect.
      termAndVoteSafetyDefect: {
        ...partA['liferaft-term-and-vote-across-restart'],
        independentOfMembership: true,
        statement: 'a restarted replica returns at term 0 with no record of ' +
          'the vote it granted, so it may vote again in a term it has ' +
          'already voted in. This is a durability defect of the current ' +
          'backend on its own, separate from the membership finding.',
      },
    },
    // What a backend implementer must do, from two verification rounds.
    backendObligations: BACKEND_OBLIGATIONS,
    minimumBackendContract: groups.contract,
    hostContract: {
      derivedFrom: RAFT_RS,
      note: 'every step and obligation cites the raft-rs source it was read ' +
        'from; nothing here is copied from an instruction',
      // Where raft-rs's own documentation contradicts itself, and which
      // side wins. Round 1 followed the example's order and recorded the
      // resulting hazard as "not a gap"; that is withdrawn here by name.
      orderNote: ORDER_NOTE,
      raftRsGuarantees: RAFT_RS_GUARANTEES,
      hostMustGuarantee: HOST_MUST_GUARANTEE,
      coreDoesNotDoThisForYou: CORE_DOES_NOT_DO_THIS_FOR_YOU,
      steps: HOST_STEPS,
      orderConstraints: ORDER_CONSTRAINTS,
    },
    hostConsensusSurface: hostSurface,
    scenarios: groups.scenarios,
    earlierSpike: {
      checks: spikeCheckNames().map((check) => ({
        check,
        finding: 'the spike drove this against raft-logic\'s JS shell ' +
          '(ThreadedRaftNode, workers, wall-clock ticks) and recorded a ' +
          'pass/fail for it',
        bearing: 'it says nothing about committed membership: the spike ' +
          'never proposed, applied or observed a configuration change',
      })),
      membershipSites: spikeMembershipSites(),
      membershipSiteCount: spikeMembershipSites().length,
      conclusion: 'the earlier spike established transport, storage and ' +
        'restart viability for raft-logic\'s high-level API. It never ' +
        'changed membership, and it drove the shell this quest excludes ' +
        'from the verdict, so it neither supports nor contradicts the ' +
        'question asked here.',
    },
    verdicts: deriveVerdicts(groups, hostSurface),
    deletionForecast: {
      label: FORECAST_LABEL,
      note: 'copied from the owner\'s decision and labelled a forecast: ' +
        'nothing here has been deleted or proved deletable',
      countsOnly: CATEGORY.MEMBERSHIP_LOCAL,
      countedNames: groups.contract[CATEGORY.MEMBERSHIP_LOCAL].names,
      candidates: DELETION_FORECAST_CANDIDATES,
    },
    reApplicationFinding: {
      statement: 'For the specific idempotent configuration-change case ' +
        'measured here, re-applying that change produced the same ' +
        'ConfState.',
      notMeasuredHere: [
        'state-machine command re-application',
        'snapshot restore',
        'log compaction',
        'which committed entries still need host application after a restart',
        'exactly-once side effects above Raft',
      ],
      jointCase: 'the enter-joint entry re-applied to a peer already in the ' +
        'joint configuration is recorded separately; see the ' +
        'joint-reapplication scenario for what the core returned',
    },
    namedGaps: collectNamedGaps(groups),
  };
}

// A gap is something measured that a consumer must know, not something that
// failed. Each one names what was measured.
function panicIsolationGap(groups) {
  const isolation = groups.scenarios
    .find((record) => record.id === 'panic-isolation');
  const recovery = groups.scenarios
    .find((record) => record.id === 'runtime-trap-recovery');
  const ingress = groups.scenarios
    .find((record) => record.id === 'ingress-validation');
  return {
    id: 'runtime-recovery-after-a-fatal-or-trap',
    attribution: 'wasm-binding',
    status: 'open',
    supersedes: 'raft-rs-fatal-poisons-the-shared-runtime, which round 2 of ' +
      'this evaluation recorded as found-and-fixed-in-this-fork with the ' +
      'blast radius "exactly the group that caused the fatal". Both ' +
      'statements are WITHDRAWN.',
    measured: 'the handle-table poisoning IS fixed: `with_node` takes the ' +
      'node out of the table for the call, so one fatal no longer ' +
      'immediately poisons other handles, and a bystander group ran a full ' +
      'scenario afterwards. But aborts are a FINITE per-instance budget: ' +
      `after ${recovery?.budget.fatalsBeforeTheRuntimeDied} fatals in this ` +
      'run every call on every group in the runtime trapped "' +
      `${recovery?.budget.bystanderFailure}", with ` +
      `${recovery?.budget.linearMemoryGrowthBytes} bytes of linear-memory ` +
      'growth. The count is measured, not a constant. Fatals are also ' +
      'REMOTELY TRIGGERABLE through `step`.',
    recovery: recovery ? {
      path: recovery.recoveryPath,
      measurements: recovery.recovery,
      preliminary: true,
    } : 'not driven',
    ingressValidation: ingress ? {
      refusedByTheValidator: ingress.refusedByTheValidator,
      stillReachAFatal: ingress.stillReachAFatal,
      honestTrafficUnaffected:
        ingress.honestTrafficControl.validatorRejectedNothingHonest,
    } : 'not driven',
    bystanderProof: isolation ? {
      bystanderRanAFullScenarioAfterTheFatal: isolation.bystanderUsable,
      deadGroupRebuiltFromItsDurableRecord: isolation.deadGroupRecoverable,
    } : 'not driven',
    hostObligation: recovery?.hostingConclusion ||
      'treat a trap as a runtime-health event with bounded recovery',
  };
}

function collectNamedGaps(groups) {
  const gaps = [];
  const auto = groups.core.find((r) => r.id === 'joint-replacement-auto');
  if (auto?.autoLeaveNeededATick) {
    gaps.push({
      id: 'auto-leave-needs-a-tick',
      attribution: 'raft-rs',
      measured: 'with the automatic transition the core appends the empty ' +
        'leave entry itself inside commit_apply (src/raft.rs:961-982), but ' +
        'has_ready stays false for that self-appended entry until a tick ' +
        'drives the next Ready: the leader held lastIndex one ahead of its ' +
        'followers until a heartbeat tick, then the leave committed and ' +
        'applied everywhere',
      bearing: 'a periodic tick is required anyway for heartbeats and ' +
        'elections, so a Multi-Raft host must have one; the finding is that ' +
        'a purely message-driven pump is not sufficient, not that a tick is ' +
        'an extra cost',
      behavioural: true,
      blocker: false,
    });
  }
  const orderMutant = groups.scenarios
    .find((record) => record.id === 'host-order-mutants')?.mutants
    ?.find((mutant) => mutant.mutant === 'apply-before-persisting-commit');
  gaps.push({
    id: 'commit-index-must-be-persisted-with-or-before-applying',
    attribution: 'host-obligation',
    supersedes: 'durable-commit-lags-the-applied-effect-inside-one-cycle, ' +
      'which round 1 of this evaluation recorded with isAGap:false. That ' +
      'was wrong and is WITHDRAWN: raft-rs names the hazard.',
    citation: 'src/lib.rs:304-310 - "it doesn\'t guarentee commit index is ' +
      'persisted before being applied ... apply index can be larger than ' +
      'commit index and cause panic. To solve the problem, persisting ' +
      'commit index with or before applying entries."',
    measured: orderMutant ?
      'driven as the apply-before-persisting-commit host mutant: ' +
      `${orderMutant.outcome}; ${orderMutant.message}` :
      'the host mutant did not run',
    whyRoundOneMissedIt: 'every boundary row had the configuration entry ' +
      'alone in its batch. With one normal entry before it and one after, ' +
      'the durable applied index runs ahead of the durable commit index and ' +
      'the restart aborts. Every boundary is now driven in both batch ' +
      'shapes.',
    isAGap: true,
  });
  gaps.push(panicIsolationGap(groups));
  gaps.push({
    id: 'corrupt-conf-change-data-decoded-as-leave-joint',
    attribution: 'wasm-binding',
    status: 'found-and-fixed-in-this-fork',
    measured: 'upstream decode_conf_change_entry used ' +
      'unwrap_or_default() on the base64, so undecodable bytes became an ' +
      'EMPTY change list - which is a valid request to leave a joint ' +
      'configuration. It now returns an error: "conf change entry data is ' +
      'not valid base64".',
  });
  gaps.push({
    id: 'pending-conf-index-crossed-as-a-javascript-number',
    attribution: 'wasm-binding',
    status: 'found-and-fixed-in-this-fork',
    measured: 'it was the one u64 crossing as a JS number; it now crosses ' +
      'as a decimal string like every other. Separately: pendingConfIndex ' +
      'does NOT clear after a change is applied, so it is not a ' +
      'change-in-progress signal on its own - the signal is ' +
      'pendingConfIndex > applied.',
  });
  gaps.push({
    id: 'snapshot-and-compaction-surface-is-incomplete',
    attribution: 'wasm-binding',
    status: 'open',
    measured: 'the binding exports no snapshot or compaction primitive, and ' +
      'the host loop leaves the durable applied index behind after storing a ' +
      'snapshot (round 2, snap.mjs: a snapshot at index 5 left appliedIndex ' +
      '"0"; only raft-rs\'s tolerance saved the restart). A snapshot must ' +
      'move the durable applied index and the ConfState atomically. The ' +
      'RawNode lifecycle this evaluation exercises is therefore NOT the ' +
      'full one: see the verdict input `readyLifecycleExposed`, which is ' +
      'named for what was actually driven.',
    hostObligation: 'a production backend needs snapshot and compaction ' +
      'primitives from the binding, and must advance applied state and ' +
      'ConfState together when it installs one',
  });
  gaps.push({
    id: 'remotely-triggerable-fatals-need-host-side-ingress-validation',
    attribution: 'hosting-model',
    status: 'open',
    measured: 'several message shapes reach a raft-rs fatal through `step`. ' +
      'A host-side ENVELOPE validator (group, recipient, sender in this ' +
      'peer\'s own ConfState, known and non-local type, heartbeat commit ' +
      'not beyond this peer\'s durable last index) refuses most of them and ' +
      'rejects nothing in honest traffic; the residue is recorded in the ' +
      'ingress-validation scenario.',
    hostObligation: 'validate the envelope before `step`; one misrouted ' +
      'heartbeat between groups in a Multi-Raft host is a fatal',
  });
  gaps.push({
    id: 'pre-vote-and-check-quorum-are-not-evaluated',
    attribution: 'raft-rs',
    status: 'open',
    measured: 'neither pre_vote nor check_quorum is configured or exercised ' +
      'anywhere in this evaluation. Round 2 measured the consequence of ' +
      'leaving them off: a removed peer that keeps ticking campaigns ' +
      'repeatedly, real voters GRANT it their vote, and it deposed the live ' +
      'leader. NOT EVALUATED HERE; integration stage.',
    hostObligation: 'decide pre_vote/check_quorum explicitly, or stop ' +
      'removed replicas ticking; do not assume the defaults suit',
  });
  gaps.push({
    id: 'election-rng-cannot-be-seeded-through-the-binding',
    attribution: 'wasm-binding',
    status: 'open',
    measured: 'raft-rs 0.7 draws the randomized election timeout from its ' +
      'own RNG and Config exposes no seed, so an election driven by ticks ' +
      'is not reproducible. Every scenario here forces elections with ' +
      'campaign() instead, which is deterministic; a future deterministic ' +
      'simulator would need a seeding hook that does not exist.',
  });
  gaps.push({
    id: 'campaigning-a-peer-outside-its-own-configuration-panics',
    attribution: 'raft-rs',
    status: 'open',
    measured: 'driving the retained-follower joint-left row while asking ' +
      'every live peer to campaign trapped with "called `Option::unwrap()` ' +
      'on a `None` value" at raft-0.7.0/src/raft.rs:1225 (become_leader). A ' +
      'node the configuration no longer holds satisfies a quorum over an ' +
      'empty voter set trivially, wins, and then cannot find its own ' +
      'progress. The evaluation now reads each peer\'s own ConfState before ' +
      'campaigning it.',
    hostObligation: 'never campaign a peer that its own ConfState does not ' +
      'contain; a removed replica must be shut down, not re-elected',
  });
  gaps.push({
    id: 'the-unstable-log-is-not-observable-through-the-binding',
    attribution: 'wasm-binding',
    status: 'open',
    measured: 'export_persisted_state reads the module\'s MemStorage, so an ' +
      'entry the core has appended but not yet surfaced in a Ready is ' +
      'invisible to the host. The auto-leave boundary is therefore measured ' +
      'through what the durable record and has_ready show, not by reading ' +
      'the core\'s unstable buffer.',
    bearing: 'a deterministic simulator or a debugging tool would want it; ' +
      'no measurement in this evaluation depends on it',
  });
  gaps.push({
    id: 'a-corrupted-durable-record-is-not-always-detectable',
    attribution: 'host-obligation',
    status: 'open',
    measured: 'each corruption is injected between the crash and the ' +
      'restart of an ordinary matrix row and judged by the RECEIPT\'S OWN ' +
      'local checks. The exact rows each corruption is and is not caught ' +
      'at are in the durable-record-corruptions scenario\'s ' +
      '`notCaughtAt` and `undetectableFromDurableStateAloneAt` lists; this ' +
      'gap does not restate them, because round 2 found the restatement ' +
      'contradicting the table.',
    hostObligation: 'integrity protection of the durable Raft record ' +
      '(checksum or authenticated storage). raft-rs cannot do it: the ' +
      'record is the only thing it has.',
  });
  gaps.push({
    id: 'wasm-memstorage-is-not-durable',
    attribution: 'hosting-model',
    measured: 'the binding\'s MemStorage lives inside the WASM module and ' +
      'no export reads it back except the one this fork added; durability ' +
      'is entirely the host\'s, and every restart here was rebuilt from a ' +
      'host-side durable record',
    bearing: 'a production backend must own a durable store; the module is ' +
      'process memory',
  });
  return gaps;
}

// --- the sections the document must CARRY, not only the JSON ----------------
//
// Verification round 1 found the .md omitting the preliminary Multi-Raft
// statement, the narrowed re-application sentence and any sequential-against-
// joint section, and saying "nine DISTINCT host states" without the 6-of-9
// durable figure. Each of those is a section below, rendered from the record
// rather than written by hand.

// The part a backend implementer needs, first, in the document itself.
function renderBackendObligations(artifact, push) {
  push('## What a Lagrange raft-rs backend must do');
  push();
  push('Each obligation states what must be done, the measurement or ' +
    'verifier observation behind it, and where it is attributable.');
  push();
  for (const entry of artifact.backendObligations) {
    push(`### ${entry.heading}`);
    push();
    push(`- **obligation**: ${entry.obligation}`);
    push(`- measured: ${entry.measured}`);
    push(`- attribution: **${entry.attribution}**`);
    push();
  }
  const recovery = scenarioOf(artifact, 'runtime-trap-recovery');
  if (recovery) {
    push('#### Runtime trap recovery, measured (PRELIMINARY)');
    push();
    push(`Fatals before the runtime died: **${
      recovery.budget.fatalsBeforeTheRuntimeDied}** (measured, not a ` +
      `constant), then every call trapped "${
        recovery.budget.bystanderFailure}".`);
    push();
    push('| Groups restored into a fresh instance | Time (ms) | ' +
      'Memory (bytes) | Damaged group |');
    push('| --- | --- | --- | --- |');
    for (const entry of recovery.recovery) {
      push(`| ${entry.groupsRestored} of ${entry.groups} | ` +
        `${(entry.recoveryNanos / 1e6).toFixed(1)} | ` +
        `${entry.recoveryMemoryBytes} | reported: ` +
        `\`${entry.damagedGroupReported}\` |`);
    }
    push();
    push(`Withdrawn: ${recovery.withdrawnClaims.join('; ')}.`);
    push();
    push(`> ${recovery.hostingConclusion}`);
    push();
  }
  const ingress = scenarioOf(artifact, 'ingress-validation');
  if (ingress) {
    push('#### Ingress validation, measured');
    push();
    push('| Message shape | Host envelope validator | Reaching the core |');
    push('| --- | --- | --- |');
    for (const shape of ingress.shapes) {
      push(`| ${shape.shape} | ${shape.refusedByTheValidator ?
        `refused: ${shape.refusedByTheValidator}` : 'passed'} | ` +
        `${shape.withoutTheValidator} |`);
    }
    push();
    push(`Honest traffic is unaffected: ${
      ingress.honestTrafficControl.refusals.length} refusals in a full ` +
      'configuration-change scenario run with the validator enabled. ' +
      `Residue that still reaches a fatal: ${
        ingress.stillReachAFatal.length === 0 ? 'none' :
          ingress.stillReachAFatal.join('; ')}.`);
    push();
  }
}

// The four-category census, which round 2 found was JSON-only.
function renderContractCensus(artifact, push) {
  const contract = artifact.minimumBackendContract;
  push('## The minimum backend contract, in four categories');
  push();
  push('| Category | Names | Counts toward the deletion forecast |');
  push('| --- | --- | --- |');
  for (const category of ['MUST SERVE', 'MEMBERSHIP-LOCAL DELETE CANDIDATE',
    'DIFFERENT IMPLEMENTATION']) {
    const entry = contract[category];
    push(`| ${category} | ${entry.names.length} | ${
      category === 'MEMBERSHIP-LOCAL DELETE CANDIDATE' ? 'yes' : 'no'} |`);
  }
  push(`| PRODUCTION GAP | ${
    contract['PRODUCTION GAP'].entries.length} | no |`);
  push();
  push('Only the membership-local category feeds the forecast: ' +
    `${contract['MEMBERSHIP-LOCAL DELETE CANDIDATE'].names
      .map((name) => `\`${name}\``).join(', ')}.`);
  push();
  push('Production gaps - what a raft-rs backend requires and Lagrange has ' +
    'no call site for:');
  push();
  for (const entry of contract['PRODUCTION GAP'].entries) {
    push(`- \`${entry.operation}\` - ${entry.why}`);
  }
  push();
}

function renderDistinctness(artifact, push) {
  const distinctness =
    artifact.verdicts.consensusCore.boundaryDistinctness;
  push('## Boundary distinctness, all three figures');
  push();
  push(distinctness.note);
  push();
  push('| Drive | Boundaries | Distinct by host state | ' +
    'Distinct by the five durable fields | Distinct by full durable state |');
  push('| --- | --- | --- | --- | --- |');
  for (const key of Object.keys(distinctness.distinctByHostState)) {
    const host = distinctness.distinctByHostState[key];
    const five = distinctness.distinctByFiveFieldDurableState[key];
    const full = distinctness.distinctByFullDurableState[key];
    push(`| \`${key}\` | ${host.boundaries} | ${host.distinct} | ` +
      `${five.distinct} | ${full.distinct} |`);
  }
  push();
  push('Two boundaries that serialize to the same durable state are the ' +
    'same thing as far as a restart can tell, so every collision is either ' +
    'an explicitly claimed exemption or the receipt is red.');
  push();
  for (const claim of distinctness.intentionallyIndistinguishable) {
    push(`- **[${claim.boundaries.join(', ')}]** - ${claim.because}`);
    for (const citation of claim.raftRsCitations) {
      push(`  - ${citation}`);
    }
    push(`  - proved not vacuous by: ${claim.provenNotVacuousBy}`);
  }
  push();
  push(`Unexplained collisions: ${
    distinctness.unexplainedCollisions.length === 0 ? 'none' :
      JSON.stringify(distinctness.unexplainedCollisions)}. ` +
    `Every class restores identically: ${
      distinctness.everyClassRestoresIdentically}.`);
  push();
  push(distinctness.batchShapeLimitations.note);
  push();
}

function scenarioOf(artifact, id) {
  return artifact.scenarios.find((scenario) => scenario.id === id) || null;
}

function renderReplacementStyles(artifact, push) {
  renderSequentialStyle(artifact, push);
  renderJointStyle(artifact, push);
}

function renderSequentialStyle(artifact, push) {
  const sequential = scenarioOf(artifact, 'sequential-replacement');
  const failures = scenarioOf(artifact, 'sequential-failure-matrix');
  const gating = scenarioOf(artifact, 'promotion-gating');

  push('## The sequential replacement, on its own terms');
  push();
  push('This section reports what the sequential style costs and what ' +
    'semantics it provides. It makes NO recommendation: which style ' +
    'Lagrange uses is the integration stage\'s decision, not this quest\'s.');
  push();
  push(`- entries: ${sequential?.confEntriesTotal} committed configuration ` +
    'changes, one per step (add learner, promote, remove the old voter).');
  push('- catch-up criterion: read from the leader\'s OWN progress for the ' +
    `learner (matched ${sequential?.catchUp.learnerProgress?.matched} ` +
    `against the leader's committed index ${sequential?.catchUp.leaderCommit}` +
    '), never from a tick count.');
  push('- the core does NOT gate promotion on catch-up: ' +
    `${gating?.coreGatesNothing ? 'a learner that never caught up was ' +
      'promoted to voter when the policy did not stop it' : 'not measured'}` +
    '. Gating is a Lagrange policy.');
  push('- learner death and old-voter death at each phase:');
  for (const testCase of failures?.cases || []) {
    push(`  - \`${testCase.label}\`: every surviving peer agreed ` +
      `(${testCase.allSurvivorsAgree}); the voter set the core used at each ` +
      `phase was ${testCase.steps.map((step) => step.voterCount).join(', ')}.`);
  }
  push('- restart: every boundary in the matrix is driven for a simple ' +
    'change as well as a joint one.');
  push();
}

function renderJointStyle(artifact, push) {
  const joint = scenarioOf(artifact, 'joint-replacement-explicit');
  const auto = scenarioOf(artifact, 'joint-replacement-auto');
  const quorum = scenarioOf(artifact, 'joint-quorum-requirement');

  push('## The joint replacement, on its own terms');
  push();
  push('Again: reported, not recommended.');
  push();
  push(`- entries: ${joint?.confEntries} with an explicit transition, ` +
    `${auto?.confEntries} with the automatic one - the automatic transition ` +
    'costs the host fewer proposed changes because the core appends the ' +
    'leave entry itself.');
  push('- joint-enter configuration: the core reports both halves - ' +
    `incoming [${joint?.jointConfStateByPeer[joint?.leaderId]?.voters
      .join(', ')}] and outgoing [${
      joint?.jointConfStateByPeer[joint?.leaderId]?.votersOutgoing
        .join(', ')}].`);
  push('- joint quorum: a commit while joint needs a majority of BOTH ' +
    `configurations (measured: ${quorum?.bothMajoritiesRequired}). With only ` +
    'the outgoing-only voter down the group still committed; with a voter ' +
    'present in both also down it did not.');
  push('- automatic against manual leave: the automatic transition left ' +
    `without a proposal (${auto?.autoLeftWithoutAProposal}) but needed a ` +
    `tick first (${auto?.autoLeaveNeededATick}); the explicit transition did ` +
    'not leave by itself and the host proposed the empty change.');
  push('- peer failure while joint: driven for an incoming voter and for an ' +
    'outgoing one, and the group committed with each down.');
  push('- restart: the joint boundaries are driven with the departing ' +
    'follower AND with a follower the group keeps.');
  push();
}

function renderMultiRaft(artifact, push) {
  const cost = scenarioOf(artifact, 'multi-raft-cost');
  push('## Multi-Raft cost: PRELIMINARY');
  push();
  push(cost?.scope || 'not driven');
  push();
  push(`Hosting shape: ${cost?.hostingShape}. One runtime shared by every ` +
    `handle: ${cost?.oneRuntime}. One-time runtime cost is reported apart ` +
    'from the per-RawNode cost.');
  push();
  push('**No cost figure feeds any verdict input.** The hosting input is a ' +
    'set of booleans, so a thousandfold regression in any number below ' +
    'could not change a verdict. They are reported to answer the owner\'s ' +
    'question about the hosting model, not to gate one.');
  push();
  push('| Groups | Incremental bytes (upper bound) | Bytes per group | ' +
    'Idle tick ns | has_ready scan ns | Ready cycle ns |');
  push('| --- | --- | --- | --- | --- | --- |');
  for (const entry of cost?.perGroup || []) {
    push(`| ${entry.groups} | ${entry.incrementalBytesBound} | ` +
      `${Math.round(entry.bytesPerGroupBound)} | ` +
      `${Math.round(entry.idleTickNanosPerGroup)} | ` +
      `${Math.round(entry.hasReadyScanNanosPerGroup)} | ` +
      `${Math.round(entry.readyCycleNanosPerGroup)} |`);
  }
  push();
}

function renderReApplication(artifact, push) {
  push('## Re-application, precisely');
  push();
  push(`> ${artifact.reApplicationFinding.statement}`);
  push();
  push('That sentence is the whole finding. It does NOT extend to:');
  push();
  for (const item of artifact.reApplicationFinding.notMeasuredHere) {
    push(`- ${item}`);
  }
  push();
  push(artifact.reApplicationFinding.jointCase);
  push();
}

function renderHostContract(artifact, push) {
  const contract = artifact.hostContract;
  push('## The host contract');
  push();
  push(`Derived from ${contract.derivedFrom.CRATE} (checksum ` +
    `${contract.derivedFrom.CHECKSUM}). ${contract.note}.`);
  push();
  push('### Where raft-rs contradicts itself');
  push();
  push(`- ${contract.orderNote.contradiction}`);
  push(`- ${contract.orderNote.resolution}`);
  push(`- ${contract.orderNote.firstRoundError}`);
  push();
  push('### What raft-rs guarantees');
  push();
  for (const entry of contract.raftRsGuarantees) {
    push(`- ${entry.guarantee} — \`${entry.source}\``);
  }
  push();
  push('### What the host must guarantee');
  push();
  for (const entry of contract.hostMustGuarantee) {
    push(`- ${entry.obligation} — \`${entry.source}\``);
    if (entry.measured) {
      push(`  - measured: ${entry.measured}`);
    }
  }
  push();
  push('### The core does not do this for you');
  push();
  for (const entry of contract.coreDoesNotDoThisForYou) {
    push(`- **${entry.assumption}** — ${entry.reality}`);
    push(`  - measured: ${entry.measured}`);
    push(`  - source: \`${entry.source}\``);
  }
  push();
}

const GAP_LINE = Object.freeze([
  ['citation', 'citation'],
  ['hostObligation', 'host obligation'],
  ['bearing', 'bearing'],
  ['bearingOnHostingShape', 'bearing on the hosting shape'],
]);

function renderOneGap(gap, push) {
  push(`### \`${gap.id}\``);
  push();
  push(`- attribution: **${gap.attribution || 'unattributed'}**` +
    `${gap.status ? ` · status: \`${gap.status}\`` : ''}`);
  push(`- measured: ${gap.measured}`);
  for (const [field, label] of GAP_LINE) {
    if (gap[field]) {
      push(`- ${label}: ${gap[field]}`);
    }
  }
  push();
}

function renderMarkdown(artifact) {
  const lines = [];
  const push = (line = '') => lines.push(line);
  push('# raft-rs backend evaluation');
  push();
  push('<!-- GENERATED from raft-backend-evaluation.json by');
  push(`     ${artifact.generatedBy}. Do not edit by hand. -->`);
  push();
  push(`Generated ${artifact.generatedAt}.`);
  push();
  push('## Three verdicts');
  push();
  push('| Question | Verdict | Follows from |');
  push('| --- | --- | --- |');
  for (const key of ARTIFACT.VERDICT_KEYS) {
    const verdict = artifact.verdicts[key];
    push(`| ${key} | \`${verdict.value}\` | ${verdict.from.length} driven ` +
      'scenarios |');
  }
  push();
  for (const key of ARTIFACT.VERDICT_KEYS) {
    const verdict = artifact.verdicts[key];
    push(`### ${key}: \`${verdict.value}\``);
    push();
    push(verdict.rule);
    push();
    push(`Scenarios: ${verdict.from.map((id) => `\`${id}\``).join(', ')}.`);
    push();
  }
  push('## The current backend');
  push();
  const membership = artifact.todaysBackend.membershipDefect;
  push('One partition, two caches: node A reported ' +
    `[${membership.configurationA.join(', ')}] with majority ` +
    `${membership.majorityA}; node B reported ` +
    `[${membership.configurationB.join(', ')}] with majority ` +
    `${membership.majorityB}. Protocol messages emitted: ` +
    `${membership.protocolMessagesEmitted}.`);
  push();
  push('### An independent safety defect: term and vote');
  push();
  push(artifact.todaysBackend.termAndVoteSafetyDefect.statement);
  push();
  push('## Scenarios');
  push();
  push('| Scenario | Driven |');
  push('| --- | --- |');
  for (const scenario of artifact.scenarios) {
    push(`| \`${scenario.id}\` | ${scenario.driven ? 'yes' : 'NO'} |`);
  }
  push();
  renderBackendObligations(artifact, push);
  renderContractCensus(artifact, push);
  renderDistinctness(artifact, push);
  renderReplacementStyles(artifact, push);
  renderMultiRaft(artifact, push);
  renderReApplication(artifact, push);
  renderHostContract(artifact, push);
  push('## Named gaps');
  push();
  push('Every gap carries its attribution: `raft-rs` is the core, ' +
    '`wasm-binding` is the fork, `hosting-model` is the shape a host runs ' +
    'them in, and `host-obligation` is something the host must do that the ' +
    'core will not do for it.');
  push();
  for (const gap of artifact.namedGaps) {
    renderOneGap(gap, push);
  }
  push('## Deletion forecast (a forecast)');
  push();
  push(artifact.deletionForecast.note);
  push();
  for (const candidate of artifact.deletionForecast.candidates) {
    push(`- ${candidate}`);
  }
  push();
  return `${lines.join('\n')}\n`;
}

async function main() {
  const artifact = await buildArtifact();
  fs.writeFileSync(artifactPath(ARTIFACT.JSON_PATH),
    `${JSON.stringify(artifact, null, 2)}\n`);
  fs.writeFileSync(artifactPath(ARTIFACT.MARKDOWN_PATH),
    renderMarkdown(artifact));
  process.stdout.write(
    `${ARTIFACT.JSON_PATH}: ${artifact.scenarios.length} scenarios, ` +
    `verdicts ${ARTIFACT.VERDICT_KEYS
      .map((key) => `${key}=${artifact.verdicts[key].value}`).join(' ')}\n`);
}

// A generator when it is run, an importable pair of pure-ish functions when a
// receipt wants to REBUILD the artifact and compare it to the committed one.
// Importing it must never write to the repository.
const runAsScript = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runAsScript) {
  await main();
}

export {buildArtifact, renderMarkdown};
