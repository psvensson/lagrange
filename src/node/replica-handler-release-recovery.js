// One bounded lifecycle wake path for current hosted partitions. Wakes and
// retries carry no phase authority: every run reads current durable origin,
// membership, build and live service facts through the release algorithm.
import {RAFT_ROLE} from '../raft/constants.js';
import {runtimeBuildProvenance, RUNTIME_BUILD_STATE} from
  '../diagnostics/runtime-build-provenance.js';
import {readPartitionWriteOrigin} from '../partition/partition-participant-transaction-store.js';
import {invalidateParticipantReleaseAdmission, participantCutoverPauseOf} from
  '../partition/partition-participant-transaction-pause.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_LOG, PARTICIPANT_RELEASE_TRIGGER as TRIGGER} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {runParticipantCutover} from './replica-handler-participant-cutover.js';
import {requestParticipantRelease} from './participant-release-client.js';

function createParticipantReleaseRecovery(handler) {
  const MAX_CONCURRENT_ATTEMPTS = 4;
  const pending = new Map();
  const running = new Map();
  const reported = new Map();
  let timer = null;
  let stopped = false;
  const now = () => handler.timeSource.now();

  function sleep(delayMs, deadlineAtMs) {
    const remaining = deadlineAtMs - now();
    if (remaining <= 0) return Promise.resolve(false);
    return new Promise((resolve) => {
      const handle = handler.timeSource.setTimeout(
        () => resolve(true), Math.min(delayMs, remaining));
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
    timer = handler.timeSource.setTimeout(dispatch, Math.max(0, next - now()));
    timer.unref?.();
  }

  function enqueue(partitionId, delay = 0) {
    if (stopped || !partitionId || hosted(partitionId).length === 0) return;
    const due = now() + delay;
    pending.set(partitionId, Math.min(pending.get(partitionId) ?? due, due));
    // A new owner event may need to wake sooner than an old recovery retry.
    if (timer !== null) handler.timeSource.clearTimeout(timer);
    timer = null;
    arm();
  }

  function report(partitionId, answer) {
    const signature = JSON.stringify([answer.outcome, answer.missingFact ?? null,
      answer.reason ?? null]);
    const previous = reported.get(partitionId);
    if (previous?.signature === signature &&
        now() - previous.at < BOUND.DRAIN_DEADLINE_MS) return;
    reported.set(partitionId, {signature, at: now()});
    handler.logger.info(PARTICIPANT_RELEASE_LOG, {partitionId,
      outcome: answer.outcome, missingFact: answer.missingFact ?? null,
      reason: answer.reason ?? null});
  }

  async function reconcile(partitionId) {
    const services = hosted(partitionId);
    const leader = services.find((service) => service.initialized &&
      service.raft?.readStatus().role === RAFT_ROLE.LEADER);
    if (!leader) {
      enqueue(partitionId, BOUND.RECOVERY_RETRY_MS);
      return;
    }
    invalidateParticipantReleaseAdmission(leader);
    if (participantCutoverPauseOf(leader) === null) return;
    if (readPartitionWriteOrigin(leader.db) === null) {
      report(partitionId, {outcome: OUTCOME.OPERATOR_REQUIRED,
        missingFact: 'explicit_pre_origin_release_request'});
      return;
    }
    const build = await runtimeBuildProvenance();
    if (build.state !== RUNTIME_BUILD_STATE.MEASURED) {
      report(partitionId, {outcome: OUTCOME.OPERATOR_REQUIRED,
        missingFact: 'measured_boot_content', reason: build.reason});
      return;
    }
    if (stopped || handler.shuttingDown ||
        handler.localServices.get(leader.replicaId) !== leader) return;
    const answer = await runParticipantCutover(handler, {partitionId,
      targetBuildDigest: build.digest, trigger: TRIGGER.EXISTING_ORIGIN,
      deadlineAtMs: now() + BOUND.DRAIN_DEADLINE_MS});
    report(partitionId, answer);
    if (answer.outcome !== OUTCOME.CUT_OVER) enqueue(partitionId, BOUND.RECOVERY_RETRY_MS);
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
      if (service) enqueue(service.partitionId);
      if (previous && hosted(previous.partitionId).length === 0) {
        pending.delete(previous.partitionId);
      }
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
        throw new Error('Fresh replica release deadline unavailable');
      }
      const authorization = await handler.participantReleaseAuthorizationOwner
        .authorizeFreshCreate({partitionId, targetBuildDigest: build.digest,
          createAdmissionEvidence: options.createAdmissionEvidence,
          createPhysicalWorkerClaim: options.createPhysicalWorkerClaim,
          identityExisted: options.identityExisted});
      if (authorization === null) {
        throw new Error('Fresh replica release authority unavailable');
      }
      let answer = null;
      do {
        answer = await requestParticipantRelease(handler, {partitionId,
          targetBuildDigest: build.digest, trigger: TRIGGER.FRESH_CREATE,
          deadlineAtMs: deadline, authorization});
        if (answer.outcome === OUTCOME.CUT_OVER) return answer;
        // A newly created one-member group can answer before its first leader
        // election.  There is no redirect yet, but NOT_LEADER is still a
        // bounded lifecycle wait rather than an authority to publish ACTIVE.
        const retryAfterMs = answer.outcome === OUTCOME.NOT_LEADER ?
          BOUND.PAUSE_RETRY_AFTER_MS : answer.retryAfterMs;
        if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0 ||
            now() + retryAfterMs > deadline ||
            !await sleep(retryAfterMs, deadline)) break;
      } while (now() <= deadline);
      throw new Error('Fresh replica participant release failed: ' +
        JSON.stringify({partitionId, answer}));
    },
    async releaseOperator({partitionId, targetBuildDigest, deadlineAtMs}) {
      if (!Number.isSafeInteger(deadlineAtMs) || deadlineAtMs <= now()) {
        throw new Error('Operator participant release deadline unavailable');
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
      if (timer !== null) handler.timeSource.clearTimeout(timer);
      timer = null;
      pending.clear();
      reported.clear();
      await Promise.allSettled([...running.values()]);
    },
  });
}

export {createParticipantReleaseRecovery};
