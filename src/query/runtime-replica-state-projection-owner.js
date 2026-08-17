import {EventEmitter} from 'node:events';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {OwnerKeyReconcileQueue} from
  '../workflow/owner-key-reconcile-queue.js';
import {projectRuntimeReplicaServicesRow} from
  './runtime-replica-state-projection.js';

const RUNTIME_REPLICA_STATE_PROJECTION_EVENT = Object.freeze({
  ACCEPTED: 'runtime_replica_state_projection_accepted',
  APPLIED: 'runtime_replica_state_projection_applied',
  RETRYING: 'runtime_replica_state_projection_retrying',
  FAILED: 'runtime_replica_state_projection_failed',
  SHUTDOWN: 'runtime_replica_state_projection_shutdown',
});

const RUNTIME_REPLICA_STATE_PROJECTION_STATE = Object.freeze({
  RETAINED: 'retained',
  STOPPED: 'stopped',
});

const PROJECTION_OWNER_NAME = 'runtime-replica-state-projection-owner';
const PROJECTION_RECONCILE_REASON = 'runtime_replica_state_projection';
const PROJECTION_FAILURE_REASON = 'runtime_replica_state_projection_failed';
const PROJECTION_OWNER_REQUIRED_ERROR =
  'RuntimeReplicaStateProjectionOwner requires ServicesOwner';
const PROJECTION_MAX_CONCURRENCY = 4;
const LOCAL_STR_FUNCTION = 'function';

function cloneProjectionContext(serviceId, stateRow, context = {}) {
  return Object.freeze({
    serviceId,
    stateRow: Object.freeze({...stateRow}),
    causeId:
      typeof context?.causeId === 'string' ? context.causeId : null,
  });
}

function buildProjectionFailureEvent(serviceId, context, error) {
  const retryable = isRetryableControlPlaneError(error);
  return {
    eventName: retryable ?
      RUNTIME_REPLICA_STATE_PROJECTION_EVENT.RETRYING :
      RUNTIME_REPLICA_STATE_PROJECTION_EVENT.FAILED,
    payload: {
      serviceId,
      status: context?.stateRow?.status || null,
      causeId: context?.causeId || null,
      retryable,
      retryAfterMs: retryable ?
        getControlPlaneRetryAfterMs(error) :
        null,
      error,
    },
  };
}

class RuntimeReplicaStateProjectionOwner extends EventEmitter {
  constructor(options = {}) {
    super();
    if (!options.servicesOwner) {
      throw new Error(PROJECTION_OWNER_REQUIRED_ERROR);
    }
    this.hostNodeId = options.hostNodeId || null;
    this.servicesOwner = options.servicesOwner;
    this.stopped = false;
    this.reconcileQueue =
      options.reconcileQueue ||
      new OwnerKeyReconcileQueue({
        name: PROJECTION_OWNER_NAME,
        maxConcurrency: PROJECTION_MAX_CONCURRENCY,
        reconcileFn: (serviceId, _reasons, context) =>
          this.reconcile(serviceId, context),
        retryPolicy: {
          isRetryableError: isRetryableControlPlaneError,
          getRetryAfterMs: getControlPlaneRetryAfterMs,
          getFailureReason: (error) =>
            getControlPlaneErrorCode(error) || PROJECTION_FAILURE_REASON,
          // A pending projection carrying a different replica status is a
          // newer lifecycle submission: the older failed projection is
          // superseded and must not retry over it (a retained CREATED
          // retry can never overwrite a later ACTIVE).
          shouldResetAttempts: (retryContext, pendingContext) =>
            retryContext?.stateRow?.status !== undefined &&
            pendingContext?.stateRow?.status !== undefined &&
            retryContext.stateRow.status !== pendingContext.stateRow.status,
        },
      });
  }

  submit(serviceId, stateRow, context = {}) {
    const projectionContext = cloneProjectionContext(
      serviceId,
      stateRow,
      context,
    );
    if (this.stopped) {
      return Object.freeze({
        retained: false,
        state: RUNTIME_REPLICA_STATE_PROJECTION_STATE.STOPPED,
        serviceId,
        status: stateRow?.status || null,
      });
    }
    this.reconcileQueue.enqueue(
      serviceId,
      PROJECTION_RECONCILE_REASON,
      projectionContext,
    );
    const accepted = Object.freeze({
      retained: true,
      state: RUNTIME_REPLICA_STATE_PROJECTION_STATE.RETAINED,
      serviceId,
      status: stateRow?.status || null,
      causeId: projectionContext.causeId,
    });
    this.emit(
      RUNTIME_REPLICA_STATE_PROJECTION_EVENT.ACCEPTED,
      accepted,
    );
    return accepted;
  }

  async reconcile(serviceId, context = {}) {
    const stateRow = context?.stateRow || {};
    try {
      await projectRuntimeReplicaServicesRow(
        this.servicesOwner,
        this.hostNodeId,
        serviceId,
        stateRow,
      );
      if (this.stopped) {
        return;
      }
      this.emit(RUNTIME_REPLICA_STATE_PROJECTION_EVENT.APPLIED, {
        serviceId,
        status: stateRow.status || null,
        causeId: context?.causeId || null,
      });
    } catch (error) {
      const failureEvent = buildProjectionFailureEvent(
        serviceId,
        context,
        error,
      );
      if (!this.stopped) {
        this.emit(failureEvent.eventName, failureEvent.payload);
      }
      throw error;
    }
  }

  getDiagnostics() {
    return {
      owner: PROJECTION_OWNER_NAME,
      ...this.reconcileQueue.getDiagnostics(),
    };
  }

  shutdown() {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    if (
      this.reconcileQueue &&
      typeof this.reconcileQueue.shutdown === LOCAL_STR_FUNCTION
    ) {
      this.reconcileQueue.shutdown();
    }
    this.emit(RUNTIME_REPLICA_STATE_PROJECTION_EVENT.SHUTDOWN, {
      owner: PROJECTION_OWNER_NAME,
    });
  }
}

export {
  RUNTIME_REPLICA_STATE_PROJECTION_EVENT,
  RuntimeReplicaStateProjectionOwner,
};
