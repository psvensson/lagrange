import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  PARTITION_SERVICE_ERROR_MSG,
  WRITE_PHASE_FIELD_APPLY_WRITE_MS,
  WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
} = PARTITION_SERVICE_SHARED;

async function executePartitionRaftWriteCommit(service, options) {
  const {
    entry,
    entryKey,
    logEntry,
    phaseTimings,
    applyStartMs,
    durableCommitWitness,
  } = options;
  let commitPromise;
  try {
    commitPromise = service.waitForCommittedWrite(entry.entryId, {
      logIndex: logEntry.index,
      result: {durableCommitWitness},
    });
  } catch (error) {
    service.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );
    return buildPartitionWriteFailureResult(error, service.partitionId);
  }
  commitPromise.catch(() => {});
  const raftCommandDispatchStartMs = Date.now();
  try {
    await service.raftProvider.propose(service.raft, entry);
  } catch (error) {
    service.rejectCommittedWrite(entry.entryId, error);
    service.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, {
      partitionId: service.partitionId,
      error: error.message,
    });
  }
  service.recordWritePhaseDuration(
    phaseTimings,
    WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
    raftCommandDispatchStartMs,
  );
  try {
    const result = await commitPromise;
    const acknowledgedResult = {
      ...result,
      acceptingNodeId: service.nodeId,
      acknowledgedAtMs: Date.now(),
    };
    const sideEffectPlan = buildPartitionWriteSideEffectPlan(
      entry,
      acknowledgedResult,
    );
    await service.applyWriteSideEffectPlan({
      entry,
      entryKey,
      result: acknowledgedResult,
      sideEffectPlan: {
        ...sideEffectPlan,
        emitCdcEntry: null,
      },
      commitPromise: null,
    });
    service.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );
    return acknowledgedResult;
  } catch (error) {
    service.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );
    return {
      success: false,
      error: error.message,
      partitionId: service.partitionId,
      logIndex: logEntry.index,
    };
  }
}

function startPartitionRaftWriteCommit(service, options) {
  const {
    promise: outcomePromise,
    resolve: resolveOutcome,
    reject: rejectOutcome,
  } = Promise.withResolvers();
  service.setPendingCommittedWriteOutcome(
    options.entry.entryId,
    outcomePromise,
  );
  executePartitionRaftWriteCommit(service, options).then(
    resolveOutcome,
    rejectOutcome,
  );
  return outcomePromise;
}

export {startPartitionRaftWriteCommit};
