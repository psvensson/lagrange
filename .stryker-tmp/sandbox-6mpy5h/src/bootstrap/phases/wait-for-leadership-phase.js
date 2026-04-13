/**
 * Wait For Leadership Phase — handles waiting for message group leadership
 * establishment and system service leader readiness during the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */
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
import { INITIAL_PARTITION_IDS } from '../system-table-schemas-constants.js';
import { getMissingSystemServiceLeaders as getMissingLeaders, isSystemTableWriteReady } from '../../cache/leader-readiness-gate.js';
import { createSystemLeaderReadinessSnapshot } from '../system-readiness-snapshot.js';
import { subscribeToSystemTableCacheChanges, waitForStartupConvergence } from '../shared/startup-convergence-gate.js';
import { JOINING_ERROR_MSG, JOINING_LOG_MSG } from '../node-joining-constants.js';
import { ReplicaStatus } from '../../rebalancer/replica-status.js';
import { COLUMN, NUM, SERVICE_TYPE, TABLES, TYPEOF } from '../../constants/index.js';
const JOINING_REQUIRED_WRITE_TABLES = Object.freeze(stryMutAct_9fa48("27461") ? [] : (stryCov_9fa48("27461"), [TABLES.NODES, TABLES.NODE_ENDPOINTS]));

/**
 * Handles the wait-for-leadership phase of the join process.
 */
class WaitForLeadershipPhase {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("27462")) {
      {}
    } else {
      stryCov_9fa48("27462");
      this.nodeId = options.nodeId;
      this.delegates = stryMutAct_9fa48("27465") ? options.delegates && {} : stryMutAct_9fa48("27464") ? false : stryMutAct_9fa48("27463") ? true : (stryCov_9fa48("27463", "27464", "27465"), options.delegates || {});
    }
  }

  /**
   * Phase: Wait for message group leadership to be established.
   * @return {Promise<void>}
   */
  async phaseWaitForLeadership() {
    if (stryMutAct_9fa48("27466")) {
      {}
    } else {
      stryCov_9fa48("27466");
      const config = this.delegates.getConfig();
      const logger = this.delegates.getLogger();
      const now = this.delegates.getNow();
      const sleep = this.delegates.getSleep();
      const startTime = now();
      const timeoutMs = config.leadershipWaitTimeoutMs;
      let delay = config.leadershipWaitInitialDelayMs;
      const maxDelay = config.leadershipWaitMaxDelayMs;
      const backoffMultiplier = config.leadershipWaitBackoffMultiplier;
      const systemTableCache = this.delegates.getSystemTableCache();
      const requiredTables = this.getRequiredSystemWriteTables();
      logger.debug(JOINING_LOG_MSG.WAITING_LEADERSHIP, stryMutAct_9fa48("27467") ? {} : (stryCov_9fa48("27467"), {
        nodeId: this.nodeId,
        timeoutMs,
        messageGroupCount: this.delegates.getMessageGroupServicesSize()
      }));
      while (stryMutAct_9fa48("27470") ? now() - startTime >= timeoutMs : stryMutAct_9fa48("27469") ? now() - startTime <= timeoutMs : stryMutAct_9fa48("27468") ? false : (stryCov_9fa48("27468", "27469", "27470"), (stryMutAct_9fa48("27471") ? now() + startTime : (stryCov_9fa48("27471"), now() - startTime)) < timeoutMs)) {
        if (stryMutAct_9fa48("27472")) {
          {}
        } else {
          stryCov_9fa48("27472");
          // Check whether any local replica can already carry the upcoming join
          // write set through the canonical metadata ingress path.
          const messageGroupServices = this.delegates.getMessageGroupServices();
          for (const [replicaId, service] of messageGroupServices) {
            if (stryMutAct_9fa48("27473")) {
              {}
            } else {
              stryCov_9fa48("27473");
              const ingressReady = stryMutAct_9fa48("27476") ? service?.isMetadataIngressReady?.({
                requiredTables
              }) !== true : stryMutAct_9fa48("27475") ? false : stryMutAct_9fa48("27474") ? true : (stryCov_9fa48("27474", "27475", "27476"), (stryMutAct_9fa48("27478") ? service.isMetadataIngressReady?.({
                requiredTables
              }) : stryMutAct_9fa48("27477") ? service?.isMetadataIngressReady({
                requiredTables
              }) : (stryCov_9fa48("27477", "27478"), service?.isMetadataIngressReady?.(stryMutAct_9fa48("27479") ? {} : (stryCov_9fa48("27479"), {
                requiredTables
              })))) === (stryMutAct_9fa48("27480") ? false : (stryCov_9fa48("27480"), true)));
              if (stryMutAct_9fa48("27482") ? false : stryMutAct_9fa48("27481") ? true : (stryCov_9fa48("27481", "27482"), ingressReady)) {
                if (stryMutAct_9fa48("27483")) {
                  {}
                } else {
                  stryCov_9fa48("27483");
                  logger.debug(JOINING_LOG_MSG.LEADERSHIP_ESTABLISHED, stryMutAct_9fa48("27484") ? {} : (stryCov_9fa48("27484"), {
                    nodeId: this.nodeId,
                    replicaId,
                    isLeader: stryMutAct_9fa48("27487") ? service?.isLeaderReplica?.() !== true : stryMutAct_9fa48("27486") ? false : stryMutAct_9fa48("27485") ? true : (stryCov_9fa48("27485", "27486", "27487"), (stryMutAct_9fa48("27489") ? service.isLeaderReplica?.() : stryMutAct_9fa48("27488") ? service?.isLeaderReplica() : (stryCov_9fa48("27488", "27489"), service?.isLeaderReplica?.())) === (stryMutAct_9fa48("27490") ? false : (stryCov_9fa48("27490"), true))),
                    leaderId: (stryMutAct_9fa48("27493") ? typeof service?.getLeaderId !== TYPEOF.FUNCTION : stryMutAct_9fa48("27492") ? false : stryMutAct_9fa48("27491") ? true : (stryCov_9fa48("27491", "27492", "27493"), typeof (stryMutAct_9fa48("27494") ? service.getLeaderId : (stryCov_9fa48("27494"), service?.getLeaderId)) === TYPEOF.FUNCTION)) ? service.getLeaderId() : null,
                    requiredTables,
                    elapsedMs: stryMutAct_9fa48("27495") ? now() + startTime : (stryCov_9fa48("27495"), now() - startTime)
                  }));
                  return;
                }
              }
            }
          }

          // Wait with exponential backoff
          await sleep(delay);
          delay = stryMutAct_9fa48("27496") ? Math.max(delay * backoffMultiplier, maxDelay) : (stryCov_9fa48("27496"), Math.min(stryMutAct_9fa48("27497") ? delay / backoffMultiplier : (stryCov_9fa48("27497"), delay * backoffMultiplier), maxDelay));
        }
      }

      // Timeout - fail joining
      const leadershipTimeout = JOINING_ERROR_MSG.leadershipTimeout;
      throw new Error(leadershipTimeout(timeoutMs));
    }
  }

  /**
   * Wait for system table leaders to be present in cache before
   * seeding writes.
   * @param {Object} systemTableCache - System table cache.
   * @return {Promise<void>}
   */
  async waitForSystemServiceLeaders(systemTableCache) {
    if (stryMutAct_9fa48("27498")) {
      {}
    } else {
      stryCov_9fa48("27498");
      const config = this.delegates.getConfig();
      const logger = this.delegates.getLogger();
      const timeoutMs = config.leadershipWaitTimeoutMs;
      logger.debug(JOINING_LOG_MSG.WAITING_LEADERSHIP, stryMutAct_9fa48("27499") ? {} : (stryCov_9fa48("27499"), {
        nodeId: this.nodeId,
        timeoutMs
      }));
      await waitForStartupConvergence(stryMutAct_9fa48("27500") ? {} : (stryCov_9fa48("27500"), {
        timeoutMs,
        subscriptions: stryMutAct_9fa48("27501") ? [] : (stryCov_9fa48("27501"), [stryMutAct_9fa48("27502") ? () => undefined : (stryCov_9fa48("27502"), notify => subscribeToSystemTableCacheChanges(systemTableCache, notify))]),
        evaluate: stryMutAct_9fa48("27503") ? () => undefined : (stryCov_9fa48("27503"), () => this.createSystemServiceLeadershipSnapshot(systemTableCache)),
        createTimeoutError: (readiness, context) => {
          if (stryMutAct_9fa48("27504")) {
            {}
          } else {
            stryCov_9fa48("27504");
            const missing = this.getMissingSystemServiceLeaders(systemTableCache);
            const blockingMissing = stryMutAct_9fa48("27507") ? readiness?.missingLeaders && missing : stryMutAct_9fa48("27506") ? false : stryMutAct_9fa48("27505") ? true : (stryCov_9fa48("27505", "27506", "27507"), (stryMutAct_9fa48("27508") ? readiness.missingLeaders : (stryCov_9fa48("27508"), readiness?.missingLeaders)) || missing);
            const leadershipTimeout = JOINING_ERROR_MSG.leadershipTimeout;
            const error = new Error(leadershipTimeout(timeoutMs));
            error.missingLeaders = blockingMissing;
            error.missingCount = stryMutAct_9fa48("27511") ? readiness?.missingCount && NUM.ZERO : stryMutAct_9fa48("27510") ? false : stryMutAct_9fa48("27509") ? true : (stryCov_9fa48("27509", "27510", "27511"), (stryMutAct_9fa48("27512") ? readiness.missingCount : (stryCov_9fa48("27512"), readiness?.missingCount)) || NUM.ZERO);
            error.nonBlockingMissingLeaders = stryMutAct_9fa48("27513") ? {} : (stryCov_9fa48("27513"), {
              missingMessageGroupLeaders: missing.missingMessageGroupLeaders,
              missingMessageGroupLeaderNodes: missing.missingMessageGroupLeaderNodes,
              missingMessageGroupLeaderAddresses: missing.missingMessageGroupLeaderAddresses
            });
            error.timeoutMs = timeoutMs;
            error.timeoutKind = context.timeoutKind;
            return error;
          }
        }
      }));
    }
  }

  /**
   * Get the system tables that must be write-routable before
   * state-query writes.
   * @return {Array<string>} Required system table names.
   */
  getRequiredSystemWriteTables() {
    if (stryMutAct_9fa48("27514")) {
      {}
    } else {
      stryCov_9fa48("27514");
      return stryMutAct_9fa48("27515") ? [] : (stryCov_9fa48("27515"), [...JOINING_REQUIRED_WRITE_TABLES]);
    }
  }

  /**
   * Check whether a system table is currently write-routable for
   * join workflow. Allows follower-routed writes when leader
   * metadata is temporarily stale.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when writes can be routed.
   */
  isSystemTableWriteRoutable(systemTableCache, tableName) {
    if (stryMutAct_9fa48("27516")) {
      {}
    } else {
      stryCov_9fa48("27516");
      if (stryMutAct_9fa48("27518") ? false : stryMutAct_9fa48("27517") ? true : (stryCov_9fa48("27517", "27518"), isSystemTableWriteReady(systemTableCache, tableName))) {
        if (stryMutAct_9fa48("27519")) {
          {}
        } else {
          stryCov_9fa48("27519");
          return stryMutAct_9fa48("27520") ? false : (stryCov_9fa48("27520"), true);
        }
      }
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      if (stryMutAct_9fa48("27523") ? !partitionId && typeof systemTableCache?.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("27522") ? false : stryMutAct_9fa48("27521") ? true : (stryCov_9fa48("27521", "27522", "27523"), (stryMutAct_9fa48("27524") ? partitionId : (stryCov_9fa48("27524"), !partitionId)) || (stryMutAct_9fa48("27526") ? typeof systemTableCache?.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("27525") ? false : (stryCov_9fa48("27525", "27526"), typeof (stryMutAct_9fa48("27527") ? systemTableCache.filter : (stryCov_9fa48("27527"), systemTableCache?.filter)) !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("27528")) {
          {}
        } else {
          stryCov_9fa48("27528");
          return stryMutAct_9fa48("27529") ? true : (stryCov_9fa48("27529"), false);
        }
      }
      const routableServices = stryMutAct_9fa48("27530") ? systemTableCache : (stryCov_9fa48("27530"), systemTableCache.filter(TABLES.SERVICES, stryMutAct_9fa48("27531") ? () => undefined : (stryCov_9fa48("27531"), service => stryMutAct_9fa48("27534") ? service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION && service?.[COLUMN.PARTITION_ID] === partitionId && service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED && service?.[COLUMN.STATUS] !== ReplicaStatus.REMOVED && typeof service?.[COLUMN.ADDRESS] === TYPEOF.STRING || service[COLUMN.ADDRESS].length > NUM.ZERO : stryMutAct_9fa48("27533") ? false : stryMutAct_9fa48("27532") ? true : (stryCov_9fa48("27532", "27533", "27534"), (stryMutAct_9fa48("27536") ? service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION && service?.[COLUMN.PARTITION_ID] === partitionId && service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED && service?.[COLUMN.STATUS] !== ReplicaStatus.REMOVED || typeof service?.[COLUMN.ADDRESS] === TYPEOF.STRING : stryMutAct_9fa48("27535") ? true : (stryCov_9fa48("27535", "27536"), (stryMutAct_9fa48("27538") ? service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION && service?.[COLUMN.PARTITION_ID] === partitionId && service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED || service?.[COLUMN.STATUS] !== ReplicaStatus.REMOVED : stryMutAct_9fa48("27537") ? true : (stryCov_9fa48("27537", "27538"), (stryMutAct_9fa48("27540") ? service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION && service?.[COLUMN.PARTITION_ID] === partitionId || service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED : stryMutAct_9fa48("27539") ? true : (stryCov_9fa48("27539", "27540"), (stryMutAct_9fa48("27542") ? service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION || service?.[COLUMN.PARTITION_ID] === partitionId : stryMutAct_9fa48("27541") ? true : (stryCov_9fa48("27541", "27542"), (stryMutAct_9fa48("27544") ? service?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("27543") ? true : (stryCov_9fa48("27543", "27544"), (stryMutAct_9fa48("27545") ? service[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("27545"), service?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.PARTITION)) && (stryMutAct_9fa48("27547") ? service?.[COLUMN.PARTITION_ID] !== partitionId : stryMutAct_9fa48("27546") ? true : (stryCov_9fa48("27546", "27547"), (stryMutAct_9fa48("27548") ? service[COLUMN.PARTITION_ID] : (stryCov_9fa48("27548"), service?.[COLUMN.PARTITION_ID])) === partitionId)))) && (stryMutAct_9fa48("27550") ? service?.[COLUMN.STATUS] === ReplicaStatus.FAILED : stryMutAct_9fa48("27549") ? true : (stryCov_9fa48("27549", "27550"), (stryMutAct_9fa48("27551") ? service[COLUMN.STATUS] : (stryCov_9fa48("27551"), service?.[COLUMN.STATUS])) !== ReplicaStatus.FAILED)))) && (stryMutAct_9fa48("27553") ? service?.[COLUMN.STATUS] === ReplicaStatus.REMOVED : stryMutAct_9fa48("27552") ? true : (stryCov_9fa48("27552", "27553"), (stryMutAct_9fa48("27554") ? service[COLUMN.STATUS] : (stryCov_9fa48("27554"), service?.[COLUMN.STATUS])) !== ReplicaStatus.REMOVED)))) && (stryMutAct_9fa48("27556") ? typeof service?.[COLUMN.ADDRESS] !== TYPEOF.STRING : stryMutAct_9fa48("27555") ? true : (stryCov_9fa48("27555", "27556"), typeof (stryMutAct_9fa48("27557") ? service[COLUMN.ADDRESS] : (stryCov_9fa48("27557"), service?.[COLUMN.ADDRESS])) === TYPEOF.STRING)))) && (stryMutAct_9fa48("27560") ? service[COLUMN.ADDRESS].length <= NUM.ZERO : stryMutAct_9fa48("27559") ? service[COLUMN.ADDRESS].length >= NUM.ZERO : stryMutAct_9fa48("27558") ? true : (stryCov_9fa48("27558", "27559", "27560"), service[COLUMN.ADDRESS].length > NUM.ZERO))))));
      return stryMutAct_9fa48("27564") ? routableServices.length <= NUM.ZERO : stryMutAct_9fa48("27563") ? routableServices.length >= NUM.ZERO : stryMutAct_9fa48("27562") ? false : stryMutAct_9fa48("27561") ? true : (stryCov_9fa48("27561", "27562", "27563", "27564"), routableServices.length > NUM.ZERO);
    }
  }

  /**
   * Find missing service leaders using system table cache.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Missing leader lists.
   */
  getMissingSystemServiceLeaders(systemTableCache) {
    if (stryMutAct_9fa48("27565")) {
      {}
    } else {
      stryCov_9fa48("27565");
      return getMissingLeaders(systemTableCache, stryMutAct_9fa48("27566") ? {} : (stryCov_9fa48("27566"), {
        // leader_node_id in partitions/message_groups is
        // asynchronously propagated. Join readiness only requires
        // routable leader services (address + node_id).
        requireLeaderNodeId: stryMutAct_9fa48("27567") ? true : (stryCov_9fa48("27567"), false)
      }));
    }
  }

  /**
   * Keep join-time readiness gates focused on system-table write
   * routing. Message-group leader rows can legitimately lag during
   * MOVE_REPLICA handoffs.
   * @param {Object} _missing - Missing leader diagnostics.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Blocking subset for state-query readiness.
   */
  getBlockingSystemServiceLeaders(_missing, systemTableCache) {
    if (stryMutAct_9fa48("27568")) {
      {}
    } else {
      stryCov_9fa48("27568");
      return this.createSystemServiceLeadershipSnapshot(systemTableCache).missingLeaders;
    }
  }
  createSystemServiceLeadershipSnapshot(systemTableCache) {
    if (stryMutAct_9fa48("27569")) {
      {}
    } else {
      stryCov_9fa48("27569");
      return createSystemLeaderReadinessSnapshot(stryMutAct_9fa48("27570") ? {} : (stryCov_9fa48("27570"), {
        systemTableCache,
        requiredTables: this.getRequiredSystemWriteTables(),
        isTableWriteSatisfied: stryMutAct_9fa48("27571") ? () => undefined : (stryCov_9fa48("27571"), (cache, tableName) => this.isSystemTableWriteRoutable(cache, tableName))
      }));
    }
  }
}
export { WaitForLeadershipPhase };