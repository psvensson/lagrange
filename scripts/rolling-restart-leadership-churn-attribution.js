#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';

const TRANSITION_MESSAGE = 'Raft leadership transition evidence';
const EVENT_LOOP_GAP_MESSAGE = 'Event loop gap detected';
const INCARNATION_BOUNDARY_EVENT = 'incarnation-boundary';
const DEFAULT_WINDOW_MS = 15_000;
const MAX_SAFE_INTEGER = 9_007_199_254_740_991;
const EVENT_TYPE_ROLE_TRANSITION = 'role_transition';
const ROLE_LEADER = 'leader';
const SOURCE_FINGERPRINT_MATCHES_FIELD = 'srcFingerprintMatches';
const DUPLICATE_VALIDATION_STREAM_CURSOR = 'stream_cursor_contract';
const CLI_FLAG_REPORT = '--report';
const CLI_FLAG_LOGS = '--logs';
const CLI_FLAG_OUT = '--out';
const CLI_USAGE =
  'usage: --report <report.json> --logs <full-log-dir> [--out <path>]';
const MISSING_WITNESS = Object.freeze({
  OLD_LEADER: 'old_leader',
  NEW_LEADER: 'new_leader',
  OLD_TERM: 'old_term',
  NEW_LEADER_TRANSITION: 'new_leader_transition',
  CAMPAIGN_OR_HEARTBEAT_LOSS: 'campaign_or_heartbeat_loss',
  PEER_COHORT: 'peer_cohort',
  MONOTONIC_TERM_ADVANCE: 'monotonic_term_advance',
  OBSERVED_AT: 'valid_observed_at',
  LEADER_SIGNATURE: 'valid_leader_signature_change',
  MIXED_PARTITION_OUTCOMES: 'mixed_partition_outcomes',
});
const OUTCOME = Object.freeze({
  REAL: 'real_raft_transition',
  ARTIFACT: 'observation_artifact',
  INCOMPLETE: 'evidence_incomplete',
});

// Intrinsics are snapshotted at module load so later prototype or global
// pollution cannot redirect validation (adversarial-js-intrinsics item 6).
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const arrayIsArray = Array.isArray;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectValues = Object.values;
const dateParse = Date.parse;
const mathAbs = Math.abs;

function ownField(record, fieldName) {
  return record &&
    typeof record === 'object' &&
    objectHasOwn(record, fieldName) ?
    record[fieldName] :
    undefined;
}

// Copies a genuine array by indexed reads so hostile iterators cannot lie
// about the contents, requiring every index to be an own element so sparse
// arrays cannot inherit values from a polluted Array.prototype
// (adversarial-js-intrinsics items 2, 4, and 8).
function ownArrayItems(value) {
  if (!arrayIsArray(value)) return null;
  const length = nonNegativeSafeInteger(value.length);
  if (length === null) return null;
  const items = [];
  for (let index = 0; index < length; index += 1) {
    if (!objectHasOwn(value, index)) return null;
    items.push(value[index]);
  }
  return items;
}

// One-shot deep copy into null-prototype records: every hostile getter fires
// exactly once here, later reads are plain data reads, and inherited
// properties never survive (adversarial-js-intrinsics items 2 and 3). Cycle
// detection tracks only the active recursion path so legitimately shared
// sub-objects (e.g. one cohort array referenced by several records) copy
// normally.
function canonicalValue(value, path = new WeakSet()) {
  if (typeof value !== 'object' || value === null) return value;
  if (path.has(value)) return undefined;
  path.add(value);
  try {
    const items = ownArrayItems(value);
    if (items) {
      const copies = [];
      for (const item of items) copies.push(canonicalValue(item, path));
      return copies;
    }
    const record = Object.create(null);
    for (const key of objectKeys(value)) {
      record[key] = canonicalValue(value[key], path);
    }
    return record;
  } finally {
    path.delete(value);
  }
}

function canonicalArray(value) {
  const canonical = canonicalValue(value);
  return arrayIsArray(canonical) ? canonical : [];
}

function nonNegativeSafeInteger(value) {
  return typeof value === 'number' &&
    value >= 0 &&
    value <= MAX_SAFE_INTEGER &&
    value % 1 === 0 &&
    !(value === 0 && 1 / value < 0) ?
    value :
    null;
}

// Returns a Map for a well-formed signature, or null when the signature is
// malformed. A malformed side must surface as a named missing witness, never
// collapse into "every leader became null" (verifier-reported blocker).
function parseLeaderSignature(value) {
  if (typeof value !== 'string') return null;
  let parsed;
  try {
    parsed = jsonParse(value);
  } catch {
    return null;
  }
  const entries = ownArrayItems(parsed);
  if (!entries) return null;
  const map = new Map();
  for (const entry of entries) {
    const pair = ownArrayItems(entry);
    if (
      !pair ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      typeof pair[1] !== 'string'
    ) {
      return null;
    }
    map.set(pair[0], pair[1]);
  }
  return map;
}

function leaderSignatureOf(entry) {
  const signature = ownField(entry, 'leaderSignature');
  return typeof signature === 'string' ? signature : null;
}

// Returns null when either side's signature is malformed.
function changedLeaderPartitions(previous, current) {
  const previousMap = parseLeaderSignature(leaderSignatureOf(previous));
  const currentMap = parseLeaderSignature(leaderSignatureOf(current));
  if (!previousMap || !currentMap) return null;
  const partitionIds = new Set([...previousMap.keys(), ...currentMap.keys()]);
  return [...partitionIds]
    .sort()
    .filter((partitionId) =>
      previousMap.get(partitionId) !== currentMap.get(partitionId))
    .map((partitionId) => ({
      partitionId,
      oldLeader: previousMap.get(partitionId) ?? null,
      newLeader: currentMap.get(partitionId) ?? null,
    }));
}

// Returns null when any observation carries a malformed signature: a corrupt
// observation can never help prove an observation artifact (fail closed).
function observationLeadersByNode(entry, partitionId) {
  const result = new Map();
  const observations = ownArrayItems(ownField(entry, 'leaderObservations'));
  for (const observation of observations || []) {
    const nodeId = ownField(observation, 'nodeId');
    if (typeof nodeId !== 'string') continue;
    const parsed = parseLeaderSignature(ownField(observation, 'leaderSignature'));
    if (!parsed) return null;
    result.set(nodeId, parsed.get(partitionId) ?? null);
  }
  return result;
}

function stableObserverProjection(previous, current, change) {
  const previousObserver = ownField(previous, 'selectedNodeId');
  const currentObserver = ownField(current, 'selectedNodeId');
  if (
    typeof previousObserver !== 'string' ||
    typeof currentObserver !== 'string' ||
    previousObserver === currentObserver
  ) {
    return null;
  }
  const before = observationLeadersByNode(previous, change.partitionId);
  const after = observationLeadersByNode(current, change.partitionId);
  if (!before || !after) return null;
  const commonObservers = [...before.keys()].filter((nodeId) => after.has(nodeId));
  if (commonObservers.length < 2) return null;
  if (commonObservers.some((nodeId) => before.get(nodeId) !== after.get(nodeId))) {
    return null;
  }
  const beforeValues = new Set(commonObservers.map((nodeId) => before.get(nodeId)));
  const afterValues = new Set(commonObservers.map((nodeId) => after.get(nodeId)));
  if (
    !beforeValues.has(change.oldLeader) ||
    !beforeValues.has(change.newLeader) ||
    !afterValues.has(change.oldLeader) ||
    !afterValues.has(change.newLeader)
  ) {
    return null;
  }
  return {
    previousObserver,
    currentObserver,
    stableObserverLeaders: Object.fromEntries(
      commonObservers.map((nodeId) => [nodeId, before.get(nodeId)]),
    ),
  };
}

function normalizePeerCohort(value) {
  const items = ownArrayItems(value);
  if (!items) return [];
  return [...new Set(items.filter((item) => typeof item === 'string'))].sort();
}

function roleTransitionRecords(records, partitionId) {
  return (arrayIsArray(records) ? records : []).filter((record) =>
    ownField(record, 'msg') === TRANSITION_MESSAGE &&
    ownField(record, 'eventType') === EVENT_TYPE_ROLE_TRANSITION &&
    ownField(record, 'partitionId') === partitionId);
}

function authoritativeRoleState(records, partitionId, observedAtMs) {
  if (observedAtMs === null) return null;
  const relevantRecords = roleTransitionRecords(records, partitionId);
  if (relevantRecords.some((record) =>
    recordTimeMs(record) === null ||
    typeof ownField(record, 'replicaId') !== 'string' ||
    typeof ownField(record, 'nodeId') !== 'string' ||
    typeof ownField(record, 'role') !== 'string' ||
    nonNegativeSafeInteger(ownField(record, 'term')) === null ||
    normalizePeerCohort(ownField(record, 'peerCohort')).length === 0)) {
    return null;
  }
  const latestByReplica = new Map();
  for (const record of relevantRecords) {
    const timeMs = recordTimeMs(record);
    const replicaId = ownField(record, 'replicaId');
    const nodeId = ownField(record, 'nodeId');
    const role = ownField(record, 'role');
    const term = nonNegativeSafeInteger(ownField(record, 'term'));
    if (
      timeMs > observedAtMs ||
      typeof replicaId !== 'string' ||
      typeof nodeId !== 'string' ||
      typeof role !== 'string' ||
      term === null
    ) {
      continue;
    }
    const prior = latestByReplica.get(replicaId);
    if (!prior || recordTimeMs(prior) < timeMs) {
      latestByReplica.set(replicaId, record);
    }
  }
  const recordsByReplica = [...latestByReplica.entries()]
    .sort(([left], [right]) => left.localeCompare(right));
  if (recordsByReplica.length === 0) return null;
  const cohorts = recordsByReplica.map(([, record]) =>
    normalizePeerCohort(ownField(record, 'peerCohort')));
  const cohort = cohorts[0];
  if (
    cohort.length === 0 ||
    cohort.length !== recordsByReplica.length ||
    cohorts.some((candidate) =>
      jsonStringify(candidate) !== jsonStringify(cohort)) ||
    recordsByReplica.some(([replicaId]) => !cohort.includes(replicaId))
  ) {
    return null;
  }
  const replicas = recordsByReplica.map(([replicaId, record]) => ({
    replicaId,
    nodeId: ownField(record, 'nodeId'),
    role: ownField(record, 'role'),
    term: ownField(record, 'term'),
    evidencePath: ownField(record, 'evidencePath') || null,
  }));
  const leaders = replicas.filter(({role}) => role === ROLE_LEADER);
  if (leaders.length !== 1) return null;
  return {cohort, replicas, leader: leaders[0]};
}

function roleStateSignature(state) {
  return jsonStringify(state?.replicas || []);
}

function proveObservationArtifact({
  previous,
  current,
  change,
  records,
  captureByNode,
}) {
  const projection = stableObserverProjection(previous, current, change);
  if (!projection) return null;
  const previousObservedAtMs = nonNegativeSafeInteger(
    ownField(previous, 'observedAtMs'),
  );
  const currentObservedAtMs = nonNegativeSafeInteger(
    ownField(current, 'observedAtMs'),
  );
  if (
    previousObservedAtMs === null ||
    currentObservedAtMs === null ||
    currentObservedAtMs <= previousObservedAtMs
  ) {
    return null;
  }
  const previousState = authoritativeRoleState(
    records,
    change.partitionId,
    previousObservedAtMs,
  );
  const currentState = authoritativeRoleState(
    records,
    change.partitionId,
    currentObservedAtMs,
  );
  if (
    !previousState ||
    !currentState ||
    roleStateSignature(previousState) !== roleStateSignature(currentState)
  ) {
    return null;
  }
  const stateNodeIds = previousState.replicas.map(({nodeId}) => nodeId);
  if (stateNodeIds.some((nodeId) => !captureIsComplete(captureByNode, nodeId))) {
    return null;
  }
  const intervalTransitions = roleTransitionRecords(records, change.partitionId)
    .filter((record) => {
      const timeMs = recordTimeMs(record);
      return timeMs > previousObservedAtMs && timeMs <= currentObservedAtMs;
    });
  if (intervalTransitions.length > 0) return null;
  return {
    authoritativeStateUnchanged: true,
    ...projection,
    authoritativeLeader: previousState.leader.nodeId,
    authoritativeTerm: previousState.leader.term,
    peerCohort: previousState.cohort,
    replicaStateWitnesses: previousState.replicas,
    intervalTransitionCount: intervalTransitions.length,
  };
}

function recordTimeMs(record) {
  const explicit = nonNegativeSafeInteger(ownField(record, 'timeMs'));
  if (explicit !== null) return explicit;
  const time = ownField(record, 'time');
  if (typeof time !== 'string') return null;
  return nonNegativeSafeInteger(dateParse(time));
}

function latestMatching(records, predicate, beforeMs, afterMs = -Infinity) {
  return records
    .filter((record) => {
      const timeMs = recordTimeMs(record);
      return timeMs !== null && timeMs <= beforeMs && timeMs >= afterMs &&
        predicate(record);
    })
    .sort((left, right) => recordTimeMs(right) - recordTimeMs(left))[0] || null;
}

function captureIsComplete(captureByNode, nodeId) {
  return captureByNode.get(nodeId)?.complete === true;
}

function eventLoopContext(records, nodeIds, observedAtMs, windowMs) {
  const nodeSet = new Set(nodeIds.filter(Boolean));
  if (observedAtMs === null) {
    return {windowMs, gapCount: 0, nearest: null, gaps: []};
  }
  const gaps = records
    .filter((record) => {
      const timeMs = recordTimeMs(record);
      return ownField(record, 'msg') === EVENT_LOOP_GAP_MESSAGE &&
        nodeSet.has(ownField(record, 'nodeId')) &&
        timeMs !== null &&
        mathAbs(timeMs - observedAtMs) <= windowMs;
    })
    .map((record) => ({
      nodeId: ownField(record, 'nodeId'),
      time: ownField(record, 'time') || null,
      gapMs: nonNegativeSafeInteger(ownField(record, 'gapMs')),
      distanceMs: mathAbs(recordTimeMs(record) - observedAtMs),
      evidencePath: ownField(record, 'evidencePath') || null,
    }))
    .sort((left, right) => left.distanceMs - right.distanceMs);
  return {
    windowMs,
    gapCount: gaps.length,
    nearest: gaps[0] || null,
    gaps,
  };
}

function captureWitnessProblems(change, captureByNode) {
  const problems = [];
  if (!change.oldLeader) problems.push(MISSING_WITNESS.OLD_LEADER);
  if (!change.newLeader) problems.push(MISSING_WITNESS.NEW_LEADER);
  if (change.oldLeader && !captureIsComplete(captureByNode, change.oldLeader)) {
    problems.push(`capture_integrity:${change.oldLeader}`);
  }
  if (change.newLeader && !captureIsComplete(captureByNode, change.newLeader)) {
    problems.push(`capture_integrity:${change.newLeader}`);
  }
  return problems;
}

function isRoleTransition(record, change, role, nodeId) {
  return ownField(record, 'msg') === TRANSITION_MESSAGE &&
    ownField(record, 'eventType') === EVENT_TYPE_ROLE_TRANSITION &&
    ownField(record, 'partitionId') === change.partitionId &&
    ownField(record, 'role') === role &&
    ownField(record, 'nodeId') === nodeId;
}

function findTransitionWitnesses({change, observedAtMs, records, windowMs}) {
  const oldLeaderEvent = latestMatching(
    records,
    (record) => isRoleTransition(record, change, 'leader', change.oldLeader),
    observedAtMs,
  );
  const newLeaderEvent = latestMatching(
    records,
    (record) => isRoleTransition(record, change, 'leader', change.newLeader),
    observedAtMs,
    observedAtMs - windowMs,
  );
  const oldTerm = nonNegativeSafeInteger(ownField(oldLeaderEvent, 'term'));
  const newTerm = nonNegativeSafeInteger(ownField(newLeaderEvent, 'term'));
  const campaignEvent = newTerm === null ? null : latestMatching(
    records,
    (record) => isRoleTransition(
      record,
      change,
      'candidate',
      change.newLeader,
    ) && ownField(record, 'term') === newTerm,
    recordTimeMs(newLeaderEvent),
    observedAtMs - windowMs,
  );
  return {oldLeaderEvent, newLeaderEvent, oldTerm, newTerm, campaignEvent};
}

function transitionWitnessProblems(witnesses, peerCohort) {
  const problems = [];
  if (witnesses.oldTerm === null) problems.push(MISSING_WITNESS.OLD_TERM);
  if (witnesses.newTerm === null) {
    problems.push(MISSING_WITNESS.NEW_LEADER_TRANSITION);
  }
  if (!witnesses.campaignEvent) {
    problems.push(MISSING_WITNESS.CAMPAIGN_OR_HEARTBEAT_LOSS);
  }
  if (peerCohort.length === 0) problems.push(MISSING_WITNESS.PEER_COHORT);
  if (
    witnesses.oldTerm !== null &&
    witnesses.newTerm !== null &&
    witnesses.newTerm <= witnesses.oldTerm
  ) {
    problems.push(MISSING_WITNESS.MONOTONIC_TERM_ADVANCE);
  }
  return problems;
}

function projectLogWitness(event) {
  return event ? {
    trigger: event.trigger,
    time: event.time || null,
    evidencePath: event.evidencePath || null,
  } : null;
}

function classifyRealTransition({
  change,
  observedAtMs,
  records,
  captureByNode,
  windowMs,
}) {
  const witnesses = findTransitionWitnesses({
    change,
    observedAtMs,
    records,
    windowMs,
  });
  const peerCohort = normalizePeerCohort(
    ownField(witnesses.newLeaderEvent, 'peerCohort'),
  );
  const missingWitnesses = [
    ...(observedAtMs === null ? [MISSING_WITNESS.OBSERVED_AT] : []),
    ...captureWitnessProblems(change, captureByNode),
    ...transitionWitnessProblems(witnesses, peerCohort),
  ];
  return {
    ...change,
    outcome: missingWitnesses.length === 0 ? OUTCOME.REAL : OUTCOME.INCOMPLETE,
    oldTerm: witnesses.oldTerm,
    newTerm: witnesses.newTerm,
    campaignWitness: projectLogWitness(witnesses.campaignEvent),
    leaderWitness: projectLogWitness(witnesses.newLeaderEvent),
    peerCohort,
    eventLoopContext: eventLoopContext(
      records,
      [change.oldLeader, change.newLeader],
      observedAtMs,
      windowMs,
    ),
    missingWitnesses: [...new Set(missingWitnesses)].sort(),
  };
}

function classifySignatureReset({
  previous,
  current,
  records,
  captureByNode,
  windowMs,
  resetIndex,
}) {
  const observedAtMs = nonNegativeSafeInteger(
    ownField(current, 'observedAtMs'),
  );
  const changes = changedLeaderPartitions(previous, current);
  if (!changes || changes.length === 0) {
    return {
      resetIndex,
      observedAtMs,
      previousObserver: ownField(previous, 'selectedNodeId') || null,
      currentObserver: ownField(current, 'selectedNodeId') || null,
      outcome: OUTCOME.INCOMPLETE,
      partitionTransitions: [],
      missingWitnesses: [MISSING_WITNESS.LEADER_SIGNATURE],
    };
  }
  const partitionTransitions = changes.map((change) => {
    const artifactProof = proveObservationArtifact({
      previous,
      current,
      change,
      records,
      captureByNode,
    });
    if (artifactProof) {
      return {
        ...change,
        outcome: OUTCOME.ARTIFACT,
        oldTerm: null,
        newTerm: null,
        observationProof: artifactProof,
        eventLoopContext: eventLoopContext(
          records,
          [change.oldLeader, change.newLeader],
          observedAtMs,
          windowMs,
        ),
        missingWitnesses: [],
      };
    }
    return classifyRealTransition({
      change,
      observedAtMs,
      records,
      captureByNode,
      windowMs,
    });
  });
  const outcomes = new Set(partitionTransitions.map(({outcome}) => outcome));
  const outcome = outcomes.size === 1 ?
    partitionTransitions[0].outcome :
    OUTCOME.INCOMPLETE;
  const missingWitnesses = partitionTransitions.flatMap(
    (transition) => transition.missingWitnesses,
  );
  if (outcomes.size > 1) {
    missingWitnesses.push(MISSING_WITNESS.MIXED_PARTITION_OUTCOMES);
  }
  return {
    resetIndex,
    observedAtMs,
    previousObserver: ownField(previous, 'selectedNodeId') || null,
    currentObserver: ownField(current, 'selectedNodeId') || null,
    outcome,
    partitionTransitions,
    missingWitnesses: [...new Set(missingWitnesses)].sort(),
  };
}

function analyzeLeadershipChurn({
  resetHistory = [],
  records = [],
  captureIntegrity = [],
  windowMs = DEFAULT_WINDOW_MS,
}) {
  const normalizedResetHistory = canonicalArray(resetHistory);
  const normalizedRecords = canonicalArray(records);
  const normalizedCaptureIntegrity = canonicalArray(captureIntegrity);
  const normalizedWindowMs = nonNegativeSafeInteger(windowMs) ||
    DEFAULT_WINDOW_MS;
  const captureByNode = new Map(
    normalizedCaptureIntegrity
      .filter((capture) => typeof ownField(capture, 'nodeId') === 'string')
      .map((capture) => [ownField(capture, 'nodeId'), capture]),
  );
  const resets = [];
  for (let index = 1; index < normalizedResetHistory.length; index += 1) {
    if (leaderSignatureOf(normalizedResetHistory[index - 1]) ===
        leaderSignatureOf(normalizedResetHistory[index])) {
      continue;
    }
    resets.push(classifySignatureReset({
      previous: normalizedResetHistory[index - 1],
      current: normalizedResetHistory[index],
      records: normalizedRecords,
      captureByNode,
      windowMs: normalizedWindowMs,
      resetIndex: index,
    }));
  }
  const outcomeCounts = Object.fromEntries(
    objectValues(OUTCOME).map((outcome) => [outcome, 0]),
  );
  for (const reset of resets) outcomeCounts[reset.outcome] += 1;
  return {
    schemaVersion: 1,
    classificationContract: objectValues(OUTCOME),
    resetHistoryCount: normalizedResetHistory.length,
    signatureResetCount: resets.length,
    outcomeCounts,
    captureIntegrity: normalizedCaptureIntegrity,
    resets,
  };
}

function parseStructuredLogLine(line) {
  try {
    return jsonParse(line);
  } catch {
    return null;
  }
}

function appendCaptureRecord(capture, parsed, nodeId, evidencePath, lineNumber) {
  const incarnation = capture.incarnations.length;
  capture.incarnations[incarnation - 1].lineCount += 1;
  if (objectHasOwn(parsed, SOURCE_FINGERPRINT_MATCHES_FIELD)) {
    const matches = parsed[SOURCE_FINGERPRINT_MATCHES_FIELD];
    if (matches === true) {
      capture.incarnations[incarnation - 1].bootProvenanceCount += 1;
    } else if (matches === false) {
      capture.problems.push(`incarnation_${incarnation}_source_mismatch`);
    } else {
      capture.problems.push(
        `incarnation_${incarnation}_invalid_boot_provenance`,
      );
    }
  }
  const timeMs = recordTimeMs(parsed);
  if (
    timeMs !== null &&
    capture.previousTimeMs !== null &&
    timeMs < capture.previousTimeMs
  ) {
    capture.timestampRegressionCount += 1;
  }
  if (timeMs !== null) capture.previousTimeMs = timeMs;
  capture.records.push({
    ...parsed,
    nodeId: ownField(parsed, 'nodeId') || nodeId,
    incarnation,
    evidencePath: `${evidencePath}:${lineNumber}`,
  });
}

function inspectNodeCaptureLines(nodeId, lines, evidencePath = '') {
  const capture = {
    incarnations: [{lineCount: 0, bootProvenanceCount: 0}],
    problems: [],
    previousTimeMs: null,
    timestampRegressionCount: 0,
    records: [],
  };
  let boundaryCount = 0;
  let unparseableLineCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const parsed = parseStructuredLogLine(line);
    if (!parsed) {
      // Container stderr can contain multiline stack continuations. They remain
      // ordered bytes in the gzip but are not structured attribution records.
      unparseableLineCount += 1;
      continue;
    }
    if (ownField(parsed, 'harnessEvent') === INCARNATION_BOUNDARY_EVENT) {
      boundaryCount += 1;
      capture.incarnations.push({lineCount: 0, bootProvenanceCount: 0});
      capture.previousTimeMs = null;
      continue;
    }
    appendCaptureRecord(capture, parsed, nodeId, evidencePath, index + 1);
  }
  capture.incarnations.forEach((incarnation, index) => {
    if (incarnation.lineCount === 0) {
      capture.problems.push(`incarnation_${index + 1}_empty`);
    }
    if (incarnation.bootProvenanceCount === 0) {
      capture.problems.push(`incarnation_${index + 1}_boot_provenance_missing`);
    }
  });
  return {
    integrity: {
      nodeId,
      complete: capture.problems.length === 0,
      boundaryCount,
      incarnationCount: capture.incarnations.length,
      incarnations: capture.incarnations,
      unparseableLineCount,
      timestampRegressionCount: capture.timestampRegressionCount,
      duplicateValidation: DUPLICATE_VALIDATION_STREAM_CURSOR,
      problems: [...new Set(capture.problems)].sort(),
      evidencePath,
    },
    records: capture.records,
  };
}

function loadFullLogCorpus(logDirectory) {
  const records = [];
  const captureIntegrity = [];
  const files = fs.readdirSync(logDirectory)
    .filter((name) => name.endsWith('.log.gz'))
    .sort();
  for (const file of files) {
    const filePath = path.join(logDirectory, file);
    const nodeId = file.slice(0, -'.log.gz'.length);
    try {
      const lines = gunzipSync(fs.readFileSync(filePath)).toString('utf8').split('\n');
      const inspected = inspectNodeCaptureLines(nodeId, lines, filePath);
      records.push(...inspected.records);
      captureIntegrity.push(inspected.integrity);
    } catch (error) {
      captureIntegrity.push({
        nodeId,
        complete: false,
        boundaryCount: 0,
        incarnationCount: 0,
        incarnations: [],
        problems: [`invalid_gzip:${error.message}`],
        evidencePath: filePath,
      });
    }
  }
  return {records, captureIntegrity};
}

function findResetHistory(value) {
  let best = [];
  const seen = new WeakSet();
  const visit = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    const history = ownField(candidate, 'candidateWindowResetHistory');
    if (arrayIsArray(history) && history.length > best.length) {
      best = history;
    }
    for (const child of arrayIsArray(candidate) ? candidate : objectValues(candidate)) {
      visit(child);
    }
  };
  visit(value);
  return best;
}

function parseArgs(argv) {
  const args = {report: '', logs: '', out: ''};
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === CLI_FLAG_REPORT) args.report = argv[(index += 1)];
    else if (flag === CLI_FLAG_LOGS) args.logs = argv[(index += 1)];
    else if (flag === CLI_FLAG_OUT) args.out = argv[(index += 1)];
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!args.report || !args.logs) {
    throw new Error(CLI_USAGE);
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const report = jsonParse(fs.readFileSync(args.report, 'utf8'));
  const corpus = loadFullLogCorpus(args.logs);
  const result = analyzeLeadershipChurn({
    resetHistory: findResetHistory(report),
    records: corpus.records,
    captureIntegrity: corpus.captureIntegrity,
  });
  const output = jsonStringify({
    ...result,
    sourceReport: args.report,
    sourceFullLogs: args.logs,
  }, null, 2) + '\n';
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), {recursive: true});
    fs.writeFileSync(args.out, output);
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv);
}

export {
  OUTCOME,
  analyzeLeadershipChurn,
  changedLeaderPartitions,
  findResetHistory,
  inspectNodeCaptureLines,
  loadFullLogCorpus,
  proveObservationArtifact,
};
