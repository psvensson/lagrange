import {assertCritical} from '../../utils/assert.js';
import {
  MessageGroupServiceAdapter,
  PartitionServiceAdapter,
  RuntimeServiceAdapter,
  ServiceLifecycleManager,
  ServiceReconciler,
} from '../../service/index.js';

const STARTUP_RECONCILER_REQUIRED =
  'Startup reconciler must be initialized before reconciliation';

class StartupServiceLifecycleOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.reconcilerRequiredError =
      options.reconcilerRequiredError || STARTUP_RECONCILER_REQUIRED;
  }

  async ensureOwners() {
    const delegates = this.delegates;
    if (delegates.getServiceLifecycleManager?.() &&
        delegates.getServiceReconciler?.()) {
      return;
    }

    const serviceLifecycleManager = new ServiceLifecycleManager({
      // The lifecycle owner acts on behalf of one node, so it reads that
      // node's clock.
      timeSource: delegates.getTimeSource?.(),
    });
    serviceLifecycleManager.registerAdapter(
      new MessageGroupServiceAdapter({
        createReplica: (context) =>
          delegates.createMessageGroupReplica(context),
        startReplica: (replicaHandle, context) =>
          delegates.startMessageGroupReplica(replicaHandle, context),
        stopReplica: (replicaHandle, context) =>
          delegates.stopMessageGroupReplica(replicaHandle, context),
      }),
    );
    serviceLifecycleManager.registerAdapter(
      new PartitionServiceAdapter({
        createReplica: (context) =>
          delegates.createPartitionReplica(context),
        startReplica: (replicaHandle, context) =>
          delegates.startPartitionReplica(replicaHandle, context),
        stopReplica: (replicaHandle, context) =>
          delegates.stopPartitionReplica(replicaHandle, context),
      }),
    );
    serviceLifecycleManager.registerAdapter(
      new RuntimeServiceAdapter({
        serviceRuntimeLifecycle: delegates.getServiceRuntimeLifecycle?.(),
      }),
    );
    delegates.setServiceLifecycleManager?.(serviceLifecycleManager);

    const serviceReconciler = new ServiceReconciler({
      lifecycleManager: serviceLifecycleManager,
      desiredStateReader: async () => delegates.readDesiredState(),
      actualStateReader: async () => delegates.readActualState(),
      checkIntervalMs: delegates.getCheckIntervalMs?.(),
      maxConcurrentServiceActions:
        delegates.getMaxConcurrentServiceActions?.(),
      // The reconciler's cadence belongs to the node it reconciles for.
      timeSource: delegates.getTimeSource?.(),
    });
    await serviceReconciler.start();
    delegates.setServiceReconciler?.(serviceReconciler);
  }

  async triggerReconciler(reason, context = {}) {
    const serviceReconciler = assertCritical(
      this.delegates.getServiceReconciler?.(),
      this.reconcilerRequiredError,
    );
    await serviceReconciler.trigger(reason, {
      nodeId: this.delegates.getNodeId?.() || null,
      phase: this.delegates.getPhase?.() || null,
      ...context,
    });
  }

  stopOwners() {
    const delegates = this.delegates;
    const serviceReconciler = delegates.getServiceReconciler?.();
    if (serviceReconciler) {
      serviceReconciler.stop();
      delegates.setServiceReconciler?.(null);
    }
    delegates.setServiceLifecycleManager?.(null);
    delegates.clearDesiredState?.();
  }
}

export {STARTUP_RECONCILER_REQUIRED, StartupServiceLifecycleOwner};
