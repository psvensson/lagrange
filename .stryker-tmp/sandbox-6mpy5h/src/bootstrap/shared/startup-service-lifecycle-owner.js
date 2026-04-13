// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { assertCritical } from '../../utils/assert.js';
import { MessageGroupServiceAdapter, PartitionServiceAdapter, RuntimeServiceAdapter, ServiceLifecycleManager, ServiceReconciler } from '../../service/index.js';
const STARTUP_RECONCILER_REQUIRED = stryMutAct_9fa48("30916") ? "" : (stryCov_9fa48("30916"), 'Startup reconciler must be initialized before reconciliation');
class StartupServiceLifecycleOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("30917")) {
      {}
    } else {
      stryCov_9fa48("30917");
      this.delegates = stryMutAct_9fa48("30920") ? options.delegates && {} : stryMutAct_9fa48("30919") ? false : stryMutAct_9fa48("30918") ? true : (stryCov_9fa48("30918", "30919", "30920"), options.delegates || {});
      this.reconcilerRequiredError = stryMutAct_9fa48("30923") ? options.reconcilerRequiredError && STARTUP_RECONCILER_REQUIRED : stryMutAct_9fa48("30922") ? false : stryMutAct_9fa48("30921") ? true : (stryCov_9fa48("30921", "30922", "30923"), options.reconcilerRequiredError || STARTUP_RECONCILER_REQUIRED);
    }
  }
  async ensureOwners() {
    if (stryMutAct_9fa48("30924")) {
      {}
    } else {
      stryCov_9fa48("30924");
      const delegates = this.delegates;
      if (stryMutAct_9fa48("30927") ? delegates.getServiceLifecycleManager?.() || delegates.getServiceReconciler?.() : stryMutAct_9fa48("30926") ? false : stryMutAct_9fa48("30925") ? true : (stryCov_9fa48("30925", "30926", "30927"), (stryMutAct_9fa48("30928") ? delegates.getServiceLifecycleManager() : (stryCov_9fa48("30928"), delegates.getServiceLifecycleManager?.())) && (stryMutAct_9fa48("30929") ? delegates.getServiceReconciler() : (stryCov_9fa48("30929"), delegates.getServiceReconciler?.())))) {
        if (stryMutAct_9fa48("30930")) {
          {}
        } else {
          stryCov_9fa48("30930");
          return;
        }
      }
      const serviceLifecycleManager = new ServiceLifecycleManager();
      serviceLifecycleManager.registerAdapter(new MessageGroupServiceAdapter(stryMutAct_9fa48("30931") ? {} : (stryCov_9fa48("30931"), {
        createReplica: stryMutAct_9fa48("30932") ? () => undefined : (stryCov_9fa48("30932"), context => delegates.createMessageGroupReplica(context)),
        startReplica: stryMutAct_9fa48("30933") ? () => undefined : (stryCov_9fa48("30933"), (replicaHandle, context) => delegates.startMessageGroupReplica(replicaHandle, context)),
        stopReplica: stryMutAct_9fa48("30934") ? () => undefined : (stryCov_9fa48("30934"), (replicaHandle, context) => delegates.stopMessageGroupReplica(replicaHandle, context))
      })));
      serviceLifecycleManager.registerAdapter(new PartitionServiceAdapter(stryMutAct_9fa48("30935") ? {} : (stryCov_9fa48("30935"), {
        createReplica: stryMutAct_9fa48("30936") ? () => undefined : (stryCov_9fa48("30936"), context => delegates.createPartitionReplica(context)),
        startReplica: stryMutAct_9fa48("30937") ? () => undefined : (stryCov_9fa48("30937"), (replicaHandle, context) => delegates.startPartitionReplica(replicaHandle, context)),
        stopReplica: stryMutAct_9fa48("30938") ? () => undefined : (stryCov_9fa48("30938"), (replicaHandle, context) => delegates.stopPartitionReplica(replicaHandle, context))
      })));
      serviceLifecycleManager.registerAdapter(new RuntimeServiceAdapter(stryMutAct_9fa48("30939") ? {} : (stryCov_9fa48("30939"), {
        serviceRuntimeLifecycle: stryMutAct_9fa48("30940") ? delegates.getServiceRuntimeLifecycle() : (stryCov_9fa48("30940"), delegates.getServiceRuntimeLifecycle?.())
      })));
      stryMutAct_9fa48("30941") ? delegates.setServiceLifecycleManager(serviceLifecycleManager) : (stryCov_9fa48("30941"), delegates.setServiceLifecycleManager?.(serviceLifecycleManager));
      const serviceReconciler = new ServiceReconciler(stryMutAct_9fa48("30942") ? {} : (stryCov_9fa48("30942"), {
        lifecycleManager: serviceLifecycleManager,
        desiredStateReader: stryMutAct_9fa48("30943") ? () => undefined : (stryCov_9fa48("30943"), async () => delegates.readDesiredState()),
        actualStateReader: stryMutAct_9fa48("30944") ? () => undefined : (stryCov_9fa48("30944"), async () => delegates.readActualState()),
        checkIntervalMs: stryMutAct_9fa48("30945") ? delegates.getCheckIntervalMs() : (stryCov_9fa48("30945"), delegates.getCheckIntervalMs?.()),
        maxConcurrentServiceActions: stryMutAct_9fa48("30946") ? delegates.getMaxConcurrentServiceActions() : (stryCov_9fa48("30946"), delegates.getMaxConcurrentServiceActions?.())
      }));
      await serviceReconciler.start();
      stryMutAct_9fa48("30947") ? delegates.setServiceReconciler(serviceReconciler) : (stryCov_9fa48("30947"), delegates.setServiceReconciler?.(serviceReconciler));
    }
  }
  async triggerReconciler(reason, context = {}) {
    if (stryMutAct_9fa48("30948")) {
      {}
    } else {
      stryCov_9fa48("30948");
      const serviceReconciler = assertCritical(stryMutAct_9fa48("30949") ? this.delegates.getServiceReconciler() : (stryCov_9fa48("30949"), this.delegates.getServiceReconciler?.()), this.reconcilerRequiredError);
      await serviceReconciler.trigger(reason, stryMutAct_9fa48("30950") ? {} : (stryCov_9fa48("30950"), {
        nodeId: stryMutAct_9fa48("30953") ? this.delegates.getNodeId?.() && null : stryMutAct_9fa48("30952") ? false : stryMutAct_9fa48("30951") ? true : (stryCov_9fa48("30951", "30952", "30953"), (stryMutAct_9fa48("30954") ? this.delegates.getNodeId() : (stryCov_9fa48("30954"), this.delegates.getNodeId?.())) || null),
        phase: stryMutAct_9fa48("30957") ? this.delegates.getPhase?.() && null : stryMutAct_9fa48("30956") ? false : stryMutAct_9fa48("30955") ? true : (stryCov_9fa48("30955", "30956", "30957"), (stryMutAct_9fa48("30958") ? this.delegates.getPhase() : (stryCov_9fa48("30958"), this.delegates.getPhase?.())) || null),
        ...context
      }));
    }
  }
  stopOwners() {
    if (stryMutAct_9fa48("30959")) {
      {}
    } else {
      stryCov_9fa48("30959");
      const delegates = this.delegates;
      const serviceReconciler = stryMutAct_9fa48("30960") ? delegates.getServiceReconciler() : (stryCov_9fa48("30960"), delegates.getServiceReconciler?.());
      if (stryMutAct_9fa48("30962") ? false : stryMutAct_9fa48("30961") ? true : (stryCov_9fa48("30961", "30962"), serviceReconciler)) {
        if (stryMutAct_9fa48("30963")) {
          {}
        } else {
          stryCov_9fa48("30963");
          serviceReconciler.stop();
          stryMutAct_9fa48("30964") ? delegates.setServiceReconciler(null) : (stryCov_9fa48("30964"), delegates.setServiceReconciler?.(null));
        }
      }
      stryMutAct_9fa48("30965") ? delegates.setServiceLifecycleManager(null) : (stryCov_9fa48("30965"), delegates.setServiceLifecycleManager?.(null));
      stryMutAct_9fa48("30966") ? delegates.clearDesiredState() : (stryCov_9fa48("30966"), delegates.clearDesiredState?.());
    }
  }
}
export { STARTUP_RECONCILER_REQUIRED, StartupServiceLifecycleOwner };