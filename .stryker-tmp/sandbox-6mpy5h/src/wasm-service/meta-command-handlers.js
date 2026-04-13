/**
 * Command handlers for sys-wasm-meta service.
 * Each handler validates input and returns SQL statements
 * for the caller to execute. No direct SQL execution.
 *
 * Requirements: 2.1, 3.1, 3.5
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
import { SQL, TABLES, NUM, SERVICE_PROFILE, UNIFIED_SERVICE_TYPE } from '../constants/index.js';
import { MODULE_MANIFEST_COL as COL } from './module-manifest-constants.js';
import { validateModuleManifest, serializeModuleManifest } from './module-manifest-models.js';
import { SD_COL, SERVICE_DEFINITION_COLUMN_LIST, serializeServiceDefinition } from './wasm-service-models.js';
import { WASM_SERVICE_DEFINITION_STATUS } from './wasm-service-constants.js';
import { buildGetOperationSQL, buildListOperationsSQL } from './operation-lifecycle.js';
import { WASM_OPERATION_COL as WO_COL } from './wasm-meta-models-constants.js';
import { validateRuntimeDescriptor } from './runtime-descriptor-validator.js';
import { validateServiceDescriptor } from '../service/service-descriptor.js';
const META_COMMAND_ERROR_MSG = Object.freeze(stryMutAct_9fa48("160877") ? {} : (stryCov_9fa48("160877"), {
  MANIFEST_REQUIRED: stryMutAct_9fa48("160878") ? "" : (stryCov_9fa48("160878"), 'Manifest is required for publish'),
  NAMESPACE_REQUIRED: stryMutAct_9fa48("160879") ? "" : (stryCov_9fa48("160879"), 'Namespace is required'),
  NAME_REQUIRED: stryMutAct_9fa48("160880") ? "" : (stryCov_9fa48("160880"), 'Name is required'),
  VERSION_REQUIRED: stryMutAct_9fa48("160881") ? "" : (stryCov_9fa48("160881"), 'Version is required'),
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("160882") ? "" : (stryCov_9fa48("160882"), 'Service ID is required'),
  SERVICE_NAME_REQUIRED: stryMutAct_9fa48("160883") ? "" : (stryCov_9fa48("160883"), 'Service name is required'),
  HANDLER_FUNCTION_REQUIRED: stryMutAct_9fa48("160884") ? "" : (stryCov_9fa48("160884"), 'Handler function ID is required'),
  REPLICA_COUNT_ODD: stryMutAct_9fa48("160885") ? "" : (stryCov_9fa48("160885"), 'Replica count must be an odd number >= 3'),
  SERVICE_DESCRIPTOR_INVALID: stryMutAct_9fa48("160886") ? "" : (stryCov_9fa48("160886"), 'Service descriptor is invalid'),
  RUNTIME_DESCRIPTOR_INVALID: stryMutAct_9fa48("160887") ? "" : (stryCov_9fa48("160887"), 'Runtime descriptor is invalid'),
  RUNTIME_KIND_REQUIRED_FOR_UPDATE: stryMutAct_9fa48("160888") ? "" : (stryCov_9fa48("160888"), 'runtimeKind is required when updating runtime descriptor fields'),
  NO_FIELDS_TO_UPDATE: stryMutAct_9fa48("160889") ? "" : (stryCov_9fa48("160889"), 'No fields provided to update'),
  REPLICA_COUNT_REQUIRED: stryMutAct_9fa48("160890") ? "" : (stryCov_9fa48("160890"), 'Replica count is required for scale'),
  OPERATION_ID_REQUIRED: stryMutAct_9fa48("160891") ? "" : (stryCov_9fa48("160891"), 'Operation ID is required'),
  REQUEST_ID_REQUIRED: stryMutAct_9fa48("160892") ? "" : (stryCov_9fa48("160892"), 'Request ID is required')
}));
const COLUMN_LIST = stryMutAct_9fa48("160893") ? [] : (stryCov_9fa48("160893"), [COL.NAMESPACE, COL.NAME, COL.VERSION, COL.DIGEST, COL.RUN_EXPORT, COL.EXPORTS, COL.DEPENDENCIES, COL.CAPABILITIES, COL.SOURCE_REFERENCE, COL.ARTIFACT_POINTER, COL.CREATED_AT]);
const COLUMN_COUNT = COLUMN_LIST.length;
const INSERT_COLUMNS = COLUMN_LIST.join(stryMutAct_9fa48("160894") ? "" : (stryCov_9fa48("160894"), ', '));
const INSERT_PLACEHOLDERS = COLUMN_LIST.map(stryMutAct_9fa48("160895") ? () => undefined : (stryCov_9fa48("160895"), (_c, i) => stryMutAct_9fa48("160896") ? `` : (stryCov_9fa48("160896"), `?${stryMutAct_9fa48("160897") ? i - NUM.ONE : (stryCov_9fa48("160897"), i + NUM.ONE)}`))).join(stryMutAct_9fa48("160898") ? "" : (stryCov_9fa48("160898"), ', '));
const SELECT_ALL = stryMutAct_9fa48("160899") ? `` : (stryCov_9fa48("160899"), `${SQL.SELECT} * FROM ${TABLES.MODULE_MANIFESTS}`);

/**
 * Handle module publish command.
 * Validates manifest and produces INSERT SQL.
 * @param {Object} params - Command params with manifest.
 * @return {Object} Result with sql/params or errors.
 */
function handlePublishModule(params) {
  if (stryMutAct_9fa48("160900")) {
    {}
  } else {
    stryCov_9fa48("160900");
    if (stryMutAct_9fa48("160903") ? !params && !params.manifest : stryMutAct_9fa48("160902") ? false : stryMutAct_9fa48("160901") ? true : (stryCov_9fa48("160901", "160902", "160903"), (stryMutAct_9fa48("160904") ? params : (stryCov_9fa48("160904"), !params)) || (stryMutAct_9fa48("160905") ? params.manifest : (stryCov_9fa48("160905"), !params.manifest)))) {
      if (stryMutAct_9fa48("160906")) {
        {}
      } else {
        stryCov_9fa48("160906");
        return stryMutAct_9fa48("160907") ? {} : (stryCov_9fa48("160907"), {
          success: stryMutAct_9fa48("160908") ? true : (stryCov_9fa48("160908"), false),
          errors: stryMutAct_9fa48("160909") ? [] : (stryCov_9fa48("160909"), [META_COMMAND_ERROR_MSG.MANIFEST_REQUIRED])
        });
      }
    }
    const validation = validateModuleManifest(params.manifest);
    if (stryMutAct_9fa48("160912") ? false : stryMutAct_9fa48("160911") ? true : stryMutAct_9fa48("160910") ? validation.valid : (stryCov_9fa48("160910", "160911", "160912"), !validation.valid)) {
      if (stryMutAct_9fa48("160913")) {
        {}
      } else {
        stryCov_9fa48("160913");
        return stryMutAct_9fa48("160914") ? {} : (stryCov_9fa48("160914"), {
          success: stryMutAct_9fa48("160915") ? true : (stryCov_9fa48("160915"), false),
          errors: validation.errors
        });
      }
    }
    const row = serializeModuleManifest(params.manifest);
    const sqlParams = COLUMN_LIST.map(stryMutAct_9fa48("160916") ? () => undefined : (stryCov_9fa48("160916"), col => row[col]));
    const sql = (stryMutAct_9fa48("160917") ? `` : (stryCov_9fa48("160917"), `${SQL.INSERT_INTO} ${TABLES.MODULE_MANIFESTS}`)) + (stryMutAct_9fa48("160918") ? `` : (stryCov_9fa48("160918"), ` (${INSERT_COLUMNS})`)) + (stryMutAct_9fa48("160919") ? `` : (stryCov_9fa48("160919"), ` ${SQL.VALUES} (${INSERT_PLACEHOLDERS})`));
    return stryMutAct_9fa48("160920") ? {} : (stryCov_9fa48("160920"), {
      success: stryMutAct_9fa48("160921") ? false : (stryCov_9fa48("160921"), true),
      sql,
      params: sqlParams,
      manifest: params.manifest
    });
  }
}

/**
 * Handle get module command.
 * Validates params and produces SELECT SQL by composite key.
 * @param {Object} params - namespace, name, version.
 * @return {Object} Result with sql/params or errors.
 */
function handleGetModule(params) {
  if (stryMutAct_9fa48("160922")) {
    {}
  } else {
    stryCov_9fa48("160922");
    const errors = stryMutAct_9fa48("160923") ? ["Stryker was here"] : (stryCov_9fa48("160923"), []);
    if (stryMutAct_9fa48("160926") ? !params && !params.namespace : stryMutAct_9fa48("160925") ? false : stryMutAct_9fa48("160924") ? true : (stryCov_9fa48("160924", "160925", "160926"), (stryMutAct_9fa48("160927") ? params : (stryCov_9fa48("160927"), !params)) || (stryMutAct_9fa48("160928") ? params.namespace : (stryCov_9fa48("160928"), !params.namespace)))) {
      if (stryMutAct_9fa48("160929")) {
        {}
      } else {
        stryCov_9fa48("160929");
        errors.push(META_COMMAND_ERROR_MSG.NAMESPACE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("160932") ? !params && !params.name : stryMutAct_9fa48("160931") ? false : stryMutAct_9fa48("160930") ? true : (stryCov_9fa48("160930", "160931", "160932"), (stryMutAct_9fa48("160933") ? params : (stryCov_9fa48("160933"), !params)) || (stryMutAct_9fa48("160934") ? params.name : (stryCov_9fa48("160934"), !params.name)))) {
      if (stryMutAct_9fa48("160935")) {
        {}
      } else {
        stryCov_9fa48("160935");
        errors.push(META_COMMAND_ERROR_MSG.NAME_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("160938") ? !params && !params.version : stryMutAct_9fa48("160937") ? false : stryMutAct_9fa48("160936") ? true : (stryCov_9fa48("160936", "160937", "160938"), (stryMutAct_9fa48("160939") ? params : (stryCov_9fa48("160939"), !params)) || (stryMutAct_9fa48("160940") ? params.version : (stryCov_9fa48("160940"), !params.version)))) {
      if (stryMutAct_9fa48("160941")) {
        {}
      } else {
        stryCov_9fa48("160941");
        errors.push(META_COMMAND_ERROR_MSG.VERSION_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("160945") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("160944") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("160943") ? false : stryMutAct_9fa48("160942") ? true : (stryCov_9fa48("160942", "160943", "160944", "160945"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("160946")) {
        {}
      } else {
        stryCov_9fa48("160946");
        return stryMutAct_9fa48("160947") ? {} : (stryCov_9fa48("160947"), {
          success: stryMutAct_9fa48("160948") ? true : (stryCov_9fa48("160948"), false),
          errors
        });
      }
    }
    const sql = (stryMutAct_9fa48("160949") ? `` : (stryCov_9fa48("160949"), `${SELECT_ALL}`)) + (stryMutAct_9fa48("160950") ? `` : (stryCov_9fa48("160950"), ` ${SQL.WHERE} ${COL.NAMESPACE} = ?1`)) + (stryMutAct_9fa48("160951") ? `` : (stryCov_9fa48("160951"), ` ${SQL.AND} ${COL.NAME} = ?2`)) + (stryMutAct_9fa48("160952") ? `` : (stryCov_9fa48("160952"), ` ${SQL.AND} ${COL.VERSION} = ?3`));
    return stryMutAct_9fa48("160953") ? {} : (stryCov_9fa48("160953"), {
      success: stryMutAct_9fa48("160954") ? false : (stryCov_9fa48("160954"), true),
      sql,
      params: stryMutAct_9fa48("160955") ? [] : (stryCov_9fa48("160955"), [params.namespace, params.name, params.version])
    });
  }
}

/**
 * Handle list modules command.
 * Builds SELECT with optional namespace/name filters.
 * @param {Object} params - Optional namespace, name filters.
 * @return {Object} Result with sql/params.
 */
function handleListModules(params) {
  if (stryMutAct_9fa48("160956")) {
    {}
  } else {
    stryCov_9fa48("160956");
    const filters = stryMutAct_9fa48("160957") ? ["Stryker was here"] : (stryCov_9fa48("160957"), []);
    const sqlParams = stryMutAct_9fa48("160958") ? ["Stryker was here"] : (stryCov_9fa48("160958"), []);
    if (stryMutAct_9fa48("160961") ? params || params.namespace : stryMutAct_9fa48("160960") ? false : stryMutAct_9fa48("160959") ? true : (stryCov_9fa48("160959", "160960", "160961"), params && params.namespace)) {
      if (stryMutAct_9fa48("160962")) {
        {}
      } else {
        stryCov_9fa48("160962");
        sqlParams.push(params.namespace);
        filters.push(stryMutAct_9fa48("160963") ? `` : (stryCov_9fa48("160963"), `${COL.NAMESPACE} = ?${sqlParams.length}`));
      }
    }
    if (stryMutAct_9fa48("160966") ? params || params.name : stryMutAct_9fa48("160965") ? false : stryMutAct_9fa48("160964") ? true : (stryCov_9fa48("160964", "160965", "160966"), params && params.name)) {
      if (stryMutAct_9fa48("160967")) {
        {}
      } else {
        stryCov_9fa48("160967");
        sqlParams.push(params.name);
        filters.push(stryMutAct_9fa48("160968") ? `` : (stryCov_9fa48("160968"), `${COL.NAME} = ?${sqlParams.length}`));
      }
    }
    let sql = SELECT_ALL;
    if (stryMutAct_9fa48("160972") ? filters.length <= NUM.ZERO : stryMutAct_9fa48("160971") ? filters.length >= NUM.ZERO : stryMutAct_9fa48("160970") ? false : stryMutAct_9fa48("160969") ? true : (stryCov_9fa48("160969", "160970", "160971", "160972"), filters.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("160973")) {
        {}
      } else {
        stryCov_9fa48("160973");
        sql += stryMutAct_9fa48("160974") ? `` : (stryCov_9fa48("160974"), ` ${SQL.WHERE} ${filters.join(stryMutAct_9fa48("160975") ? `` : (stryCov_9fa48("160975"), ` ${SQL.AND} `))}`);
      }
    }
    return stryMutAct_9fa48("160976") ? {} : (stryCov_9fa48("160976"), {
      success: stryMutAct_9fa48("160977") ? false : (stryCov_9fa48("160977"), true),
      sql,
      params: sqlParams
    });
  }
}
const SD_INSERT_COLUMNS = SERVICE_DEFINITION_COLUMN_LIST.join(stryMutAct_9fa48("160978") ? "" : (stryCov_9fa48("160978"), ', '));
const SD_INSERT_PLACEHOLDERS = SERVICE_DEFINITION_COLUMN_LIST.map(stryMutAct_9fa48("160979") ? () => undefined : (stryCov_9fa48("160979"), (_c, i) => stryMutAct_9fa48("160980") ? `` : (stryCov_9fa48("160980"), `?${stryMutAct_9fa48("160981") ? i - NUM.ONE : (stryCov_9fa48("160981"), i + NUM.ONE)}`))).join(stryMutAct_9fa48("160982") ? "" : (stryCov_9fa48("160982"), ', '));

/**
 * Validate that replicaCount is an odd number >= 3.
 * @param {number} count - Replica count to validate.
 * @return {boolean} True if valid.
 */
function isValidReplicaCount(count) {
  if (stryMutAct_9fa48("160983")) {
    {}
  } else {
    stryCov_9fa48("160983");
    return stryMutAct_9fa48("160986") ? Number.isInteger(count) && count >= NUM.THREE || count % NUM.TWO !== NUM.ZERO : stryMutAct_9fa48("160985") ? false : stryMutAct_9fa48("160984") ? true : (stryCov_9fa48("160984", "160985", "160986"), (stryMutAct_9fa48("160988") ? Number.isInteger(count) || count >= NUM.THREE : stryMutAct_9fa48("160987") ? true : (stryCov_9fa48("160987", "160988"), Number.isInteger(count) && (stryMutAct_9fa48("160991") ? count < NUM.THREE : stryMutAct_9fa48("160990") ? count > NUM.THREE : stryMutAct_9fa48("160989") ? true : (stryCov_9fa48("160989", "160990", "160991"), count >= NUM.THREE)))) && (stryMutAct_9fa48("160993") ? count % NUM.TWO === NUM.ZERO : stryMutAct_9fa48("160992") ? true : (stryCov_9fa48("160992", "160993"), (stryMutAct_9fa48("160994") ? count * NUM.TWO : (stryCov_9fa48("160994"), count % NUM.TWO)) !== NUM.ZERO)));
  }
}

/**
 * Handle create service command.
 * Validates params and produces INSERT SQL for service_definitions.
 * @param {Object} params - Service definition params.
 * @return {Object} Result with sql/params or errors.
 */
function handleCreateService(params) {
  if (stryMutAct_9fa48("160995")) {
    {}
  } else {
    stryCov_9fa48("160995");
    const errors = stryMutAct_9fa48("160996") ? ["Stryker was here"] : (stryCov_9fa48("160996"), []);
    if (stryMutAct_9fa48("160999") ? !params && !params.serviceId : stryMutAct_9fa48("160998") ? false : stryMutAct_9fa48("160997") ? true : (stryCov_9fa48("160997", "160998", "160999"), (stryMutAct_9fa48("161000") ? params : (stryCov_9fa48("161000"), !params)) || (stryMutAct_9fa48("161001") ? params.serviceId : (stryCov_9fa48("161001"), !params.serviceId)))) {
      if (stryMutAct_9fa48("161002")) {
        {}
      } else {
        stryCov_9fa48("161002");
        errors.push(META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161005") ? !params && !params.serviceName : stryMutAct_9fa48("161004") ? false : stryMutAct_9fa48("161003") ? true : (stryCov_9fa48("161003", "161004", "161005"), (stryMutAct_9fa48("161006") ? params : (stryCov_9fa48("161006"), !params)) || (stryMutAct_9fa48("161007") ? params.serviceName : (stryCov_9fa48("161007"), !params.serviceName)))) {
      if (stryMutAct_9fa48("161008")) {
        {}
      } else {
        stryCov_9fa48("161008");
        errors.push(META_COMMAND_ERROR_MSG.SERVICE_NAME_REQUIRED);
      }
    }
    const isSqlEngine = stryMutAct_9fa48("161011") ? params || params.serviceProfile === SERVICE_PROFILE.SQL_ENGINE : stryMutAct_9fa48("161010") ? false : stryMutAct_9fa48("161009") ? true : (stryCov_9fa48("161009", "161010", "161011"), params && (stryMutAct_9fa48("161013") ? params.serviceProfile !== SERVICE_PROFILE.SQL_ENGINE : stryMutAct_9fa48("161012") ? true : (stryCov_9fa48("161012", "161013"), params.serviceProfile === SERVICE_PROFILE.SQL_ENGINE)));
    if (stryMutAct_9fa48("161016") ? !isSqlEngine || !params || !params.handlerFunctionId : stryMutAct_9fa48("161015") ? false : stryMutAct_9fa48("161014") ? true : (stryCov_9fa48("161014", "161015", "161016"), (stryMutAct_9fa48("161017") ? isSqlEngine : (stryCov_9fa48("161017"), !isSqlEngine)) && (stryMutAct_9fa48("161019") ? !params && !params.handlerFunctionId : stryMutAct_9fa48("161018") ? true : (stryCov_9fa48("161018", "161019"), (stryMutAct_9fa48("161020") ? params : (stryCov_9fa48("161020"), !params)) || (stryMutAct_9fa48("161021") ? params.handlerFunctionId : (stryCov_9fa48("161021"), !params.handlerFunctionId)))))) {
      if (stryMutAct_9fa48("161022")) {
        {}
      } else {
        stryCov_9fa48("161022");
        errors.push(META_COMMAND_ERROR_MSG.HANDLER_FUNCTION_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161025") ? params && params.replicaCount !== undefined || !isValidReplicaCount(params.replicaCount) : stryMutAct_9fa48("161024") ? false : stryMutAct_9fa48("161023") ? true : (stryCov_9fa48("161023", "161024", "161025"), (stryMutAct_9fa48("161027") ? params || params.replicaCount !== undefined : stryMutAct_9fa48("161026") ? true : (stryCov_9fa48("161026", "161027"), params && (stryMutAct_9fa48("161029") ? params.replicaCount === undefined : stryMutAct_9fa48("161028") ? true : (stryCov_9fa48("161028", "161029"), params.replicaCount !== undefined)))) && (stryMutAct_9fa48("161030") ? isValidReplicaCount(params.replicaCount) : (stryCov_9fa48("161030"), !isValidReplicaCount(params.replicaCount))))) {
      if (stryMutAct_9fa48("161031")) {
        {}
      } else {
        stryCov_9fa48("161031");
        errors.push(META_COMMAND_ERROR_MSG.REPLICA_COUNT_ODD);
      }
    }
    if (stryMutAct_9fa48("161035") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("161034") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("161033") ? false : stryMutAct_9fa48("161032") ? true : (stryCov_9fa48("161032", "161033", "161034", "161035"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("161036")) {
        {}
      } else {
        stryCov_9fa48("161036");
        return stryMutAct_9fa48("161037") ? {} : (stryCov_9fa48("161037"), {
          success: stryMutAct_9fa48("161038") ? true : (stryCov_9fa48("161038"), false),
          errors
        });
      }
    }
    const row = serializeServiceDefinition(params);
    const descriptorResult = validateServiceDescriptor(stryMutAct_9fa48("161039") ? {} : (stryCov_9fa48("161039"), {
      serviceId: row[SD_COL.SERVICE_ID],
      serviceType: stryMutAct_9fa48("161042") ? params.serviceType && UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE : stryMutAct_9fa48("161041") ? false : stryMutAct_9fa48("161040") ? true : (stryCov_9fa48("161040", "161041", "161042"), params.serviceType || UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE),
      replicaCount: row[SD_COL.REPLICA_COUNT],
      runtimeKind: row[SD_COL.RUNTIME_KIND],
      runtimeRef: row[SD_COL.RUNTIME_REF],
      runtimeConfig: row[SD_COL.RUNTIME_CONFIG]
    }));
    if (stryMutAct_9fa48("161045") ? false : stryMutAct_9fa48("161044") ? true : stryMutAct_9fa48("161043") ? descriptorResult.valid : (stryCov_9fa48("161043", "161044", "161045"), !descriptorResult.valid)) {
      if (stryMutAct_9fa48("161046")) {
        {}
      } else {
        stryCov_9fa48("161046");
        return stryMutAct_9fa48("161047") ? {} : (stryCov_9fa48("161047"), {
          success: stryMutAct_9fa48("161048") ? true : (stryCov_9fa48("161048"), false),
          errors: stryMutAct_9fa48("161049") ? [] : (stryCov_9fa48("161049"), [META_COMMAND_ERROR_MSG.SERVICE_DESCRIPTOR_INVALID, ...descriptorResult.errors])
        });
      }
    }
    const sqlParams = SERVICE_DEFINITION_COLUMN_LIST.map(stryMutAct_9fa48("161050") ? () => undefined : (stryCov_9fa48("161050"), col => row[col]));
    const sql = (stryMutAct_9fa48("161051") ? `` : (stryCov_9fa48("161051"), `${SQL.INSERT_INTO} ${TABLES.SERVICE_DEFINITIONS}`)) + (stryMutAct_9fa48("161052") ? `` : (stryCov_9fa48("161052"), ` (${SD_INSERT_COLUMNS})`)) + (stryMutAct_9fa48("161053") ? `` : (stryCov_9fa48("161053"), ` ${SQL.VALUES} (${SD_INSERT_PLACEHOLDERS})`));
    return stryMutAct_9fa48("161054") ? {} : (stryCov_9fa48("161054"), {
      success: stryMutAct_9fa48("161055") ? false : (stryCov_9fa48("161055"), true),
      sql,
      params: sqlParams,
      serviceId: params.serviceId
    });
  }
}

/** Updatable fields mapping from param name to column name. */
const UPDATABLE_FIELDS = Object.freeze(stryMutAct_9fa48("161056") ? {} : (stryCov_9fa48("161056"), {
  serviceProfile: SD_COL.SERVICE_PROFILE,
  handlerFunctionId: SD_COL.HANDLER_FUNCTION_ID,
  runtimeKind: SD_COL.RUNTIME_KIND,
  runtimeRef: SD_COL.RUNTIME_REF,
  runtimeConfig: SD_COL.RUNTIME_CONFIG,
  readConsistency: SD_COL.READ_CONSISTENCY,
  writeConsistency: SD_COL.WRITE_CONSISTENCY,
  resourceBudget: SD_COL.RESOURCE_BUDGET,
  safetyIntervalMs: SD_COL.SAFETY_INTERVAL_MS
}));

/**
 * Handle update service command.
 * Validates params and produces UPDATE SQL for service_definitions.
 * @param {Object} params - Fields to update plus serviceId.
 * @return {Object} Result with sql/params or errors.
 */
function handleUpdateService(params) {
  if (stryMutAct_9fa48("161057")) {
    {}
  } else {
    stryCov_9fa48("161057");
    if (stryMutAct_9fa48("161060") ? !params && !params.serviceId : stryMutAct_9fa48("161059") ? false : stryMutAct_9fa48("161058") ? true : (stryCov_9fa48("161058", "161059", "161060"), (stryMutAct_9fa48("161061") ? params : (stryCov_9fa48("161061"), !params)) || (stryMutAct_9fa48("161062") ? params.serviceId : (stryCov_9fa48("161062"), !params.serviceId)))) {
      if (stryMutAct_9fa48("161063")) {
        {}
      } else {
        stryCov_9fa48("161063");
        return stryMutAct_9fa48("161064") ? {} : (stryCov_9fa48("161064"), {
          success: stryMutAct_9fa48("161065") ? true : (stryCov_9fa48("161065"), false),
          errors: stryMutAct_9fa48("161066") ? [] : (stryCov_9fa48("161066"), [META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED])
        });
      }
    }
    const hasRuntimeField = stryMutAct_9fa48("161069") ? (params.runtimeKind !== undefined || params.runtimeRef !== undefined) && params.runtimeConfig !== undefined : stryMutAct_9fa48("161068") ? false : stryMutAct_9fa48("161067") ? true : (stryCov_9fa48("161067", "161068", "161069"), (stryMutAct_9fa48("161071") ? params.runtimeKind !== undefined && params.runtimeRef !== undefined : stryMutAct_9fa48("161070") ? false : (stryCov_9fa48("161070", "161071"), (stryMutAct_9fa48("161073") ? params.runtimeKind === undefined : stryMutAct_9fa48("161072") ? false : (stryCov_9fa48("161072", "161073"), params.runtimeKind !== undefined)) || (stryMutAct_9fa48("161075") ? params.runtimeRef === undefined : stryMutAct_9fa48("161074") ? false : (stryCov_9fa48("161074", "161075"), params.runtimeRef !== undefined)))) || (stryMutAct_9fa48("161077") ? params.runtimeConfig === undefined : stryMutAct_9fa48("161076") ? false : (stryCov_9fa48("161076", "161077"), params.runtimeConfig !== undefined)));
    if (stryMutAct_9fa48("161080") ? hasRuntimeField || params.runtimeKind === undefined : stryMutAct_9fa48("161079") ? false : stryMutAct_9fa48("161078") ? true : (stryCov_9fa48("161078", "161079", "161080"), hasRuntimeField && (stryMutAct_9fa48("161082") ? params.runtimeKind !== undefined : stryMutAct_9fa48("161081") ? true : (stryCov_9fa48("161081", "161082"), params.runtimeKind === undefined)))) {
      if (stryMutAct_9fa48("161083")) {
        {}
      } else {
        stryCov_9fa48("161083");
        return stryMutAct_9fa48("161084") ? {} : (stryCov_9fa48("161084"), {
          success: stryMutAct_9fa48("161085") ? true : (stryCov_9fa48("161085"), false),
          errors: stryMutAct_9fa48("161086") ? [] : (stryCov_9fa48("161086"), [META_COMMAND_ERROR_MSG.RUNTIME_KIND_REQUIRED_FOR_UPDATE])
        });
      }
    }
    if (stryMutAct_9fa48("161088") ? false : stryMutAct_9fa48("161087") ? true : (stryCov_9fa48("161087", "161088"), hasRuntimeField)) {
      if (stryMutAct_9fa48("161089")) {
        {}
      } else {
        stryCov_9fa48("161089");
        const runtimeConfig = (stryMutAct_9fa48("161092") ? typeof params.runtimeConfig === 'object' || params.runtimeConfig !== null : stryMutAct_9fa48("161091") ? false : stryMutAct_9fa48("161090") ? true : (stryCov_9fa48("161090", "161091", "161092"), (stryMutAct_9fa48("161094") ? typeof params.runtimeConfig !== 'object' : stryMutAct_9fa48("161093") ? true : (stryCov_9fa48("161093", "161094"), typeof params.runtimeConfig === (stryMutAct_9fa48("161095") ? "" : (stryCov_9fa48("161095"), 'object')))) && (stryMutAct_9fa48("161097") ? params.runtimeConfig === null : stryMutAct_9fa48("161096") ? true : (stryCov_9fa48("161096", "161097"), params.runtimeConfig !== null)))) ? JSON.stringify(params.runtimeConfig) : params.runtimeConfig;
        const descriptorResult = validateRuntimeDescriptor(stryMutAct_9fa48("161098") ? {} : (stryCov_9fa48("161098"), {
          runtimeKind: params.runtimeKind,
          runtimeRef: stryMutAct_9fa48("161099") ? params.runtimeRef && null : (stryCov_9fa48("161099"), params.runtimeRef ?? null),
          runtimeConfig: stryMutAct_9fa48("161100") ? runtimeConfig && null : (stryCov_9fa48("161100"), runtimeConfig ?? null)
        }));
        if (stryMutAct_9fa48("161103") ? false : stryMutAct_9fa48("161102") ? true : stryMutAct_9fa48("161101") ? descriptorResult.valid : (stryCov_9fa48("161101", "161102", "161103"), !descriptorResult.valid)) {
          if (stryMutAct_9fa48("161104")) {
            {}
          } else {
            stryCov_9fa48("161104");
            return stryMutAct_9fa48("161105") ? {} : (stryCov_9fa48("161105"), {
              success: stryMutAct_9fa48("161106") ? true : (stryCov_9fa48("161106"), false),
              errors: stryMutAct_9fa48("161107") ? [] : (stryCov_9fa48("161107"), [META_COMMAND_ERROR_MSG.RUNTIME_DESCRIPTOR_INVALID, ...descriptorResult.errors])
            });
          }
        }
      }
    }
    const setClauses = stryMutAct_9fa48("161108") ? ["Stryker was here"] : (stryCov_9fa48("161108"), []);
    const sqlParams = stryMutAct_9fa48("161109") ? ["Stryker was here"] : (stryCov_9fa48("161109"), []);
    const fieldKeys = Object.keys(UPDATABLE_FIELDS);
    for (let i = NUM.ZERO; stryMutAct_9fa48("161112") ? i >= fieldKeys.length : stryMutAct_9fa48("161111") ? i <= fieldKeys.length : stryMutAct_9fa48("161110") ? false : (stryCov_9fa48("161110", "161111", "161112"), i < fieldKeys.length); stryMutAct_9fa48("161113") ? i-- : (stryCov_9fa48("161113"), i++)) {
      if (stryMutAct_9fa48("161114")) {
        {}
      } else {
        stryCov_9fa48("161114");
        const key = fieldKeys[i];
        if (stryMutAct_9fa48("161117") ? params[key] === undefined : stryMutAct_9fa48("161116") ? false : stryMutAct_9fa48("161115") ? true : (stryCov_9fa48("161115", "161116", "161117"), params[key] !== undefined)) {
          if (stryMutAct_9fa48("161118")) {
            {}
          } else {
            stryCov_9fa48("161118");
            let value = params[key];
            if (stryMutAct_9fa48("161121") ? key !== 'resourceBudget' : stryMutAct_9fa48("161120") ? false : stryMutAct_9fa48("161119") ? true : (stryCov_9fa48("161119", "161120", "161121"), key === (stryMutAct_9fa48("161122") ? "" : (stryCov_9fa48("161122"), 'resourceBudget')))) {
              if (stryMutAct_9fa48("161123")) {
                {}
              } else {
                stryCov_9fa48("161123");
                value = JSON.stringify(params[key]);
              }
            } else if (stryMutAct_9fa48("161126") ? key === 'runtimeConfig' && typeof params[key] === 'object' || params[key] !== null : stryMutAct_9fa48("161125") ? false : stryMutAct_9fa48("161124") ? true : (stryCov_9fa48("161124", "161125", "161126"), (stryMutAct_9fa48("161128") ? key === 'runtimeConfig' || typeof params[key] === 'object' : stryMutAct_9fa48("161127") ? true : (stryCov_9fa48("161127", "161128"), (stryMutAct_9fa48("161130") ? key !== 'runtimeConfig' : stryMutAct_9fa48("161129") ? true : (stryCov_9fa48("161129", "161130"), key === (stryMutAct_9fa48("161131") ? "" : (stryCov_9fa48("161131"), 'runtimeConfig')))) && (stryMutAct_9fa48("161133") ? typeof params[key] !== 'object' : stryMutAct_9fa48("161132") ? true : (stryCov_9fa48("161132", "161133"), typeof params[key] === (stryMutAct_9fa48("161134") ? "" : (stryCov_9fa48("161134"), 'object')))))) && (stryMutAct_9fa48("161136") ? params[key] === null : stryMutAct_9fa48("161135") ? true : (stryCov_9fa48("161135", "161136"), params[key] !== null)))) {
              if (stryMutAct_9fa48("161137")) {
                {}
              } else {
                stryCov_9fa48("161137");
                value = JSON.stringify(params[key]);
              }
            }
            sqlParams.push(value);
            setClauses.push(stryMutAct_9fa48("161138") ? `` : (stryCov_9fa48("161138"), `${UPDATABLE_FIELDS[key]} = ?${sqlParams.length}`));
          }
        }
      }
    }
    if (stryMutAct_9fa48("161141") ? setClauses.length !== NUM.ZERO : stryMutAct_9fa48("161140") ? false : stryMutAct_9fa48("161139") ? true : (stryCov_9fa48("161139", "161140", "161141"), setClauses.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("161142")) {
        {}
      } else {
        stryCov_9fa48("161142");
        return stryMutAct_9fa48("161143") ? {} : (stryCov_9fa48("161143"), {
          success: stryMutAct_9fa48("161144") ? true : (stryCov_9fa48("161144"), false),
          errors: stryMutAct_9fa48("161145") ? [] : (stryCov_9fa48("161145"), [META_COMMAND_ERROR_MSG.NO_FIELDS_TO_UPDATE])
        });
      }
    }
    sqlParams.push(Date.now());
    setClauses.push(stryMutAct_9fa48("161146") ? `` : (stryCov_9fa48("161146"), `${SD_COL.UPDATED_AT} = ?${sqlParams.length}`));
    sqlParams.push(params.serviceId);
    const whereIdx = sqlParams.length;
    const sql = (stryMutAct_9fa48("161147") ? `` : (stryCov_9fa48("161147"), `${SQL.UPDATE} ${TABLES.SERVICE_DEFINITIONS}`)) + (stryMutAct_9fa48("161148") ? `` : (stryCov_9fa48("161148"), ` ${SQL.SET} ${setClauses.join(stryMutAct_9fa48("161149") ? "" : (stryCov_9fa48("161149"), ', '))}`)) + (stryMutAct_9fa48("161150") ? `` : (stryCov_9fa48("161150"), ` ${SQL.WHERE} ${SD_COL.SERVICE_ID} = ?${whereIdx}`));
    return stryMutAct_9fa48("161151") ? {} : (stryCov_9fa48("161151"), {
      success: stryMutAct_9fa48("161152") ? false : (stryCov_9fa48("161152"), true),
      sql,
      params: sqlParams,
      serviceId: params.serviceId
    });
  }
}

/**
 * Handle scale service command.
 * Validates params and produces UPDATE SQL for replica_count.
 * @param {Object} params - serviceId and replicaCount.
 * @return {Object} Result with sql/params or errors.
 */
function handleScaleService(params) {
  if (stryMutAct_9fa48("161153")) {
    {}
  } else {
    stryCov_9fa48("161153");
    const errors = stryMutAct_9fa48("161154") ? ["Stryker was here"] : (stryCov_9fa48("161154"), []);
    if (stryMutAct_9fa48("161157") ? !params && !params.serviceId : stryMutAct_9fa48("161156") ? false : stryMutAct_9fa48("161155") ? true : (stryCov_9fa48("161155", "161156", "161157"), (stryMutAct_9fa48("161158") ? params : (stryCov_9fa48("161158"), !params)) || (stryMutAct_9fa48("161159") ? params.serviceId : (stryCov_9fa48("161159"), !params.serviceId)))) {
      if (stryMutAct_9fa48("161160")) {
        {}
      } else {
        stryCov_9fa48("161160");
        errors.push(META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161163") ? !params && params.replicaCount === undefined : stryMutAct_9fa48("161162") ? false : stryMutAct_9fa48("161161") ? true : (stryCov_9fa48("161161", "161162", "161163"), (stryMutAct_9fa48("161164") ? params : (stryCov_9fa48("161164"), !params)) || (stryMutAct_9fa48("161166") ? params.replicaCount !== undefined : stryMutAct_9fa48("161165") ? false : (stryCov_9fa48("161165", "161166"), params.replicaCount === undefined)))) {
      if (stryMutAct_9fa48("161167")) {
        {}
      } else {
        stryCov_9fa48("161167");
        errors.push(META_COMMAND_ERROR_MSG.REPLICA_COUNT_REQUIRED);
      }
    } else if (stryMutAct_9fa48("161170") ? false : stryMutAct_9fa48("161169") ? true : stryMutAct_9fa48("161168") ? isValidReplicaCount(params.replicaCount) : (stryCov_9fa48("161168", "161169", "161170"), !isValidReplicaCount(params.replicaCount))) {
      if (stryMutAct_9fa48("161171")) {
        {}
      } else {
        stryCov_9fa48("161171");
        errors.push(META_COMMAND_ERROR_MSG.REPLICA_COUNT_ODD);
      }
    }
    if (stryMutAct_9fa48("161175") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("161174") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("161173") ? false : stryMutAct_9fa48("161172") ? true : (stryCov_9fa48("161172", "161173", "161174", "161175"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("161176")) {
        {}
      } else {
        stryCov_9fa48("161176");
        return stryMutAct_9fa48("161177") ? {} : (stryCov_9fa48("161177"), {
          success: stryMutAct_9fa48("161178") ? true : (stryCov_9fa48("161178"), false),
          errors
        });
      }
    }
    const now = Date.now();
    const sqlParams = stryMutAct_9fa48("161179") ? [] : (stryCov_9fa48("161179"), [params.replicaCount, now, params.serviceId]);
    const sql = (stryMutAct_9fa48("161180") ? `` : (stryCov_9fa48("161180"), `${SQL.UPDATE} ${TABLES.SERVICE_DEFINITIONS}`)) + (stryMutAct_9fa48("161181") ? `` : (stryCov_9fa48("161181"), ` ${SQL.SET} ${SD_COL.REPLICA_COUNT} = ?1,`)) + (stryMutAct_9fa48("161182") ? `` : (stryCov_9fa48("161182"), ` ${SD_COL.UPDATED_AT} = ?2`)) + (stryMutAct_9fa48("161183") ? `` : (stryCov_9fa48("161183"), ` ${SQL.WHERE} ${SD_COL.SERVICE_ID} = ?3`));
    return stryMutAct_9fa48("161184") ? {} : (stryCov_9fa48("161184"), {
      success: stryMutAct_9fa48("161185") ? false : (stryCov_9fa48("161185"), true),
      sql,
      params: sqlParams,
      serviceId: params.serviceId
    });
  }
}

/**
 * Handle delete service command (soft delete).
 * Sets status to inactive.
 * @param {Object} params - serviceId.
 * @return {Object} Result with sql/params or errors.
 */
function handleDeleteService(params) {
  if (stryMutAct_9fa48("161186")) {
    {}
  } else {
    stryCov_9fa48("161186");
    if (stryMutAct_9fa48("161189") ? !params && !params.serviceId : stryMutAct_9fa48("161188") ? false : stryMutAct_9fa48("161187") ? true : (stryCov_9fa48("161187", "161188", "161189"), (stryMutAct_9fa48("161190") ? params : (stryCov_9fa48("161190"), !params)) || (stryMutAct_9fa48("161191") ? params.serviceId : (stryCov_9fa48("161191"), !params.serviceId)))) {
      if (stryMutAct_9fa48("161192")) {
        {}
      } else {
        stryCov_9fa48("161192");
        return stryMutAct_9fa48("161193") ? {} : (stryCov_9fa48("161193"), {
          success: stryMutAct_9fa48("161194") ? true : (stryCov_9fa48("161194"), false),
          errors: stryMutAct_9fa48("161195") ? [] : (stryCov_9fa48("161195"), [META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED])
        });
      }
    }
    const now = Date.now();
    const sqlParams = stryMutAct_9fa48("161196") ? [] : (stryCov_9fa48("161196"), [WASM_SERVICE_DEFINITION_STATUS.INACTIVE, now, params.serviceId]);
    const sql = (stryMutAct_9fa48("161197") ? `` : (stryCov_9fa48("161197"), `${SQL.UPDATE} ${TABLES.SERVICE_DEFINITIONS}`)) + (stryMutAct_9fa48("161198") ? `` : (stryCov_9fa48("161198"), ` ${SQL.SET} ${SD_COL.STATUS} = ?1,`)) + (stryMutAct_9fa48("161199") ? `` : (stryCov_9fa48("161199"), ` ${SD_COL.UPDATED_AT} = ?2`)) + (stryMutAct_9fa48("161200") ? `` : (stryCov_9fa48("161200"), ` ${SQL.WHERE} ${SD_COL.SERVICE_ID} = ?3`));
    return stryMutAct_9fa48("161201") ? {} : (stryCov_9fa48("161201"), {
      success: stryMutAct_9fa48("161202") ? false : (stryCov_9fa48("161202"), true),
      sql,
      params: sqlParams,
      serviceId: params.serviceId
    });
  }
}

/**
 * Handle get operation command.
 * Validates operationId and returns SQL to fetch a single operation.
 * @param {Object} params - Command params with operationId.
 * @return {Object} Result with sql/params or errors.
 */
function handleGetOperation(params) {
  if (stryMutAct_9fa48("161203")) {
    {}
  } else {
    stryCov_9fa48("161203");
    if (stryMutAct_9fa48("161206") ? !params && !params.operationId : stryMutAct_9fa48("161205") ? false : stryMutAct_9fa48("161204") ? true : (stryCov_9fa48("161204", "161205", "161206"), (stryMutAct_9fa48("161207") ? params : (stryCov_9fa48("161207"), !params)) || (stryMutAct_9fa48("161208") ? params.operationId : (stryCov_9fa48("161208"), !params.operationId)))) {
      if (stryMutAct_9fa48("161209")) {
        {}
      } else {
        stryCov_9fa48("161209");
        return stryMutAct_9fa48("161210") ? {} : (stryCov_9fa48("161210"), {
          success: stryMutAct_9fa48("161211") ? true : (stryCov_9fa48("161211"), false),
          errors: stryMutAct_9fa48("161212") ? [] : (stryCov_9fa48("161212"), [META_COMMAND_ERROR_MSG.OPERATION_ID_REQUIRED])
        });
      }
    }
    const {
      sql,
      params: sqlParams
    } = buildGetOperationSQL(params.operationId);
    return stryMutAct_9fa48("161213") ? {} : (stryCov_9fa48("161213"), {
      success: stryMutAct_9fa48("161214") ? false : (stryCov_9fa48("161214"), true),
      sql,
      params: sqlParams
    });
  }
}

/**
 * Handle list operations command.
 * Returns SQL to list operations with optional filters.
 * @param {Object} params - Optional tenantId and state filters.
 * @return {Object} Result with sql/params.
 */
function handleListOperations(params) {
  if (stryMutAct_9fa48("161215")) {
    {}
  } else {
    stryCov_9fa48("161215");
    const tenantId = (stryMutAct_9fa48("161218") ? params || params.tenantId : stryMutAct_9fa48("161217") ? false : stryMutAct_9fa48("161216") ? true : (stryCov_9fa48("161216", "161217", "161218"), params && params.tenantId)) ? params.tenantId : undefined;
    const state = (stryMutAct_9fa48("161221") ? params || params.state : stryMutAct_9fa48("161220") ? false : stryMutAct_9fa48("161219") ? true : (stryCov_9fa48("161219", "161220", "161221"), params && params.state)) ? params.state : undefined;
    const {
      sql,
      params: sqlParams
    } = buildListOperationsSQL(tenantId, state);
    return stryMutAct_9fa48("161222") ? {} : (stryCov_9fa48("161222"), {
      success: stryMutAct_9fa48("161223") ? false : (stryCov_9fa48("161223"), true),
      sql,
      params: sqlParams
    });
  }
}

/**
 * Build a standard response envelope for an operation result.
 * @param {Object} operation - Operation row from the database.
 * @param {string} requestId - Caller-supplied request identifier.
 * @return {Object} Frozen response envelope or error result.
 */
function buildOperationResponse(operation, requestId) {
  if (stryMutAct_9fa48("161224")) {
    {}
  } else {
    stryCov_9fa48("161224");
    if (stryMutAct_9fa48("161227") ? false : stryMutAct_9fa48("161226") ? true : stryMutAct_9fa48("161225") ? requestId : (stryCov_9fa48("161225", "161226", "161227"), !requestId)) {
      if (stryMutAct_9fa48("161228")) {
        {}
      } else {
        stryCov_9fa48("161228");
        return stryMutAct_9fa48("161229") ? {} : (stryCov_9fa48("161229"), {
          success: stryMutAct_9fa48("161230") ? true : (stryCov_9fa48("161230"), false),
          errors: stryMutAct_9fa48("161231") ? [] : (stryCov_9fa48("161231"), [META_COMMAND_ERROR_MSG.REQUEST_ID_REQUIRED])
        });
      }
    }
    return Object.freeze(stryMutAct_9fa48("161232") ? {} : (stryCov_9fa48("161232"), {
      requestId,
      operationId: operation[WO_COL.OPERATION_ID],
      state: operation[WO_COL.STATE],
      result: stryMutAct_9fa48("161233") ? operation[WO_COL.RESULT] && null : (stryCov_9fa48("161233"), operation[WO_COL.RESULT] ?? null),
      error: stryMutAct_9fa48("161234") ? operation[WO_COL.ERROR] && null : (stryCov_9fa48("161234"), operation[WO_COL.ERROR] ?? null),
      createdAt: operation[WO_COL.CREATED_AT],
      updatedAt: operation[WO_COL.UPDATED_AT]
    }));
  }
}

/**
 * Build a minimal response for async mutation commands.
 * @param {string} operationId - The created operation identifier.
 * @param {string} requestId - Caller-supplied request identifier.
 * @return {Object} Frozen minimal response or error result.
 */
function buildMutationResponse(operationId, requestId) {
  if (stryMutAct_9fa48("161235")) {
    {}
  } else {
    stryCov_9fa48("161235");
    const errors = stryMutAct_9fa48("161236") ? ["Stryker was here"] : (stryCov_9fa48("161236"), []);
    if (stryMutAct_9fa48("161239") ? false : stryMutAct_9fa48("161238") ? true : stryMutAct_9fa48("161237") ? operationId : (stryCov_9fa48("161237", "161238", "161239"), !operationId)) {
      if (stryMutAct_9fa48("161240")) {
        {}
      } else {
        stryCov_9fa48("161240");
        errors.push(META_COMMAND_ERROR_MSG.OPERATION_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161243") ? false : stryMutAct_9fa48("161242") ? true : stryMutAct_9fa48("161241") ? requestId : (stryCov_9fa48("161241", "161242", "161243"), !requestId)) {
      if (stryMutAct_9fa48("161244")) {
        {}
      } else {
        stryCov_9fa48("161244");
        errors.push(META_COMMAND_ERROR_MSG.REQUEST_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161248") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("161247") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("161246") ? false : stryMutAct_9fa48("161245") ? true : (stryCov_9fa48("161245", "161246", "161247", "161248"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("161249")) {
        {}
      } else {
        stryCov_9fa48("161249");
        return stryMutAct_9fa48("161250") ? {} : (stryCov_9fa48("161250"), {
          success: stryMutAct_9fa48("161251") ? true : (stryCov_9fa48("161251"), false),
          errors
        });
      }
    }
    return Object.freeze(stryMutAct_9fa48("161252") ? {} : (stryCov_9fa48("161252"), {
      operationId,
      requestId
    }));
  }
}
export { META_COMMAND_ERROR_MSG, COLUMN_COUNT, handlePublishModule, handleGetModule, handleListModules, handleCreateService, handleUpdateService, handleScaleService, handleDeleteService, handleGetOperation, handleListOperations, buildOperationResponse, buildMutationResponse };