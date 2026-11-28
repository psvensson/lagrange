import {readStateField} from '../utils/state-field-read.js';
// One bounded lifecycle wake path for current hosted partitions. Wakes and
// retries carry no phase authority: every run reads current durable origin,
// membership, build and live service facts through the release algorithm.
import {RAFT_ROLE} from '../raft/constants.js';
import {TABLES} from '../constants/tables.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {ROLE as RAFT_RS_ROLE} from '../raft/raft-rs-runtime-owner-constants.js';
import {runtimeBuildProvenance, RUNTIME_BUILD_STATE} from
  '../diagnostics/runtime-build-provenance.js';
import {readPartitionWriteOrigin} from '../partition/partition-participant-transaction-store.js';
import {invalidateParticipantReleaseAdmission, participantCutoverPauseOf} from
  '../partition/partition-participant-transaction-pause.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_LOG, PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT,
  PARTICIPANT_RELEASE_TRIGGER as TRIGGER} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {runParticipantCutover} from './replica-handler-participant-cutover.js';
import {
  hasAnyUnreachableOrDeadClusterNode,
  hasUnpublishedCompletedMembershipRecovery,
} from './replica-handler-membership-recovery-decision.js';
import {captureParticipantReleaseRecoveryDetail} from './participant-release-diagnostic-observation.js';
import {completeParticipantRelease, requestParticipantRelease} from './participant-release-client.js';
import {isHeldByHostFailure} from '../raft/raft-operation-port.js';

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
const FRESH_CREATE_RELEASE_UNAVAILABLE = 'FRESH_CREATE_RELEASE_UNAVAILABLE';

const PRE_CANDIDATE_RAFT_STATE = 3;
const PRE_CANDIDATE_ROLE = RAFT_RS_ROLE[PRE_CANDIDATE_RAFT_STATE];
const PRIORITY_RELEASE_PARTITION_ORDER = Object.freeze([
  INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS],
  INITIAL_PARTITION_IDS[TABLES.REPLICA_OPERATIONS],
  INITIAL_PARTITION_IDS[TABLES.SERVICES],
  INITIAL_PARTITION_IDS[TABLES.PARTITIONS],
  INITIAL_PARTITION_IDS[TABLES.TABLES],
  INITIAL_PARTITION_IDS[TABLES.NODES],
  INITIAL_PARTITION_IDS[TABLES.SCHEMA_OPERATIONS],
  INITIAL_PARTITION_IDS[TABLES.SERVICE_ENDPOINTS],
  INITIAL_PARTITION_IDS[TABLES.NODE_ENDPOINTS],
]);
const PRIORITY_RELEASE_PARTITION_SET = new Set(PRIORITY_RELEASE_PARTITION_ORDER);

function releasePartitionPriorityRank(partitionId) {
  const index = PRIORITY_RELEASE_PARTITION_ORDER.indexOf(partitionId);
  return index === -1 ? PRIORITY_RELEASE_PARTITION_ORDER.length : index;
}

function ordinaryNonleaderStatus(status) {
  // PRE_VOTE is enabled on every group (raft-rs-group-constants.js), so
  // raft-rs can report StateRole::PreCandidate (`'pre-candidate'`) on an
  // otherwise healthy non-leader follower without holding unavailable status.
  return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    (status.role === RAFT_ROLE.FOLLOWER ||
      status.role === RAFT_ROLE.CANDIDATE ||
      status.role === PRE_CANDIDATE_ROLE);
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
    recoveryPhase: readStateField(status?.phase),
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
    handler.logger.info(PARTICIPANT_RELEASE_LOG,
      {partitionId, ...fields, ...captureParticipantReleaseRecoveryDetail(answer)});
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

  function isActiveHostedLeader(leader) {
    if (stopped || handler.shuttingDown) return false;
    if (leader.isShutdown === true) return false;
    return handler.localServices.get(leader.replicaId) === leader;
  }

  function enqueuePriorityHostedPartitions(delay = 0) {
    if (stopped || handler.shuttingDown) return;
    for (const partitionId of PRIORITY_RELEASE_PARTITION_ORDER) {
      if (hosted(partitionId).length > 0) {
        enqueue(partitionId, delay);
      }
    }
  }

  function hasPendingLocalPriorityLeader(excludePartitionId = null) {
    for (const partitionId of PRIORITY_RELEASE_PARTITION_ORDER) {
      if (partitionId === excludePartitionId) continue;
      if (running.has(partitionId)) return true;
      for (const service of hosted(partitionId)) {
        if (!service.initialized) continue;
        if (service.raft?.readStatus?.()?.role === RAFT_ROLE.LEADER &&
            participantCutoverPauseOf(service) !== null) {
          return true;
        }
      }
    }
    return false;
  }

  function hasAnyCompletedLocalMembershipRecovery() {
    for (const service of handler.localServices.values()) {
      if (service?.lastCompletedMembershipRecovery) return true;
    }
    return false;
  }

  function reassertAllLocalLeadersMetadata() {
    for (const service of handler.localServices.values()) {
      if (!service || service.isShutdown || !service.initialized) continue;
      if (service.raft?.readStatus?.()?.role === RAFT_ROLE.LEADER) {
        service.reassertDurableLeaderNodeId?.();
        if (service.lastCompletedMembershipRecovery &&
            service.lastCompletedMembershipRecoveryPersisted !== true) {
          void handler.tryAutonomousPermanentMemberLossRecovery?.(service);
        }
      }
      service.reassertDurableRaftRole?.();
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
    const isPriorityPartition = PRIORITY_RELEASE_PARTITION_SET.has(partitionId);
    if (participantCutoverPauseOf(leader) === null) {
      const voterCount = leader.raft?.readStatus?.()?.voterCount ?? 0;
      const hasUnpublishedRecovery = hasUnpublishedCompletedMembershipRecovery(
        handler,
        leader,
      );
      if (!hasUnpublishedRecovery &&
          (!isPriorityPartition ||
            (!leader.lastCompletedMembershipRecovery &&
              (voterCount <= 1 || !hasAnyUnreachableOrDeadClusterNode(handler))))) {
        return;
      }
      const recovered = await handler.tryAutonomousPermanentMemberLossRecovery?.(leader);
      if (recovered?.success === true) {
        enqueuePriorityHostedPartitions(0);
      } else if (recovered?.retry === true) {
        enqueue(partitionId, BOUND.RECOVERY_RETRY_MS);
      }
      return;
    }
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
    if (!isActiveHostedLeader(leader)) return;
    const answer = await runParticipantCutover(handler, {partitionId,
      targetBuildDigest: build.digest, trigger: TRIGGER.EXISTING_ORIGIN,
      deadlineAtMs: now() + BOUND.DRAIN_DEADLINE_MS});
    if (answer.outcome !== OUTCOME.CUT_OVER) {
      report(partitionId, answer);
      const missingDirectReply =
        answer.missingFact === MISSING_FACT.REPLICA_RELEASE_REPLY;
      const missingControlReply =
        answer.missingFact === MISSING_FACT.CURRENT_CONTROL_OWNER &&
        answer.controlMissingFact === MISSING_FACT.REPLICA_RELEASE_REPLY;
      if (missingControlReply) {
        enqueue(INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS], 0);
      }
      if ((missingDirectReply || missingControlReply) &&
          isActiveHostedLeader(leader) &&
          (isPriorityPartition || !hasPendingLocalPriorityLeader(partitionId))) {
        const recovered = await handler.tryAutonomousPermanentMemberLossRecovery?.(
          leader,
          answer.inspectNodeId ?? null,
          missingDirectReply ? answer.inspectReplicaId ?? null : null,
        );
        if (recovered?.success === true) {
          enqueuePriorityHostedPartitions(0);
          enqueue(partitionId, 0);
          return;
        }
      }
      enqueue(partitionId, BOUND.RECOVERY_RETRY_MS);
      return;
    }
    if (!isActiveHostedLeader(leader)) return;
    if (participantCutoverPauseOf(leader) !== null) {
      enqueue(partitionId);
      return;
    }
    const hasUnpublishedRecovery = hasUnpublishedCompletedMembershipRecovery(
      handler,
      leader,
    );
    if (hasUnpublishedRecovery ||
        hasAnyCompletedLocalMembershipRecovery() ||
        hasAnyUnreachableOrDeadClusterNode(handler)) {
      leader.reassertDurableLeaderNodeId?.();
      leader.reassertDurableRaftRole?.();
      if (hasUnpublishedRecovery ||
          (leader.lastCompletedMembershipRecovery &&
            leader.lastCompletedMembershipRecoveryPersisted !== true)) {
        const recovered = await handler.tryAutonomousPermanentMemberLossRecovery?.(leader);
        if (recovered?.retry === true) {
          enqueue(partitionId, BOUND.RECOVERY_RETRY_MS);
        }
      }
      if (isPriorityPartition) {
        reassertAllLocalLeadersMetadata();
        enqueuePriorityHostedPartitions(0);
      }
    }
    report(partitionId, answer);
  }

  function dispatch() {
    timer = null;
    if (stopped || handler.shuttingDown) return;
    const currentNow = now();
    const readyEntries = [...pending.entries()]
      .filter(([, due]) => due <= currentNow)
      .sort(([leftId, leftDue], [rightId, rightDue]) => {
        const rankDiff = releasePartitionPriorityRank(leftId) -
          releasePartitionPriorityRank(rightId);
        return rankDiff !== 0 ? rankDiff : leftDue - rightDue;
      });
    for (const [partitionId] of readyEntries) {
      if (running.size >= MAX_CONCURRENT_ATTEMPTS) break;
      if (running.has(partitionId)) {
        pending.set(partitionId, currentNow + BOUND.RECOVERY_RETRY_MS);
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
        throw Object.assign(new Error(RELEASE_RECOVERY_ERROR.FRESH_DEADLINE),
          {code: FRESH_CREATE_RELEASE_UNAVAILABLE});
      }
      // The create identity is a lookup key: the answering leader decides the
      // release authority from the committed founding create operation.
      const createAdmissionIdentity = handler.participantReleaseAuthorizationOwner
        .freshCreateReleaseIdentity({partitionId,
          createAdmissionEvidence: options.createAdmissionEvidence,
          identityExisted: options.identityExisted});
      if (createAdmissionIdentity === null) {
        throw new Error(RELEASE_RECOVERY_ERROR.FRESH_AUTHORITY);
      }
      const {answer, completed, outcome, retryAfterMs} =
        await completeParticipantRelease(handler, {partitionId,
          targetBuildDigest: build.digest, trigger: TRIGGER.FRESH_CREATE,
          deadlineAtMs: deadline, createAdmissionIdentity}, {now, sleep});
      if (completed) return answer;
      const error = new Error(RELEASE_RECOVERY_ERROR.FRESH_FAILED +
        JSON.stringify({partitionId, answer}));
      error.participantReleaseAnswer = answer;
      if (outcome === OUTCOME.UNAVAILABLE || outcome === OUTCOME.NOT_LEADER ||
          (Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0)) {
        error.code = FRESH_CREATE_RELEASE_UNAVAILABLE;
      }
      throw error;
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
    wake(partitionId, delay) {
      enqueue(partitionId, delay ?? BOUND.RECOVERY_RETRY_MS);
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

export {FRESH_CREATE_RELEASE_UNAVAILABLE, createParticipantReleaseRecovery};
