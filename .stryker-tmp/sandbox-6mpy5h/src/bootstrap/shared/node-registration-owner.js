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
import os from 'os';
import { assertCritical } from '../../utils/assert.js';
import { NodeStorageBudgetSetup } from './node-storage-budget-setup.js';
import { NodeService } from '../../node/node-service.js';
import { registerBuiltInMetaServiceEndpoints } from './meta-service-definition-registration.js';
import { createBootstrapCacheHydrationApplier } from '../bootstrap-cache-hydration-applier.js';
import { JOINING_ERROR_MSG, JOINING_LOG_MSG } from '../node-joining-constants.js';
import { COLUMN, ENDPOINT_STATUS, NUM, SERVICE_STATUS, STATE, TABLES, TIME_MS, TRANSPORT_TYPE, TYPEOF } from '../../constants/index.js';
import { META_SERVICE_ID } from '../../constants/wasm-meta.js';
import { resolveAdvertisedWebSocketAddress } from '../../transport/node-address-resolution.js';
import { runRetryableControlPlaneWrite } from './retryable-control-plane-write.js';
import { MEMBERSHIP_LIFECYCLE_INTENT, resolveMembershipJoinIntentType } from '../../control-plane/membership-lifecycle-controller.js';
import { AuthoritativeControlPlaneView } from '../../control-plane/authoritative-control-plane-view.js';
const LOG_META_ENDPOINT_REGISTER_FAILED = stryMutAct_9fa48("29780") ? "" : (stryCov_9fa48("29780"), 'Failed to register built-in meta service endpoints');
const LOG_NODE_REGISTER_ERROR_PREFIX = stryMutAct_9fa48("29781") ? "" : (stryCov_9fa48("29781"), 'Failed to register node: ');
const LOG_JOIN_ADMISSION_WRITE_RETRY = stryMutAct_9fa48("29782") ? "" : (stryCov_9fa48("29782"), 'Retrying join admission system-table write after retryable failure');
const LOG_REUSING_DURABLE_REJOIN_MEMBERSHIP = stryMutAct_9fa48("29783") ? "" : (stryCov_9fa48("29783"), 'Reusing existing canonical membership for durable rejoin');
const JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS = stryMutAct_9fa48("29784") ? TIME_MS.SECOND / NUM.TWO : (stryCov_9fa48("29784"), TIME_MS.SECOND * NUM.TWO);
const DURABLE_REJOIN_REQUIRED_SERVICE_IDS = Object.freeze(stryMutAct_9fa48("29785") ? [] : (stryCov_9fa48("29785"), [META_SERVICE_ID.POSTGRES_WIRE]));
const hasFunction = stryMutAct_9fa48("29786") ? () => undefined : (stryCov_9fa48("29786"), (() => {
  const hasFunction = value => stryMutAct_9fa48("29789") ? typeof value !== TYPEOF.FUNCTION : stryMutAct_9fa48("29788") ? false : stryMutAct_9fa48("29787") ? true : (stryCov_9fa48("29787", "29788", "29789"), typeof value === TYPEOF.FUNCTION);
  return hasFunction;
})());
const normalizeString = stryMutAct_9fa48("29790") ? () => undefined : (stryCov_9fa48("29790"), (() => {
  const normalizeString = value => (stryMutAct_9fa48("29793") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("29792") ? false : stryMutAct_9fa48("29791") ? true : (stryCov_9fa48("29791", "29792", "29793"), typeof value === TYPEOF.STRING)) ? stryMutAct_9fa48("29794") ? value : (stryCov_9fa48("29794"), value.trim()) : stryMutAct_9fa48("29795") ? "Stryker was here!" : (stryCov_9fa48("29795"), '');
  return normalizeString;
})());
class NodeRegistrationOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("29796")) {
      {}
    } else {
      stryCov_9fa48("29796");
      this.nodeId = options.nodeId;
      this.nodeAddress = options.nodeAddress;
      this.advertisedNodeWsAddress = stryMutAct_9fa48("29799") ? options.advertisedNodeWsAddress && null : stryMutAct_9fa48("29798") ? false : stryMutAct_9fa48("29797") ? true : (stryCov_9fa48("29797", "29798", "29799"), options.advertisedNodeWsAddress || null);
      this.delegates = stryMutAct_9fa48("29802") ? options.delegates && {} : stryMutAct_9fa48("29801") ? false : stryMutAct_9fa48("29800") ? true : (stryCov_9fa48("29800", "29801", "29802"), options.delegates || {});
      this.authoritativeControlPlaneView = null;
    }
  }
  async registerNodeInCluster() {
    if (stryMutAct_9fa48("29803")) {
      {}
    } else {
      stryCov_9fa48("29803");
      const logger = this.delegates.getLogger();
      logger.info(stryMutAct_9fa48("29804") ? "" : (stryCov_9fa48("29804"), 'Registering node in cluster'), stryMutAct_9fa48("29805") ? {} : (stryCov_9fa48("29805"), {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress
      }));
      assertCritical(stryMutAct_9fa48("29806") ? this.delegates.getCdcIntegrationService().sqlQueryEngine : (stryCov_9fa48("29806"), this.delegates.getCdcIntegrationService()?.sqlQueryEngine), JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED);
      const now = this.delegates.getNow()();
      const nodeRow = this.buildNodeRegistrationRow(now);
      try {
        if (stryMutAct_9fa48("29807")) {
          {}
        } else {
          stryCov_9fa48("29807");
          const existingMembership = await this.resolveExistingDurableRejoinMembership(now);
          if (stryMutAct_9fa48("29809") ? false : stryMutAct_9fa48("29808") ? true : (stryCov_9fa48("29808", "29809"), existingMembership)) {
            if (stryMutAct_9fa48("29810")) {
              {}
            } else {
              stryCov_9fa48("29810");
              await this.refreshExistingDurableRejoinMembership(existingMembership);
              this.activateExistingDurableRejoinMembership(existingMembership);
              logger.info(LOG_REUSING_DURABLE_REJOIN_MEMBERSHIP, stryMutAct_9fa48("29811") ? {} : (stryCov_9fa48("29811"), {
                nodeId: this.nodeId,
                nodeAddress: this.nodeAddress,
                reusedEndpointCount: stryMutAct_9fa48("29812") ? NUM.ONE - existingMembership.metaEndpointRows.length : (stryCov_9fa48("29812"), NUM.ONE + existingMembership.metaEndpointRows.length)
              }));
              return existingMembership;
            }
          }
          const budgetService = this.delegates.getNodeStorageBudgetService();
          const {
            budgetRow,
            resolution
          } = await NodeStorageBudgetSetup.resolveWithoutPersist(stryMutAct_9fa48("29813") ? {} : (stryCov_9fa48("29813"), {
            budgetService,
            nodeRow,
            nodeId: this.nodeId
          }));
          const nodeUpsertResult = await this.upsertSystemTableRowWithRetry(TABLES.NODES, budgetRow, stryMutAct_9fa48("29814") ? {} : (stryCov_9fa48("29814"), {
            admissionTarget: stryMutAct_9fa48("29815") ? "" : (stryCov_9fa48("29815"), 'node membership publication')
          }));
          if (stryMutAct_9fa48("29818") ? nodeUpsertResult?.success === true : stryMutAct_9fa48("29817") ? false : stryMutAct_9fa48("29816") ? true : (stryCov_9fa48("29816", "29817", "29818"), (stryMutAct_9fa48("29819") ? nodeUpsertResult.success : (stryCov_9fa48("29819"), nodeUpsertResult?.success)) !== (stryMutAct_9fa48("29820") ? false : (stryCov_9fa48("29820"), true)))) {
            if (stryMutAct_9fa48("29821")) {
              {}
            } else {
              stryCov_9fa48("29821");
              throw new Error(stryMutAct_9fa48("29822") ? `` : (stryCov_9fa48("29822"), `Failed to register node: ${stryMutAct_9fa48("29823") ? nodeUpsertResult.error : (stryCov_9fa48("29823"), nodeUpsertResult?.error)}`));
            }
          }
          this.seedJoinTimeCacheRow(TABLES.NODES, stryMutAct_9fa48("29824") ? {} : (stryCov_9fa48("29824"), {
            ...budgetRow,
            [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
            [COLUMN.LAST_HEARTBEAT]: now,
            [COLUMN.READY_LEASE_EXPIRES_AT]: null
          }));
          logger.info(stryMutAct_9fa48("29825") ? "" : (stryCov_9fa48("29825"), 'Node registered in cluster'), stryMutAct_9fa48("29826") ? {} : (stryCov_9fa48("29826"), {
            nodeId: this.nodeId,
            nodeAddress: this.nodeAddress,
            cpuCores: stryMutAct_9fa48("29829") ? budgetRow?.[COLUMN.CPU_CORES] && null : stryMutAct_9fa48("29828") ? false : stryMutAct_9fa48("29827") ? true : (stryCov_9fa48("29827", "29828", "29829"), (stryMutAct_9fa48("29830") ? budgetRow[COLUMN.CPU_CORES] : (stryCov_9fa48("29830"), budgetRow?.[COLUMN.CPU_CORES])) || null),
            memoryMb: stryMutAct_9fa48("29833") ? budgetRow?.[COLUMN.MEMORY_MB] && null : stryMutAct_9fa48("29832") ? false : stryMutAct_9fa48("29831") ? true : (stryCov_9fa48("29831", "29832", "29833"), (stryMutAct_9fa48("29834") ? budgetRow[COLUMN.MEMORY_MB] : (stryCov_9fa48("29834"), budgetRow?.[COLUMN.MEMORY_MB])) || null),
            diskGb: stryMutAct_9fa48("29837") ? budgetRow?.[COLUMN.DISK_GB] && null : stryMutAct_9fa48("29836") ? false : stryMutAct_9fa48("29835") ? true : (stryCov_9fa48("29835", "29836", "29837"), (stryMutAct_9fa48("29838") ? budgetRow[COLUMN.DISK_GB] : (stryCov_9fa48("29838"), budgetRow?.[COLUMN.DISK_GB])) || null),
            budgetBytes: stryMutAct_9fa48("29841") ? resolution?.budgetBytes && null : stryMutAct_9fa48("29840") ? false : stryMutAct_9fa48("29839") ? true : (stryCov_9fa48("29839", "29840", "29841"), (stryMutAct_9fa48("29842") ? resolution.budgetBytes : (stryCov_9fa48("29842"), resolution?.budgetBytes)) || null),
            budgetSource: stryMutAct_9fa48("29845") ? resolution?.source && null : stryMutAct_9fa48("29844") ? false : stryMutAct_9fa48("29843") ? true : (stryCov_9fa48("29843", "29844", "29845"), (stryMutAct_9fa48("29846") ? resolution.source : (stryCov_9fa48("29846"), resolution?.source)) || null)
          }));
          const endpointRow = await this.registerNodeEndpoint(now);
          this.seedJoinTimeCacheRow(TABLES.NODE_ENDPOINTS, endpointRow);
          const metaEndpointRows = await this.registerMetaServiceEndpoints();
          for (const metaEndpointRow of metaEndpointRows) {
            if (stryMutAct_9fa48("29847")) {
              {}
            } else {
              stryCov_9fa48("29847");
              this.seedJoinTimeCacheRow(TABLES.SERVICE_ENDPOINTS, metaEndpointRow);
            }
          }
          return stryMutAct_9fa48("29848") ? {} : (stryCov_9fa48("29848"), {
            nodeRow: budgetRow,
            endpointRow,
            metaEndpointRows,
            resolution
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("29849")) {
          {}
        } else {
          stryCov_9fa48("29849");
          const wrappedError = new Error(stryMutAct_9fa48("29850") ? `` : (stryCov_9fa48("29850"), `${LOG_NODE_REGISTER_ERROR_PREFIX}${error.message}`));
          wrappedError.cause = error;
          if (stryMutAct_9fa48("29853") ? typeof error?.code === TYPEOF.STRING || error.code.length > NUM.ZERO : stryMutAct_9fa48("29852") ? false : stryMutAct_9fa48("29851") ? true : (stryCov_9fa48("29851", "29852", "29853"), (stryMutAct_9fa48("29855") ? typeof error?.code !== TYPEOF.STRING : stryMutAct_9fa48("29854") ? true : (stryCov_9fa48("29854", "29855"), typeof (stryMutAct_9fa48("29856") ? error.code : (stryCov_9fa48("29856"), error?.code)) === TYPEOF.STRING)) && (stryMutAct_9fa48("29859") ? error.code.length <= NUM.ZERO : stryMutAct_9fa48("29858") ? error.code.length >= NUM.ZERO : stryMutAct_9fa48("29857") ? true : (stryCov_9fa48("29857", "29858", "29859"), error.code.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("29860")) {
              {}
            } else {
              stryCov_9fa48("29860");
              wrappedError.code = error.code;
            }
          } else if (stryMutAct_9fa48("29863") ? typeof error?.errorCode === TYPEOF.STRING || error.errorCode.length > NUM.ZERO : stryMutAct_9fa48("29862") ? false : stryMutAct_9fa48("29861") ? true : (stryCov_9fa48("29861", "29862", "29863"), (stryMutAct_9fa48("29865") ? typeof error?.errorCode !== TYPEOF.STRING : stryMutAct_9fa48("29864") ? true : (stryCov_9fa48("29864", "29865"), typeof (stryMutAct_9fa48("29866") ? error.errorCode : (stryCov_9fa48("29866"), error?.errorCode)) === TYPEOF.STRING)) && (stryMutAct_9fa48("29869") ? error.errorCode.length <= NUM.ZERO : stryMutAct_9fa48("29868") ? error.errorCode.length >= NUM.ZERO : stryMutAct_9fa48("29867") ? true : (stryCov_9fa48("29867", "29868", "29869"), error.errorCode.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("29870")) {
              {}
            } else {
              stryCov_9fa48("29870");
              wrappedError.code = error.errorCode;
            }
          }
          if (stryMutAct_9fa48("29872") ? false : stryMutAct_9fa48("29871") ? true : (stryCov_9fa48("29871", "29872"), Number.isFinite(stryMutAct_9fa48("29873") ? error.retryAfterMs : (stryCov_9fa48("29873"), error?.retryAfterMs)))) {
            if (stryMutAct_9fa48("29874")) {
              {}
            } else {
              stryCov_9fa48("29874");
              wrappedError.retryAfterMs = Math.floor(error.retryAfterMs);
            }
          }
          if (stryMutAct_9fa48("29877") ? error?.retryable !== false : stryMutAct_9fa48("29876") ? false : stryMutAct_9fa48("29875") ? true : (stryCov_9fa48("29875", "29876", "29877"), (stryMutAct_9fa48("29878") ? error.retryable : (stryCov_9fa48("29878"), error?.retryable)) === (stryMutAct_9fa48("29879") ? true : (stryCov_9fa48("29879"), false)))) {
            if (stryMutAct_9fa48("29880")) {
              {}
            } else {
              stryCov_9fa48("29880");
              wrappedError.retryable = stryMutAct_9fa48("29881") ? true : (stryCov_9fa48("29881"), false);
            }
          }
          if (stryMutAct_9fa48("29884") ? error?.publicationDiagnostics || typeof error.publicationDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("29883") ? false : stryMutAct_9fa48("29882") ? true : (stryCov_9fa48("29882", "29883", "29884"), (stryMutAct_9fa48("29885") ? error.publicationDiagnostics : (stryCov_9fa48("29885"), error?.publicationDiagnostics)) && (stryMutAct_9fa48("29887") ? typeof error.publicationDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("29886") ? true : (stryCov_9fa48("29886", "29887"), typeof error.publicationDiagnostics === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("29888")) {
              {}
            } else {
              stryCov_9fa48("29888");
              wrappedError.publicationDiagnostics = error.publicationDiagnostics;
            }
          }
          logger.error(stryMutAct_9fa48("29889") ? "" : (stryCov_9fa48("29889"), 'Failed to register node in cluster'), stryMutAct_9fa48("29890") ? {} : (stryCov_9fa48("29890"), {
            nodeId: this.nodeId,
            error: wrappedError.message
          }));
          throw wrappedError;
        }
      }
    }
  }
  buildNodeRegistrationRow(now) {
    if (stryMutAct_9fa48("29891")) {
      {}
    } else {
      stryCov_9fa48("29891");
      const cpus = os.cpus();
      const totalMemoryBytes = os.totalmem();
      const totalMemoryMb = Math.floor(stryMutAct_9fa48("29892") ? totalMemoryBytes * (NUM.THOUSAND * NUM.THOUSAND) : (stryCov_9fa48("29892"), totalMemoryBytes / (stryMutAct_9fa48("29893") ? NUM.THOUSAND / NUM.THOUSAND : (stryCov_9fa48("29893"), NUM.THOUSAND * NUM.THOUSAND))));
      return stryMutAct_9fa48("29894") ? {} : (stryCov_9fa48("29894"), {
        [COLUMN.NODE_ID]: this.nodeId,
        [COLUMN.NODE_ADDRESS]: this.nodeAddress,
        [COLUMN.CPU_CORES]: cpus.length,
        [COLUMN.MEMORY_MB]: totalMemoryMb,
        [COLUMN.DISK_GB]: NUM.HUNDRED,
        [COLUMN.CPU_USAGE_PERCENT]: NUM.ZERO,
        [COLUMN.MEMORY_USAGE_PERCENT]: NUM.ZERO,
        [COLUMN.DISK_USAGE_PERCENT]: NUM.ZERO,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
        [COLUMN.CAPABILITIES]: JSON.stringify(stryMutAct_9fa48("29897") ? this.delegates.getNodeCapabilities?.() && [] : stryMutAct_9fa48("29896") ? false : stryMutAct_9fa48("29895") ? true : (stryCov_9fa48("29895", "29896", "29897"), (stryMutAct_9fa48("29898") ? this.delegates.getNodeCapabilities() : (stryCov_9fa48("29898"), this.delegates.getNodeCapabilities?.())) || (stryMutAct_9fa48("29899") ? ["Stryker was here"] : (stryCov_9fa48("29899"), [])))),
        [COLUMN.LAST_HEARTBEAT]: now,
        [COLUMN.CREATED_AT]: now
      });
    }
  }
  async resolveExistingDurableRejoinMembership(now) {
    if (stryMutAct_9fa48("29900")) {
      {}
    } else {
      stryCov_9fa48("29900");
      if (stryMutAct_9fa48("29903") ? this.getJoinLifecycleIntentType() === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY : stryMutAct_9fa48("29902") ? false : stryMutAct_9fa48("29901") ? true : (stryCov_9fa48("29901", "29902", "29903"), this.getJoinLifecycleIntentType() !== MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY)) {
        if (stryMutAct_9fa48("29904")) {
          {}
        } else {
          stryCov_9fa48("29904");
          return null;
        }
      }
      const authoritativeNodeRow = await this.readAuthoritativeDurableRejoinNodeRow();
      if (stryMutAct_9fa48("29907") ? false : stryMutAct_9fa48("29906") ? true : stryMutAct_9fa48("29905") ? authoritativeNodeRow : (stryCov_9fa48("29905", "29906", "29907"), !authoritativeNodeRow)) {
        if (stryMutAct_9fa48("29908")) {
          {}
        } else {
          stryCov_9fa48("29908");
          return null;
        }
      }
      const cachedNodeAddress = normalizeString(authoritativeNodeRow[COLUMN.NODE_ADDRESS]);
      const currentNodeAddress = normalizeString(this.nodeAddress);
      if (stryMutAct_9fa48("29911") ? cachedNodeAddress.length > NUM.ZERO && currentNodeAddress.length > NUM.ZERO || cachedNodeAddress !== currentNodeAddress : stryMutAct_9fa48("29910") ? false : stryMutAct_9fa48("29909") ? true : (stryCov_9fa48("29909", "29910", "29911"), (stryMutAct_9fa48("29913") ? cachedNodeAddress.length > NUM.ZERO || currentNodeAddress.length > NUM.ZERO : stryMutAct_9fa48("29912") ? true : (stryCov_9fa48("29912", "29913"), (stryMutAct_9fa48("29916") ? cachedNodeAddress.length <= NUM.ZERO : stryMutAct_9fa48("29915") ? cachedNodeAddress.length >= NUM.ZERO : stryMutAct_9fa48("29914") ? true : (stryCov_9fa48("29914", "29915", "29916"), cachedNodeAddress.length > NUM.ZERO)) && (stryMutAct_9fa48("29919") ? currentNodeAddress.length <= NUM.ZERO : stryMutAct_9fa48("29918") ? currentNodeAddress.length >= NUM.ZERO : stryMutAct_9fa48("29917") ? true : (stryCov_9fa48("29917", "29918", "29919"), currentNodeAddress.length > NUM.ZERO)))) && (stryMutAct_9fa48("29921") ? cachedNodeAddress === currentNodeAddress : stryMutAct_9fa48("29920") ? true : (stryCov_9fa48("29920", "29921"), cachedNodeAddress !== currentNodeAddress)))) {
        if (stryMutAct_9fa48("29922")) {
          {}
        } else {
          stryCov_9fa48("29922");
          return null;
        }
      }
      const authoritativeEndpointRow = await this.readAuthoritativeNodeEndpointRow();
      if (stryMutAct_9fa48("29925") ? false : stryMutAct_9fa48("29924") ? true : stryMutAct_9fa48("29923") ? authoritativeEndpointRow : (stryCov_9fa48("29923", "29924", "29925"), !authoritativeEndpointRow)) {
        if (stryMutAct_9fa48("29926")) {
          {}
        } else {
          stryCov_9fa48("29926");
          return null;
        }
      }
      const metaEndpointRows = await this.readAuthoritativeMetaEndpointRows();
      if (stryMutAct_9fa48("29929") ? metaEndpointRows.length === DURABLE_REJOIN_REQUIRED_SERVICE_IDS.length : stryMutAct_9fa48("29928") ? false : stryMutAct_9fa48("29927") ? true : (stryCov_9fa48("29927", "29928", "29929"), metaEndpointRows.length !== DURABLE_REJOIN_REQUIRED_SERVICE_IDS.length)) {
        if (stryMutAct_9fa48("29930")) {
          {}
        } else {
          stryCov_9fa48("29930");
          return null;
        }
      }
      const reusedNodeRow = stryMutAct_9fa48("29931") ? {} : (stryCov_9fa48("29931"), {
        ...authoritativeNodeRow,
        [COLUMN.STATUS]: stryMutAct_9fa48("29934") ? authoritativeNodeRow[COLUMN.STATUS] && SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("29933") ? false : stryMutAct_9fa48("29932") ? true : (stryCov_9fa48("29932", "29933", "29934"), authoritativeNodeRow[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE),
        [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
        [COLUMN.LAST_HEARTBEAT]: now,
        [COLUMN.READY_LEASE_EXPIRES_AT]: null
      });
      return stryMutAct_9fa48("29935") ? {} : (stryCov_9fa48("29935"), {
        nodeRow: reusedNodeRow,
        endpointRow: authoritativeEndpointRow,
        metaEndpointRows,
        resolution: stryMutAct_9fa48("29936") ? {} : (stryCov_9fa48("29936"), {
          source: stryMutAct_9fa48("29937") ? "" : (stryCov_9fa48("29937"), 'durable_rejoin_existing_membership')
        }),
        reusedExistingMembership: stryMutAct_9fa48("29938") ? false : (stryCov_9fa48("29938"), true)
      });
    }
  }
  async refreshExistingDurableRejoinMembership(existingMembership) {
    if (stryMutAct_9fa48("29939")) {
      {}
    } else {
      stryCov_9fa48("29939");
      const nodeRow = stryMutAct_9fa48("29942") ? existingMembership?.nodeRow && null : stryMutAct_9fa48("29941") ? false : stryMutAct_9fa48("29940") ? true : (stryCov_9fa48("29940", "29941", "29942"), (stryMutAct_9fa48("29943") ? existingMembership.nodeRow : (stryCov_9fa48("29943"), existingMembership?.nodeRow)) || null);
      const refreshResult = await this.upsertSystemTableRowWithRetry(TABLES.NODES, nodeRow, stryMutAct_9fa48("29944") ? {} : (stryCov_9fa48("29944"), {
        admissionTarget: stryMutAct_9fa48("29945") ? "" : (stryCov_9fa48("29945"), 'durable rejoin membership refresh')
      }));
      if (stryMutAct_9fa48("29948") ? false : stryMutAct_9fa48("29947") ? true : stryMutAct_9fa48("29946") ? refreshResult?.success : (stryCov_9fa48("29946", "29947", "29948"), !(stryMutAct_9fa48("29949") ? refreshResult.success : (stryCov_9fa48("29949"), refreshResult?.success)))) {
        if (stryMutAct_9fa48("29950")) {
          {}
        } else {
          stryCov_9fa48("29950");
          throw new Error((stryMutAct_9fa48("29951") ? `` : (stryCov_9fa48("29951"), `Failed to refresh durable rejoin membership: `)) + (stryMutAct_9fa48("29952") ? `` : (stryCov_9fa48("29952"), `${stryMutAct_9fa48("29953") ? refreshResult.error : (stryCov_9fa48("29953"), refreshResult?.error)}`)));
        }
      }
      return refreshResult;
    }
  }
  activateExistingDurableRejoinMembership(existingMembership) {
    if (stryMutAct_9fa48("29954")) {
      {}
    } else {
      stryCov_9fa48("29954");
      if (stryMutAct_9fa48("29957") ? !existingMembership && typeof existingMembership !== TYPEOF.OBJECT : stryMutAct_9fa48("29956") ? false : stryMutAct_9fa48("29955") ? true : (stryCov_9fa48("29955", "29956", "29957"), (stryMutAct_9fa48("29958") ? existingMembership : (stryCov_9fa48("29958"), !existingMembership)) || (stryMutAct_9fa48("29960") ? typeof existingMembership === TYPEOF.OBJECT : stryMutAct_9fa48("29959") ? false : (stryCov_9fa48("29959", "29960"), typeof existingMembership !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("29961")) {
          {}
        } else {
          stryCov_9fa48("29961");
          return;
        }
      }
      this.seedJoinTimeCacheRow(TABLES.NODES, existingMembership.nodeRow);
      this.seedJoinTimeCacheRow(TABLES.NODE_ENDPOINTS, existingMembership.endpointRow);
      for (const metaEndpointRow of stryMutAct_9fa48("29964") ? existingMembership.metaEndpointRows && [] : stryMutAct_9fa48("29963") ? false : stryMutAct_9fa48("29962") ? true : (stryCov_9fa48("29962", "29963", "29964"), existingMembership.metaEndpointRows || (stryMutAct_9fa48("29965") ? ["Stryker was here"] : (stryCov_9fa48("29965"), [])))) {
        if (stryMutAct_9fa48("29966")) {
          {}
        } else {
          stryCov_9fa48("29966");
          this.seedJoinTimeCacheRow(TABLES.SERVICE_ENDPOINTS, metaEndpointRow);
        }
      }
    }
  }
  getJoinLifecycleIntentType() {
    if (stryMutAct_9fa48("29967")) {
      {}
    } else {
      stryCov_9fa48("29967");
      const joinLifecycleIntentType = stryMutAct_9fa48("29968") ? this.delegates.getJoinLifecycleIntentType() : (stryCov_9fa48("29968"), this.delegates.getJoinLifecycleIntentType?.());
      if (stryMutAct_9fa48("29971") ? typeof joinLifecycleIntentType === TYPEOF.STRING || joinLifecycleIntentType.length > NUM.ZERO : stryMutAct_9fa48("29970") ? false : stryMutAct_9fa48("29969") ? true : (stryCov_9fa48("29969", "29970", "29971"), (stryMutAct_9fa48("29973") ? typeof joinLifecycleIntentType !== TYPEOF.STRING : stryMutAct_9fa48("29972") ? true : (stryCov_9fa48("29972", "29973"), typeof joinLifecycleIntentType === TYPEOF.STRING)) && (stryMutAct_9fa48("29976") ? joinLifecycleIntentType.length <= NUM.ZERO : stryMutAct_9fa48("29975") ? joinLifecycleIntentType.length >= NUM.ZERO : stryMutAct_9fa48("29974") ? true : (stryCov_9fa48("29974", "29975", "29976"), joinLifecycleIntentType.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("29977")) {
          {}
        } else {
          stryCov_9fa48("29977");
          return joinLifecycleIntentType;
        }
      }
      return resolveMembershipJoinIntentType(stryMutAct_9fa48("29978") ? this.delegates.getJoinStartupMode() : (stryCov_9fa48("29978"), this.delegates.getJoinStartupMode?.()));
    }
  }
  getAuthoritativeControlPlaneView() {
    if (stryMutAct_9fa48("29979")) {
      {}
    } else {
      stryCov_9fa48("29979");
      if (stryMutAct_9fa48("29981") ? false : stryMutAct_9fa48("29980") ? true : (stryCov_9fa48("29980", "29981"), this.authoritativeControlPlaneView)) {
        if (stryMutAct_9fa48("29982")) {
          {}
        } else {
          stryCov_9fa48("29982");
          this.authoritativeControlPlaneView.syncOwnerDependencies(stryMutAct_9fa48("29983") ? {} : (stryCov_9fa48("29983"), {
            cdcIntegrationService: stryMutAct_9fa48("29984") ? this.delegates.getCdcIntegrationService() : (stryCov_9fa48("29984"), this.delegates.getCdcIntegrationService?.()),
            messageRouter: stryMutAct_9fa48("29987") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("29986") ? false : stryMutAct_9fa48("29985") ? true : (stryCov_9fa48("29985", "29986", "29987"), (stryMutAct_9fa48("29988") ? this.delegates.getMessageRouter() : (stryCov_9fa48("29988"), this.delegates.getMessageRouter?.())) || null)
          }));
          return this.authoritativeControlPlaneView;
        }
      }
      const cdcIntegrationService = stryMutAct_9fa48("29991") ? this.delegates.getCdcIntegrationService?.() && null : stryMutAct_9fa48("29990") ? false : stryMutAct_9fa48("29989") ? true : (stryCov_9fa48("29989", "29990", "29991"), (stryMutAct_9fa48("29992") ? this.delegates.getCdcIntegrationService() : (stryCov_9fa48("29992"), this.delegates.getCdcIntegrationService?.())) || null);
      if (stryMutAct_9fa48("29995") ? false : stryMutAct_9fa48("29994") ? true : stryMutAct_9fa48("29993") ? cdcIntegrationService : (stryCov_9fa48("29993", "29994", "29995"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("29996")) {
          {}
        } else {
          stryCov_9fa48("29996");
          return null;
        }
      }
      this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView(stryMutAct_9fa48("29997") ? {} : (stryCov_9fa48("29997"), {
        nodeId: stryMutAct_9fa48("30000") ? this.delegates.getSeedNodeId?.() && this.nodeId : stryMutAct_9fa48("29999") ? false : stryMutAct_9fa48("29998") ? true : (stryCov_9fa48("29998", "29999", "30000"), (stryMutAct_9fa48("30001") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("30001"), this.delegates.getSeedNodeId?.())) || this.nodeId),
        cdcIntegrationService,
        messageRouter: stryMutAct_9fa48("30004") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("30003") ? false : stryMutAct_9fa48("30002") ? true : (stryCov_9fa48("30002", "30003", "30004"), (stryMutAct_9fa48("30005") ? this.delegates.getMessageRouter() : (stryCov_9fa48("30005"), this.delegates.getMessageRouter?.())) || null)
      }));
      return this.authoritativeControlPlaneView;
    }
  }
  async readAuthoritativeRows(tableName, sql, params = stryMutAct_9fa48("30006") ? ["Stryker was here"] : (stryCov_9fa48("30006"), [])) {
    if (stryMutAct_9fa48("30007")) {
      {}
    } else {
      stryCov_9fa48("30007");
      const view = this.getAuthoritativeControlPlaneView();
      if (stryMutAct_9fa48("30010") ? false : stryMutAct_9fa48("30009") ? true : stryMutAct_9fa48("30008") ? view?.canRead() : (stryCov_9fa48("30008", "30009", "30010"), !(stryMutAct_9fa48("30011") ? view.canRead() : (stryCov_9fa48("30011"), view?.canRead())))) {
        if (stryMutAct_9fa48("30012")) {
          {}
        } else {
          stryCov_9fa48("30012");
          return stryMutAct_9fa48("30013") ? ["Stryker was here"] : (stryCov_9fa48("30013"), []);
        }
      }
      try {
        if (stryMutAct_9fa48("30014")) {
          {}
        } else {
          stryCov_9fa48("30014");
          const result = await view.readRows(tableName, sql, params);
          return (stryMutAct_9fa48("30017") ? result?.success === true || Array.isArray(result.rows) : stryMutAct_9fa48("30016") ? false : stryMutAct_9fa48("30015") ? true : (stryCov_9fa48("30015", "30016", "30017"), (stryMutAct_9fa48("30019") ? result?.success !== true : stryMutAct_9fa48("30018") ? true : (stryCov_9fa48("30018", "30019"), (stryMutAct_9fa48("30020") ? result.success : (stryCov_9fa48("30020"), result?.success)) === (stryMutAct_9fa48("30021") ? false : (stryCov_9fa48("30021"), true)))) && Array.isArray(result.rows))) ? result.rows : stryMutAct_9fa48("30022") ? ["Stryker was here"] : (stryCov_9fa48("30022"), []);
        }
      } catch (_error) {
        if (stryMutAct_9fa48("30023")) {
          {}
        } else {
          stryCov_9fa48("30023");
          return stryMutAct_9fa48("30024") ? ["Stryker was here"] : (stryCov_9fa48("30024"), []);
        }
      }
    }
  }
  async readAuthoritativeDurableRejoinNodeRow() {
    if (stryMutAct_9fa48("30025")) {
      {}
    } else {
      stryCov_9fa48("30025");
      const rows = await this.readAuthoritativeRows(TABLES.NODES, stryMutAct_9fa48("30026") ? `` : (stryCov_9fa48("30026"), `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`), stryMutAct_9fa48("30027") ? [] : (stryCov_9fa48("30027"), [this.nodeId]));
      return stryMutAct_9fa48("30030") ? rows.find(row => normalizeString(row?.[COLUMN.NODE_ID]) === this.nodeId) && null : stryMutAct_9fa48("30029") ? false : stryMutAct_9fa48("30028") ? true : (stryCov_9fa48("30028", "30029", "30030"), rows.find(stryMutAct_9fa48("30031") ? () => undefined : (stryCov_9fa48("30031"), row => stryMutAct_9fa48("30034") ? normalizeString(row?.[COLUMN.NODE_ID]) !== this.nodeId : stryMutAct_9fa48("30033") ? false : stryMutAct_9fa48("30032") ? true : (stryCov_9fa48("30032", "30033", "30034"), normalizeString(stryMutAct_9fa48("30035") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("30035"), row?.[COLUMN.NODE_ID])) === this.nodeId))) || null);
    }
  }
  async readAuthoritativeNodeEndpointRow() {
    if (stryMutAct_9fa48("30036")) {
      {}
    } else {
      stryCov_9fa48("30036");
      const expectedWsAddress = normalizeString(this.resolveCanonicalWsAddress());
      const rows = await this.readAuthoritativeRows(TABLES.NODE_ENDPOINTS, stryMutAct_9fa48("30037") ? `` : (stryCov_9fa48("30037"), `SELECT * FROM ${TABLES.NODE_ENDPOINTS} WHERE ${COLUMN.NODE_ID} = ?`), stryMutAct_9fa48("30038") ? [] : (stryCov_9fa48("30038"), [this.nodeId]));
      return stryMutAct_9fa48("30041") ? rows.find(row => {
        const nodeId = normalizeString(row?.[COLUMN.NODE_ID]);
        const transportType = normalizeString(row?.[COLUMN.TRANSPORT_TYPE]).toLowerCase();
        const status = normalizeString(row?.[COLUMN.STATUS]).toLowerCase();
        const address = normalizeString(row?.[COLUMN.ADDRESS]);
        return nodeId === this.nodeId && transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() && status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() && address === expectedWsAddress;
      }) && null : stryMutAct_9fa48("30040") ? false : stryMutAct_9fa48("30039") ? true : (stryCov_9fa48("30039", "30040", "30041"), rows.find(row => {
        if (stryMutAct_9fa48("30042")) {
          {}
        } else {
          stryCov_9fa48("30042");
          const nodeId = normalizeString(stryMutAct_9fa48("30043") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("30043"), row?.[COLUMN.NODE_ID]));
          const transportType = stryMutAct_9fa48("30044") ? normalizeString(row?.[COLUMN.TRANSPORT_TYPE]).toUpperCase() : (stryCov_9fa48("30044"), normalizeString(stryMutAct_9fa48("30045") ? row[COLUMN.TRANSPORT_TYPE] : (stryCov_9fa48("30045"), row?.[COLUMN.TRANSPORT_TYPE])).toLowerCase());
          const status = stryMutAct_9fa48("30046") ? normalizeString(row?.[COLUMN.STATUS]).toUpperCase() : (stryCov_9fa48("30046"), normalizeString(stryMutAct_9fa48("30047") ? row[COLUMN.STATUS] : (stryCov_9fa48("30047"), row?.[COLUMN.STATUS])).toLowerCase());
          const address = normalizeString(stryMutAct_9fa48("30048") ? row[COLUMN.ADDRESS] : (stryCov_9fa48("30048"), row?.[COLUMN.ADDRESS]));
          return stryMutAct_9fa48("30051") ? nodeId === this.nodeId && transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() && status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() || address === expectedWsAddress : stryMutAct_9fa48("30050") ? false : stryMutAct_9fa48("30049") ? true : (stryCov_9fa48("30049", "30050", "30051"), (stryMutAct_9fa48("30053") ? nodeId === this.nodeId && transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() || status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("30052") ? true : (stryCov_9fa48("30052", "30053"), (stryMutAct_9fa48("30055") ? nodeId === this.nodeId || transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() : stryMutAct_9fa48("30054") ? true : (stryCov_9fa48("30054", "30055"), (stryMutAct_9fa48("30057") ? nodeId !== this.nodeId : stryMutAct_9fa48("30056") ? true : (stryCov_9fa48("30056", "30057"), nodeId === this.nodeId)) && (stryMutAct_9fa48("30059") ? transportType !== String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() : stryMutAct_9fa48("30058") ? true : (stryCov_9fa48("30058", "30059"), transportType === (stryMutAct_9fa48("30060") ? String(TRANSPORT_TYPE.WEBSOCKET).toUpperCase() : (stryCov_9fa48("30060"), String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase())))))) && (stryMutAct_9fa48("30062") ? status !== String(ENDPOINT_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("30061") ? true : (stryCov_9fa48("30061", "30062"), status === (stryMutAct_9fa48("30063") ? String(ENDPOINT_STATUS.ACTIVE).toUpperCase() : (stryCov_9fa48("30063"), String(ENDPOINT_STATUS.ACTIVE).toLowerCase())))))) && (stryMutAct_9fa48("30065") ? address !== expectedWsAddress : stryMutAct_9fa48("30064") ? true : (stryCov_9fa48("30064", "30065"), address === expectedWsAddress)));
        }
      }) || null);
    }
  }
  async readAuthoritativeMetaEndpointRows() {
    if (stryMutAct_9fa48("30066")) {
      {}
    } else {
      stryCov_9fa48("30066");
      const rows = await this.readAuthoritativeRows(TABLES.SERVICE_ENDPOINTS, stryMutAct_9fa48("30067") ? `` : (stryCov_9fa48("30067"), `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS} WHERE ${COLUMN.NODE_ID} = ?`), stryMutAct_9fa48("30068") ? [] : (stryCov_9fa48("30068"), [this.nodeId]));
      const rowsByServiceId = new Map();
      for (const row of rows) {
        if (stryMutAct_9fa48("30069")) {
          {}
        } else {
          stryCov_9fa48("30069");
          const nodeId = normalizeString(stryMutAct_9fa48("30070") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("30070"), row?.[COLUMN.NODE_ID]));
          const serviceId = normalizeString(stryMutAct_9fa48("30071") ? row[COLUMN.SERVICE_ID] : (stryCov_9fa48("30071"), row?.[COLUMN.SERVICE_ID]));
          if (stryMutAct_9fa48("30074") ? (nodeId !== this.nodeId || !DURABLE_REJOIN_REQUIRED_SERVICE_IDS.includes(serviceId)) && rowsByServiceId.has(serviceId) : stryMutAct_9fa48("30073") ? false : stryMutAct_9fa48("30072") ? true : (stryCov_9fa48("30072", "30073", "30074"), (stryMutAct_9fa48("30076") ? nodeId !== this.nodeId && !DURABLE_REJOIN_REQUIRED_SERVICE_IDS.includes(serviceId) : stryMutAct_9fa48("30075") ? false : (stryCov_9fa48("30075", "30076"), (stryMutAct_9fa48("30078") ? nodeId === this.nodeId : stryMutAct_9fa48("30077") ? false : (stryCov_9fa48("30077", "30078"), nodeId !== this.nodeId)) || (stryMutAct_9fa48("30079") ? DURABLE_REJOIN_REQUIRED_SERVICE_IDS.includes(serviceId) : (stryCov_9fa48("30079"), !DURABLE_REJOIN_REQUIRED_SERVICE_IDS.includes(serviceId))))) || rowsByServiceId.has(serviceId))) {
            if (stryMutAct_9fa48("30080")) {
              {}
            } else {
              stryCov_9fa48("30080");
              continue;
            }
          }
          rowsByServiceId.set(serviceId, row);
        }
      }
      return stryMutAct_9fa48("30081") ? DURABLE_REJOIN_REQUIRED_SERVICE_IDS.map(serviceId => rowsByServiceId.get(serviceId) || null) : (stryCov_9fa48("30081"), DURABLE_REJOIN_REQUIRED_SERVICE_IDS.map(stryMutAct_9fa48("30082") ? () => undefined : (stryCov_9fa48("30082"), serviceId => stryMutAct_9fa48("30085") ? rowsByServiceId.get(serviceId) && null : stryMutAct_9fa48("30084") ? false : stryMutAct_9fa48("30083") ? true : (stryCov_9fa48("30083", "30084", "30085"), rowsByServiceId.get(serviceId) || null))).filter(Boolean));
    }
  }
  resolveCanonicalWsAddress() {
    if (stryMutAct_9fa48("30086")) {
      {}
    } else {
      stryCov_9fa48("30086");
      return stryMutAct_9fa48("30089") ? (this.advertisedNodeWsAddress || resolveAdvertisedWebSocketAddress({
        nodeAddress: this.nodeAddress,
        wsPort: this.delegates.getWsPort?.() || null
      })) && this.nodeAddress : stryMutAct_9fa48("30088") ? false : stryMutAct_9fa48("30087") ? true : (stryCov_9fa48("30087", "30088", "30089"), (stryMutAct_9fa48("30091") ? this.advertisedNodeWsAddress && resolveAdvertisedWebSocketAddress({
        nodeAddress: this.nodeAddress,
        wsPort: this.delegates.getWsPort?.() || null
      }) : stryMutAct_9fa48("30090") ? false : (stryCov_9fa48("30090", "30091"), this.advertisedNodeWsAddress || resolveAdvertisedWebSocketAddress(stryMutAct_9fa48("30092") ? {} : (stryCov_9fa48("30092"), {
        nodeAddress: this.nodeAddress,
        wsPort: stryMutAct_9fa48("30095") ? this.delegates.getWsPort?.() && null : stryMutAct_9fa48("30094") ? false : stryMutAct_9fa48("30093") ? true : (stryCov_9fa48("30093", "30094", "30095"), (stryMutAct_9fa48("30096") ? this.delegates.getWsPort() : (stryCov_9fa48("30096"), this.delegates.getWsPort?.())) || null)
      })))) || this.nodeAddress);
    }
  }
  async registerNodeEndpoint(now) {
    if (stryMutAct_9fa48("30097")) {
      {}
    } else {
      stryCov_9fa48("30097");
      const logger = this.delegates.getLogger();
      logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERING, stryMutAct_9fa48("30098") ? {} : (stryCov_9fa48("30098"), {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress
      }));
      const endpointId = stryMutAct_9fa48("30099") ? `` : (stryCov_9fa48("30099"), `ep-${this.nodeId}-ws`);
      const canonicalWsAddress = this.resolveCanonicalWsAddress();
      const endpointData = stryMutAct_9fa48("30100") ? {} : (stryCov_9fa48("30100"), {
        [COLUMN.ENDPOINT_ID]: endpointId,
        [COLUMN.NODE_ID]: this.nodeId,
        [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
        [COLUMN.ADDRESS]: canonicalWsAddress,
        [COLUMN.PRIORITY]: NUM.ZERO,
        [COLUMN.METADATA]: JSON.stringify({}),
        [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
        [COLUMN.CREATED_AT]: now,
        [COLUMN.UPDATED_AT]: now
      });
      const endpointResult = await this.upsertSystemTableRowWithRetry(TABLES.NODE_ENDPOINTS, endpointData, stryMutAct_9fa48("30101") ? {} : (stryCov_9fa48("30101"), {
        admissionTarget: stryMutAct_9fa48("30102") ? "" : (stryCov_9fa48("30102"), 'node websocket endpoint publication')
      }));
      if (stryMutAct_9fa48("30105") ? false : stryMutAct_9fa48("30104") ? true : stryMutAct_9fa48("30103") ? endpointResult?.success : (stryCov_9fa48("30103", "30104", "30105"), !(stryMutAct_9fa48("30106") ? endpointResult.success : (stryCov_9fa48("30106"), endpointResult?.success)))) {
        if (stryMutAct_9fa48("30107")) {
          {}
        } else {
          stryCov_9fa48("30107");
          throw new Error(stryMutAct_9fa48("30108") ? `` : (stryCov_9fa48("30108"), `Failed to register endpoint: ${stryMutAct_9fa48("30109") ? endpointResult.error : (stryCov_9fa48("30109"), endpointResult?.error)}`));
        }
      }
      logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERED, stryMutAct_9fa48("30110") ? {} : (stryCov_9fa48("30110"), {
        nodeId: this.nodeId,
        endpointId,
        transportType: TRANSPORT_TYPE.WEBSOCKET,
        address: canonicalWsAddress
      }));
      return endpointData;
    }
  }
  async registerMetaServiceEndpoints() {
    if (stryMutAct_9fa48("30111")) {
      {}
    } else {
      stryCov_9fa48("30111");
      const logger = this.delegates.getLogger();
      try {
        if (stryMutAct_9fa48("30112")) {
          {}
        } else {
          stryCov_9fa48("30112");
          const endpointRows = stryMutAct_9fa48("30113") ? ["Stryker was here"] : (stryCov_9fa48("30113"), []);
          await registerBuiltInMetaServiceEndpoints(stryMutAct_9fa48("30114") ? {} : (stryCov_9fa48("30114"), {
            upsertRow: async (tableName, row) => {
              if (stryMutAct_9fa48("30115")) {
                {}
              } else {
                stryCov_9fa48("30115");
                endpointRows.push(row);
                return this.upsertSystemTableRowWithRetry(tableName, row, stryMutAct_9fa48("30116") ? {} : (stryCov_9fa48("30116"), {
                  admissionTarget: stryMutAct_9fa48("30117") ? "" : (stryCov_9fa48("30117"), 'built-in meta service endpoint publication')
                }));
              }
            },
            nodeId: this.nodeId,
            nodeAddress: this.nodeAddress,
            advertisedNodeWsAddress: this.advertisedNodeWsAddress,
            wsPort: stryMutAct_9fa48("30118") ? this.delegates.getWsPort() : (stryCov_9fa48("30118"), this.delegates.getWsPort?.())
          }));
          return endpointRows;
        }
      } catch (error) {
        if (stryMutAct_9fa48("30119")) {
          {}
        } else {
          stryCov_9fa48("30119");
          logger.error(LOG_META_ENDPOINT_REGISTER_FAILED, stryMutAct_9fa48("30120") ? {} : (stryCov_9fa48("30120"), {
            nodeId: this.nodeId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }
  async publishNodeMembershipViaHeartbeat(rowData) {
    if (stryMutAct_9fa48("30121")) {
      {}
    } else {
      stryCov_9fa48("30121");
      const heartbeatService = stryMutAct_9fa48("30124") ? this.delegates.getHeartbeatService?.() && null : stryMutAct_9fa48("30123") ? false : stryMutAct_9fa48("30122") ? true : (stryCov_9fa48("30122", "30123", "30124"), (stryMutAct_9fa48("30125") ? this.delegates.getHeartbeatService() : (stryCov_9fa48("30125"), this.delegates.getHeartbeatService?.())) || null);
      if (stryMutAct_9fa48("30128") ? !hasFunction(heartbeatService?.writeNodeHeartbeat) && !hasFunction(heartbeatService?.nodeStateReporter) : stryMutAct_9fa48("30127") ? false : stryMutAct_9fa48("30126") ? true : (stryCov_9fa48("30126", "30127", "30128"), (stryMutAct_9fa48("30129") ? hasFunction(heartbeatService?.writeNodeHeartbeat) : (stryCov_9fa48("30129"), !hasFunction(stryMutAct_9fa48("30130") ? heartbeatService.writeNodeHeartbeat : (stryCov_9fa48("30130"), heartbeatService?.writeNodeHeartbeat)))) || (stryMutAct_9fa48("30131") ? hasFunction(heartbeatService?.nodeStateReporter) : (stryCov_9fa48("30131"), !hasFunction(stryMutAct_9fa48("30132") ? heartbeatService.nodeStateReporter : (stryCov_9fa48("30132"), heartbeatService?.nodeStateReporter)))))) {
        if (stryMutAct_9fa48("30133")) {
          {}
        } else {
          stryCov_9fa48("30133");
          return null;
        }
      }
      const now = Number.isFinite(stryMutAct_9fa48("30134") ? rowData[COLUMN.LAST_HEARTBEAT] : (stryCov_9fa48("30134"), rowData?.[COLUMN.LAST_HEARTBEAT])) ? rowData[COLUMN.LAST_HEARTBEAT] : this.delegates.getNow()();
      const queryTimeoutMs = stryMutAct_9fa48("30135") ? Math.min(NUM.ONE, this.getJoinAdmissionWriteRetryTimeoutMs()) : (stryCov_9fa48("30135"), Math.max(NUM.ONE, this.getJoinAdmissionWriteRetryTimeoutMs()));
      await heartbeatService.writeNodeHeartbeat(rowData, stryMutAct_9fa48("30138") ? this.delegates.getNodeCapabilities?.() && null : stryMutAct_9fa48("30137") ? false : stryMutAct_9fa48("30136") ? true : (stryCov_9fa48("30136", "30137", "30138"), (stryMutAct_9fa48("30139") ? this.delegates.getNodeCapabilities() : (stryCov_9fa48("30139"), this.delegates.getNodeCapabilities?.())) || null), now, queryTimeoutMs);
      return stryMutAct_9fa48("30140") ? {} : (stryCov_9fa48("30140"), {
        success: stryMutAct_9fa48("30141") ? false : (stryCov_9fa48("30141"), true),
        publicationPath: stryMutAct_9fa48("30142") ? "" : (stryCov_9fa48("30142"), 'node_state_reporter')
      });
    }
  }
  async upsertSystemTableRow(tableName, rowData) {
    if (stryMutAct_9fa48("30143")) {
      {}
    } else {
      stryCov_9fa48("30143");
      if (stryMutAct_9fa48("30146") ? tableName !== TABLES.NODES : stryMutAct_9fa48("30145") ? false : stryMutAct_9fa48("30144") ? true : (stryCov_9fa48("30144", "30145", "30146"), tableName === TABLES.NODES)) {
        if (stryMutAct_9fa48("30147")) {
          {}
        } else {
          stryCov_9fa48("30147");
          const heartbeatPublicationResult = await this.publishNodeMembershipViaHeartbeat(rowData);
          if (stryMutAct_9fa48("30149") ? false : stryMutAct_9fa48("30148") ? true : (stryCov_9fa48("30148", "30149"), heartbeatPublicationResult)) {
            if (stryMutAct_9fa48("30150")) {
              {}
            } else {
              stryCov_9fa48("30150");
              return heartbeatPublicationResult;
            }
          }
        }
      }
      const cdcIntegrationService = this.delegates.getCdcIntegrationService();
      const upsertOptions = this.getJoinTimeUpsertOptions();
      if (stryMutAct_9fa48("30152") ? false : stryMutAct_9fa48("30151") ? true : (stryCov_9fa48("30151", "30152"), hasFunction(stryMutAct_9fa48("30153") ? cdcIntegrationService.upsertSystemTableRow : (stryCov_9fa48("30153"), cdcIntegrationService?.upsertSystemTableRow)))) {
        if (stryMutAct_9fa48("30154")) {
          {}
        } else {
          stryCov_9fa48("30154");
          return cdcIntegrationService.upsertSystemTableRow(tableName, rowData, upsertOptions);
        }
      }
      const columns = Object.keys(rowData);
      const placeholders = columns.map(stryMutAct_9fa48("30155") ? () => undefined : (stryCov_9fa48("30155"), () => stryMutAct_9fa48("30156") ? "" : (stryCov_9fa48("30156"), '?'))).join(stryMutAct_9fa48("30157") ? "" : (stryCov_9fa48("30157"), ', '));
      const sql = (stryMutAct_9fa48("30158") ? `` : (stryCov_9fa48("30158"), `INSERT INTO ${tableName} `)) + (stryMutAct_9fa48("30159") ? `` : (stryCov_9fa48("30159"), `(${columns.join(stryMutAct_9fa48("30160") ? "" : (stryCov_9fa48("30160"), ', '))}) VALUES (${placeholders})`));
      const params = columns.map(stryMutAct_9fa48("30161") ? () => undefined : (stryCov_9fa48("30161"), column => rowData[column]));
      return cdcIntegrationService.sqlQueryEngine.executeQuery(sql, params, upsertOptions);
    }
  }
  async upsertSystemTableRowWithRetry(tableName, rowData, options = {}) {
    if (stryMutAct_9fa48("30162")) {
      {}
    } else {
      stryCov_9fa48("30162");
      return runRetryableControlPlaneWrite(stryMutAct_9fa48("30163") ? () => undefined : (stryCov_9fa48("30163"), () => this.upsertSystemTableRow(tableName, rowData)), stryMutAct_9fa48("30164") ? {} : (stryCov_9fa48("30164"), {
        timeoutMs: this.getJoinAdmissionWriteRetryTimeoutMs(),
        now: stryMutAct_9fa48("30165") ? () => undefined : (stryCov_9fa48("30165"), () => this.delegates.getNow()()),
        onRetry: ({
          attempt,
          delayMs,
          remainingMs,
          retryAfterMs,
          resultOrError
        }) => {
          if (stryMutAct_9fa48("30166")) {
            {}
          } else {
            stryCov_9fa48("30166");
            this.delegates.getLogger().warn(LOG_JOIN_ADMISSION_WRITE_RETRY, stryMutAct_9fa48("30167") ? {} : (stryCov_9fa48("30167"), {
              nodeId: this.nodeId,
              tableName,
              attempt,
              retryAfterMs,
              delayMs,
              remainingMs,
              admissionTarget: stryMutAct_9fa48("30170") ? options.admissionTarget && null : stryMutAct_9fa48("30169") ? false : stryMutAct_9fa48("30168") ? true : (stryCov_9fa48("30168", "30169", "30170"), options.admissionTarget || null),
              error: stryMutAct_9fa48("30173") ? (resultOrError?.error || resultOrError?.message) && 'retryable join admission write failure' : stryMutAct_9fa48("30172") ? false : stryMutAct_9fa48("30171") ? true : (stryCov_9fa48("30171", "30172", "30173"), (stryMutAct_9fa48("30175") ? resultOrError?.error && resultOrError?.message : stryMutAct_9fa48("30174") ? false : (stryCov_9fa48("30174", "30175"), (stryMutAct_9fa48("30176") ? resultOrError.error : (stryCov_9fa48("30176"), resultOrError?.error)) || (stryMutAct_9fa48("30177") ? resultOrError.message : (stryCov_9fa48("30177"), resultOrError?.message)))) || (stryMutAct_9fa48("30178") ? "" : (stryCov_9fa48("30178"), 'retryable join admission write failure')))
            }));
          }
        },
        sleep: stryMutAct_9fa48("30179") ? () => undefined : (stryCov_9fa48("30179"), delayMs => this.sleep(delayMs))
      }));
    }
  }
  getJoinTimeUpsertOptions() {
    if (stryMutAct_9fa48("30180")) {
      {}
    } else {
      stryCov_9fa48("30180");
      const options = stryMutAct_9fa48("30181") ? {} : (stryCov_9fa48("30181"), {
        deliveryPriority: stryMutAct_9fa48("30182") ? "" : (stryCov_9fa48("30182"), 'critical')
      });
      if (stryMutAct_9fa48("30185") ? this.delegates.getCdcSubscriptionsActive?.() === true : stryMutAct_9fa48("30184") ? false : stryMutAct_9fa48("30183") ? true : (stryCov_9fa48("30183", "30184", "30185"), (stryMutAct_9fa48("30186") ? this.delegates.getCdcSubscriptionsActive() : (stryCov_9fa48("30186"), this.delegates.getCdcSubscriptionsActive?.())) !== (stryMutAct_9fa48("30187") ? false : (stryCov_9fa48("30187"), true)))) {
        if (stryMutAct_9fa48("30188")) {
          {}
        } else {
          stryCov_9fa48("30188");
          options.skipCacheWait = stryMutAct_9fa48("30189") ? false : (stryCov_9fa48("30189"), true);
        }
      }
      return options;
    }
  }
  seedJoinTimeCacheRow(tableName, rowData) {
    if (stryMutAct_9fa48("30190")) {
      {}
    } else {
      stryCov_9fa48("30190");
      if (stryMutAct_9fa48("30193") ? !rowData && typeof rowData !== TYPEOF.OBJECT : stryMutAct_9fa48("30192") ? false : stryMutAct_9fa48("30191") ? true : (stryCov_9fa48("30191", "30192", "30193"), (stryMutAct_9fa48("30194") ? rowData : (stryCov_9fa48("30194"), !rowData)) || (stryMutAct_9fa48("30196") ? typeof rowData === TYPEOF.OBJECT : stryMutAct_9fa48("30195") ? false : (stryCov_9fa48("30195", "30196"), typeof rowData !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("30197")) {
          {}
        } else {
          stryCov_9fa48("30197");
          return;
        }
      }
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      if (stryMutAct_9fa48("30200") ? !systemTableCache && typeof systemTableCache.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("30199") ? false : stryMutAct_9fa48("30198") ? true : (stryCov_9fa48("30198", "30199", "30200"), (stryMutAct_9fa48("30201") ? systemTableCache : (stryCov_9fa48("30201"), !systemTableCache)) || (stryMutAct_9fa48("30203") ? typeof systemTableCache.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("30202") ? false : (stryCov_9fa48("30202", "30203"), typeof systemTableCache.applySystemTableChange !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("30204")) {
          {}
        } else {
          stryCov_9fa48("30204");
          return;
        }
      }
      void createBootstrapCacheHydrationApplier(systemTableCache)(tableName, stryMutAct_9fa48("30205") ? "" : (stryCov_9fa48("30205"), 'UPSERT'), rowData);
    }
  }
  getJoinAdmissionWriteRetryTimeoutMs() {
    if (stryMutAct_9fa48("30206")) {
      {}
    } else {
      stryCov_9fa48("30206");
      const configured = stryMutAct_9fa48("30208") ? this.delegates.getConfig()?.joinAdmissionWriteRetryTimeoutMs : stryMutAct_9fa48("30207") ? this.delegates.getConfig?.().joinAdmissionWriteRetryTimeoutMs : (stryCov_9fa48("30207", "30208"), this.delegates.getConfig?.()?.joinAdmissionWriteRetryTimeoutMs);
      if (stryMutAct_9fa48("30211") ? Number.isFinite(configured) || configured >= NUM.ZERO : stryMutAct_9fa48("30210") ? false : stryMutAct_9fa48("30209") ? true : (stryCov_9fa48("30209", "30210", "30211"), Number.isFinite(configured) && (stryMutAct_9fa48("30214") ? configured < NUM.ZERO : stryMutAct_9fa48("30213") ? configured > NUM.ZERO : stryMutAct_9fa48("30212") ? true : (stryCov_9fa48("30212", "30213", "30214"), configured >= NUM.ZERO)))) {
        if (stryMutAct_9fa48("30215")) {
          {}
        } else {
          stryCov_9fa48("30215");
          return Math.floor(configured);
        }
      }
      return JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS;
    }
  }
  async sleep(delayMs) {
    if (stryMutAct_9fa48("30216")) {
      {}
    } else {
      stryCov_9fa48("30216");
      const sleepImpl = stryMutAct_9fa48("30217") ? this.delegates.getSleep() : (stryCov_9fa48("30217"), this.delegates.getSleep?.());
      if (stryMutAct_9fa48("30219") ? false : stryMutAct_9fa48("30218") ? true : (stryCov_9fa48("30218", "30219"), hasFunction(sleepImpl))) {
        if (stryMutAct_9fa48("30220")) {
          {}
        } else {
          stryCov_9fa48("30220");
          await sleepImpl(delayMs);
          return;
        }
      }
      await new Promise(stryMutAct_9fa48("30221") ? () => undefined : (stryCov_9fa48("30221"), resolve => setTimeout(resolve, delayMs)));
    }
  }
}
export { NodeRegistrationOwner };