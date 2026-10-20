// Test-only passive original-delivery observation, reused from the independently
// reviewed native-startup census trace-v2. No owner read or protocol action.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {MessageRouter} from '../../src/transport/message-router.js';
import {COMMITTED_MEMBERSHIP_MAX_PEERS} from
  '../../src/raft/raft-committed-membership-constants.js';
import {PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';

const PARTICIPANT_RELEASE_TRACE_CAP = 8192;
const PARTICIPANT_RELEASE_COHORT_TRACE_CAP = 16;
const TRACE_ERROR_MESSAGE_CAP = 512;
const PARTICIPANT_RELEASE_TRACE_SCHEMA = 'participant-release-delivery-trace/1';

// Preserve only the named observational fields; absence stays explicit null.
function traceFields(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, value?.[field] ?? null]));
}

function traceErrorOf(error) {
  if (error === null || typeof error !== 'object') return null;
  const message = typeof error.message === 'string' ? error.message : null;
  const code = typeof error.code === 'string' || typeof error.code === 'number' ?
    error.code : null;
  return {name: typeof error.name === 'string' ? error.name : null, code,
    message: message === null ? null : message.slice(0, TRACE_ERROR_MESSAGE_CAP),
    messageLength: message?.length ?? null};
}

function releaseIdentityTraceOf(release) {
  if (release === null || typeof release !== 'object') return null;
  return {
    releaseId: release.releaseId ?? null,
    partitionId: release.partitionId ?? null,
    protocolVersion: release.protocolVersion ?? null,
    targetBuildDigest: release.targetBuildDigest ?? null,
    configurationKey: release.configurationKey ?? null,
    membershipGenerationIndex: release.membershipGenerationIndex ?? null,
  };
}

function generationTraceOf(generation) {
  if (generation === null || typeof generation !== 'object') return null;
  return {
    nodeId: generation.nodeId ?? null,
    ownerIncarnation: generation.ownerIncarnation ?? null,
    replicaId: generation.replicaId ?? null,
    lifecycleIncarnation: generation.lifecycleIncarnation ?? null,
    runtimeGeneration: generation.runtimeGeneration ?? null,
    connectionGeneration: generation.connectionGeneration ?? null,
    admissionGeneration: generation.admissionGeneration ?? null,
  };
}

function workTraceOf(work) {
  if (work === null || typeof work !== 'object') return null;
  return {
    sqliteTransactionOpen: work.sqliteTransactionOpen ?? null,
    participantStaging: work.participantStaging ?? null,
    participantPrepared: work.participantPrepared ?? null,
    proposals: work.proposals ?? null,
    pendingOutcomes: work.pendingOutcomes ?? null,
    appliedIndex: work.appliedIndex ?? null,
    commitIndex: work.commitIndex ?? null,
    lastIndex: work.lastIndex ?? null,
  };
}

function originTraceOf(origin) {
  if (origin === null || typeof origin !== 'object') return null;
  return {originIndex: origin.originIndex ?? null, originTerm: origin.originTerm ?? null};
}

function boundedMembershipArray(value) {
  return Array.isArray(value) ? value.slice(0, COMMITTED_MEMBERSHIP_MAX_PEERS) : null;
}

function membershipTraceOf(membership) {
  if (membership === null || typeof membership !== 'object') return null;
  const voters = boundedMembershipArray(membership.voters);
  const votersOutgoing = boundedMembershipArray(membership.votersOutgoing);
  const learners = boundedMembershipArray(membership.learners);
  const learnersNext = boundedMembershipArray(membership.learnersNext);
  const groups = [voters, votersOutgoing, learners, learnersNext];
  const peerIds = [...new Set(groups.flatMap((group) => group ?? []))]
    .slice(0, COMMITTED_MEMBERSHIP_MAX_PEERS);
  return {
    kind: membership.kind ?? null,
    voters,
    votersOutgoing,
    learners,
    learnersNext,
    ...traceFields(membership, ['appliedIndex', 'configurationKey',
      'membershipGenerationIndex', 'commitIndex', 'term', 'leaderId', 'gateOpen']),
    identities: peerIds.map((peerId) => ({peerId,
      replicaId: membership.identities?.[peerId] ?? null})),
  };
}

function attemptTraceOf(attempt) {
  if (attempt === null || typeof attempt !== 'object') return null;
  return {
    leaderReplicaId: attempt.leaderReplicaId ?? null,
    term: attempt.term ?? null,
    leaderLifecycleIncarnation: attempt.leaderLifecycleIncarnation ?? null,
    deadlineAtMs: attempt.deadlineAtMs ?? null,
  };
}

function cohortTraceOf(census) {
  if (!Array.isArray(census)) return null;
  const captured = census.slice(0, PARTICIPANT_RELEASE_COHORT_TRACE_CAP);
  return {total: census.length, captured: captured.length,
    dropped: census.length - captured.length,
    members: captured.map((facts, index) => ({ordinal: index + 1,
      partitionId: facts?.partitionId ?? null,
      generation: generationTraceOf(facts?.generation)}))};
}

function requestTraceOf(request) {
  return {
    ...traceFields(request, ['action', 'trigger', 'partitionId', 'replicaId',
      'targetBuildDigest', 'deadlineAtMs']),
    release: releaseIdentityTraceOf(request?.release),
    target: generationTraceOf(request?.target),
    attempt: attemptTraceOf(request?.attempt),
    cohort: cohortTraceOf(request?.census),
  };
}

function blockedDrainTraceOf(blockedDrain) {
  if (blockedDrain === null || typeof blockedDrain !== 'object') return null;
  return {generation: generationTraceOf(blockedDrain.generation),
    work: workTraceOf(blockedDrain.work)};
}

function releaseAnswerTraceOf(answer) {
  if (answer === null || typeof answer !== 'object') return null;
  return {
    ...traceFields(answer, ['outcome', 'releaseId', 'partitionId', 'phase', 'reason']),
    queryState: answer.queryCensus?.state ?? null,
    queryEnforcement: answer.queryCensus?.enforcement?.state ?? null,
    ...traceFields(answer, ['retryAfterMs', 'missingFact', 'controlPartitionId',
      'controlNodeId', 'controlOutcome', 'controlMissingFact', 'controlPhase', 'controlReason',
      'leaderReplicaId', 'leaderAddress', 'buildDigest']),
    release: releaseIdentityTraceOf(answer.release),
    generation: generationTraceOf(answer.generation),
    work: workTraceOf(answer.work),
    origin: originTraceOf(answer.origin),
    membership: membershipTraceOf(answer.membership),
    blockedDrain: blockedDrainTraceOf(answer.blockedDrain),
  };
}

function responseTraceOf(response) {
  if (response === null) return null;
  return {...traceFields(response, ['acknowledged', 'deliveryState', 'noHandler', 'errorCode']),
    answer: releaseAnswerTraceOf(response?.[PARTICIPANT_RELEASE_RESULT_FIELD])};
}

function createParticipantReleaseDeliveryTrace() {
  const records = [];
  const installations = [];
  let callOrdinal = 0;
  let completionOrdinal = 0;
  let installationOrdinal = 0;
  let matchedCount = 0;
  let droppedCount = 0;
  let captureErrorCount = 0;

  const admitRecord = (installation, args, currentCallOrdinal) => {
    try {
      if (args[1]?.type !== PARTICIPANT_RELEASE_TYPE) return null;
      matchedCount += 1;
      if (records.length >= PARTICIPANT_RELEASE_TRACE_CAP) {
        droppedCount += 1;
        return null;
      }
      const record = {startedAtMs: Date.now(), settledAtMs: null,
        installationOrdinal: installation.trace.installationOrdinal,
        routerId: installation.trace.routerId,
        nodeId: installation.trace.nodeId,
        callOrdinal: currentCallOrdinal, completionOrdinal: null,
        targetAddress: args[0], request: requestTraceOf(args[1]),
        response: null, error: null};
      records.push(record);
      return record;
    } catch (_captureError) {
      captureErrorCount += 1;
      return null;
    }
  };

  const captureCompletion = (record, response, error) => {
    if (record === null) return;
    try {
      const responseTrace = responseTraceOf(response);
      const errorTrace = traceErrorOf(error);
      completionOrdinal += 1;
      record.completionOrdinal = completionOrdinal;
      record.settledAtMs = Date.now();
      record.response = responseTrace;
      record.error = errorTrace;
    } catch (_captureError) {
      captureErrorCount += 1;
    }
  };

  const routerFactory = (options) => {
    const router = new MessageRouter(options);
    const originalDeliver = router.deliver;
    installationOrdinal += 1;
    const installation = {router, originalDeliver, trace: {
      installationOrdinal,
      nodeId: options.nodeId ?? null,
      nodeAddress: options.nodeAddress ?? null,
      advertisedAddress: options.advertisedAddress ?? null,
      wsPort: options.wsPort ?? null,
      bootIncarnation: options.bootIncarnation ?? null,
      routerNodeId: router.nodeId ?? null,
      routerId: router.routerId ?? null,
    }};
    router.deliver = function(...args) {
      callOrdinal += 1;
      const currentCallOrdinal = callOrdinal;
      const record = admitRecord(installation, args, currentCallOrdinal);
      let originalPromise;
      try {
        originalPromise = Reflect.apply(originalDeliver, this, args);
      } catch (error) {
        captureCompletion(record, null, error);
        throw error;
      }
      try {
        if (record !== null) {
          void Promise.prototype.then.call(originalPromise,
            (response) => captureCompletion(record, response, null),
            (error) => captureCompletion(record, null, error));
        }
      } catch (_captureError) {
        captureErrorCount += 1;
      }
      return originalPromise;
    };
    installations.push(installation);
    return router;
  };

  return {
    routerFactory,
    restore() {
      const errors = [];
      for (const {router, originalDeliver} of installations) {
        try {
          router.deliver = originalDeliver;
        } catch (error) {
          captureErrorCount += 1;
          errors.push(error);
        }
      }
      if (errors.length > 0) throw errors[0];
    },
    report() {
      return {schema: PARTICIPANT_RELEASE_TRACE_SCHEMA,
        cap: PARTICIPANT_RELEASE_TRACE_CAP, matchedCount,
        recordedCount: records.length, completionCount: completionOrdinal,
        droppedCount, captureErrorCount,
        incompleteCount: records.filter((record) => record.completionOrdinal === null).length,
        installations: installations.map((installation) => installation.trace), records};
    },
  };
}

// Preserve full evidence outside the runner's disposable worktree, only after
// bootstrap settles. Root owns copying and deleting this one named directory.
function emitParticipantReleaseDeliveryTrace(trace) {
  const report = trace.report();
  const payload = JSON.stringify(report);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-control-trace-'));
  const file = path.join(directory, 'trace.json');
  fs.writeFileSync(file, payload);
  console.error(JSON.stringify({schema: 'participant-release-trace-file/1', file,
    sha256: createHash('sha256').update(payload).digest('hex'),
    bytes: Buffer.byteLength(payload), recordedCount: report.recordedCount,
    droppedCount: report.droppedCount, captureErrorCount: report.captureErrorCount,
    incompleteCount: report.incompleteCount}));
}

export {createParticipantReleaseDeliveryTrace, emitParticipantReleaseDeliveryTrace};
