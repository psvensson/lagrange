/**
 * Storage Capacity Migration - backfills node storage budgets and
 * manages rollout mode transitions.
 *
 * Requirements: 12.2, 12.4, 12.5
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
import { LoggingService } from '../logging/logging-service.js';
import { COLUMN, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { BACKFILL_DEFAULT_RATIO, STORAGE_BUDGET_SOURCE, STORAGE_CAPACITY_LOG_MSG, STORAGE_CAPACITY_SUBSYSTEM } from './storage-capacity-constants.js';
const MIGRATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("141805") ? {} : (stryCov_9fa48("141805"), {
  CDC_REQUIRED: stryMutAct_9fa48("141806") ? "" : (stryCov_9fa48("141806"), 'StorageCapacityMigration requires cdcIntegrationService'),
  NODE_ROWS_REQUIRED: stryMutAct_9fa48("141807") ? "" : (stryCov_9fa48("141807"), 'backfillNodeBudgets requires an array of node rows')
}));
class StorageCapacityMigration {
  /**
   * @param {Object} options
   * @param {Object} options.cdcIntegrationService
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("141808")) {
      {}
    } else {
      stryCov_9fa48("141808");
      this.cdcIntegrationService = stryMutAct_9fa48("141811") ? options.cdcIntegrationService && null : stryMutAct_9fa48("141810") ? false : stryMutAct_9fa48("141809") ? true : (stryCov_9fa48("141809", "141810", "141811"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("141814") ? options.controlPlaneSystemTableGateway && createControlPlaneRuntimeBundle({
        getCdcIntegrationService: () => this.cdcIntegrationService
      }).controlPlaneSystemTableGateway : stryMutAct_9fa48("141813") ? false : stryMutAct_9fa48("141812") ? true : (stryCov_9fa48("141812", "141813", "141814"), options.controlPlaneSystemTableGateway || createControlPlaneRuntimeBundle(stryMutAct_9fa48("141815") ? {} : (stryCov_9fa48("141815"), {
        getCdcIntegrationService: stryMutAct_9fa48("141816") ? () => undefined : (stryCov_9fa48("141816"), () => this.cdcIntegrationService)
      })).controlPlaneSystemTableGateway);
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;
    }
  }

  /**
   * Compute deterministic backfill budget bytes from a node row.
   * Uses BACKFILL_DEFAULT_RATIO of disk_gb converted to bytes.
   *
   * @param {Object} nodeRow
   * @return {number|null} budget bytes or null if disk_gb unavailable
   */
  getBackfillBudget(nodeRow) {
    if (stryMutAct_9fa48("141817")) {
      {}
    } else {
      stryCov_9fa48("141817");
      const diskGb = Number(stryMutAct_9fa48("141818") ? nodeRow[COLUMN.DISK_GB] : (stryCov_9fa48("141818"), nodeRow?.[COLUMN.DISK_GB]));
      if (stryMutAct_9fa48("141821") ? !Number.isFinite(diskGb) && diskGb <= NUM.ZERO : stryMutAct_9fa48("141820") ? false : stryMutAct_9fa48("141819") ? true : (stryCov_9fa48("141819", "141820", "141821"), (stryMutAct_9fa48("141822") ? Number.isFinite(diskGb) : (stryCov_9fa48("141822"), !Number.isFinite(diskGb))) || (stryMutAct_9fa48("141825") ? diskGb > NUM.ZERO : stryMutAct_9fa48("141824") ? diskGb < NUM.ZERO : stryMutAct_9fa48("141823") ? false : (stryCov_9fa48("141823", "141824", "141825"), diskGb <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("141826")) {
          {}
        } else {
          stryCov_9fa48("141826");
          return null;
        }
      }
      return Math.floor(stryMutAct_9fa48("141827") ? diskGb * NUM.BYTES_PER_GIB / BACKFILL_DEFAULT_RATIO : (stryCov_9fa48("141827"), (stryMutAct_9fa48("141828") ? diskGb / NUM.BYTES_PER_GIB : (stryCov_9fa48("141828"), diskGb * NUM.BYTES_PER_GIB)) * BACKFILL_DEFAULT_RATIO));
    }
  }

  /**
   * Backfill storage budgets for nodes missing them.
   *
   * @param {Array<Object>} nodeRows - array of node row objects
   * @return {Promise<Object>} summary with backfilled and skipped counts
   */
  async backfillNodeBudgets(nodeRows) {
    if (stryMutAct_9fa48("141829")) {
      {}
    } else {
      stryCov_9fa48("141829");
      if (stryMutAct_9fa48("141832") ? false : stryMutAct_9fa48("141831") ? true : stryMutAct_9fa48("141830") ? Array.isArray(nodeRows) : (stryCov_9fa48("141830", "141831", "141832"), !Array.isArray(nodeRows))) {
        if (stryMutAct_9fa48("141833")) {
          {}
        } else {
          stryCov_9fa48("141833");
          throw new Error(MIGRATION_ERROR_MSG.NODE_ROWS_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("141836") ? false : stryMutAct_9fa48("141835") ? true : stryMutAct_9fa48("141834") ? this.cdcIntegrationService : (stryCov_9fa48("141834", "141835", "141836"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("141837")) {
          {}
        } else {
          stryCov_9fa48("141837");
          throw new Error(MIGRATION_ERROR_MSG.CDC_REQUIRED);
        }
      }
      let backfilled = NUM.ZERO;
      let skipped = NUM.ZERO;
      for (const row of nodeRows) {
        if (stryMutAct_9fa48("141838")) {
          {}
        } else {
          stryCov_9fa48("141838");
          const nodeId = row[COLUMN.NODE_ID];
          const existingBudget = row[COLUMN.STORAGE_BUDGET_BYTES];
          if (stryMutAct_9fa48("141841") ? typeof existingBudget === TYPEOF.NUMBER && Number.isFinite(existingBudget) || existingBudget > NUM.ZERO : stryMutAct_9fa48("141840") ? false : stryMutAct_9fa48("141839") ? true : (stryCov_9fa48("141839", "141840", "141841"), (stryMutAct_9fa48("141843") ? typeof existingBudget === TYPEOF.NUMBER || Number.isFinite(existingBudget) : stryMutAct_9fa48("141842") ? true : (stryCov_9fa48("141842", "141843"), (stryMutAct_9fa48("141845") ? typeof existingBudget !== TYPEOF.NUMBER : stryMutAct_9fa48("141844") ? true : (stryCov_9fa48("141844", "141845"), typeof existingBudget === TYPEOF.NUMBER)) && Number.isFinite(existingBudget))) && (stryMutAct_9fa48("141848") ? existingBudget <= NUM.ZERO : stryMutAct_9fa48("141847") ? existingBudget >= NUM.ZERO : stryMutAct_9fa48("141846") ? true : (stryCov_9fa48("141846", "141847", "141848"), existingBudget > NUM.ZERO)))) {
            if (stryMutAct_9fa48("141849")) {
              {}
            } else {
              stryCov_9fa48("141849");
              this.logger.info(STORAGE_CAPACITY_LOG_MSG.BACKFILL_SKIPPED, stryMutAct_9fa48("141850") ? {} : (stryCov_9fa48("141850"), {
                nodeId,
                existingBudget
              }));
              stryMutAct_9fa48("141851") ? skipped-- : (stryCov_9fa48("141851"), skipped++);
              continue;
            }
          }
          const budgetBytes = this.getBackfillBudget(row);
          if (stryMutAct_9fa48("141854") ? budgetBytes !== null : stryMutAct_9fa48("141853") ? false : stryMutAct_9fa48("141852") ? true : (stryCov_9fa48("141852", "141853", "141854"), budgetBytes === null)) {
            if (stryMutAct_9fa48("141855")) {
              {}
            } else {
              stryCov_9fa48("141855");
              this.logger.warn(STORAGE_CAPACITY_LOG_MSG.BACKFILL_SKIPPED, stryMutAct_9fa48("141856") ? {} : (stryCov_9fa48("141856"), {
                nodeId,
                reason: stryMutAct_9fa48("141857") ? "" : (stryCov_9fa48("141857"), 'disk_gb unavailable')
              }));
              stryMutAct_9fa48("141858") ? skipped-- : (stryCov_9fa48("141858"), skipped++);
              continue;
            }
          }
          const budgetRow = stryMutAct_9fa48("141859") ? {} : (stryCov_9fa48("141859"), {
            [COLUMN.NODE_ID]: nodeId,
            [COLUMN.STORAGE_BUDGET_BYTES]: budgetBytes,
            [COLUMN.STORAGE_BUDGET_SOURCE]: STORAGE_BUDGET_SOURCE.BACKFILL,
            [COLUMN.STORAGE_BUDGET_UPDATED_AT]: Date.now()
          });
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("141860") ? {} : (stryCov_9fa48("141860"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
            tableName: TABLES.NODES,
            row: budgetRow
          }), stryMutAct_9fa48("141861") ? {} : (stryCov_9fa48("141861"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("141862") ? "" : (stryCov_9fa48("141862"), 'critical')
          }));
          this.logger.info(STORAGE_CAPACITY_LOG_MSG.BACKFILL_APPLIED, stryMutAct_9fa48("141863") ? {} : (stryCov_9fa48("141863"), {
            nodeId,
            budgetBytes,
            source: STORAGE_BUDGET_SOURCE.BACKFILL
          }));
          stryMutAct_9fa48("141864") ? backfilled-- : (stryCov_9fa48("141864"), backfilled++);
        }
      }
      return stryMutAct_9fa48("141865") ? {} : (stryCov_9fa48("141865"), {
        backfilled,
        skipped
      });
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("141866")) {
      {}
    } else {
      stryCov_9fa48("141866");
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { StorageCapacityMigration, MIGRATION_ERROR_MSG };