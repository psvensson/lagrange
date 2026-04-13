/**
 * Node Storage Budget Service - resolves and persists node storage budgets.
 *
 * Requirements: 1.1, 1.3, 1.4, 1.5, 9.1, 9.3, 9.4
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
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import { COLUMN, NODE_STATE, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { STORAGE_BUDGET_CONFIG_KEY, STORAGE_BUDGET_SOURCE, STORAGE_BUDGET_VALIDATION, STORAGE_CAPACITY_ERROR_MSG, STORAGE_CAPACITY_LOG_MSG, STORAGE_CAPACITY_SUBSYSTEM } from './storage-capacity-constants.js';
const NODE_STORAGE_BUDGET_ERROR_MSG = Object.freeze(stryMutAct_9fa48("131384") ? {} : (stryCov_9fa48("131384"), {
  MISSING_NODE_ID: stryMutAct_9fa48("131385") ? "" : (stryCov_9fa48("131385"), 'NodeStorageBudgetService requires nodeId'),
  MISSING_CDC: stryMutAct_9fa48("131386") ? "" : (stryCov_9fa48("131386"), 'NodeStorageBudgetService requires cdcIntegrationService'),
  INVALID_NODE_ROW: stryMutAct_9fa48("131387") ? "" : (stryCov_9fa48("131387"), 'NodeStorageBudgetService requires a node row object'),
  REGISTRATION_FAILED: stryMutAct_9fa48("131388") ? "" : (stryCov_9fa48("131388"), 'Node storage budget registration failed')
}));
class NodeStorageBudgetService {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.cdcIntegrationService
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("131389")) {
      {}
    } else {
      stryCov_9fa48("131389");
      this.nodeId = stryMutAct_9fa48("131392") ? options.nodeId && null : stryMutAct_9fa48("131391") ? false : stryMutAct_9fa48("131390") ? true : (stryCov_9fa48("131390", "131391", "131392"), options.nodeId || null);
      this.cdcIntegrationService = stryMutAct_9fa48("131395") ? options.cdcIntegrationService && null : stryMutAct_9fa48("131394") ? false : stryMutAct_9fa48("131393") ? true : (stryCov_9fa48("131393", "131394", "131395"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("131398") ? options.controlPlaneSystemTableGateway && createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getCdcIntegrationService: () => this.cdcIntegrationService
      }).controlPlaneSystemTableGateway : stryMutAct_9fa48("131397") ? false : stryMutAct_9fa48("131396") ? true : (stryCov_9fa48("131396", "131397", "131398"), options.controlPlaneSystemTableGateway || createControlPlaneRuntimeBundle(stryMutAct_9fa48("131399") ? {} : (stryCov_9fa48("131399"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("131400") ? () => undefined : (stryCov_9fa48("131400"), () => this.cdcIntegrationService)
      })).controlPlaneSystemTableGateway);
      this.config = ConfigurationManager.getInstance();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;
    }
  }

  /**
   * Initialize or refresh dependencies.
   * @param {Object} options
   * @param {string} [options.nodeId]
   * @param {Object} [options.cdcIntegrationService]
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("131401")) {
      {}
    } else {
      stryCov_9fa48("131401");
      if (stryMutAct_9fa48("131403") ? false : stryMutAct_9fa48("131402") ? true : (stryCov_9fa48("131402", "131403"), options.nodeId)) {
        if (stryMutAct_9fa48("131404")) {
          {}
        } else {
          stryCov_9fa48("131404");
          this.nodeId = options.nodeId;
        }
      }
      if (stryMutAct_9fa48("131406") ? false : stryMutAct_9fa48("131405") ? true : (stryCov_9fa48("131405", "131406"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("131407")) {
          {}
        } else {
          stryCov_9fa48("131407");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("131409") ? false : stryMutAct_9fa48("131408") ? true : (stryCov_9fa48("131408", "131409"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("131410")) {
          {}
        } else {
          stryCov_9fa48("131410");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      assertCritical(this.nodeId, NODE_STORAGE_BUDGET_ERROR_MSG.MISSING_NODE_ID);
      assertCritical(this.cdcIntegrationService, NODE_STORAGE_BUDGET_ERROR_MSG.MISSING_CDC);
    }
  }

  /**
   * Resolve disk bytes from node row data.
   * @param {Object} nodeRow
   * @return {number|null}
   * @private
   */
  getDiskBytesFromNodeRow(nodeRow) {
    if (stryMutAct_9fa48("131411")) {
      {}
    } else {
      stryCov_9fa48("131411");
      const diskGb = Number(stryMutAct_9fa48("131412") ? nodeRow[COLUMN.DISK_GB] : (stryCov_9fa48("131412"), nodeRow?.[COLUMN.DISK_GB]));
      if (stryMutAct_9fa48("131415") ? !Number.isFinite(diskGb) && diskGb <= NUM.ZERO : stryMutAct_9fa48("131414") ? false : stryMutAct_9fa48("131413") ? true : (stryCov_9fa48("131413", "131414", "131415"), (stryMutAct_9fa48("131416") ? Number.isFinite(diskGb) : (stryCov_9fa48("131416"), !Number.isFinite(diskGb))) || (stryMutAct_9fa48("131419") ? diskGb > NUM.ZERO : stryMutAct_9fa48("131418") ? diskGb < NUM.ZERO : stryMutAct_9fa48("131417") ? false : (stryCov_9fa48("131417", "131418", "131419"), diskGb <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("131420")) {
          {}
        } else {
          stryCov_9fa48("131420");
          return null;
        }
      }
      return Math.floor(stryMutAct_9fa48("131421") ? diskGb / NUM.BYTES_PER_GIB : (stryCov_9fa48("131421"), diskGb * NUM.BYTES_PER_GIB));
    }
  }

  /**
   * Resolve storage budget from config and node metadata.
   * @param {Object} nodeRow
   * @return {Object}
   */
  resolveBudget(nodeRow) {
    if (stryMutAct_9fa48("131422")) {
      {}
    } else {
      stryCov_9fa48("131422");
      assertCritical(stryMutAct_9fa48("131425") ? nodeRow || typeof nodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("131424") ? false : stryMutAct_9fa48("131423") ? true : (stryCov_9fa48("131423", "131424", "131425"), nodeRow && (stryMutAct_9fa48("131427") ? typeof nodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("131426") ? true : (stryCov_9fa48("131426", "131427"), typeof nodeRow === TYPEOF.OBJECT))), NODE_STORAGE_BUDGET_ERROR_MSG.INVALID_NODE_ROW);
      const budgetBytesConfig = this.config.get(STORAGE_BUDGET_CONFIG_KEY.BUDGET_BYTES);
      const budgetRatioConfig = this.config.get(STORAGE_BUDGET_CONFIG_KEY.BUDGET_RATIO);
      const hasBudgetBytes = Number.isFinite(budgetBytesConfig);
      const hasBudgetRatio = Number.isFinite(budgetRatioConfig);
      const diskBytes = this.getDiskBytesFromNodeRow(nodeRow);
      const resolvedAt = Date.now();
      let budgetBytes = null;
      let source = null;
      let error = null;
      let warning = null;
      if (stryMutAct_9fa48("131429") ? false : stryMutAct_9fa48("131428") ? true : (stryCov_9fa48("131428", "131429"), hasBudgetBytes)) {
        if (stryMutAct_9fa48("131430")) {
          {}
        } else {
          stryCov_9fa48("131430");
          budgetBytes = Math.floor(budgetBytesConfig);
          source = STORAGE_BUDGET_SOURCE.ABSOLUTE;
          if (stryMutAct_9fa48("131432") ? false : stryMutAct_9fa48("131431") ? true : (stryCov_9fa48("131431", "131432"), hasBudgetRatio)) {
            if (stryMutAct_9fa48("131433")) {
              {}
            } else {
              stryCov_9fa48("131433");
              warning = STORAGE_CAPACITY_ERROR_MSG.BOTH_BUDGET_TYPES_PROVIDED;
            }
          }
        }
      } else if (stryMutAct_9fa48("131435") ? false : stryMutAct_9fa48("131434") ? true : (stryCov_9fa48("131434", "131435"), hasBudgetRatio)) {
        if (stryMutAct_9fa48("131436")) {
          {}
        } else {
          stryCov_9fa48("131436");
          if (stryMutAct_9fa48("131439") ? budgetRatioConfig < STORAGE_BUDGET_VALIDATION.MIN_RATIO && budgetRatioConfig > STORAGE_BUDGET_VALIDATION.MAX_RATIO : stryMutAct_9fa48("131438") ? false : stryMutAct_9fa48("131437") ? true : (stryCov_9fa48("131437", "131438", "131439"), (stryMutAct_9fa48("131442") ? budgetRatioConfig >= STORAGE_BUDGET_VALIDATION.MIN_RATIO : stryMutAct_9fa48("131441") ? budgetRatioConfig <= STORAGE_BUDGET_VALIDATION.MIN_RATIO : stryMutAct_9fa48("131440") ? false : (stryCov_9fa48("131440", "131441", "131442"), budgetRatioConfig < STORAGE_BUDGET_VALIDATION.MIN_RATIO)) || (stryMutAct_9fa48("131445") ? budgetRatioConfig <= STORAGE_BUDGET_VALIDATION.MAX_RATIO : stryMutAct_9fa48("131444") ? budgetRatioConfig >= STORAGE_BUDGET_VALIDATION.MAX_RATIO : stryMutAct_9fa48("131443") ? false : (stryCov_9fa48("131443", "131444", "131445"), budgetRatioConfig > STORAGE_BUDGET_VALIDATION.MAX_RATIO)))) {
            if (stryMutAct_9fa48("131446")) {
              {}
            } else {
              stryCov_9fa48("131446");
              error = STORAGE_CAPACITY_ERROR_MSG.RATIO_OUT_OF_RANGE;
            }
          } else if (stryMutAct_9fa48("131449") ? false : stryMutAct_9fa48("131448") ? true : stryMutAct_9fa48("131447") ? Number.isFinite(diskBytes) : (stryCov_9fa48("131447", "131448", "131449"), !Number.isFinite(diskBytes))) {
            if (stryMutAct_9fa48("131450")) {
              {}
            } else {
              stryCov_9fa48("131450");
              error = STORAGE_CAPACITY_ERROR_MSG.DISK_SIZE_UNAVAILABLE;
            }
          } else {
            if (stryMutAct_9fa48("131451")) {
              {}
            } else {
              stryCov_9fa48("131451");
              budgetBytes = Math.floor(stryMutAct_9fa48("131452") ? diskBytes / budgetRatioConfig : (stryCov_9fa48("131452"), diskBytes * budgetRatioConfig));
              source = STORAGE_BUDGET_SOURCE.RATIO;
            }
          }
        }
      } else if (stryMutAct_9fa48("131454") ? false : stryMutAct_9fa48("131453") ? true : (stryCov_9fa48("131453", "131454"), Number.isFinite(diskBytes))) {
        if (stryMutAct_9fa48("131455")) {
          {}
        } else {
          stryCov_9fa48("131455");
          budgetBytes = Math.floor(diskBytes);
          source = STORAGE_BUDGET_SOURCE.BACKFILL;
        }
      } else {
        if (stryMutAct_9fa48("131456")) {
          {}
        } else {
          stryCov_9fa48("131456");
          error = STORAGE_CAPACITY_ERROR_MSG.DISK_SIZE_UNAVAILABLE;
        }
      }
      if (stryMutAct_9fa48("131459") ? false : stryMutAct_9fa48("131458") ? true : stryMutAct_9fa48("131457") ? error : (stryCov_9fa48("131457", "131458", "131459"), !error)) {
        if (stryMutAct_9fa48("131460")) {
          {}
        } else {
          stryCov_9fa48("131460");
          if (stryMutAct_9fa48("131463") ? false : stryMutAct_9fa48("131462") ? true : stryMutAct_9fa48("131461") ? Number.isFinite(budgetBytes) : (stryCov_9fa48("131461", "131462", "131463"), !Number.isFinite(budgetBytes))) {
            if (stryMutAct_9fa48("131464")) {
              {}
            } else {
              stryCov_9fa48("131464");
              error = STORAGE_CAPACITY_ERROR_MSG.BUDGET_MALFORMED;
            }
          } else if (stryMutAct_9fa48("131468") ? budgetBytes > NUM.ZERO : stryMutAct_9fa48("131467") ? budgetBytes < NUM.ZERO : stryMutAct_9fa48("131466") ? false : stryMutAct_9fa48("131465") ? true : (stryCov_9fa48("131465", "131466", "131467", "131468"), budgetBytes <= NUM.ZERO)) {
            if (stryMutAct_9fa48("131469")) {
              {}
            } else {
              stryCov_9fa48("131469");
              error = STORAGE_CAPACITY_ERROR_MSG.BUDGET_NON_POSITIVE;
            }
          } else if (stryMutAct_9fa48("131473") ? budgetBytes >= STORAGE_BUDGET_VALIDATION.MIN_BUDGET_BYTES : stryMutAct_9fa48("131472") ? budgetBytes <= STORAGE_BUDGET_VALIDATION.MIN_BUDGET_BYTES : stryMutAct_9fa48("131471") ? false : stryMutAct_9fa48("131470") ? true : (stryCov_9fa48("131470", "131471", "131472", "131473"), budgetBytes < STORAGE_BUDGET_VALIDATION.MIN_BUDGET_BYTES)) {
            if (stryMutAct_9fa48("131474")) {
              {}
            } else {
              stryCov_9fa48("131474");
              error = STORAGE_CAPACITY_ERROR_MSG.BUDGET_TOO_SMALL;
            }
          } else if (stryMutAct_9fa48("131477") ? Number.isFinite(diskBytes) || budgetBytes > diskBytes : stryMutAct_9fa48("131476") ? false : stryMutAct_9fa48("131475") ? true : (stryCov_9fa48("131475", "131476", "131477"), Number.isFinite(diskBytes) && (stryMutAct_9fa48("131480") ? budgetBytes <= diskBytes : stryMutAct_9fa48("131479") ? budgetBytes >= diskBytes : stryMutAct_9fa48("131478") ? true : (stryCov_9fa48("131478", "131479", "131480"), budgetBytes > diskBytes)))) {
            if (stryMutAct_9fa48("131481")) {
              {}
            } else {
              stryCov_9fa48("131481");
              error = STORAGE_CAPACITY_ERROR_MSG.BUDGET_EXCEEDS_DISK;
            }
          }
        }
      }
      const isValid = stryMutAct_9fa48("131482") ? error : (stryCov_9fa48("131482"), !error);
      return stryMutAct_9fa48("131483") ? {} : (stryCov_9fa48("131483"), {
        isValid,
        budgetBytes: isValid ? budgetBytes : null,
        source: isValid ? source : null,
        resolvedAt,
        diskBytes,
        error,
        warning
      });
    }
  }

  /**
   * Build a node row with storage budget fields.
   * @param {Object} nodeRow
   * @param {Object} resolution
   * @return {Object}
   * @private
   */
  buildBudgetRow(nodeRow, resolution) {
    if (stryMutAct_9fa48("131484")) {
      {}
    } else {
      stryCov_9fa48("131484");
      const status = resolution.isValid ? stryMutAct_9fa48("131487") ? nodeRow[COLUMN.STATUS] && NODE_STATE.ACTIVE : stryMutAct_9fa48("131486") ? false : stryMutAct_9fa48("131485") ? true : (stryCov_9fa48("131485", "131486", "131487"), nodeRow[COLUMN.STATUS] || NODE_STATE.ACTIVE) : NODE_STATE.JOINING;
      return stryMutAct_9fa48("131488") ? {} : (stryCov_9fa48("131488"), {
        ...nodeRow,
        [COLUMN.STATUS]: status,
        [COLUMN.STORAGE_BUDGET_BYTES]: resolution.isValid ? resolution.budgetBytes : null,
        [COLUMN.STORAGE_BUDGET_SOURCE]: resolution.isValid ? resolution.source : null,
        [COLUMN.STORAGE_BUDGET_UPDATED_AT]: resolution.resolvedAt
      });
    }
  }

  /**
   * Resolve one startup/storage-budget projection without persisting it.
   * This keeps storage-budget ownership centralized while allowing callers
   * with different row-lifecycle owners to reuse the canonical budget fields.
   * @param {Object} nodeRow
   * @return {{budgetRow: Object, resolution: Object}}
   */
  resolveBudgetRow(nodeRow) {
    if (stryMutAct_9fa48("131489")) {
      {}
    } else {
      stryCov_9fa48("131489");
      const resolution = this.resolveBudget(nodeRow);
      return stryMutAct_9fa48("131490") ? {} : (stryCov_9fa48("131490"), {
        budgetRow: this.buildBudgetRow(nodeRow, resolution),
        resolution
      });
    }
  }

  /**
   * Resolve and persist the node storage budget in the nodes table.
   * @param {Object} options
   * @param {Object} options.nodeRow
   * @return {Promise<Object>}
   */
  async registerNodeBudget(options = {}) {
    if (stryMutAct_9fa48("131491")) {
      {}
    } else {
      stryCov_9fa48("131491");
      const nodeRow = options.nodeRow;
      const upsertOptions = (stryMutAct_9fa48("131494") ? options.upsertOptions || typeof options.upsertOptions === TYPEOF.OBJECT : stryMutAct_9fa48("131493") ? false : stryMutAct_9fa48("131492") ? true : (stryCov_9fa48("131492", "131493", "131494"), options.upsertOptions && (stryMutAct_9fa48("131496") ? typeof options.upsertOptions !== TYPEOF.OBJECT : stryMutAct_9fa48("131495") ? true : (stryCov_9fa48("131495", "131496"), typeof options.upsertOptions === TYPEOF.OBJECT)))) ? options.upsertOptions : undefined;
      assertCritical(stryMutAct_9fa48("131499") ? nodeRow || typeof nodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("131498") ? false : stryMutAct_9fa48("131497") ? true : (stryCov_9fa48("131497", "131498", "131499"), nodeRow && (stryMutAct_9fa48("131501") ? typeof nodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("131500") ? true : (stryCov_9fa48("131500", "131501"), typeof nodeRow === TYPEOF.OBJECT))), NODE_STORAGE_BUDGET_ERROR_MSG.INVALID_NODE_ROW);
      const nodeId = stryMutAct_9fa48("131504") ? this.nodeId && nodeRow[COLUMN.NODE_ID] : stryMutAct_9fa48("131503") ? false : stryMutAct_9fa48("131502") ? true : (stryCov_9fa48("131502", "131503", "131504"), this.nodeId || nodeRow[COLUMN.NODE_ID]);
      assertCritical(nodeId, NODE_STORAGE_BUDGET_ERROR_MSG.MISSING_NODE_ID);
      this.nodeId = nodeId;
      assertCritical(this.cdcIntegrationService, NODE_STORAGE_BUDGET_ERROR_MSG.MISSING_CDC);
      const {
        budgetRow,
        resolution
      } = this.resolveBudgetRow(nodeRow);
      const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("131505") ? {} : (stryCov_9fa48("131505"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.NODES,
        row: budgetRow
      }), stryMutAct_9fa48("131506") ? {} : (stryCov_9fa48("131506"), {
        ...upsertOptions,
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: stryMutAct_9fa48("131507") ? "" : (stryCov_9fa48("131507"), 'critical')
      }));
      if (stryMutAct_9fa48("131510") ? false : stryMutAct_9fa48("131509") ? true : stryMutAct_9fa48("131508") ? result?.success : (stryCov_9fa48("131508", "131509", "131510"), !(stryMutAct_9fa48("131511") ? result.success : (stryCov_9fa48("131511"), result?.success)))) {
        if (stryMutAct_9fa48("131512")) {
          {}
        } else {
          stryCov_9fa48("131512");
          throw new Error(stryMutAct_9fa48("131515") ? result?.error && NODE_STORAGE_BUDGET_ERROR_MSG.REGISTRATION_FAILED : stryMutAct_9fa48("131514") ? false : stryMutAct_9fa48("131513") ? true : (stryCov_9fa48("131513", "131514", "131515"), (stryMutAct_9fa48("131516") ? result.error : (stryCov_9fa48("131516"), result?.error)) || NODE_STORAGE_BUDGET_ERROR_MSG.REGISTRATION_FAILED));
        }
      }
      if (stryMutAct_9fa48("131518") ? false : stryMutAct_9fa48("131517") ? true : (stryCov_9fa48("131517", "131518"), resolution.isValid)) {
        if (stryMutAct_9fa48("131519")) {
          {}
        } else {
          stryCov_9fa48("131519");
          this.logger.info(STORAGE_CAPACITY_LOG_MSG.BUDGET_RESOLVED, stryMutAct_9fa48("131520") ? {} : (stryCov_9fa48("131520"), {
            nodeId,
            budgetBytes: resolution.budgetBytes,
            budgetSource: resolution.source,
            diskBytes: resolution.diskBytes,
            warning: resolution.warning
          }));
        }
      } else {
        if (stryMutAct_9fa48("131521")) {
          {}
        } else {
          stryCov_9fa48("131521");
          this.logger.warn(STORAGE_CAPACITY_LOG_MSG.BUDGET_MISSING, stryMutAct_9fa48("131522") ? {} : (stryCov_9fa48("131522"), {
            nodeId,
            error: resolution.error,
            diskBytes: resolution.diskBytes
          }));
        }
      }
      return stryMutAct_9fa48("131523") ? {} : (stryCov_9fa48("131523"), {
        result,
        budgetRow,
        resolution
      });
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("131524")) {
      {}
    } else {
      stryCov_9fa48("131524");
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { NodeStorageBudgetService };