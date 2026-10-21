// One bounded lifecycle wake path for current hosted partitions. Wakes and
// retries carry no phase authority: every run reads current durable origin,
// membership, build and live service facts through the release algorithm.
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {runtimeBuildProvenance, RUNTIME_BUILD_STATE} from
  '../diagnostics/runtime-build-provenance.js';
import {readPartitionWriteOrigin} from '../partition/partition-participant-transaction-store.js';
import {invalidateParticipantReleaseAdmission, participantCutoverPauseOf} from
  '../partition/partition-participant-transaction-pause.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_LOG, PARTICIPANT_RELEASE_TRIGGER as TRIGGER} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {runParticipantCutover} from './replica-handler-participant-cutover.js';
import {completeParticipantRelease, requestParticipantRelease} from './participant-release-client.js';
import {isHeldByHostFailure} from '../partition/partition-write-kernel.js';

const RELEASE_RECOVERY_FACT = Object.freeze({
  BUILD: 'measured_boot_content',
  ORIGIN: 'explicit_pre_origin_release_request',
  STATUS: 'semantic_raft_status',
  TIMER: 'release_recovery_timer',
});
const RELEASE_RECOVERY_REASON = Object.freeze({
  STATUS_UNAVAILABLE: 'semantic raft status unavailable',
});
const RELEASE_RECOVERY_ERROR = Object.freeze({
  FRESH_FAILED: 'Fresh replica participant release failed: ',
  FRESH_DEADLINE: 'Fresh replica release deadline unavailable',
  FRESH_AUTHORITY: 'Fresh replica release authority unavailable',
  OPERATOR_DEADLINE: 'Operator participant release deadline unavailable',
});

function ordinaryNonleaderStatus(status) {
  return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    (status.role === RAFT_ROLE.FOLLOWER || status.role === RAFT_ROLE.CANDIDATE);
}

function statusReason(status) {
  const reason = status?.reason;
  if (typeof reason === 'string') return reason;
  const failureReason = status?.failure?.reason;
  return typeof failureReason === 'string' ? failureReason :
    RELEASE_RECOVERY_REASON.STATUS_UNAVAILABLE;
}

function reportFieldsOf(answer) {
  return {outcome: answer.outcome,
    missingFact: answer.missingFact ?? null,
    reason: answer.reason ?? null,
    blockedGroupId: answer.blockedGroupId ?? null,
    blockedReplicaId: answer.blockedReplicaId ?? null,
    recoveryPhase: answer.recoveryPhase ?? null,
    statusOutcome: answer.statusOutcome ?? null,
    failure: answer.failure ?? null};
}

function observeHostedServices(services) {
  let held = null;
  let unavailable = null;
  let initialized = 0;
  for (const service of services) {
    if (!service.initialized) continue;
    initialized += 1;
    const status = service.raft?.readStatus();
    if (status?.role === RAFT_ROLE.LEADER) return {leader: service, held, unavailable, initialized};
    if (isHeldByHostFailure(status)) {
      held ??= {service, status};
    } else if (!ordinaryNonleaderStatus(status)) {
      unavailable ??= {service, status};
    }
  }
  return {leader: null, held, unavailable, initialized};
}

function statusReportOf(observation) {
  const {service, status} = observation;
  return {outcome: OUTCOME.UNAVAILABLE, missingFact: RELEASE_RECOVERY_FACT.STATUS,
    reason: statusReason(status),
    blockedGroupId: status?.groupId || service.partitionId,
    blockedReplicaId: status?.replicaIdentity || service.replicaId,
    recoveryPhase: status?.phase ?? null,
    statusOutcome: status?.outcome ?? null,
    failure: status?.failure ?? null};
}

function createParticipantReleaseRecovery(handler) {
  const MAX_CONCURRENT_ATTEMPTS = 4;
  const pending = new Map();
  const running = new Map();
  const reported = new Map();
  let timer = null;
  let stopped = false;
  const now = () => handler.timeSource.now();

  function sleep(delayMs) {
    return new Promise((resolve) => {
      const handle = handler.timeSource.setTimeout(
        () => resolve(), delayMs);
      handle?.unref?.();
    });
  }

  function hosted(partitionId) {
    return [...handler.localServices.values()].filter((service) =>
      service.partitionId === partitionId && !service.isShutdown);
  }

  function arm() {
    if (stopped || timer !== null || pending.size === 0 ||
        running.size >= MAX_CONCURRENT_ATTEMPTS) return;
    const next = Math.min(...pending.values());
    try {
      // Keep the original scheduler with this timer. A later handler clock
      // replacement may schedule new work, but must never clear a handle
      // owned by another clock's recovery lane.
      const source = handler.timeSource;
      const handle = source.setTimeout(dispatch, Math.max(0, next - now()));
      timer = Object.freeze({source, handle});
      handle?.unref?.();
    } catch (error) {
      timer = null;
      const stranded = [...pending.keys()];
      pending.clear();
      for (const partitionId of stranded) {
        report(partitionId, {outcome: OUTCOME.UNAVAILABLE,
          missingFact: RELEASE_RECOVERY_FACT.TIMER,
          reason: String(error?.message ?? error)});
      }
    }
  }

  function enqueue(partitionId, delay = 0) {
    if (stopped || !partitionId || hosted(partitionId).length === 0) return;
    const due = now() + delay;
    pending.set(partitionId, Math.min(pending.get(partitionId) ?? due, due));
    // A new owner event may need to wake sooner than an old recovery retry.
    if (timer !== null) timer.source.clearTimeout(timer.handle);
    timer = null;
    arm();
  }

  function dischargePartition(partitionId) {
    pending.delete(partitionId);
    reported.delete(partitionId);
    if (pending.size === 0 && timer !== null) {
      timer.source.clearTimeout(timer.handle);
      timer = null;
    }
  }

  function report(partitionId, answer) {
    if (stopped || hosted(partitionId).length === 0) {
      reported.delete(partitionId);
      return;
    }
    const fields = reportFieldsOf(answer);
    const signature = JSON.stringify([fields.outcome, fields.missingFact,
      fields.reason, fields.blockedGroupId, fields.blockedReplicaId,
      fields.recoveryPhase, fields.statusOutcome]);
    const previous = reported.get(partitionId);
    if (previous?.signature === signature &&
        now() - previous.at < BOUND.DRAIN_DEADLINE_MS) return;
    reported.set(partitionId, {signature, at: now()});
    handler.logger.info(PARTICIPANT_RELEASE_LOG, {partitionId, ...fields});
  }

  function settleNoLeader(partitionId, services, observed) {
    if (observed.held !== null) {
      report(partitionId, statusReportOf(observed.held));
      enqueue(partitionId, BOUND.RECOVERY_RETRY_MS);
    } else if (observed.unavailable !== null) {
      report(partitionId, statusReportOf(observed.unavailable));
    } else if (services.length === 0) {
      dischargePartition(partitionId);
    } else if (services.length > 0 && observed.initialized === 0) {
      report(partitionId, {outcome: OUTCOME.UNAVAILABLE,
        missingFact: RELEASE_RECOVERY_FACT.STATUS,
        reason: RELEASE_RECOVERY_REASON.STATUS_UNAVAILABLE});
    }
  }

  async function reconcile(partitionId) {
    const services = hosted(partitionId);
    const observed = observeHostedServices(services);
    const {leader} = observed;
    if (!leader) {
      settleNoLeader(partitionId, services, observed);
      return;
    }
    invalidateParticipantReleaseAdmission(leader);
    if (participantCutoverPauseOf(leader) === null) return;
    if (readPartitionWriteOrigin(leader.db) === null) {
      report(partitionId, {outcome: OUTCOME.OPERATOR_REQUIRED,
        missingFact: RELEASE_RECOVERY_FACT.ORIGIN});
      return;
    }
    const build = await runtimeBuildProvenance();
    if (build.state !== RUNTIME_BUILD_STATE.MEASURED) {
      report(partitionId, {outcome: OUTCOME.OPERATOR_REQUIRED,
        missingFact: RELEASE_RECOVERY_FACT.BUILD, reason: build.reason});
      return;
    }
    if (stopped || handler.shuttingDown ||
        handler.localServices.get(leader.replicaId) !== leader) return;
    const answer = await runParticipantCutover(handler, {partitionId,
      targetBuildDigest: build.digest, trigger: TRIGGER.EXISTING_ORIGIN,
      deadlineAtMs: now() + BOUND.DRAIN_DEADLINE_MS});
    report(partitionId, answer);
  }

  function dispatch() {
    timer = null;
    if (stopped || handler.shuttingDown) return;
    for (const [partitionId, due] of pending) {
      if (running.size >= MAX_CONCURRENT_ATTEMPTS) break;
      if (due > now()) continue;
      if (running.has(partitionId)) {
        pending.set(partitionId, now() + BOUND.RECOVERY_RETRY_MS);
        continue;
      }
      pending.delete(partitionId);
      const task = reconcile(partitionId).catch((error) => {
        report(partitionId, {outcome: OUTCOME.UNAVAILABLE,
          reason: String(error?.message ?? error)});
        enqueue(partitionId, BOUND.RECOVERY_RETRY_MS);
      }).finally(() => {
        if (running.get(partitionId) === task) running.delete(partitionId);
        arm();
      });
      running.set(partitionId, task);
    }
    arm();
  }

  const stopServices = handler.localServices.subscribeServiceChanges(
    ({service, previous}) => {
      if (previous && hosted(previous.partitionId).length === 0) {
        dischargePartition(previous.partitionId);
      }
      if (service) enqueue(service.partitionId);
    });
  const stopConsensus = handler.consensusEvents.subscribe(({partitionId}) => {
    for (const service of hosted(partitionId)) invalidateParticipantReleaseAdmission(service);
    enqueue(partitionId);
  });

  return Object.freeze({
    async releaseFreshCreate(partitionId, options = {}) {
      const build = await runtimeBuildProvenance();
      if (build.state !== RUNTIME_BUILD_STATE.MEASURED) {
        throw new Error(`Fresh replica release build unavailable: ${build.reason}`);
      }
      const deadline = options.deadlineAtMs;
      if (!Number.isSafeInteger(deadline) || deadline <= now()) {
        throw new Error(RELEASE_RECOVERY_ERROR.FRESH_DEADLINE);
      }
      const authorization = await handler.participantReleaseAuthorizationOwner
        .authorizeFreshCreate({partitionId, targetBuildDigest: build.digest,
          createAdmissionEvidence: options.createAdmissionEvidence,
          identityExisted: options.identityExisted});
      if (authorization === null) {
        throw new Error(RELEASE_RECOVERY_ERROR.FRESH_AUTHORITY);
      }
      const {answer, completed} = await completeParticipantRelease(handler, {partitionId,
        targetBuildDigest: build.digest, trigger: TRIGGER.FRESH_CREATE,
        deadlineAtMs: deadline, authorization}, {now, sleep});
      if (completed) return answer;
      throw new Error(RELEASE_RECOVERY_ERROR.FRESH_FAILED +
        JSON.stringify({partitionId, answer}));
    },
    async releaseOperator({partitionId, targetBuildDigest, deadlineAtMs}) {
      if (!Number.isSafeInteger(deadlineAtMs) || deadlineAtMs <= now()) {
        throw new Error(RELEASE_RECOVERY_ERROR.OPERATOR_DEADLINE);
      }
      const authorization = handler.participantReleaseAuthorizationOwner
        .authorizeOperator({partitionId, targetBuildDigest});
      return requestParticipantRelease(handler, {partitionId,
        targetBuildDigest, deadlineAtMs, authorization,
        trigger: TRIGGER.OPERATOR});
    },
    async shutdown() {
      stopped = true;
      stopServices();
      stopConsensus();
      if (timer !== null) timer.source.clearTimeout(timer.handle);
      timer = null;
      pending.clear();
      reported.clear();
      await Promise.allSettled([...running.values()]);
    },
  });
}

export {createParticipantReleaseRecovery};
