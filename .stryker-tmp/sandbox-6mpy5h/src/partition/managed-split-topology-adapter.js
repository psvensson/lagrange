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
import { TABLES } from '../constants/index.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
class ManagedSplitTopologyAdapter {
  constructor(options = {}) {
    if (stryMutAct_9fa48("97814")) {
      {}
    } else {
      stryCov_9fa48("97814");
      this.sqlQueryEngine = stryMutAct_9fa48("97817") ? options.sqlQueryEngine && null : stryMutAct_9fa48("97816") ? false : stryMutAct_9fa48("97815") ? true : (stryCov_9fa48("97815", "97816", "97817"), options.sqlQueryEngine || null);
    }
  }
  getCDCIntegrationService() {
    if (stryMutAct_9fa48("97818")) {
      {}
    } else {
      stryCov_9fa48("97818");
      return stryMutAct_9fa48("97821") ? this.sqlQueryEngine?.cdcIntegrationService && null : stryMutAct_9fa48("97820") ? false : stryMutAct_9fa48("97819") ? true : (stryCov_9fa48("97819", "97820", "97821"), (stryMutAct_9fa48("97822") ? this.sqlQueryEngine.cdcIntegrationService : (stryCov_9fa48("97822"), this.sqlQueryEngine?.cdcIntegrationService)) || null);
    }
  }
  getPartitionInfo(partitionId) {
    if (stryMutAct_9fa48("97823")) {
      {}
    } else {
      stryCov_9fa48("97823");
      return stryMutAct_9fa48("97826") ? this.sqlQueryEngine?.getPartitionInfo(partitionId) && null : stryMutAct_9fa48("97825") ? false : stryMutAct_9fa48("97824") ? true : (stryCov_9fa48("97824", "97825", "97826"), (stryMutAct_9fa48("97827") ? this.sqlQueryEngine.getPartitionInfo(partitionId) : (stryCov_9fa48("97827"), this.sqlQueryEngine?.getPartitionInfo(partitionId))) || null);
    }
  }
  getTableInfo(tableNameOrId) {
    if (stryMutAct_9fa48("97828")) {
      {}
    } else {
      stryCov_9fa48("97828");
      return stryMutAct_9fa48("97831") ? this.sqlQueryEngine?.getTableInfo(tableNameOrId) && null : stryMutAct_9fa48("97830") ? false : stryMutAct_9fa48("97829") ? true : (stryCov_9fa48("97829", "97830", "97831"), (stryMutAct_9fa48("97832") ? this.sqlQueryEngine.getTableInfo(tableNameOrId) : (stryCov_9fa48("97832"), this.sqlQueryEngine?.getTableInfo(tableNameOrId))) || null);
    }
  }
  listTableInfos() {
    if (stryMutAct_9fa48("97833")) {
      {}
    } else {
      stryCov_9fa48("97833");
      return stryMutAct_9fa48("97836") ? this.sqlQueryEngine?.systemCache?.getAll(TABLES.TABLES) && [] : stryMutAct_9fa48("97835") ? false : stryMutAct_9fa48("97834") ? true : (stryCov_9fa48("97834", "97835", "97836"), (stryMutAct_9fa48("97838") ? this.sqlQueryEngine.systemCache?.getAll(TABLES.TABLES) : stryMutAct_9fa48("97837") ? this.sqlQueryEngine?.systemCache.getAll(TABLES.TABLES) : (stryCov_9fa48("97837", "97838"), this.sqlQueryEngine?.systemCache?.getAll(TABLES.TABLES))) || (stryMutAct_9fa48("97839") ? ["Stryker was here"] : (stryCov_9fa48("97839"), [])));
    }
  }
  parsePartitionTransition(tableInfo) {
    if (stryMutAct_9fa48("97840")) {
      {}
    } else {
      stryCov_9fa48("97840");
      return stryMutAct_9fa48("97843") ? this.sqlQueryEngine?.parsePartitionTransition(tableInfo) && null : stryMutAct_9fa48("97842") ? false : stryMutAct_9fa48("97841") ? true : (stryCov_9fa48("97841", "97842", "97843"), (stryMutAct_9fa48("97844") ? this.sqlQueryEngine.parsePartitionTransition(tableInfo) : (stryCov_9fa48("97844"), this.sqlQueryEngine?.parsePartitionTransition(tableInfo))) || null);
    }
  }
  isLocalManagedSplitLeader(partitionInfo) {
    if (stryMutAct_9fa48("97845")) {
      {}
    } else {
      stryCov_9fa48("97845");
      return stryMutAct_9fa48("97848") ? this.sqlQueryEngine?.isLocalManagedSplitLeader(partitionInfo) !== true : stryMutAct_9fa48("97847") ? false : stryMutAct_9fa48("97846") ? true : (stryCov_9fa48("97846", "97847", "97848"), (stryMutAct_9fa48("97849") ? this.sqlQueryEngine.isLocalManagedSplitLeader(partitionInfo) : (stryCov_9fa48("97849"), this.sqlQueryEngine?.isLocalManagedSplitLeader(partitionInfo))) === (stryMutAct_9fa48("97850") ? false : (stryCov_9fa48("97850"), true)));
    }
  }
  resolveActivePartitionVersion(tableInfo) {
    if (stryMutAct_9fa48("97851")) {
      {}
    } else {
      stryCov_9fa48("97851");
      return stryMutAct_9fa48("97854") ? this.sqlQueryEngine?.resolveActivePartitionVersion(tableInfo) && 1 : stryMutAct_9fa48("97853") ? false : stryMutAct_9fa48("97852") ? true : (stryCov_9fa48("97852", "97853", "97854"), (stryMutAct_9fa48("97855") ? this.sqlQueryEngine.resolveActivePartitionVersion(tableInfo) : (stryCov_9fa48("97855"), this.sqlQueryEngine?.resolveActivePartitionVersion(tableInfo))) || 1);
    }
  }
  buildManagedSplitPlan(...args) {
    if (stryMutAct_9fa48("97856")) {
      {}
    } else {
      stryCov_9fa48("97856");
      return stryMutAct_9fa48("97857") ? this.sqlQueryEngine.buildManagedSplitPlan(...args) : (stryCov_9fa48("97857"), this.sqlQueryEngine?.buildManagedSplitPlan(...args));
    }
  }
  resolveProvisionTargetNodeIds(replicaCount) {
    if (stryMutAct_9fa48("97858")) {
      {}
    } else {
      stryCov_9fa48("97858");
      return stryMutAct_9fa48("97861") ? this.sqlQueryEngine?.resolveProvisionTargetNodeIds(replicaCount) && [] : stryMutAct_9fa48("97860") ? false : stryMutAct_9fa48("97859") ? true : (stryCov_9fa48("97859", "97860", "97861"), (stryMutAct_9fa48("97862") ? this.sqlQueryEngine.resolveProvisionTargetNodeIds(replicaCount) : (stryCov_9fa48("97862"), this.sqlQueryEngine?.resolveProvisionTargetNodeIds(replicaCount))) || (stryMutAct_9fa48("97863") ? ["Stryker was here"] : (stryCov_9fa48("97863"), [])));
    }
  }
  getRoutablePartitionServiceNodeIds(partitionId) {
    if (stryMutAct_9fa48("97864")) {
      {}
    } else {
      stryCov_9fa48("97864");
      return stryMutAct_9fa48("97867") ? this.sqlQueryEngine?.getRoutablePartitionServiceNodeIds(partitionId, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE) && [] : stryMutAct_9fa48("97866") ? false : stryMutAct_9fa48("97865") ? true : (stryCov_9fa48("97865", "97866", "97867"), (stryMutAct_9fa48("97868") ? this.sqlQueryEngine.getRoutablePartitionServiceNodeIds(partitionId, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE) : (stryCov_9fa48("97868"), this.sqlQueryEngine?.getRoutablePartitionServiceNodeIds(partitionId, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE))) || (stryMutAct_9fa48("97869") ? ["Stryker was here"] : (stryCov_9fa48("97869"), [])));
    }
  }
  isCriticalSystemPartition(partitionId) {
    if (stryMutAct_9fa48("97870")) {
      {}
    } else {
      stryCov_9fa48("97870");
      return stryMutAct_9fa48("97873") ? typeof this.sqlQueryEngine?.rebalanceCoordinator?.isCriticalSystemPartition === 'function' || this.sqlQueryEngine.rebalanceCoordinator.isCriticalSystemPartition(partitionId) === true : stryMutAct_9fa48("97872") ? false : stryMutAct_9fa48("97871") ? true : (stryCov_9fa48("97871", "97872", "97873"), (stryMutAct_9fa48("97875") ? typeof this.sqlQueryEngine?.rebalanceCoordinator?.isCriticalSystemPartition !== 'function' : stryMutAct_9fa48("97874") ? true : (stryCov_9fa48("97874", "97875"), typeof (stryMutAct_9fa48("97877") ? this.sqlQueryEngine.rebalanceCoordinator?.isCriticalSystemPartition : stryMutAct_9fa48("97876") ? this.sqlQueryEngine?.rebalanceCoordinator.isCriticalSystemPartition : (stryCov_9fa48("97876", "97877"), this.sqlQueryEngine?.rebalanceCoordinator?.isCriticalSystemPartition)) === (stryMutAct_9fa48("97878") ? "" : (stryCov_9fa48("97878"), 'function')))) && (stryMutAct_9fa48("97880") ? this.sqlQueryEngine.rebalanceCoordinator.isCriticalSystemPartition(partitionId) !== true : stryMutAct_9fa48("97879") ? true : (stryCov_9fa48("97879", "97880"), this.sqlQueryEngine.rebalanceCoordinator.isCriticalSystemPartition(partitionId) === (stryMutAct_9fa48("97881") ? false : (stryCov_9fa48("97881"), true)))));
    }
  }
  captureTopologySnapshot(context) {
    if (stryMutAct_9fa48("97882")) {
      {}
    } else {
      stryCov_9fa48("97882");
      return stryMutAct_9fa48("97885") ? this.sqlQueryEngine?.captureManagedSplitTopologySnapshot(context) && null : stryMutAct_9fa48("97884") ? false : stryMutAct_9fa48("97883") ? true : (stryCov_9fa48("97883", "97884", "97885"), (stryMutAct_9fa48("97886") ? this.sqlQueryEngine.captureManagedSplitTopologySnapshot(context) : (stryCov_9fa48("97886"), this.sqlQueryEngine?.captureManagedSplitTopologySnapshot(context))) || null);
    }
  }
  calculateQuorumReplicaCount(replicaCount) {
    if (stryMutAct_9fa48("97887")) {
      {}
    } else {
      stryCov_9fa48("97887");
      return stryMutAct_9fa48("97888") ? this.sqlQueryEngine.calculateQuorumReplicaCount(replicaCount) : (stryCov_9fa48("97888"), this.sqlQueryEngine?.calculateQuorumReplicaCount(replicaCount));
    }
  }
  get storageAdmissionService() {
    if (stryMutAct_9fa48("97889")) {
      {}
    } else {
      stryCov_9fa48("97889");
      return stryMutAct_9fa48("97892") ? this.sqlQueryEngine?.rebalanceCoordinator?.storageAdmissionService && null : stryMutAct_9fa48("97891") ? false : stryMutAct_9fa48("97890") ? true : (stryCov_9fa48("97890", "97891", "97892"), (stryMutAct_9fa48("97894") ? this.sqlQueryEngine.rebalanceCoordinator?.storageAdmissionService : stryMutAct_9fa48("97893") ? this.sqlQueryEngine?.rebalanceCoordinator.storageAdmissionService : (stryCov_9fa48("97893", "97894"), this.sqlQueryEngine?.rebalanceCoordinator?.storageAdmissionService)) || null);
    }
  }
  get messageRouter() {
    if (stryMutAct_9fa48("97895")) {
      {}
    } else {
      stryCov_9fa48("97895");
      return stryMutAct_9fa48("97898") ? this.sqlQueryEngine?.messageRouter && null : stryMutAct_9fa48("97897") ? false : stryMutAct_9fa48("97896") ? true : (stryCov_9fa48("97896", "97897", "97898"), (stryMutAct_9fa48("97899") ? this.sqlQueryEngine.messageRouter : (stryCov_9fa48("97899"), this.sqlQueryEngine?.messageRouter)) || null);
    }
  }
  createExecutionTimeoutBudget() {
    if (stryMutAct_9fa48("97900")) {
      {}
    } else {
      stryCov_9fa48("97900");
      return stryMutAct_9fa48("97901") ? this.sqlQueryEngine.createControlPlaneTimeoutBudget(this.sqlQueryEngine?.tablePartitionProvisioningTimeoutMs) : (stryCov_9fa48("97901"), this.sqlQueryEngine?.createControlPlaneTimeoutBudget(stryMutAct_9fa48("97902") ? this.sqlQueryEngine.tablePartitionProvisioningTimeoutMs : (stryCov_9fa48("97902"), this.sqlQueryEngine?.tablePartitionProvisioningTimeoutMs)));
    }
  }
  estimateSplitAdmissionBytes(partitionInfo, tableInfo) {
    if (stryMutAct_9fa48("97903")) {
      {}
    } else {
      stryCov_9fa48("97903");
      return stryMutAct_9fa48("97904") ? this.sqlQueryEngine.estimateSplitAdmissionBytes(partitionInfo, tableInfo) : (stryCov_9fa48("97904"), this.sqlQueryEngine?.estimateSplitAdmissionBytes(partitionInfo, tableInfo));
    }
  }
  waitForTablePartitionMetadata(tableId, partitionId, timeoutBudget) {
    if (stryMutAct_9fa48("97905")) {
      {}
    } else {
      stryCov_9fa48("97905");
      return stryMutAct_9fa48("97906") ? this.sqlQueryEngine.waitForTablePartitionMetadata(tableId, partitionId, timeoutBudget) : (stryCov_9fa48("97906"), this.sqlQueryEngine?.waitForTablePartitionMetadata(tableId, partitionId, timeoutBudget));
    }
  }
  probeInitialTablePartitionProvisioning(context) {
    if (stryMutAct_9fa48("97907")) {
      {}
    } else {
      stryCov_9fa48("97907");
      return stryMutAct_9fa48("97908") ? this.sqlQueryEngine.probeInitialTablePartitionProvisioning(context) : (stryCov_9fa48("97908"), this.sqlQueryEngine?.probeInitialTablePartitionProvisioning(context));
    }
  }
  provisionInitialTablePartition(context) {
    if (stryMutAct_9fa48("97909")) {
      {}
    } else {
      stryCov_9fa48("97909");
      return stryMutAct_9fa48("97910") ? this.sqlQueryEngine.provisionInitialTablePartition(context) : (stryCov_9fa48("97910"), this.sqlQueryEngine?.provisionInitialTablePartition(context));
    }
  }
  startSplitReplicationOnSourcePartition(partitionId, tableId, tableName, transitionMetadata) {
    if (stryMutAct_9fa48("97911")) {
      {}
    } else {
      stryCov_9fa48("97911");
      return stryMutAct_9fa48("97912") ? this.sqlQueryEngine.startSplitReplicationOnSourcePartition(partitionId, tableId, tableName, transitionMetadata) : (stryCov_9fa48("97912"), this.sqlQueryEngine?.startSplitReplicationOnSourcePartition(partitionId, tableId, tableName, transitionMetadata));
    }
  }
  get logger() {
    if (stryMutAct_9fa48("97913")) {
      {}
    } else {
      stryCov_9fa48("97913");
      return stryMutAct_9fa48("97916") ? this.sqlQueryEngine?.logger && console : stryMutAct_9fa48("97915") ? false : stryMutAct_9fa48("97914") ? true : (stryCov_9fa48("97914", "97915", "97916"), (stryMutAct_9fa48("97917") ? this.sqlQueryEngine.logger : (stryCov_9fa48("97917"), this.sqlQueryEngine?.logger)) || console);
    }
  }
  get transactionCoordinator() {
    if (stryMutAct_9fa48("97918")) {
      {}
    } else {
      stryCov_9fa48("97918");
      return stryMutAct_9fa48("97921") ? this.sqlQueryEngine?.transactionCoordinator && null : stryMutAct_9fa48("97920") ? false : stryMutAct_9fa48("97919") ? true : (stryCov_9fa48("97919", "97920", "97921"), (stryMutAct_9fa48("97922") ? this.sqlQueryEngine.transactionCoordinator : (stryCov_9fa48("97922"), this.sqlQueryEngine?.transactionCoordinator)) || null);
    }
  }
}
export { ManagedSplitTopologyAdapter };