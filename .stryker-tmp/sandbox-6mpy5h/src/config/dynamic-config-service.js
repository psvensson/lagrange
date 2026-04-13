/**
 * Dynamic Configuration Service - Manages configuration through system table.
 * Provides dynamic configuration management with watchers and hot reload.
 * Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9, 30.10
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
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { CDC_OPERATION, NUM, STRING, TYPEOF } from '../constants/index.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { CONTROL_PLANE_MUTATION_OPERATION, CONTROL_PLANE_MUTATION_OUTCOME } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { CONFIG_DEFINITIONS, CONFIG_ENV, CONFIG_ENV_REGEX, CONFIG_ENV_REPLACE, CONFIG_ERROR_MSG, CONFIG_EVENT, CONFIG_KEY, CONFIG_KEY_FRAGMENT, CONFIG_LOG_LEVELS, CONFIG_LOG_MSG, CONFIG_SEPARATOR, CONFIG_SEED_SOURCE, CONFIG_SQL, CONFIG_STATS_DEFAULT, CONFIG_SUBSYSTEM, CONFIG_TABLE_COLUMN, CONFIG_VALUE_DEFAULT, CONFIG_VALUE_TYPE } from './config-constants.js';
const CONFIG_SELECT_ALL_SQL = CONFIG_SQL.SELECT_ALL;
const CONFIG_SELECT_BY_KEY_SQL = CONFIG_SQL.SELECT_BY_KEY;
const ConfigValueType = CONFIG_VALUE_TYPE;

/**
 * DynamicConfigService manages configuration through the config system table.
 * Provides watchers for configuration changes and supports hot reload.
 */
class DynamicConfigService extends EventEmitter {
  /**
   * Create a new DynamicConfigService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.systemTableCache - System table cache for reads.
   * @param {string} options.nodeId - Node ID for audit logging.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("53433")) {
      {}
    } else {
      stryCov_9fa48("53433");
      super();
      this.cdcIntegrationService = stryMutAct_9fa48("53436") ? options.cdcIntegrationService && null : stryMutAct_9fa48("53435") ? false : stryMutAct_9fa48("53434") ? true : (stryCov_9fa48("53434", "53435", "53436"), options.cdcIntegrationService || null);
      this.systemTableCache = stryMutAct_9fa48("53439") ? options.systemTableCache && null : stryMutAct_9fa48("53438") ? false : stryMutAct_9fa48("53437") ? true : (stryCov_9fa48("53437", "53438", "53439"), options.systemTableCache || null);
      this.sqlQueryEngine = stryMutAct_9fa48("53442") ? options.sqlQueryEngine && null : stryMutAct_9fa48("53441") ? false : stryMutAct_9fa48("53440") ? true : (stryCov_9fa48("53440", "53441", "53442"), options.sqlQueryEngine || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("53445") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("53444") ? false : stryMutAct_9fa48("53443") ? true : (stryCov_9fa48("53443", "53444", "53445"), options.controlPlaneSystemTableGateway || null);
      this.nodeId = stryMutAct_9fa48("53448") ? options.nodeId && STRING.UNKNOWN : stryMutAct_9fa48("53447") ? false : stryMutAct_9fa48("53446") ? true : (stryCov_9fa48("53446", "53447", "53448"), options.nodeId || STRING.UNKNOWN);

      // Local cache of configuration values
      this.configCache = new Map();

      // Watchers for configuration changes
      this.watchers = new Map();

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(CONFIG_SUBSYSTEM.DYNAMIC_CONFIG) : console;

      // Statistics
      this.stats = stryMutAct_9fa48("53449") ? {} : (stryCov_9fa48("53449"), {
        ...CONFIG_STATS_DEFAULT
      });
      this.initialized = stryMutAct_9fa48("53450") ? true : (stryCov_9fa48("53450"), false);
    }
  }

  /**
   * Initialize the dynamic configuration service.
   * @param {Object} options - Initialization options.
   */
  async initialize(options = {}) {
    if (stryMutAct_9fa48("53451")) {
      {}
    } else {
      stryCov_9fa48("53451");
      if (stryMutAct_9fa48("53453") ? false : stryMutAct_9fa48("53452") ? true : (stryCov_9fa48("53452", "53453"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("53454")) {
          {}
        } else {
          stryCov_9fa48("53454");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("53456") ? false : stryMutAct_9fa48("53455") ? true : (stryCov_9fa48("53455", "53456"), options.systemTableCache)) {
        if (stryMutAct_9fa48("53457")) {
          {}
        } else {
          stryCov_9fa48("53457");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("53459") ? false : stryMutAct_9fa48("53458") ? true : (stryCov_9fa48("53458", "53459"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("53460")) {
          {}
        } else {
          stryCov_9fa48("53460");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("53462") ? false : stryMutAct_9fa48("53461") ? true : (stryCov_9fa48("53461", "53462"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("53463")) {
          {}
        } else {
          stryCov_9fa48("53463");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("53465") ? false : stryMutAct_9fa48("53464") ? true : (stryCov_9fa48("53464", "53465"), options.nodeId)) {
        if (stryMutAct_9fa48("53466")) {
          {}
        } else {
          stryCov_9fa48("53466");
          this.nodeId = options.nodeId;
        }
      }
      this.initialized = stryMutAct_9fa48("53467") ? false : (stryCov_9fa48("53467"), true);
      this.logger.info(CONFIG_LOG_MSG.INITIALIZED, stryMutAct_9fa48("53468") ? {} : (stryCov_9fa48("53468"), {
        nodeId: this.nodeId,
        definedKeys: Object.keys(CONFIG_DEFINITIONS).length
      }));
    }
  }

  /**
   * Seed configuration from environment variables and defaults.
   * Only seeds keys that don't already exist in the config table.
   * Requirements: 30.2, 30.9
   * @param {string} updatedBy - Identity of who is seeding (e.g., 'system').
   * @param {Object} [options={}] - Seeding options.
   * @param {boolean} [options.skipExistingCheck=false] - Legacy compatibility
   *   flag. Seeding now uses idempotent insert-if-absent writes, so per-key
   *   existence reads are no longer required.
   * @param {boolean} [options.useDirectCdcMutations=false] - Write directly
   *   through the CDC integration service instead of the control-plane gateway.
   * @return {Promise<Object>} Seeding result.
   */
  async seedConfiguration(updatedBy = CONFIG_SEED_SOURCE.SYSTEM, options = {}) {
    if (stryMutAct_9fa48("53469")) {
      {}
    } else {
      stryCov_9fa48("53469");
      if (stryMutAct_9fa48("53472") ? false : stryMutAct_9fa48("53471") ? true : stryMutAct_9fa48("53470") ? this.cdcIntegrationService : (stryCov_9fa48("53470", "53471", "53472"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("53473")) {
          {}
        } else {
          stryCov_9fa48("53473");
          throw new Error(CONFIG_ERROR_MSG.CDC_UNAVAILABLE);
        }
      }
      const seeded = stryMutAct_9fa48("53474") ? ["Stryker was here"] : (stryCov_9fa48("53474"), []);
      const skipped = stryMutAct_9fa48("53475") ? ["Stryker was here"] : (stryCov_9fa48("53475"), []);
      const now = Date.now();
      const useDirectCdcMutations = stryMutAct_9fa48("53478") ? options?.useDirectCdcMutations !== true : stryMutAct_9fa48("53477") ? false : stryMutAct_9fa48("53476") ? true : (stryCov_9fa48("53476", "53477", "53478"), (stryMutAct_9fa48("53479") ? options.useDirectCdcMutations : (stryCov_9fa48("53479"), options?.useDirectCdcMutations)) === (stryMutAct_9fa48("53480") ? false : (stryCov_9fa48("53480"), true)));
      for (const [key, definition] of Object.entries(CONFIG_DEFINITIONS)) {
        if (stryMutAct_9fa48("53481")) {
          {}
        } else {
          stryCov_9fa48("53481");
          // Check for environment variable override
          const envKey = this.keyToEnvVar(key);
          const envValue = process.env[envKey];
          const value = (stryMutAct_9fa48("53484") ? envValue === undefined : stryMutAct_9fa48("53483") ? false : stryMutAct_9fa48("53482") ? true : (stryCov_9fa48("53482", "53483", "53484"), envValue !== undefined)) ? this.parseEnvValue(envValue, definition.type) : definition.defaultValue;

          // Insert into config table
          const row = stryMutAct_9fa48("53485") ? {} : (stryCov_9fa48("53485"), {
            [CONFIG_TABLE_COLUMN.KEY]: key,
            [CONFIG_TABLE_COLUMN.VALUE]: this.serializeValue(value, definition.type),
            [CONFIG_TABLE_COLUMN.VALUE_TYPE]: definition.type,
            [CONFIG_TABLE_COLUMN.REQUIRES_RESTART]: definition.requiresRestart ? NUM.ONE : NUM.ZERO,
            [CONFIG_TABLE_COLUMN.DESCRIPTION]: definition.description,
            [CONFIG_TABLE_COLUMN.DEFAULT_VALUE]: this.serializeValue(definition.defaultValue, definition.type),
            [CONFIG_TABLE_COLUMN.UPDATED_BY]: updatedBy,
            [CONFIG_TABLE_COLUMN.UPDATED_AT]: now,
            [CONFIG_TABLE_COLUMN.CREATED_AT]: now
          });
          const writeOptions = stryMutAct_9fa48("53486") ? {} : (stryCov_9fa48("53486"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("53487") ? "" : (stryCov_9fa48("53487"), 'critical'),
            ignoreExisting: stryMutAct_9fa48("53488") ? false : (stryCov_9fa48("53488"), true)
          });
          let mutationResult = null;
          if (stryMutAct_9fa48("53490") ? false : stryMutAct_9fa48("53489") ? true : (stryCov_9fa48("53489", "53490"), useDirectCdcMutations)) {
            if (stryMutAct_9fa48("53491")) {
              {}
            } else {
              stryCov_9fa48("53491");
              mutationResult = await this.cdcIntegrationService.insertSystemTableRow(SYSTEM_TABLE_NAME.CONFIG, row, writeOptions);
            }
          } else {
            if (stryMutAct_9fa48("53492")) {
              {}
            } else {
              stryCov_9fa48("53492");
              mutationResult = await this.getControlPlaneSystemTableGateway().insertSystemTableRow(SYSTEM_TABLE_NAME.CONFIG, row, writeOptions);
            }
          }
          if (stryMutAct_9fa48("53494") ? false : stryMutAct_9fa48("53493") ? true : (stryCov_9fa48("53493", "53494"), this.didConfigSeedInsertApply(mutationResult))) {
            if (stryMutAct_9fa48("53495")) {
              {}
            } else {
              stryCov_9fa48("53495");
              seeded.push(key);
            }
          } else {
            if (stryMutAct_9fa48("53496")) {
              {}
            } else {
              stryCov_9fa48("53496");
              skipped.push(key);
            }
          }
        }
      }
      this.logger.info(CONFIG_LOG_MSG.SEEDING_COMPLETE, stryMutAct_9fa48("53497") ? {} : (stryCov_9fa48("53497"), {
        seeded: seeded.length,
        skipped: skipped.length
      }));
      return stryMutAct_9fa48("53498") ? {} : (stryCov_9fa48("53498"), {
        seeded,
        skipped
      });
    }
  }

  /**
   * Classify one config seed write as inserted vs already-present.
   * @param {Object|null} mutationResult
   * @return {boolean}
   * @private
   */
  didConfigSeedInsertApply(mutationResult) {
    if (stryMutAct_9fa48("53499")) {
      {}
    } else {
      stryCov_9fa48("53499");
      const affectedRows = Number(stryMutAct_9fa48("53500") ? mutationResult?.partitionResult?.affectedRows && mutationResult?.affectedRows : (stryCov_9fa48("53500"), (stryMutAct_9fa48("53502") ? mutationResult.partitionResult?.affectedRows : stryMutAct_9fa48("53501") ? mutationResult?.partitionResult.affectedRows : (stryCov_9fa48("53501", "53502"), mutationResult?.partitionResult?.affectedRows)) ?? (stryMutAct_9fa48("53503") ? mutationResult.affectedRows : (stryCov_9fa48("53503"), mutationResult?.affectedRows))));
      if (stryMutAct_9fa48("53505") ? false : stryMutAct_9fa48("53504") ? true : (stryCov_9fa48("53504", "53505"), Number.isFinite(affectedRows))) {
        if (stryMutAct_9fa48("53506")) {
          {}
        } else {
          stryCov_9fa48("53506");
          return stryMutAct_9fa48("53510") ? affectedRows <= NUM.ZERO : stryMutAct_9fa48("53509") ? affectedRows >= NUM.ZERO : stryMutAct_9fa48("53508") ? false : stryMutAct_9fa48("53507") ? true : (stryCov_9fa48("53507", "53508", "53509", "53510"), affectedRows > NUM.ZERO);
        }
      }
      return stryMutAct_9fa48("53513") ? mutationResult?.outcome !== CONTROL_PLANE_MUTATION_OUTCOME.NO_OP && mutationResult?.outcome !== CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED || mutationResult?.success !== false : stryMutAct_9fa48("53512") ? false : stryMutAct_9fa48("53511") ? true : (stryCov_9fa48("53511", "53512", "53513"), (stryMutAct_9fa48("53515") ? mutationResult?.outcome !== CONTROL_PLANE_MUTATION_OUTCOME.NO_OP || mutationResult?.outcome !== CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED : stryMutAct_9fa48("53514") ? true : (stryCov_9fa48("53514", "53515"), (stryMutAct_9fa48("53517") ? mutationResult?.outcome === CONTROL_PLANE_MUTATION_OUTCOME.NO_OP : stryMutAct_9fa48("53516") ? true : (stryCov_9fa48("53516", "53517"), (stryMutAct_9fa48("53518") ? mutationResult.outcome : (stryCov_9fa48("53518"), mutationResult?.outcome)) !== CONTROL_PLANE_MUTATION_OUTCOME.NO_OP)) && (stryMutAct_9fa48("53520") ? mutationResult?.outcome === CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED : stryMutAct_9fa48("53519") ? true : (stryCov_9fa48("53519", "53520"), (stryMutAct_9fa48("53521") ? mutationResult.outcome : (stryCov_9fa48("53521"), mutationResult?.outcome)) !== CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED)))) && (stryMutAct_9fa48("53523") ? mutationResult?.success === false : stryMutAct_9fa48("53522") ? true : (stryCov_9fa48("53522", "53523"), (stryMutAct_9fa48("53524") ? mutationResult.success : (stryCov_9fa48("53524"), mutationResult?.success)) !== (stryMutAct_9fa48("53525") ? true : (stryCov_9fa48("53525"), false)))));
    }
  }

  /**
   * Get a configuration value.
   * Requirements: 30.3
   * @param {string} key - Configuration key.
   * @return {Promise<*>} Configuration value or default.
   */
  async get(key) {
    if (stryMutAct_9fa48("53526")) {
      {}
    } else {
      stryCov_9fa48("53526");
      stryMutAct_9fa48("53527") ? this.stats.reads-- : (stryCov_9fa48("53527"), this.stats.reads++);

      // Try local cache first
      if (stryMutAct_9fa48("53529") ? false : stryMutAct_9fa48("53528") ? true : (stryCov_9fa48("53528", "53529"), this.configCache.has(key))) {
        if (stryMutAct_9fa48("53530")) {
          {}
        } else {
          stryCov_9fa48("53530");
          return this.configCache.get(key);
        }
      }

      // Try system table cache
      const config = await this.getConfigFromTable(key);
      if (stryMutAct_9fa48("53532") ? false : stryMutAct_9fa48("53531") ? true : (stryCov_9fa48("53531", "53532"), config)) {
        if (stryMutAct_9fa48("53533")) {
          {}
        } else {
          stryCov_9fa48("53533");
          const value = this.deserializeValue(config.config_value, config.value_type);
          this.configCache.set(key, value);
          return value;
        }
      }

      // Return default if defined
      const definition = CONFIG_DEFINITIONS[key];
      if (stryMutAct_9fa48("53535") ? false : stryMutAct_9fa48("53534") ? true : (stryCov_9fa48("53534", "53535"), definition)) {
        if (stryMutAct_9fa48("53536")) {
          {}
        } else {
          stryCov_9fa48("53536");
          return definition.defaultValue;
        }
      }
      return undefined;
    }
  }

  /**
   * Set a configuration value.
   * Requirements: 30.4, 30.8, 30.10
   * @param {string} key - Configuration key.
   * @param {*} value - Configuration value.
   * @param {string} updatedBy - Identity of who made the change.
   * @return {Promise<Object>} Update result.
   */
  async set(key, value, updatedBy = CONFIG_ENV.UPDATED_BY_UNKNOWN) {
    if (stryMutAct_9fa48("53537")) {
      {}
    } else {
      stryCov_9fa48("53537");
      if (stryMutAct_9fa48("53540") ? false : stryMutAct_9fa48("53539") ? true : stryMutAct_9fa48("53538") ? this.cdcIntegrationService : (stryCov_9fa48("53538", "53539", "53540"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("53541")) {
          {}
        } else {
          stryCov_9fa48("53541");
          throw new Error(CONFIG_ERROR_MSG.CDC_UNAVAILABLE);
        }
      }

      // Validate the value
      const validation = this.validateValue(key, value);
      if (stryMutAct_9fa48("53544") ? false : stryMutAct_9fa48("53543") ? true : stryMutAct_9fa48("53542") ? validation.valid : (stryCov_9fa48("53542", "53543", "53544"), !validation.valid)) {
        if (stryMutAct_9fa48("53545")) {
          {}
        } else {
          stryCov_9fa48("53545");
          throw new Error(stryMutAct_9fa48("53546") ? `` : (stryCov_9fa48("53546"), `${CONFIG_ERROR_MSG.INVALID_VALUE_PREFIX}${validation.error}`));
        }
      }
      const definition = CONFIG_DEFINITIONS[key];
      const valueType = definition ? definition.type : this.inferType(value);
      const now = Date.now();

      // Check if key exists
      const existing = await this.getConfigFromTable(key);
      if (stryMutAct_9fa48("53548") ? false : stryMutAct_9fa48("53547") ? true : (stryCov_9fa48("53547", "53548"), existing)) {
        if (stryMutAct_9fa48("53549")) {
          {}
        } else {
          stryCov_9fa48("53549");
          // Update existing
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("53550") ? {} : (stryCov_9fa48("53550"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: SYSTEM_TABLE_NAME.CONFIG,
            whereClause: stryMutAct_9fa48("53551") ? {} : (stryCov_9fa48("53551"), {
              [CONFIG_TABLE_COLUMN.KEY]: key
            }),
            data: stryMutAct_9fa48("53552") ? {} : (stryCov_9fa48("53552"), {
              [CONFIG_TABLE_COLUMN.VALUE]: this.serializeValue(value, valueType),
              [CONFIG_TABLE_COLUMN.UPDATED_BY]: updatedBy,
              [CONFIG_TABLE_COLUMN.UPDATED_AT]: now
            })
          }), stryMutAct_9fa48("53553") ? {} : (stryCov_9fa48("53553"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("53554") ? "" : (stryCov_9fa48("53554"), 'critical')
          }));
        }
      } else {
        if (stryMutAct_9fa48("53555")) {
          {}
        } else {
          stryCov_9fa48("53555");
          // Insert new
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("53556") ? {} : (stryCov_9fa48("53556"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: SYSTEM_TABLE_NAME.CONFIG,
            row: stryMutAct_9fa48("53557") ? {} : (stryCov_9fa48("53557"), {
              [CONFIG_TABLE_COLUMN.KEY]: key,
              [CONFIG_TABLE_COLUMN.VALUE]: this.serializeValue(value, valueType),
              [CONFIG_TABLE_COLUMN.VALUE_TYPE]: valueType,
              [CONFIG_TABLE_COLUMN.REQUIRES_RESTART]: definition ? definition.requiresRestart ? NUM.ONE : NUM.ZERO : NUM.ZERO,
              [CONFIG_TABLE_COLUMN.DESCRIPTION]: definition ? definition.description : STRING.EMPTY,
              [CONFIG_TABLE_COLUMN.DEFAULT_VALUE]: this.serializeValue(definition ? definition.defaultValue : value, valueType),
              [CONFIG_TABLE_COLUMN.UPDATED_BY]: updatedBy,
              [CONFIG_TABLE_COLUMN.UPDATED_AT]: now,
              [CONFIG_TABLE_COLUMN.CREATED_AT]: now
            })
          }), stryMutAct_9fa48("53558") ? {} : (stryCov_9fa48("53558"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("53559") ? "" : (stryCov_9fa48("53559"), 'critical')
          }));
        }
      }
      stryMutAct_9fa48("53560") ? this.stats.writes-- : (stryCov_9fa48("53560"), this.stats.writes++);

      // Log the change for auditing
      // Note: Local cache will be updated when CDC event arrives via handleCDCEvent()
      this.logger.info(CONFIG_LOG_MSG.UPDATED, stryMutAct_9fa48("53561") ? {} : (stryCov_9fa48("53561"), {
        key,
        updatedBy,
        requiresRestart: definition ? definition.requiresRestart : stryMutAct_9fa48("53562") ? true : (stryCov_9fa48("53562"), false)
      }));
      return stryMutAct_9fa48("53563") ? {} : (stryCov_9fa48("53563"), {
        success: stryMutAct_9fa48("53564") ? false : (stryCov_9fa48("53564"), true),
        key,
        value,
        requiresRestart: definition ? definition.requiresRestart : stryMutAct_9fa48("53565") ? true : (stryCov_9fa48("53565"), false)
      });
    }
  }

  /**
   * Get all configuration values.
   * @return {Promise<Object>} All configuration key-value pairs.
   */
  async getAll() {
    if (stryMutAct_9fa48("53566")) {
      {}
    } else {
      stryCov_9fa48("53566");
      const result = {};
      if (stryMutAct_9fa48("53568") ? false : stryMutAct_9fa48("53567") ? true : (stryCov_9fa48("53567", "53568"), this.canReadConfig())) {
        if (stryMutAct_9fa48("53569")) {
          {}
        } else {
          stryCov_9fa48("53569");
          const queryResult = await this.getControlPlaneSystemTableGateway().readRows(SYSTEM_TABLE_NAME.CONFIG, CONFIG_SELECT_ALL_SQL, stryMutAct_9fa48("53570") ? ["Stryker was here"] : (stryCov_9fa48("53570"), []));
          const configs = stryMutAct_9fa48("53573") ? queryResult.rows && [] : stryMutAct_9fa48("53572") ? false : stryMutAct_9fa48("53571") ? true : (stryCov_9fa48("53571", "53572", "53573"), queryResult.rows || (stryMutAct_9fa48("53574") ? ["Stryker was here"] : (stryCov_9fa48("53574"), [])));
          for (const config of configs) {
            if (stryMutAct_9fa48("53575")) {
              {}
            } else {
              stryCov_9fa48("53575");
              result[config[CONFIG_TABLE_COLUMN.KEY]] = this.deserializeValue(config[CONFIG_TABLE_COLUMN.VALUE], config[CONFIG_TABLE_COLUMN.VALUE_TYPE]);
            }
          }
        }
      }

      // Fill in defaults for missing keys
      for (const [key, definition] of Object.entries(CONFIG_DEFINITIONS)) {
        if (stryMutAct_9fa48("53576")) {
          {}
        } else {
          stryCov_9fa48("53576");
          if (stryMutAct_9fa48("53579") ? false : stryMutAct_9fa48("53578") ? true : stryMutAct_9fa48("53577") ? key in result : (stryCov_9fa48("53577", "53578", "53579"), !(key in result))) {
            if (stryMutAct_9fa48("53580")) {
              {}
            } else {
              stryCov_9fa48("53580");
              result[key] = definition.defaultValue;
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Register a watcher for configuration changes.
   * Requirements: 30.5, 30.6
   * @param {string} key - Configuration key to watch.
   * @param {Function} callback - Callback function(newValue, oldValue, key).
   * @return {Function} Unsubscribe function.
   */
  watch(key, callback) {
    if (stryMutAct_9fa48("53581")) {
      {}
    } else {
      stryCov_9fa48("53581");
      if (stryMutAct_9fa48("53584") ? false : stryMutAct_9fa48("53583") ? true : stryMutAct_9fa48("53582") ? this.watchers.has(key) : (stryCov_9fa48("53582", "53583", "53584"), !this.watchers.has(key))) {
        if (stryMutAct_9fa48("53585")) {
          {}
        } else {
          stryCov_9fa48("53585");
          this.watchers.set(key, new Set());
        }
      }
      this.watchers.get(key).add(callback);
      this.logger.debug(CONFIG_LOG_MSG.WATCHER_REGISTERED, stryMutAct_9fa48("53586") ? {} : (stryCov_9fa48("53586"), {
        key
      }));

      // Return unsubscribe function
      return () => {
        if (stryMutAct_9fa48("53587")) {
          {}
        } else {
          stryCov_9fa48("53587");
          const keyWatchers = this.watchers.get(key);
          if (stryMutAct_9fa48("53589") ? false : stryMutAct_9fa48("53588") ? true : (stryCov_9fa48("53588", "53589"), keyWatchers)) {
            if (stryMutAct_9fa48("53590")) {
              {}
            } else {
              stryCov_9fa48("53590");
              keyWatchers.delete(callback);
              if (stryMutAct_9fa48("53593") ? keyWatchers.size !== NUM.ZERO : stryMutAct_9fa48("53592") ? false : stryMutAct_9fa48("53591") ? true : (stryCov_9fa48("53591", "53592", "53593"), keyWatchers.size === NUM.ZERO)) {
                if (stryMutAct_9fa48("53594")) {
                  {}
                } else {
                  stryCov_9fa48("53594");
                  this.watchers.delete(key);
                }
              }
            }
          }
        }
      };
    }
  }

  /**
   * Notify watchers of a configuration change.
   * @param {string} key - Configuration key that changed.
   * @param {*} newValue - New value.
   * @param {string} oldValueSerialized - Old serialized value.
   * @private
   */
  async notifyWatchers(key, newValue, oldValueSerialized) {
    if (stryMutAct_9fa48("53595")) {
      {}
    } else {
      stryCov_9fa48("53595");
      const keyWatchers = this.watchers.get(key);
      if (stryMutAct_9fa48("53598") ? !keyWatchers && keyWatchers.size === NUM.ZERO : stryMutAct_9fa48("53597") ? false : stryMutAct_9fa48("53596") ? true : (stryCov_9fa48("53596", "53597", "53598"), (stryMutAct_9fa48("53599") ? keyWatchers : (stryCov_9fa48("53599"), !keyWatchers)) || (stryMutAct_9fa48("53601") ? keyWatchers.size !== NUM.ZERO : stryMutAct_9fa48("53600") ? false : (stryCov_9fa48("53600", "53601"), keyWatchers.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("53602")) {
          {}
        } else {
          stryCov_9fa48("53602");
          return;
        }
      }
      const definition = CONFIG_DEFINITIONS[key];
      const valueType = definition ? definition.type : this.inferType(newValue);
      const oldValue = oldValueSerialized ? this.deserializeValue(oldValueSerialized, valueType) : undefined;
      for (const callback of keyWatchers) {
        if (stryMutAct_9fa48("53603")) {
          {}
        } else {
          stryCov_9fa48("53603");
          try {
            if (stryMutAct_9fa48("53604")) {
              {}
            } else {
              stryCov_9fa48("53604");
              await callback(newValue, oldValue, key);
              stryMutAct_9fa48("53605") ? this.stats.watcherNotifications-- : (stryCov_9fa48("53605"), this.stats.watcherNotifications++);
            }
          } catch (error) {
            if (stryMutAct_9fa48("53606")) {
              {}
            } else {
              stryCov_9fa48("53606");
              this.logger.error(CONFIG_LOG_MSG.WATCHER_CALLBACK_FAILED, stryMutAct_9fa48("53607") ? {} : (stryCov_9fa48("53607"), {
                key,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }

      // Emit event for general listeners
      this.emit(CONFIG_EVENT.CHANGE, stryMutAct_9fa48("53608") ? {} : (stryCov_9fa48("53608"), {
        key,
        newValue,
        oldValue
      }));
    }
  }

  /**
   * Handle CDC event for config table changes.
   * This is called when the cache receives CDC updates.
   * @param {Object} event - CDC event.
   */
  async handleCDCEvent(event) {
    if (stryMutAct_9fa48("53609")) {
      {}
    } else {
      stryCov_9fa48("53609");
      const {
        operation,
        data
      } = event;
      const key = data[CONFIG_TABLE_COLUMN.KEY];
      if (stryMutAct_9fa48("53612") ? operation === CDC_OPERATION.INSERT && operation === CDC_OPERATION.UPDATE : stryMutAct_9fa48("53611") ? false : stryMutAct_9fa48("53610") ? true : (stryCov_9fa48("53610", "53611", "53612"), (stryMutAct_9fa48("53614") ? operation !== CDC_OPERATION.INSERT : stryMutAct_9fa48("53613") ? false : (stryCov_9fa48("53613", "53614"), operation === CDC_OPERATION.INSERT)) || (stryMutAct_9fa48("53616") ? operation !== CDC_OPERATION.UPDATE : stryMutAct_9fa48("53615") ? false : (stryCov_9fa48("53615", "53616"), operation === CDC_OPERATION.UPDATE)))) {
        if (stryMutAct_9fa48("53617")) {
          {}
        } else {
          stryCov_9fa48("53617");
          const valueType = this.resolveValueType(key, data[CONFIG_TABLE_COLUMN.VALUE_TYPE]);
          const newValue = this.deserializeValue(data[CONFIG_TABLE_COLUMN.VALUE], valueType);
          const oldValue = this.configCache.get(key);

          // Update local cache
          this.configCache.set(key, newValue);

          // Notify watchers if value changed
          if (stryMutAct_9fa48("53620") ? oldValue === newValue : stryMutAct_9fa48("53619") ? false : stryMutAct_9fa48("53618") ? true : (stryCov_9fa48("53618", "53619", "53620"), oldValue !== newValue)) {
            if (stryMutAct_9fa48("53621")) {
              {}
            } else {
              stryCov_9fa48("53621");
              const oldValueSerialized = (stryMutAct_9fa48("53624") ? oldValue !== undefined : stryMutAct_9fa48("53623") ? false : stryMutAct_9fa48("53622") ? true : (stryCov_9fa48("53622", "53623", "53624"), oldValue === undefined)) ? undefined : this.serializeValue(oldValue, valueType);
              await this.notifyWatchers(key, newValue, oldValueSerialized);
            }
          }
        }
      } else if (stryMutAct_9fa48("53627") ? operation !== CDC_OPERATION.DELETE : stryMutAct_9fa48("53626") ? false : stryMutAct_9fa48("53625") ? true : (stryCov_9fa48("53625", "53626", "53627"), operation === CDC_OPERATION.DELETE)) {
        if (stryMutAct_9fa48("53628")) {
          {}
        } else {
          stryCov_9fa48("53628");
          this.configCache.delete(key);
          this.emit(CONFIG_EVENT.DELETE, stryMutAct_9fa48("53629") ? {} : (stryCov_9fa48("53629"), {
            key
          }));
        }
      }
    }
  }

  /**
   * Check if a configuration key requires restart.
   * Requirements: 30.7
   * @param {string} key - Configuration key.
   * @return {boolean} True if restart is required.
   */
  requiresRestart(key) {
    if (stryMutAct_9fa48("53630")) {
      {}
    } else {
      stryCov_9fa48("53630");
      const definition = CONFIG_DEFINITIONS[key];
      return definition ? definition.requiresRestart : stryMutAct_9fa48("53631") ? true : (stryCov_9fa48("53631"), false);
    }
  }

  /**
   * Get configuration metadata.
   * @param {string} key - Configuration key.
   * @return {Object|null} Configuration metadata or null.
   */
  getMetadata(key) {
    if (stryMutAct_9fa48("53632")) {
      {}
    } else {
      stryCov_9fa48("53632");
      return stryMutAct_9fa48("53635") ? CONFIG_DEFINITIONS[key] && null : stryMutAct_9fa48("53634") ? false : stryMutAct_9fa48("53633") ? true : (stryCov_9fa48("53633", "53634", "53635"), CONFIG_DEFINITIONS[key] || null);
    }
  }

  /**
   * Get all configuration keys that require restart.
   * @return {string[]} Array of keys requiring restart.
   */
  getRestartRequiredKeys() {
    if (stryMutAct_9fa48("53636")) {
      {}
    } else {
      stryCov_9fa48("53636");
      return stryMutAct_9fa48("53637") ? Object.entries(CONFIG_DEFINITIONS).map(([key]) => key) : (stryCov_9fa48("53637"), Object.entries(CONFIG_DEFINITIONS).filter(stryMutAct_9fa48("53638") ? () => undefined : (stryCov_9fa48("53638"), ([_, def]) => def.requiresRestart)).map(stryMutAct_9fa48("53639") ? () => undefined : (stryCov_9fa48("53639"), ([key]) => key)));
    }
  }

  /**
   * Get all configuration keys that support hot reload.
   * @return {string[]} Array of hot-reloadable keys.
   */
  getHotReloadKeys() {
    if (stryMutAct_9fa48("53640")) {
      {}
    } else {
      stryCov_9fa48("53640");
      return stryMutAct_9fa48("53641") ? Object.entries(CONFIG_DEFINITIONS).map(([key]) => key) : (stryCov_9fa48("53641"), Object.entries(CONFIG_DEFINITIONS).filter(stryMutAct_9fa48("53642") ? () => undefined : (stryCov_9fa48("53642"), ([_, def]) => stryMutAct_9fa48("53643") ? def.requiresRestart : (stryCov_9fa48("53643"), !def.requiresRestart))).map(stryMutAct_9fa48("53644") ? () => undefined : (stryCov_9fa48("53644"), ([key]) => key)));
    }
  }

  /**
   * Validate a configuration value.
   * Requirements: 30.10
   * @param {string} key - Configuration key.
   * @param {*} value - Value to validate.
   * @return {Object} Validation result {valid, error}.
   */
  validateValue(key, value) {
    if (stryMutAct_9fa48("53645")) {
      {}
    } else {
      stryCov_9fa48("53645");
      const definition = CONFIG_DEFINITIONS[key];
      if (stryMutAct_9fa48("53648") ? false : stryMutAct_9fa48("53647") ? true : stryMutAct_9fa48("53646") ? definition : (stryCov_9fa48("53646", "53647", "53648"), !definition)) {
        if (stryMutAct_9fa48("53649")) {
          {}
        } else {
          stryCov_9fa48("53649");
          // Allow custom keys with inferred types
          return stryMutAct_9fa48("53650") ? {} : (stryCov_9fa48("53650"), {
            valid: stryMutAct_9fa48("53651") ? false : (stryCov_9fa48("53651"), true)
          });
        }
      }

      // Type validation
      switch (definition.type) {
        case ConfigValueType.STRING:
          if (stryMutAct_9fa48("53652")) {} else {
            stryCov_9fa48("53652");
            if (stryMutAct_9fa48("53655") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("53654") ? false : stryMutAct_9fa48("53653") ? true : (stryCov_9fa48("53653", "53654", "53655"), typeof value !== TYPEOF.STRING)) {
              if (stryMutAct_9fa48("53656")) {
                {}
              } else {
                stryCov_9fa48("53656");
                return stryMutAct_9fa48("53657") ? {} : (stryCov_9fa48("53657"), {
                  valid: stryMutAct_9fa48("53658") ? true : (stryCov_9fa48("53658"), false),
                  error: stryMutAct_9fa48("53659") ? `` : (stryCov_9fa48("53659"), `${CONFIG_ERROR_MSG.EXPECTED_STRING_PREFIX}${typeof value}`)
                });
              }
            }
            // Special validation for log level
            if (stryMutAct_9fa48("53662") ? key !== CONFIG_KEY.LOGGING_LEVEL : stryMutAct_9fa48("53661") ? false : stryMutAct_9fa48("53660") ? true : (stryCov_9fa48("53660", "53661", "53662"), key === CONFIG_KEY.LOGGING_LEVEL)) {
              if (stryMutAct_9fa48("53663")) {
                {}
              } else {
                stryCov_9fa48("53663");
                const validLevels = CONFIG_LOG_LEVELS.VALUES;
                if (stryMutAct_9fa48("53666") ? false : stryMutAct_9fa48("53665") ? true : stryMutAct_9fa48("53664") ? validLevels.includes(value) : (stryCov_9fa48("53664", "53665", "53666"), !validLevels.includes(value))) {
                  if (stryMutAct_9fa48("53667")) {
                    {}
                  } else {
                    stryCov_9fa48("53667");
                    return stryMutAct_9fa48("53668") ? {} : (stryCov_9fa48("53668"), {
                      valid: stryMutAct_9fa48("53669") ? true : (stryCov_9fa48("53669"), false),
                      error: stryMutAct_9fa48("53670") ? `` : (stryCov_9fa48("53670"), `${CONFIG_ERROR_MSG.LOG_LEVEL_INVALID_PREFIX}${validLevels.join(CONFIG_SEPARATOR.COMMA_SPACE)}`)
                    });
                  }
                }
              }
            }
            break;
          }
        case ConfigValueType.NUMBER:
          if (stryMutAct_9fa48("53671")) {} else {
            stryCov_9fa48("53671");
            if (stryMutAct_9fa48("53674") ? typeof value !== TYPEOF.NUMBER && Number.isNaN(value) : stryMutAct_9fa48("53673") ? false : stryMutAct_9fa48("53672") ? true : (stryCov_9fa48("53672", "53673", "53674"), (stryMutAct_9fa48("53676") ? typeof value === TYPEOF.NUMBER : stryMutAct_9fa48("53675") ? false : (stryCov_9fa48("53675", "53676"), typeof value !== TYPEOF.NUMBER)) || Number.isNaN(value))) {
              if (stryMutAct_9fa48("53677")) {
                {}
              } else {
                stryCov_9fa48("53677");
                return stryMutAct_9fa48("53678") ? {} : (stryCov_9fa48("53678"), {
                  valid: stryMutAct_9fa48("53679") ? true : (stryCov_9fa48("53679"), false),
                  error: stryMutAct_9fa48("53680") ? `` : (stryCov_9fa48("53680"), `${CONFIG_ERROR_MSG.EXPECTED_NUMBER_PREFIX}${typeof value}`)
                });
              }
            }
            // Validate positive numbers for most numeric configs
            if (stryMutAct_9fa48("53683") ? value < NUM.ZERO || !key.includes(CONFIG_KEY_FRAGMENT.THRESHOLD) : stryMutAct_9fa48("53682") ? false : stryMutAct_9fa48("53681") ? true : (stryCov_9fa48("53681", "53682", "53683"), (stryMutAct_9fa48("53686") ? value >= NUM.ZERO : stryMutAct_9fa48("53685") ? value <= NUM.ZERO : stryMutAct_9fa48("53684") ? true : (stryCov_9fa48("53684", "53685", "53686"), value < NUM.ZERO)) && (stryMutAct_9fa48("53687") ? key.includes(CONFIG_KEY_FRAGMENT.THRESHOLD) : (stryCov_9fa48("53687"), !key.includes(CONFIG_KEY_FRAGMENT.THRESHOLD))))) {
              if (stryMutAct_9fa48("53688")) {
                {}
              } else {
                stryCov_9fa48("53688");
                return stryMutAct_9fa48("53689") ? {} : (stryCov_9fa48("53689"), {
                  valid: stryMutAct_9fa48("53690") ? true : (stryCov_9fa48("53690"), false),
                  error: CONFIG_ERROR_MSG.NON_NEGATIVE_REQUIRED
                });
              }
            }
            break;
          }
        case ConfigValueType.BOOLEAN:
          if (stryMutAct_9fa48("53691")) {} else {
            stryCov_9fa48("53691");
            if (stryMutAct_9fa48("53694") ? typeof value === TYPEOF.BOOLEAN : stryMutAct_9fa48("53693") ? false : stryMutAct_9fa48("53692") ? true : (stryCov_9fa48("53692", "53693", "53694"), typeof value !== TYPEOF.BOOLEAN)) {
              if (stryMutAct_9fa48("53695")) {
                {}
              } else {
                stryCov_9fa48("53695");
                return stryMutAct_9fa48("53696") ? {} : (stryCov_9fa48("53696"), {
                  valid: stryMutAct_9fa48("53697") ? true : (stryCov_9fa48("53697"), false),
                  error: stryMutAct_9fa48("53698") ? `` : (stryCov_9fa48("53698"), `${CONFIG_ERROR_MSG.EXPECTED_BOOLEAN_PREFIX}${typeof value}`)
                });
              }
            }
            break;
          }
        case ConfigValueType.JSON:
          if (stryMutAct_9fa48("53699")) {} else {
            stryCov_9fa48("53699");
            if (stryMutAct_9fa48("53702") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("53701") ? false : stryMutAct_9fa48("53700") ? true : (stryCov_9fa48("53700", "53701", "53702"), typeof value !== TYPEOF.OBJECT)) {
              if (stryMutAct_9fa48("53703")) {
                {}
              } else {
                stryCov_9fa48("53703");
                return stryMutAct_9fa48("53704") ? {} : (stryCov_9fa48("53704"), {
                  valid: stryMutAct_9fa48("53705") ? true : (stryCov_9fa48("53705"), false),
                  error: stryMutAct_9fa48("53706") ? `` : (stryCov_9fa48("53706"), `${CONFIG_ERROR_MSG.EXPECTED_OBJECT_PREFIX}${typeof value}`)
                });
              }
            }
            break;
          }
      }
      return stryMutAct_9fa48("53707") ? {} : (stryCov_9fa48("53707"), {
        valid: stryMutAct_9fa48("53708") ? false : (stryCov_9fa48("53708"), true)
      });
    }
  }

  /**
   * Get configuration from SQL engine.
   * @param {string} key - Configuration key.
   * @return {Promise<Object|null>} Configuration row or null.
   * @private
   */
  async getConfigFromTable(key) {
    if (stryMutAct_9fa48("53709")) {
      {}
    } else {
      stryCov_9fa48("53709");
      if (stryMutAct_9fa48("53711") ? false : stryMutAct_9fa48("53710") ? true : (stryCov_9fa48("53710", "53711"), this.canReadConfig())) {
        if (stryMutAct_9fa48("53712")) {
          {}
        } else {
          stryCov_9fa48("53712");
          const result = await this.getControlPlaneSystemTableGateway().readRows(SYSTEM_TABLE_NAME.CONFIG, CONFIG_SELECT_BY_KEY_SQL, stryMutAct_9fa48("53713") ? [] : (stryCov_9fa48("53713"), [key]));
          return stryMutAct_9fa48("53716") ? result.rows?.[0] && null : stryMutAct_9fa48("53715") ? false : stryMutAct_9fa48("53714") ? true : (stryCov_9fa48("53714", "53715", "53716"), (stryMutAct_9fa48("53717") ? result.rows[0] : (stryCov_9fa48("53717"), result.rows?.[0])) || null);
        }
      }
      return null;
    }
  }

  /**
   * Serialize a value for storage.
   * @param {*} value - Value to serialize.
   * @param {string} type - Value type.
   * @return {string} Serialized value.
   * @private
   */
  serializeValue(value, type) {
    if (stryMutAct_9fa48("53718")) {
      {}
    } else {
      stryCov_9fa48("53718");
      switch (type) {
        case ConfigValueType.JSON:
          if (stryMutAct_9fa48("53719")) {} else {
            stryCov_9fa48("53719");
            return JSON.stringify(value);
          }
        case ConfigValueType.BOOLEAN:
          if (stryMutAct_9fa48("53720")) {} else {
            stryCov_9fa48("53720");
            return value ? CONFIG_ENV.TRUE : CONFIG_ENV.FALSE;
          }
        default:
          if (stryMutAct_9fa48("53721")) {} else {
            stryCov_9fa48("53721");
            return String(value);
          }
      }
    }
  }

  /**
   * Deserialize a value from storage.
   * @param {string} serialized - Serialized value.
   * @param {string} type - Value type.
   * @return {*} Deserialized value.
   * @private
   */
  deserializeValue(serialized, type) {
    if (stryMutAct_9fa48("53722")) {
      {}
    } else {
      stryCov_9fa48("53722");
      switch (type) {
        case ConfigValueType.NUMBER:
          if (stryMutAct_9fa48("53723")) {} else {
            stryCov_9fa48("53723");
            return Number(serialized);
          }
        case ConfigValueType.BOOLEAN:
          if (stryMutAct_9fa48("53724")) {} else {
            stryCov_9fa48("53724");
            return stryMutAct_9fa48("53727") ? serialized === CONFIG_ENV.TRUE && serialized === CONFIG_ENV.ONE : stryMutAct_9fa48("53726") ? false : stryMutAct_9fa48("53725") ? true : (stryCov_9fa48("53725", "53726", "53727"), (stryMutAct_9fa48("53729") ? serialized !== CONFIG_ENV.TRUE : stryMutAct_9fa48("53728") ? false : (stryCov_9fa48("53728", "53729"), serialized === CONFIG_ENV.TRUE)) || (stryMutAct_9fa48("53731") ? serialized !== CONFIG_ENV.ONE : stryMutAct_9fa48("53730") ? false : (stryCov_9fa48("53730", "53731"), serialized === CONFIG_ENV.ONE)));
          }
        case ConfigValueType.JSON:
          if (stryMutAct_9fa48("53732")) {} else {
            stryCov_9fa48("53732");
            try {
              if (stryMutAct_9fa48("53733")) {
                {}
              } else {
                stryCov_9fa48("53733");
                return JSON.parse(serialized);
              }
            } catch (_parseErr) {
              if (stryMutAct_9fa48("53734")) {
                {}
              } else {
                stryCov_9fa48("53734");
                return CONFIG_VALUE_DEFAULT.EMPTY_OBJECT;
              }
            }
          }
        default:
          if (stryMutAct_9fa48("53735")) {} else {
            stryCov_9fa48("53735");
            return serialized;
          }
      }
    }
  }

  /**
   * Convert a configuration key to environment variable name.
   * @param {string} key - Configuration key (e.g., 'node.heartbeatIntervalMs').
   * @return {string} Environment variable name (e.g., 'NODE_HEARTBEAT_INTERVAL_MS').
   * @private
   */
  keyToEnvVar(key) {
    if (stryMutAct_9fa48("53736")) {
      {}
    } else {
      stryCov_9fa48("53736");
      return stryMutAct_9fa48("53737") ? key.replace(CONFIG_ENV_REGEX.DOT, CONFIG_SEPARATOR.UNDERSCORE).replace(CONFIG_ENV_REGEX.CAMEL_CASE, CONFIG_ENV_REPLACE.CAMEL_CASE).toLowerCase() : (stryCov_9fa48("53737"), key.replace(CONFIG_ENV_REGEX.DOT, CONFIG_SEPARATOR.UNDERSCORE).replace(CONFIG_ENV_REGEX.CAMEL_CASE, CONFIG_ENV_REPLACE.CAMEL_CASE).toUpperCase());
    }
  }

  /**
   * Parse an environment variable value.
   * @param {string} value - Environment variable value.
   * @param {string} type - Expected type.
   * @return {*} Parsed value.
   * @private
   */
  parseEnvValue(value, type) {
    if (stryMutAct_9fa48("53738")) {
      {}
    } else {
      stryCov_9fa48("53738");
      switch (type) {
        case ConfigValueType.NUMBER:
          if (stryMutAct_9fa48("53739")) {} else {
            stryCov_9fa48("53739");
            return Number(value);
          }
        case ConfigValueType.BOOLEAN:
          if (stryMutAct_9fa48("53740")) {} else {
            stryCov_9fa48("53740");
            return stryMutAct_9fa48("53743") ? value.toLowerCase() === CONFIG_ENV.TRUE && value === CONFIG_ENV.ONE : stryMutAct_9fa48("53742") ? false : stryMutAct_9fa48("53741") ? true : (stryCov_9fa48("53741", "53742", "53743"), (stryMutAct_9fa48("53745") ? value.toLowerCase() !== CONFIG_ENV.TRUE : stryMutAct_9fa48("53744") ? false : (stryCov_9fa48("53744", "53745"), (stryMutAct_9fa48("53746") ? value.toUpperCase() : (stryCov_9fa48("53746"), value.toLowerCase())) === CONFIG_ENV.TRUE)) || (stryMutAct_9fa48("53748") ? value !== CONFIG_ENV.ONE : stryMutAct_9fa48("53747") ? false : (stryCov_9fa48("53747", "53748"), value === CONFIG_ENV.ONE)));
          }
        case ConfigValueType.JSON:
          if (stryMutAct_9fa48("53749")) {} else {
            stryCov_9fa48("53749");
            try {
              if (stryMutAct_9fa48("53750")) {
                {}
              } else {
                stryCov_9fa48("53750");
                return JSON.parse(value);
              }
            } catch (_parseErr) {
              if (stryMutAct_9fa48("53751")) {
                {}
              } else {
                stryCov_9fa48("53751");
                return CONFIG_VALUE_DEFAULT.EMPTY_OBJECT;
              }
            }
          }
        default:
          if (stryMutAct_9fa48("53752")) {} else {
            stryCov_9fa48("53752");
            return value;
          }
      }
    }
  }

  /**
   * Infer the type of a value.
   * @param {*} value - Value to check.
   * @return {string} Inferred type.
   * @private
   */
  inferType(value) {
    if (stryMutAct_9fa48("53753")) {
      {}
    } else {
      stryCov_9fa48("53753");
      if (stryMutAct_9fa48("53756") ? typeof value !== TYPEOF.NUMBER : stryMutAct_9fa48("53755") ? false : stryMutAct_9fa48("53754") ? true : (stryCov_9fa48("53754", "53755", "53756"), typeof value === TYPEOF.NUMBER)) return ConfigValueType.NUMBER;
      if (stryMutAct_9fa48("53759") ? typeof value !== TYPEOF.BOOLEAN : stryMutAct_9fa48("53758") ? false : stryMutAct_9fa48("53757") ? true : (stryCov_9fa48("53757", "53758", "53759"), typeof value === TYPEOF.BOOLEAN)) return ConfigValueType.BOOLEAN;
      if (stryMutAct_9fa48("53762") ? typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("53761") ? false : stryMutAct_9fa48("53760") ? true : (stryCov_9fa48("53760", "53761", "53762"), typeof value === TYPEOF.OBJECT)) return ConfigValueType.JSON;
      return ConfigValueType.STRING;
    }
  }

  /**
   * Resolve value type for incoming CDC config events.
   * CDC update payloads can omit value_type, so fall back to key metadata.
   * @param {string} key - Config key.
   * @param {string} valueType - Value type from CDC payload.
   * @return {string} Resolved value type.
   * @private
   */
  resolveValueType(key, valueType) {
    if (stryMutAct_9fa48("53763")) {
      {}
    } else {
      stryCov_9fa48("53763");
      if (stryMutAct_9fa48("53766") ? typeof valueType === TYPEOF.STRING || valueType.length > NUM.ZERO : stryMutAct_9fa48("53765") ? false : stryMutAct_9fa48("53764") ? true : (stryCov_9fa48("53764", "53765", "53766"), (stryMutAct_9fa48("53768") ? typeof valueType !== TYPEOF.STRING : stryMutAct_9fa48("53767") ? true : (stryCov_9fa48("53767", "53768"), typeof valueType === TYPEOF.STRING)) && (stryMutAct_9fa48("53771") ? valueType.length <= NUM.ZERO : stryMutAct_9fa48("53770") ? valueType.length >= NUM.ZERO : stryMutAct_9fa48("53769") ? true : (stryCov_9fa48("53769", "53770", "53771"), valueType.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("53772")) {
          {}
        } else {
          stryCov_9fa48("53772");
          return valueType;
        }
      }
      const definition = CONFIG_DEFINITIONS[key];
      if (stryMutAct_9fa48("53775") ? definition.type : stryMutAct_9fa48("53774") ? false : stryMutAct_9fa48("53773") ? true : (stryCov_9fa48("53773", "53774", "53775"), definition?.type)) {
        if (stryMutAct_9fa48("53776")) {
          {}
        } else {
          stryCov_9fa48("53776");
          return definition.type;
        }
      }
      return ConfigValueType.STRING;
    }
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("53777")) {
      {}
    } else {
      stryCov_9fa48("53777");
      return stryMutAct_9fa48("53778") ? {} : (stryCov_9fa48("53778"), {
        ...this.stats,
        watcherCount: Array.from(this.watchers.values()).reduce(stryMutAct_9fa48("53779") ? () => undefined : (stryCov_9fa48("53779"), (sum, set) => stryMutAct_9fa48("53780") ? sum - set.size : (stryCov_9fa48("53780"), sum + set.size)), NUM.ZERO),
        cachedKeys: this.configCache.size
      });
    }
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("53781")) {
      {}
    } else {
      stryCov_9fa48("53781");
      return this.initialized;
    }
  }
  canReadConfig() {
    if (stryMutAct_9fa48("53782")) {
      {}
    } else {
      stryCov_9fa48("53782");
      return Boolean(stryMutAct_9fa48("53785") ? (this.controlPlaneSystemTableGateway || this.sqlQueryEngine) && this.cdcIntegrationService : stryMutAct_9fa48("53784") ? false : stryMutAct_9fa48("53783") ? true : (stryCov_9fa48("53783", "53784", "53785"), (stryMutAct_9fa48("53787") ? this.controlPlaneSystemTableGateway && this.sqlQueryEngine : stryMutAct_9fa48("53786") ? false : (stryCov_9fa48("53786", "53787"), this.controlPlaneSystemTableGateway || this.sqlQueryEngine)) || this.cdcIntegrationService));
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("53788")) {
      {}
    } else {
      stryCov_9fa48("53788");
      if (stryMutAct_9fa48("53790") ? false : stryMutAct_9fa48("53789") ? true : (stryCov_9fa48("53789", "53790"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("53791")) {
          {}
        } else {
          stryCov_9fa48("53791");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("53792") ? {} : (stryCov_9fa48("53792"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("53793") ? () => undefined : (stryCov_9fa48("53793"), () => this.cdcIntegrationService),
        getSqlQueryEngine: stryMutAct_9fa48("53794") ? () => undefined : (stryCov_9fa48("53794"), () => this.sqlQueryEngine),
        getSystemTableCache: stryMutAct_9fa48("53795") ? () => undefined : (stryCov_9fa48("53795"), () => this.systemTableCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Clear local cache.
   */
  clearCache() {
    if (stryMutAct_9fa48("53796")) {
      {}
    } else {
      stryCov_9fa48("53796");
      this.configCache.clear();
    }
  }
}
export { DynamicConfigService, ConfigValueType, CONFIG_DEFINITIONS };