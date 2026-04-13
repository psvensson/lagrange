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
import { BOOTSTRAP_LOG_MSG, BOOTSTRAP_NODE_READY_REBALANCE_TABLES, BOOTSTRAP_REBALANCE_REASON } from '../bootstrap-constants.js';
import { compareNodeHeartbeatWatermarks, isNodeHeartbeatWatermarkRegression, isNodeRecordReady } from '../../node/node-readiness-policy.js';
import { NUM } from '../../constants/index.js';
const NODE_READY_REBALANCE_TABLE_SET = new Set(BOOTSTRAP_NODE_READY_REBALANCE_TABLES);
class BootstrapNodeReadyRebalanceOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("19318")) {
      {}
    } else {
      stryCov_9fa48("19318");
      this.delegates = stryMutAct_9fa48("19321") ? options.delegates && {} : stryMutAct_9fa48("19320") ? false : stryMutAct_9fa48("19319") ? true : (stryCov_9fa48("19319", "19320", "19321"), options.delegates || {});
      this.rebalanceTriggeredNodeIds = new Set();
      this.pendingNodeReadyRebalanceTimers = new Map();
      this.latestObservedNodeRows = new Map();
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("19322")) {
      {}
    } else {
      stryCov_9fa48("19322");
      return stryMutAct_9fa48("19325") ? this.delegates.getLogger?.() && console : stryMutAct_9fa48("19324") ? false : stryMutAct_9fa48("19323") ? true : (stryCov_9fa48("19323", "19324", "19325"), (stryMutAct_9fa48("19326") ? this.delegates.getLogger() : (stryCov_9fa48("19326"), this.delegates.getLogger?.())) || console);
    }
  }
  getNodeReadyRebalanceDelayMs() {
    if (stryMutAct_9fa48("19327")) {
      {}
    } else {
      stryCov_9fa48("19327");
      return stryMutAct_9fa48("19330") ? this.delegates.getNodeReadyRebalanceDelayMs?.() && NUM.ZERO : stryMutAct_9fa48("19329") ? false : stryMutAct_9fa48("19328") ? true : (stryCov_9fa48("19328", "19329", "19330"), (stryMutAct_9fa48("19331") ? this.delegates.getNodeReadyRebalanceDelayMs() : (stryCov_9fa48("19331"), this.delegates.getNodeReadyRebalanceDelayMs?.())) || NUM.ZERO);
    }
  }
  getPartitionServices() {
    if (stryMutAct_9fa48("19332")) {
      {}
    } else {
      stryCov_9fa48("19332");
      return stryMutAct_9fa48("19335") ? this.delegates.getPartitionServices?.() && new Map() : stryMutAct_9fa48("19334") ? false : stryMutAct_9fa48("19333") ? true : (stryCov_9fa48("19333", "19334", "19335"), (stryMutAct_9fa48("19336") ? this.delegates.getPartitionServices() : (stryCov_9fa48("19336"), this.delegates.getPartitionServices?.())) || new Map());
    }
  }
  getLocalNodeId() {
    if (stryMutAct_9fa48("19337")) {
      {}
    } else {
      stryCov_9fa48("19337");
      return stryMutAct_9fa48("19340") ? this.delegates.getLocalNodeId?.() && null : stryMutAct_9fa48("19339") ? false : stryMutAct_9fa48("19338") ? true : (stryCov_9fa48("19338", "19339", "19340"), (stryMutAct_9fa48("19341") ? this.delegates.getLocalNodeId() : (stryCov_9fa48("19341"), this.delegates.getLocalNodeId?.())) || null);
    }
  }
  isBootstrapNodeReadyRebalanceActive() {
    if (stryMutAct_9fa48("19342")) {
      {}
    } else {
      stryCov_9fa48("19342");
      return stryMutAct_9fa48("19345") ? this.delegates.isBootstrapNodeReadyRebalanceActive?.() === false : stryMutAct_9fa48("19344") ? false : stryMutAct_9fa48("19343") ? true : (stryCov_9fa48("19343", "19344", "19345"), (stryMutAct_9fa48("19346") ? this.delegates.isBootstrapNodeReadyRebalanceActive() : (stryCov_9fa48("19346"), this.delegates.isBootstrapNodeReadyRebalanceActive?.())) !== (stryMutAct_9fa48("19347") ? true : (stryCov_9fa48("19347"), false)));
    }
  }
  executeNodeReadyRebalance(reason) {
    if (stryMutAct_9fa48("19348")) {
      {}
    } else {
      stryCov_9fa48("19348");
      if (stryMutAct_9fa48("19351") ? typeof this.delegates.executeNodeReadyRebalance !== 'function' : stryMutAct_9fa48("19350") ? false : stryMutAct_9fa48("19349") ? true : (stryCov_9fa48("19349", "19350", "19351"), typeof this.delegates.executeNodeReadyRebalance === (stryMutAct_9fa48("19352") ? "" : (stryCov_9fa48("19352"), 'function')))) {
        if (stryMutAct_9fa48("19353")) {
          {}
        } else {
          stryCov_9fa48("19353");
          this.delegates.executeNodeReadyRebalance(reason);
          return;
        }
      }
      this.triggerRebalancingOnAllPartitions(reason);
    }
  }
  triggerRebalancingOnAllPartitions(reason) {
    if (stryMutAct_9fa48("19354")) {
      {}
    } else {
      stryCov_9fa48("19354");
      const logger = this.getLogger();
      const partitionServices = this.getPartitionServices();
      const nodeReadyScoped = stryMutAct_9fa48("19357") ? reason !== BOOTSTRAP_REBALANCE_REASON.NODE_READY : stryMutAct_9fa48("19356") ? false : stryMutAct_9fa48("19355") ? true : (stryCov_9fa48("19355", "19356", "19357"), reason === BOOTSTRAP_REBALANCE_REASON.NODE_READY);
      let leaderPartitionCount = NUM.ZERO;
      let triggeredPartitionCount = NUM.ZERO;
      for (const partition of partitionServices.values()) {
        if (stryMutAct_9fa48("19358")) {
          {}
        } else {
          stryCov_9fa48("19358");
          if (stryMutAct_9fa48("19361") ? false : stryMutAct_9fa48("19360") ? true : stryMutAct_9fa48("19359") ? partition?.isLeader : (stryCov_9fa48("19359", "19360", "19361"), !(stryMutAct_9fa48("19362") ? partition.isLeader : (stryCov_9fa48("19362"), partition?.isLeader)))) {
            if (stryMutAct_9fa48("19363")) {
              {}
            } else {
              stryCov_9fa48("19363");
              continue;
            }
          }
          stryMutAct_9fa48("19364") ? leaderPartitionCount-- : (stryCov_9fa48("19364"), leaderPartitionCount++);
          if (stryMutAct_9fa48("19367") ? nodeReadyScoped || !this.shouldTriggerNodeReadyRebalanceForPartition(partition) : stryMutAct_9fa48("19366") ? false : stryMutAct_9fa48("19365") ? true : (stryCov_9fa48("19365", "19366", "19367"), nodeReadyScoped && (stryMutAct_9fa48("19368") ? this.shouldTriggerNodeReadyRebalanceForPartition(partition) : (stryCov_9fa48("19368"), !this.shouldTriggerNodeReadyRebalanceForPartition(partition))))) {
            if (stryMutAct_9fa48("19369")) {
              {}
            } else {
              stryCov_9fa48("19369");
              continue;
            }
          }
          stryMutAct_9fa48("19370") ? triggeredPartitionCount-- : (stryCov_9fa48("19370"), triggeredPartitionCount++);
          partition.triggerRebalanceCheck(reason);
        }
      }
      logger.info(BOOTSTRAP_LOG_MSG.REBALANCE_TRIGGER, stryMutAct_9fa48("19371") ? {} : (stryCov_9fa48("19371"), {
        reason,
        partitionCount: partitionServices.size,
        leaderPartitionCount,
        triggeredPartitionCount,
        scope: nodeReadyScoped ? stryMutAct_9fa48("19372") ? "" : (stryCov_9fa48("19372"), 'bootstrap_convergence_critical') : stryMutAct_9fa48("19373") ? "" : (stryCov_9fa48("19373"), 'all_leader_partitions')
      }));
    }
  }
  shouldTriggerNodeReadyRebalanceForPartition(partition) {
    if (stryMutAct_9fa48("19374")) {
      {}
    } else {
      stryCov_9fa48("19374");
      const tableName = stryMutAct_9fa48("19377") ? (partition?.tableName || partition?.table_id || partition?.tableId) && null : stryMutAct_9fa48("19376") ? false : stryMutAct_9fa48("19375") ? true : (stryCov_9fa48("19375", "19376", "19377"), (stryMutAct_9fa48("19379") ? (partition?.tableName || partition?.table_id) && partition?.tableId : stryMutAct_9fa48("19378") ? false : (stryCov_9fa48("19378", "19379"), (stryMutAct_9fa48("19381") ? partition?.tableName && partition?.table_id : stryMutAct_9fa48("19380") ? false : (stryCov_9fa48("19380", "19381"), (stryMutAct_9fa48("19382") ? partition.tableName : (stryCov_9fa48("19382"), partition?.tableName)) || (stryMutAct_9fa48("19383") ? partition.table_id : (stryCov_9fa48("19383"), partition?.table_id)))) || (stryMutAct_9fa48("19384") ? partition.tableId : (stryCov_9fa48("19384"), partition?.tableId)))) || null);
      if (stryMutAct_9fa48("19387") ? typeof tableName === 'string' || NODE_READY_REBALANCE_TABLE_SET.has(tableName) : stryMutAct_9fa48("19386") ? false : stryMutAct_9fa48("19385") ? true : (stryCov_9fa48("19385", "19386", "19387"), (stryMutAct_9fa48("19389") ? typeof tableName !== 'string' : stryMutAct_9fa48("19388") ? true : (stryCov_9fa48("19388", "19389"), typeof tableName === (stryMutAct_9fa48("19390") ? "" : (stryCov_9fa48("19390"), 'string')))) && NODE_READY_REBALANCE_TABLE_SET.has(tableName))) {
        if (stryMutAct_9fa48("19391")) {
          {}
        } else {
          stryCov_9fa48("19391");
          return stryMutAct_9fa48("19392") ? false : (stryCov_9fa48("19392"), true);
        }
      }
      const partitionId = stryMutAct_9fa48("19395") ? (partition?.partitionId || partition?.partition_id || partition?.serviceId || partition?.service_id) && null : stryMutAct_9fa48("19394") ? false : stryMutAct_9fa48("19393") ? true : (stryCov_9fa48("19393", "19394", "19395"), (stryMutAct_9fa48("19397") ? (partition?.partitionId || partition?.partition_id || partition?.serviceId) && partition?.service_id : stryMutAct_9fa48("19396") ? false : (stryCov_9fa48("19396", "19397"), (stryMutAct_9fa48("19399") ? (partition?.partitionId || partition?.partition_id) && partition?.serviceId : stryMutAct_9fa48("19398") ? false : (stryCov_9fa48("19398", "19399"), (stryMutAct_9fa48("19401") ? partition?.partitionId && partition?.partition_id : stryMutAct_9fa48("19400") ? false : (stryCov_9fa48("19400", "19401"), (stryMutAct_9fa48("19402") ? partition.partitionId : (stryCov_9fa48("19402"), partition?.partitionId)) || (stryMutAct_9fa48("19403") ? partition.partition_id : (stryCov_9fa48("19403"), partition?.partition_id)))) || (stryMutAct_9fa48("19404") ? partition.serviceId : (stryCov_9fa48("19404"), partition?.serviceId)))) || (stryMutAct_9fa48("19405") ? partition.service_id : (stryCov_9fa48("19405"), partition?.service_id)))) || null);
      if (stryMutAct_9fa48("19408") ? typeof partitionId !== 'string' && partitionId.length === NUM.ZERO : stryMutAct_9fa48("19407") ? false : stryMutAct_9fa48("19406") ? true : (stryCov_9fa48("19406", "19407", "19408"), (stryMutAct_9fa48("19410") ? typeof partitionId === 'string' : stryMutAct_9fa48("19409") ? false : (stryCov_9fa48("19409", "19410"), typeof partitionId !== (stryMutAct_9fa48("19411") ? "" : (stryCov_9fa48("19411"), 'string')))) || (stryMutAct_9fa48("19413") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("19412") ? false : (stryCov_9fa48("19412", "19413"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("19414")) {
          {}
        } else {
          stryCov_9fa48("19414");
          return stryMutAct_9fa48("19415") ? true : (stryCov_9fa48("19415"), false);
        }
      }
      for (const nodeReadyTableName of BOOTSTRAP_NODE_READY_REBALANCE_TABLES) {
        if (stryMutAct_9fa48("19416")) {
          {}
        } else {
          stryCov_9fa48("19416");
          if (stryMutAct_9fa48("19419") ? partitionId !== `${nodeReadyTableName}-p1` : stryMutAct_9fa48("19418") ? false : stryMutAct_9fa48("19417") ? true : (stryCov_9fa48("19417", "19418", "19419"), partitionId === (stryMutAct_9fa48("19420") ? `` : (stryCov_9fa48("19420"), `${nodeReadyTableName}-p1`)))) {
            if (stryMutAct_9fa48("19421")) {
              {}
            } else {
              stryCov_9fa48("19421");
              return stryMutAct_9fa48("19422") ? false : (stryCov_9fa48("19422"), true);
            }
          }
        }
      }
      return stryMutAct_9fa48("19423") ? true : (stryCov_9fa48("19423"), false);
    }
  }
  handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow) {
    if (stryMutAct_9fa48("19424")) {
      {}
    } else {
      stryCov_9fa48("19424");
      const logger = this.getLogger();
      const rawNodeRow = stryMutAct_9fa48("19427") ? cdcEvent?.data && null : stryMutAct_9fa48("19426") ? false : stryMutAct_9fa48("19425") ? true : (stryCov_9fa48("19425", "19426", "19427"), (stryMutAct_9fa48("19428") ? cdcEvent.data : (stryCov_9fa48("19428"), cdcEvent?.data)) || null);
      const previousRow = (stryMutAct_9fa48("19431") ? previousNodeRow || typeof previousNodeRow === 'object' : stryMutAct_9fa48("19430") ? false : stryMutAct_9fa48("19429") ? true : (stryCov_9fa48("19429", "19430", "19431"), previousNodeRow && (stryMutAct_9fa48("19433") ? typeof previousNodeRow !== 'object' : stryMutAct_9fa48("19432") ? true : (stryCov_9fa48("19432", "19433"), typeof previousNodeRow === (stryMutAct_9fa48("19434") ? "" : (stryCov_9fa48("19434"), 'object')))))) ? previousNodeRow : {};
      const incomingRow = (stryMutAct_9fa48("19437") ? rawNodeRow || typeof rawNodeRow === 'object' : stryMutAct_9fa48("19436") ? false : stryMutAct_9fa48("19435") ? true : (stryCov_9fa48("19435", "19436", "19437"), rawNodeRow && (stryMutAct_9fa48("19439") ? typeof rawNodeRow !== 'object' : stryMutAct_9fa48("19438") ? true : (stryCov_9fa48("19438", "19439"), typeof rawNodeRow === (stryMutAct_9fa48("19440") ? "" : (stryCov_9fa48("19440"), 'object')))))) ? rawNodeRow : {};
      const nodeRow = stryMutAct_9fa48("19441") ? {} : (stryCov_9fa48("19441"), {
        ...previousRow,
        ...incomingRow,
        node_id: stryMutAct_9fa48("19442") ? (incomingRow.node_id ?? incomingRow.nodeId ?? previousRow.node_id ?? previousRow.nodeId) && null : (stryCov_9fa48("19442"), (stryMutAct_9fa48("19443") ? (incomingRow.node_id ?? incomingRow.nodeId ?? previousRow.node_id) && previousRow.nodeId : (stryCov_9fa48("19443"), (stryMutAct_9fa48("19444") ? (incomingRow.node_id ?? incomingRow.nodeId) && previousRow.node_id : (stryCov_9fa48("19444"), (stryMutAct_9fa48("19445") ? incomingRow.node_id && incomingRow.nodeId : (stryCov_9fa48("19445"), incomingRow.node_id ?? incomingRow.nodeId)) ?? previousRow.node_id)) ?? previousRow.nodeId)) ?? null),
        status: stryMutAct_9fa48("19446") ? (incomingRow.status ?? incomingRow.nodeStatus ?? incomingRow.state ?? incomingRow.lifecycle_state ?? incomingRow.lifecycleState ?? previousRow.status ?? previousRow.nodeStatus ?? previousRow.state ?? previousRow.lifecycle_state ?? previousRow.lifecycleState) && null : (stryCov_9fa48("19446"), (stryMutAct_9fa48("19447") ? (incomingRow.status ?? incomingRow.nodeStatus ?? incomingRow.state ?? incomingRow.lifecycle_state ?? incomingRow.lifecycleState ?? previousRow.status ?? previousRow.nodeStatus ?? previousRow.state ?? previousRow.lifecycle_state) && previousRow.lifecycleState : (stryCov_9fa48("19447"), (stryMutAct_9fa48("19448") ? (incomingRow.status ?? incomingRow.nodeStatus ?? incomingRow.state ?? incomingRow.lifecycle_state ?? incomingRow.lifecycleState ?? previousRow.status ?? previousRow.nodeStatus ?? previousRow.state) && previousRow.lifecycle_state : (stryCov_9fa48("19448"), (stryMutAct_9fa48("19449") ? (incomingRow.status ?? incomingRow.nodeStatus ?? incomingRow.state ?? incomingRow.lifecycle_state ?? incomingRow.lifecycleState ?? previousRow.status ?? previousRow.nodeStatus) && previousRow.state : (stryCov_9fa48("19449"), (stryMutAct_9fa48("19450") ? (incomingRow.status ?? incomingRow.nodeStatus ?? incomingRow.state ?? incomingRow.lifecycle_state ?? incomingRow.lifecycleState ?? previousRow.status) && previousRow.nodeStatus : (stryCov_9fa48("19450"), (stryMutAct_9fa48("19451") ? (incomingRow.status ?? incomingRow.nodeStatus ?? incomingRow.state ?? incomingRow.lifecycle_state ?? incomingRow.lifecycleState) && previousRow.status : (stryCov_9fa48("19451"), (stryMutAct_9fa48("19452") ? (incomingRow.status ?? incomingRow.nodeStatus ?? incomingRow.state ?? incomingRow.lifecycle_state) && incomingRow.lifecycleState : (stryCov_9fa48("19452"), (stryMutAct_9fa48("19453") ? (incomingRow.status ?? incomingRow.nodeStatus ?? incomingRow.state) && incomingRow.lifecycle_state : (stryCov_9fa48("19453"), (stryMutAct_9fa48("19454") ? (incomingRow.status ?? incomingRow.nodeStatus) && incomingRow.state : (stryCov_9fa48("19454"), (stryMutAct_9fa48("19455") ? incomingRow.status && incomingRow.nodeStatus : (stryCov_9fa48("19455"), incomingRow.status ?? incomingRow.nodeStatus)) ?? incomingRow.state)) ?? incomingRow.lifecycle_state)) ?? incomingRow.lifecycleState)) ?? previousRow.status)) ?? previousRow.nodeStatus)) ?? previousRow.state)) ?? previousRow.lifecycle_state)) ?? previousRow.lifecycleState)) ?? null),
        ready_lease_expires_at: stryMutAct_9fa48("19456") ? (incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt ?? incomingRow.readyLeaseExpiresAtMs ?? incomingRow.readyLeaseExpires ?? previousRow.ready_lease_expires_at ?? previousRow.readyLeaseExpiresAt ?? previousRow.readyLeaseExpiresAtMs ?? previousRow.readyLeaseExpires) && null : (stryCov_9fa48("19456"), (stryMutAct_9fa48("19457") ? (incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt ?? incomingRow.readyLeaseExpiresAtMs ?? incomingRow.readyLeaseExpires ?? previousRow.ready_lease_expires_at ?? previousRow.readyLeaseExpiresAt ?? previousRow.readyLeaseExpiresAtMs) && previousRow.readyLeaseExpires : (stryCov_9fa48("19457"), (stryMutAct_9fa48("19458") ? (incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt ?? incomingRow.readyLeaseExpiresAtMs ?? incomingRow.readyLeaseExpires ?? previousRow.ready_lease_expires_at ?? previousRow.readyLeaseExpiresAt) && previousRow.readyLeaseExpiresAtMs : (stryCov_9fa48("19458"), (stryMutAct_9fa48("19459") ? (incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt ?? incomingRow.readyLeaseExpiresAtMs ?? incomingRow.readyLeaseExpires ?? previousRow.ready_lease_expires_at) && previousRow.readyLeaseExpiresAt : (stryCov_9fa48("19459"), (stryMutAct_9fa48("19460") ? (incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt ?? incomingRow.readyLeaseExpiresAtMs ?? incomingRow.readyLeaseExpires) && previousRow.ready_lease_expires_at : (stryCov_9fa48("19460"), (stryMutAct_9fa48("19461") ? (incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt ?? incomingRow.readyLeaseExpiresAtMs) && incomingRow.readyLeaseExpires : (stryCov_9fa48("19461"), (stryMutAct_9fa48("19462") ? (incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt) && incomingRow.readyLeaseExpiresAtMs : (stryCov_9fa48("19462"), (stryMutAct_9fa48("19463") ? incomingRow.ready_lease_expires_at && incomingRow.readyLeaseExpiresAt : (stryCov_9fa48("19463"), incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt)) ?? incomingRow.readyLeaseExpiresAtMs)) ?? incomingRow.readyLeaseExpires)) ?? previousRow.ready_lease_expires_at)) ?? previousRow.readyLeaseExpiresAt)) ?? previousRow.readyLeaseExpiresAtMs)) ?? previousRow.readyLeaseExpires)) ?? null)
      });
      const nodeId = stryMutAct_9fa48("19464") ? nodeRow.node_id : (stryCov_9fa48("19464"), nodeRow?.node_id);
      const localNodeId = this.getLocalNodeId();
      if (stryMutAct_9fa48("19467") ? false : stryMutAct_9fa48("19466") ? true : stryMutAct_9fa48("19465") ? nodeId : (stryCov_9fa48("19465", "19466", "19467"), !nodeId)) {
        if (stryMutAct_9fa48("19468")) {
          {}
        } else {
          stryCov_9fa48("19468");
          logger.info(stryMutAct_9fa48("19469") ? "" : (stryCov_9fa48("19469"), 'Skipping node-ready rebalance trigger: missing node_id'), stryMutAct_9fa48("19470") ? {} : (stryCov_9fa48("19470"), {
            operation: stryMutAct_9fa48("19473") ? cdcEvent?.operation && null : stryMutAct_9fa48("19472") ? false : stryMutAct_9fa48("19471") ? true : (stryCov_9fa48("19471", "19472", "19473"), (stryMutAct_9fa48("19474") ? cdcEvent.operation : (stryCov_9fa48("19474"), cdcEvent?.operation)) || null)
          }));
          return stryMutAct_9fa48("19475") ? true : (stryCov_9fa48("19475"), false);
        }
      }
      if (stryMutAct_9fa48("19478") ? this.isBootstrapNodeReadyRebalanceActive() === true : stryMutAct_9fa48("19477") ? false : stryMutAct_9fa48("19476") ? true : (stryCov_9fa48("19476", "19477", "19478"), this.isBootstrapNodeReadyRebalanceActive() !== (stryMutAct_9fa48("19479") ? false : (stryCov_9fa48("19479"), true)))) {
        if (stryMutAct_9fa48("19480")) {
          {}
        } else {
          stryCov_9fa48("19480");
          logger.debug(stryMutAct_9fa48("19481") ? "" : (stryCov_9fa48("19481"), 'Skipping node-ready rebalance trigger: bootstrap node_ready lane is inactive'), stryMutAct_9fa48("19482") ? {} : (stryCov_9fa48("19482"), {
            readyNodeId: nodeId,
            localNodeId,
            operation: stryMutAct_9fa48("19485") ? cdcEvent?.operation && null : stryMutAct_9fa48("19484") ? false : stryMutAct_9fa48("19483") ? true : (stryCov_9fa48("19483", "19484", "19485"), (stryMutAct_9fa48("19486") ? cdcEvent.operation : (stryCov_9fa48("19486"), cdcEvent?.operation)) || null)
          }));
          return stryMutAct_9fa48("19487") ? true : (stryCov_9fa48("19487"), false);
        }
      }
      if (stryMutAct_9fa48("19490") ? nodeId !== localNodeId : stryMutAct_9fa48("19489") ? false : stryMutAct_9fa48("19488") ? true : (stryCov_9fa48("19488", "19489", "19490"), nodeId === localNodeId)) {
        if (stryMutAct_9fa48("19491")) {
          {}
        } else {
          stryCov_9fa48("19491");
          logger.debug(stryMutAct_9fa48("19492") ? "" : (stryCov_9fa48("19492"), 'Skipping node-ready rebalance trigger: local node readiness is runtime-owned'), stryMutAct_9fa48("19493") ? {} : (stryCov_9fa48("19493"), {
            readyNodeId: nodeId,
            localNodeId,
            operation: stryMutAct_9fa48("19496") ? cdcEvent?.operation && null : stryMutAct_9fa48("19495") ? false : stryMutAct_9fa48("19494") ? true : (stryCov_9fa48("19494", "19495", "19496"), (stryMutAct_9fa48("19497") ? cdcEvent.operation : (stryCov_9fa48("19497"), cdcEvent?.operation)) || null)
          }));
          return stryMutAct_9fa48("19498") ? true : (stryCov_9fa48("19498"), false);
        }
      }
      const now = Date.now();
      const observedNodeRow = stryMutAct_9fa48("19501") ? this.latestObservedNodeRows.get(nodeId) && null : stryMutAct_9fa48("19500") ? false : stryMutAct_9fa48("19499") ? true : (stryCov_9fa48("19499", "19500", "19501"), this.latestObservedNodeRows.get(nodeId) || null);
      const effectivePreviousRow = this.resolveMostRecentNodeRow(previousRow, observedNodeRow);
      const previousRowWasReady = isNodeRecordReady(previousRow, stryMutAct_9fa48("19502") ? {} : (stryCov_9fa48("19502"), {
        now
      }));
      const incomingRowIsReady = isNodeRecordReady(nodeRow, stryMutAct_9fa48("19503") ? {} : (stryCov_9fa48("19503"), {
        now
      }));
      const incomingLastHeartbeat = Number(stryMutAct_9fa48("19504") ? (nodeRow.last_heartbeat ?? nodeRow.lastHeartbeat) && NaN : (stryCov_9fa48("19504"), (stryMutAct_9fa48("19505") ? nodeRow.last_heartbeat && nodeRow.lastHeartbeat : (stryCov_9fa48("19505"), nodeRow.last_heartbeat ?? nodeRow.lastHeartbeat)) ?? NaN));
      const incomingLooksOlderThanObserved = stryMutAct_9fa48("19508") ? effectivePreviousRow || compareNodeHeartbeatWatermarks(effectivePreviousRow, nodeRow) < NUM.ZERO : stryMutAct_9fa48("19507") ? false : stryMutAct_9fa48("19506") ? true : (stryCov_9fa48("19506", "19507", "19508"), effectivePreviousRow && (stryMutAct_9fa48("19511") ? compareNodeHeartbeatWatermarks(effectivePreviousRow, nodeRow) >= NUM.ZERO : stryMutAct_9fa48("19510") ? compareNodeHeartbeatWatermarks(effectivePreviousRow, nodeRow) <= NUM.ZERO : stryMutAct_9fa48("19509") ? true : (stryCov_9fa48("19509", "19510", "19511"), compareNodeHeartbeatWatermarks(effectivePreviousRow, nodeRow) < NUM.ZERO)));
      const shouldSuppressObservedRegression = stryMutAct_9fa48("19514") ? incomingLooksOlderThanObserved || incomingRowIsReady || !previousRowWasReady || Number.isFinite(incomingLastHeartbeat) : stryMutAct_9fa48("19513") ? false : stryMutAct_9fa48("19512") ? true : (stryCov_9fa48("19512", "19513", "19514"), incomingLooksOlderThanObserved && (stryMutAct_9fa48("19516") ? (incomingRowIsReady || !previousRowWasReady) && Number.isFinite(incomingLastHeartbeat) : stryMutAct_9fa48("19515") ? true : (stryCov_9fa48("19515", "19516"), (stryMutAct_9fa48("19518") ? incomingRowIsReady && !previousRowWasReady : stryMutAct_9fa48("19517") ? false : (stryCov_9fa48("19517", "19518"), incomingRowIsReady || (stryMutAct_9fa48("19519") ? previousRowWasReady : (stryCov_9fa48("19519"), !previousRowWasReady)))) || Number.isFinite(incomingLastHeartbeat))));
      if (stryMutAct_9fa48("19521") ? false : stryMutAct_9fa48("19520") ? true : (stryCov_9fa48("19520", "19521"), shouldSuppressObservedRegression)) {
        if (stryMutAct_9fa48("19522")) {
          {}
        } else {
          stryCov_9fa48("19522");
          logger.debug(stryMutAct_9fa48("19523") ? "" : (stryCov_9fa48("19523"), 'Skipping node-ready rebalance trigger: stale node liveness regression'), stryMutAct_9fa48("19524") ? {} : (stryCov_9fa48("19524"), {
            readyNodeId: nodeId,
            localNodeId,
            operation: stryMutAct_9fa48("19527") ? cdcEvent?.operation && null : stryMutAct_9fa48("19526") ? false : stryMutAct_9fa48("19525") ? true : (stryCov_9fa48("19525", "19526", "19527"), (stryMutAct_9fa48("19528") ? cdcEvent.operation : (stryCov_9fa48("19528"), cdcEvent?.operation)) || null),
            previousReadyLeaseExpiresAt: stryMutAct_9fa48("19529") ? (effectivePreviousRow.ready_lease_expires_at ?? effectivePreviousRow.readyLeaseExpiresAt) && null : (stryCov_9fa48("19529"), (stryMutAct_9fa48("19530") ? effectivePreviousRow.ready_lease_expires_at && effectivePreviousRow.readyLeaseExpiresAt : (stryCov_9fa48("19530"), effectivePreviousRow.ready_lease_expires_at ?? effectivePreviousRow.readyLeaseExpiresAt)) ?? null),
            incomingReadyLeaseExpiresAt: stryMutAct_9fa48("19531") ? (nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt) && null : (stryCov_9fa48("19531"), (stryMutAct_9fa48("19532") ? nodeRow.ready_lease_expires_at && nodeRow.readyLeaseExpiresAt : (stryCov_9fa48("19532"), nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt)) ?? null),
            previousLastHeartbeat: stryMutAct_9fa48("19533") ? (effectivePreviousRow.last_heartbeat ?? effectivePreviousRow.lastHeartbeat) && null : (stryCov_9fa48("19533"), (stryMutAct_9fa48("19534") ? effectivePreviousRow.last_heartbeat && effectivePreviousRow.lastHeartbeat : (stryCov_9fa48("19534"), effectivePreviousRow.last_heartbeat ?? effectivePreviousRow.lastHeartbeat)) ?? null),
            incomingLastHeartbeat: stryMutAct_9fa48("19535") ? (nodeRow.last_heartbeat ?? nodeRow.lastHeartbeat) && null : (stryCov_9fa48("19535"), (stryMutAct_9fa48("19536") ? nodeRow.last_heartbeat && nodeRow.lastHeartbeat : (stryCov_9fa48("19536"), nodeRow.last_heartbeat ?? nodeRow.lastHeartbeat)) ?? null)
          }));
          return stryMutAct_9fa48("19537") ? true : (stryCov_9fa48("19537"), false);
        }
      }
      const nextObservedRow = incomingLooksOlderThanObserved ? nodeRow : this.resolveMostRecentNodeRow(effectivePreviousRow, nodeRow);
      this.latestObservedNodeRows.set(nodeId, nextObservedRow);
      if (stryMutAct_9fa48("19539") ? false : stryMutAct_9fa48("19538") ? true : (stryCov_9fa48("19538", "19539"), isNodeHeartbeatWatermarkRegression(previousRow, incomingRow))) {
        if (stryMutAct_9fa48("19540")) {
          {}
        } else {
          stryCov_9fa48("19540");
          logger.debug(stryMutAct_9fa48("19541") ? "" : (stryCov_9fa48("19541"), 'Skipping node-ready rebalance trigger: stale node liveness regression'), stryMutAct_9fa48("19542") ? {} : (stryCov_9fa48("19542"), {
            readyNodeId: nodeId,
            localNodeId,
            operation: stryMutAct_9fa48("19545") ? cdcEvent?.operation && null : stryMutAct_9fa48("19544") ? false : stryMutAct_9fa48("19543") ? true : (stryCov_9fa48("19543", "19544", "19545"), (stryMutAct_9fa48("19546") ? cdcEvent.operation : (stryCov_9fa48("19546"), cdcEvent?.operation)) || null),
            previousReadyLeaseExpiresAt: stryMutAct_9fa48("19547") ? (previousRow.ready_lease_expires_at ?? previousRow.readyLeaseExpiresAt) && null : (stryCov_9fa48("19547"), (stryMutAct_9fa48("19548") ? previousRow.ready_lease_expires_at && previousRow.readyLeaseExpiresAt : (stryCov_9fa48("19548"), previousRow.ready_lease_expires_at ?? previousRow.readyLeaseExpiresAt)) ?? null),
            incomingReadyLeaseExpiresAt: stryMutAct_9fa48("19549") ? (incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt) && null : (stryCov_9fa48("19549"), (stryMutAct_9fa48("19550") ? incomingRow.ready_lease_expires_at && incomingRow.readyLeaseExpiresAt : (stryCov_9fa48("19550"), incomingRow.ready_lease_expires_at ?? incomingRow.readyLeaseExpiresAt)) ?? null),
            previousLastHeartbeat: stryMutAct_9fa48("19551") ? (previousRow.last_heartbeat ?? previousRow.lastHeartbeat) && null : (stryCov_9fa48("19551"), (stryMutAct_9fa48("19552") ? previousRow.last_heartbeat && previousRow.lastHeartbeat : (stryCov_9fa48("19552"), previousRow.last_heartbeat ?? previousRow.lastHeartbeat)) ?? null),
            incomingLastHeartbeat: stryMutAct_9fa48("19553") ? (incomingRow.last_heartbeat ?? incomingRow.lastHeartbeat) && null : (stryCov_9fa48("19553"), (stryMutAct_9fa48("19554") ? incomingRow.last_heartbeat && incomingRow.lastHeartbeat : (stryCov_9fa48("19554"), incomingRow.last_heartbeat ?? incomingRow.lastHeartbeat)) ?? null)
          }));
          return stryMutAct_9fa48("19555") ? true : (stryCov_9fa48("19555"), false);
        }
      }
      const isReady = isNodeRecordReady(nextObservedRow, stryMutAct_9fa48("19556") ? {} : (stryCov_9fa48("19556"), {
        now
      }));
      const wasReady = isNodeRecordReady(effectivePreviousRow, stryMutAct_9fa48("19557") ? {} : (stryCov_9fa48("19557"), {
        now
      }));
      if (stryMutAct_9fa48("19560") ? false : stryMutAct_9fa48("19559") ? true : stryMutAct_9fa48("19558") ? isReady : (stryCov_9fa48("19558", "19559", "19560"), !isReady)) {
        if (stryMutAct_9fa48("19561")) {
          {}
        } else {
          stryCov_9fa48("19561");
          logger.info(stryMutAct_9fa48("19562") ? "" : (stryCov_9fa48("19562"), 'Skipping node-ready rebalance trigger: node not ready'), stryMutAct_9fa48("19563") ? {} : (stryCov_9fa48("19563"), {
            readyNodeId: nodeId,
            localNodeId,
            status: stryMutAct_9fa48("19566") ? nextObservedRow.status && null : stryMutAct_9fa48("19565") ? false : stryMutAct_9fa48("19564") ? true : (stryCov_9fa48("19564", "19565", "19566"), nextObservedRow.status || null),
            readyLeaseExpiresAt: stryMutAct_9fa48("19569") ? nextObservedRow.ready_lease_expires_at && null : stryMutAct_9fa48("19568") ? false : stryMutAct_9fa48("19567") ? true : (stryCov_9fa48("19567", "19568", "19569"), nextObservedRow.ready_lease_expires_at || null),
            operation: stryMutAct_9fa48("19572") ? cdcEvent?.operation && null : stryMutAct_9fa48("19571") ? false : stryMutAct_9fa48("19570") ? true : (stryCov_9fa48("19570", "19571", "19572"), (stryMutAct_9fa48("19573") ? cdcEvent.operation : (stryCov_9fa48("19573"), cdcEvent?.operation)) || null)
          }));
          const existingTimer = this.pendingNodeReadyRebalanceTimers.get(nodeId);
          if (stryMutAct_9fa48("19575") ? false : stryMutAct_9fa48("19574") ? true : (stryCov_9fa48("19574", "19575"), existingTimer)) {
            if (stryMutAct_9fa48("19576")) {
              {}
            } else {
              stryCov_9fa48("19576");
              clearTimeout(existingTimer);
              this.pendingNodeReadyRebalanceTimers.delete(nodeId);
              this.rebalanceTriggeredNodeIds.delete(nodeId);
            }
          }
          return stryMutAct_9fa48("19577") ? true : (stryCov_9fa48("19577"), false);
        }
      }
      if (stryMutAct_9fa48("19579") ? false : stryMutAct_9fa48("19578") ? true : (stryCov_9fa48("19578", "19579"), wasReady)) {
        if (stryMutAct_9fa48("19580")) {
          {}
        } else {
          stryCov_9fa48("19580");
          logger.debug(stryMutAct_9fa48("19581") ? "" : (stryCov_9fa48("19581"), 'Skipping node-ready rebalance trigger: no not-ready to ready transition'), stryMutAct_9fa48("19582") ? {} : (stryCov_9fa48("19582"), {
            readyNodeId: nodeId,
            localNodeId,
            status: stryMutAct_9fa48("19585") ? nextObservedRow.status && null : stryMutAct_9fa48("19584") ? false : stryMutAct_9fa48("19583") ? true : (stryCov_9fa48("19583", "19584", "19585"), nextObservedRow.status || null),
            readyLeaseExpiresAt: stryMutAct_9fa48("19588") ? nextObservedRow.ready_lease_expires_at && null : stryMutAct_9fa48("19587") ? false : stryMutAct_9fa48("19586") ? true : (stryCov_9fa48("19586", "19587", "19588"), nextObservedRow.ready_lease_expires_at || null),
            operation: stryMutAct_9fa48("19591") ? cdcEvent?.operation && null : stryMutAct_9fa48("19590") ? false : stryMutAct_9fa48("19589") ? true : (stryCov_9fa48("19589", "19590", "19591"), (stryMutAct_9fa48("19592") ? cdcEvent.operation : (stryCov_9fa48("19592"), cdcEvent?.operation)) || null)
          }));
          return stryMutAct_9fa48("19593") ? true : (stryCov_9fa48("19593"), false);
        }
      }
      if (stryMutAct_9fa48("19595") ? false : stryMutAct_9fa48("19594") ? true : (stryCov_9fa48("19594", "19595"), this.rebalanceTriggeredNodeIds.has(nodeId))) {
        if (stryMutAct_9fa48("19596")) {
          {}
        } else {
          stryCov_9fa48("19596");
          logger.info(stryMutAct_9fa48("19597") ? "" : (stryCov_9fa48("19597"), 'Skipping node-ready rebalance trigger: already scheduled'), stryMutAct_9fa48("19598") ? {} : (stryCov_9fa48("19598"), {
            readyNodeId: nodeId,
            localNodeId
          }));
          return stryMutAct_9fa48("19599") ? true : (stryCov_9fa48("19599"), false);
        }
      }
      this.rebalanceTriggeredNodeIds.add(nodeId);
      if (stryMutAct_9fa48("19601") ? false : stryMutAct_9fa48("19600") ? true : (stryCov_9fa48("19600", "19601"), this.pendingNodeReadyRebalanceTimers.has(nodeId))) {
        if (stryMutAct_9fa48("19602")) {
          {}
        } else {
          stryCov_9fa48("19602");
          return stryMutAct_9fa48("19603") ? true : (stryCov_9fa48("19603"), false);
        }
      }
      logger.info(stryMutAct_9fa48("19604") ? "" : (stryCov_9fa48("19604"), 'Scheduling node-ready rebalance trigger'), stryMutAct_9fa48("19605") ? {} : (stryCov_9fa48("19605"), {
        readyNodeId: nodeId,
        localNodeId,
        reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
        delayMs: this.getNodeReadyRebalanceDelayMs(),
        status: stryMutAct_9fa48("19608") ? nextObservedRow.status && null : stryMutAct_9fa48("19607") ? false : stryMutAct_9fa48("19606") ? true : (stryCov_9fa48("19606", "19607", "19608"), nextObservedRow.status || null),
        readyLeaseExpiresAt: stryMutAct_9fa48("19611") ? nextObservedRow.ready_lease_expires_at && null : stryMutAct_9fa48("19610") ? false : stryMutAct_9fa48("19609") ? true : (stryCov_9fa48("19609", "19610", "19611"), nextObservedRow.ready_lease_expires_at || null)
      }));
      const timer = setTimeout(() => {
        if (stryMutAct_9fa48("19612")) {
          {}
        } else {
          stryCov_9fa48("19612");
          void this.executeNodeReadyRebalanceTrigger(nodeId);
        }
      }, this.getNodeReadyRebalanceDelayMs());
      if (stryMutAct_9fa48("19615") ? typeof timer.unref !== 'function' : stryMutAct_9fa48("19614") ? false : stryMutAct_9fa48("19613") ? true : (stryCov_9fa48("19613", "19614", "19615"), typeof timer.unref === (stryMutAct_9fa48("19616") ? "" : (stryCov_9fa48("19616"), 'function')))) {
        if (stryMutAct_9fa48("19617")) {
          {}
        } else {
          stryCov_9fa48("19617");
          timer.unref();
        }
      }
      this.pendingNodeReadyRebalanceTimers.set(nodeId, timer);
      return stryMutAct_9fa48("19618") ? false : (stryCov_9fa48("19618"), true);
    }
  }
  async executeNodeReadyRebalanceTrigger(nodeId) {
    if (stryMutAct_9fa48("19619")) {
      {}
    } else {
      stryCov_9fa48("19619");
      this.pendingNodeReadyRebalanceTimers.delete(nodeId);
      this.rebalanceTriggeredNodeIds.delete(nodeId);
      this.executeNodeReadyRebalance(BOOTSTRAP_REBALANCE_REASON.NODE_READY);
    }
  }
  clearNodeReadyRebalanceState() {
    if (stryMutAct_9fa48("19620")) {
      {}
    } else {
      stryCov_9fa48("19620");
      for (const timer of this.pendingNodeReadyRebalanceTimers.values()) {
        if (stryMutAct_9fa48("19621")) {
          {}
        } else {
          stryCov_9fa48("19621");
          clearTimeout(timer);
        }
      }
      this.pendingNodeReadyRebalanceTimers.clear();
      this.rebalanceTriggeredNodeIds.clear();
      this.latestObservedNodeRows.clear();
    }
  }
  resolveMostRecentNodeRow(primaryRow, fallbackRow) {
    if (stryMutAct_9fa48("19622")) {
      {}
    } else {
      stryCov_9fa48("19622");
      if (stryMutAct_9fa48("19625") ? false : stryMutAct_9fa48("19624") ? true : stryMutAct_9fa48("19623") ? primaryRow : (stryCov_9fa48("19623", "19624", "19625"), !primaryRow)) {
        if (stryMutAct_9fa48("19626")) {
          {}
        } else {
          stryCov_9fa48("19626");
          return stryMutAct_9fa48("19629") ? fallbackRow && null : stryMutAct_9fa48("19628") ? false : stryMutAct_9fa48("19627") ? true : (stryCov_9fa48("19627", "19628", "19629"), fallbackRow || null);
        }
      }
      if (stryMutAct_9fa48("19632") ? false : stryMutAct_9fa48("19631") ? true : stryMutAct_9fa48("19630") ? fallbackRow : (stryCov_9fa48("19630", "19631", "19632"), !fallbackRow)) {
        if (stryMutAct_9fa48("19633")) {
          {}
        } else {
          stryCov_9fa48("19633");
          return primaryRow;
        }
      }
      const comparison = compareNodeHeartbeatWatermarks(primaryRow, fallbackRow);
      if (stryMutAct_9fa48("19637") ? comparison <= NUM.ZERO : stryMutAct_9fa48("19636") ? comparison >= NUM.ZERO : stryMutAct_9fa48("19635") ? false : stryMutAct_9fa48("19634") ? true : (stryCov_9fa48("19634", "19635", "19636", "19637"), comparison > NUM.ZERO)) {
        if (stryMutAct_9fa48("19638")) {
          {}
        } else {
          stryCov_9fa48("19638");
          return fallbackRow;
        }
      }
      if (stryMutAct_9fa48("19642") ? comparison >= NUM.ZERO : stryMutAct_9fa48("19641") ? comparison <= NUM.ZERO : stryMutAct_9fa48("19640") ? false : stryMutAct_9fa48("19639") ? true : (stryCov_9fa48("19639", "19640", "19641", "19642"), comparison < NUM.ZERO)) {
        if (stryMutAct_9fa48("19643")) {
          {}
        } else {
          stryCov_9fa48("19643");
          return primaryRow;
        }
      }
      return stryMutAct_9fa48("19644") ? {} : (stryCov_9fa48("19644"), {
        ...fallbackRow,
        ...primaryRow
      });
    }
  }
}
export { BootstrapNodeReadyRebalanceOwner };