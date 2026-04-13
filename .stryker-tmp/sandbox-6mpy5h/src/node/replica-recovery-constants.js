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
import { NUM, STRING, TIME_MS } from '../constants/index.js';
import { NODE_STATUS } from './node-constants.js';
const REPLICA_RECOVERY_SUBSYSTEM = stryMutAct_9fa48("95897") ? "" : (stryCov_9fa48("95897"), 'replica-recovery');
const REPLICA_RECOVERY_DEFAULT = Object.freeze(stryMutAct_9fa48("95898") ? {} : (stryCov_9fa48("95898"), {
  CHECK_INTERVAL_MS: stryMutAct_9fa48("95899") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("95899"), TIME_MS.SECOND * NUM.TEN),
  IDLE_BACKOFF_MULTIPLIER: NUM.TWO,
  MAX_CHECK_INTERVAL_MS: TIME_MS.MINUTE,
  MIN_PARTITION_REPLICAS: NUM.THREE,
  MIN_MESSAGE_GROUP_REPLICAS: NUM.THREE,
  RECOVERY_DELAY_MS: stryMutAct_9fa48("95900") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("95900"), TIME_MS.SECOND * NUM.FIVE)
}));
const REPLICA_RECOVERY_LOG_MSG = Object.freeze(stryMutAct_9fa48("95901") ? {} : (stryCov_9fa48("95901"), {
  INITIALIZED: stryMutAct_9fa48("95902") ? "" : (stryCov_9fa48("95902"), 'Replica recovery service initialized'),
  STARTING_MONITORING: stryMutAct_9fa48("95903") ? "" : (stryCov_9fa48("95903"), 'Starting replica recovery monitoring'),
  CHECK_ERROR: stryMutAct_9fa48("95904") ? "" : (stryCov_9fa48("95904"), 'Error during replica recovery check'),
  STOPPED_MONITORING: stryMutAct_9fa48("95905") ? "" : (stryCov_9fa48("95905"), 'Stopped replica recovery monitoring'),
  PARTITION_BELOW_MIN: stryMutAct_9fa48("95906") ? "" : (stryCov_9fa48("95906"), 'Partition replica count below minimum'),
  MESSAGE_GROUP_BELOW_MIN: stryMutAct_9fa48("95907") ? "" : (stryCov_9fa48("95907"), 'Message group replica count below minimum'),
  NO_HEALTHY_NODES_PARTITION: stryMutAct_9fa48("95908") ? "" : (stryCov_9fa48("95908"), 'No healthy nodes available for partition recovery'),
  NO_HEALTHY_NODES_MESSAGE_GROUP: stryMutAct_9fa48("95909") ? "" : (stryCov_9fa48("95909"), 'No healthy nodes available for message group recovery'),
  CREATE_PARTITION_REPLICA: stryMutAct_9fa48("95910") ? "" : (stryCov_9fa48("95910"), 'Creating replacement partition replica'),
  CREATE_MESSAGE_GROUP_REPLICA: stryMutAct_9fa48("95911") ? "" : (stryCov_9fa48("95911"), 'Creating replacement message group replica'),
  CREATE_PARTITION_FAILED: stryMutAct_9fa48("95912") ? "" : (stryCov_9fa48("95912"), 'Failed to create partition replica'),
  CREATE_MESSAGE_GROUP_FAILED: stryMutAct_9fa48("95913") ? "" : (stryCov_9fa48("95913"), 'Failed to create message group replica'),
  SHUTDOWN: stryMutAct_9fa48("95914") ? "" : (stryCov_9fa48("95914"), 'Replica recovery service shutdown')
}));
const REPLICA_RECOVERY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("95915") ? {} : (stryCov_9fa48("95915"), {
  MISSING_NODE_ID: stryMutAct_9fa48("95916") ? "" : (stryCov_9fa48("95916"), 'ReplicaRecoveryService requires nodeId'),
  MISSING_SYSTEM_TABLE_CACHE: stryMutAct_9fa48("95917") ? "" : (stryCov_9fa48("95917"), 'ReplicaRecoveryService requires systemTableCache'),
  MISSING_CDC_SERVICE: stryMutAct_9fa48("95918") ? "" : (stryCov_9fa48("95918"), 'ReplicaRecoveryService requires cdcIntegrationService'),
  NOT_INITIALIZED: stryMutAct_9fa48("95919") ? "" : (stryCov_9fa48("95919"), 'ReplicaRecoveryService not initialized')
}));
const REPLICA_RECOVERY_ENTITY_TYPE = Object.freeze(stryMutAct_9fa48("95920") ? {} : (stryCov_9fa48("95920"), {
  PARTITION: stryMutAct_9fa48("95921") ? "" : (stryCov_9fa48("95921"), 'partition'),
  MESSAGE_GROUP: stryMutAct_9fa48("95922") ? "" : (stryCov_9fa48("95922"), 'message_group')
}));
const REPLICA_RECOVERY_KEY_PREFIX = Object.freeze(stryMutAct_9fa48("95923") ? {} : (stryCov_9fa48("95923"), {
  PARTITION: stryMutAct_9fa48("95924") ? "" : (stryCov_9fa48("95924"), 'partition:'),
  MESSAGE_GROUP: stryMutAct_9fa48("95925") ? "" : (stryCov_9fa48("95925"), 'message_group:')
}));
const REPLICA_RECOVERY_EVENT = Object.freeze(stryMutAct_9fa48("95926") ? {} : (stryCov_9fa48("95926"), {
  REPLICA_CREATED: stryMutAct_9fa48("95927") ? "" : (stryCov_9fa48("95927"), 'replicaCreated')
}));
const REPLICA_RECOVERY_REPLICA_STATUS = Object.freeze(stryMutAct_9fa48("95928") ? {} : (stryCov_9fa48("95928"), {
  ACTIVE: stryMutAct_9fa48("95929") ? "" : (stryCov_9fa48("95929"), 'active'),
  INACTIVE: stryMutAct_9fa48("95930") ? "" : (stryCov_9fa48("95930"), 'inactive'),
  FAILED: stryMutAct_9fa48("95931") ? "" : (stryCov_9fa48("95931"), 'failed'),
  STARTING: stryMutAct_9fa48("95932") ? "" : (stryCov_9fa48("95932"), 'starting'),
  STOPPING: stryMutAct_9fa48("95933") ? "" : (stryCov_9fa48("95933"), 'stopping')
}));
const REPLICA_RECOVERY_NODE_STATUS = NODE_STATUS;
const REPLICA_RECOVERY_NUM = Object.freeze(stryMutAct_9fa48("95934") ? {} : (stryCov_9fa48("95934"), {
  ZERO: NUM.ZERO
}));
const REPLICA_RECOVERY_STRING = Object.freeze(stryMutAct_9fa48("95935") ? {} : (stryCov_9fa48("95935"), {
  UNKNOWN: STRING.UNKNOWN
}));
export { REPLICA_RECOVERY_DEFAULT, REPLICA_RECOVERY_ENTITY_TYPE, REPLICA_RECOVERY_ERROR_MSG, REPLICA_RECOVERY_EVENT, REPLICA_RECOVERY_KEY_PREFIX, REPLICA_RECOVERY_LOG_MSG, REPLICA_RECOVERY_NODE_STATUS, REPLICA_RECOVERY_NUM, REPLICA_RECOVERY_REPLICA_STATUS, REPLICA_RECOVERY_STRING, REPLICA_RECOVERY_SUBSYSTEM };