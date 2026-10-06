import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
} from './replica-create-admission-owner.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';

function deferredProgressError(operationId) {
  const error = new Error(`CREATE admission progress deferred ${operationId}`);
  error.code = CREATE_ADMISSION_ERROR_CODE.DEFERRED;
  error.errorCode = CREATE_ADMISSION_ERROR_CODE.DEFERRED;
  error.deferRetry = true;
  return error;
}

async function recoverRetainedCreateAdmissionRow(
  handler,
  owner,
  row,
  {buildRequest, reconcileLifecycle},
) {
  await owner.runExclusive(row.operation_id, async () => {
    handler.throwIfShuttingDown();
    const evidence = await owner.takeoverRetained(row);
    if (!evidence) return;
    const reconciled = await reconcileLifecycle(handler, evidence);
    const lifecycleStatus = reconciled.row?.status || null;
    if (lifecycleStatus === ReplicaStatus.ACTIVE ||
        lifecycleStatus === ReplicaStatus.FAILED) {
      const settledState = lifecycleStatus === ReplicaStatus.ACTIVE ?
        CREATE_ADMISSION_STATE.ACTIVE :
        CREATE_ADMISSION_STATE.FAILED;
      if (reconciled.evidence.admissionState !== settledState &&
          !await owner.markProgress(reconciled.evidence, settledState)) {
        throw deferredProgressError(row.operation_id);
      }
      return;
    }
    await handler.handleCreateReplica(buildRequest(row, reconciled.evidence));
  });
}

export {recoverRetainedCreateAdmissionRow};
