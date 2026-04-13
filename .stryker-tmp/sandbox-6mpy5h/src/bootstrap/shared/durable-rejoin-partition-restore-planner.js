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
import { NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES, TYPEOF, UNIFIED_SERVICE_TYPE } from '../../constants/index.js';
import { ReplicaStatus, TERMINAL_STATUSES, isTerminalStep, isValidWorkflowStep } from '../../rebalancer/replica-status.js';
import { buildReplicatedServiceBootstrapTopology, formatReplicatedServiceAddress } from '../../service/replicated-service-topology.js';
import { getSchemaByTableName } from '../system-table-schemas-constants.js';
import { getPartitionDbPath } from '../../storage/data-directory-manager.js';
const RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES = new Set(stryMutAct_9fa48("28540") ? [] : (stryCov_9fa48("28540"), [ReplicaStatus.ACTIVE, SERVICE_STATUS.ACTIVE]));
function normalizeJoinMetadataString(value) {
  if (stryMutAct_9fa48("28541")) {
    {}
  } else {
    stryCov_9fa48("28541");
    return (stryMutAct_9fa48("28544") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("28543") ? false : stryMutAct_9fa48("28542") ? true : (stryCov_9fa48("28542", "28543", "28544"), typeof value === TYPEOF.STRING)) ? stryMutAct_9fa48("28545") ? value : (stryCov_9fa48("28545"), value.trim()) : stryMutAct_9fa48("28546") ? "Stryker was here!" : (stryCov_9fa48("28546"), '');
  }
}
function normalizeJoinMetadataInteger(value) {
  if (stryMutAct_9fa48("28547")) {
    {}
  } else {
    stryCov_9fa48("28547");
    const normalizedValue = Number(value);
    if (stryMutAct_9fa48("28550") ? false : stryMutAct_9fa48("28549") ? true : stryMutAct_9fa48("28548") ? Number.isInteger(normalizedValue) : (stryCov_9fa48("28548", "28549", "28550"), !Number.isInteger(normalizedValue))) {
      if (stryMutAct_9fa48("28551")) {
        {}
      } else {
        stryCov_9fa48("28551");
        return null;
      }
    }
    return normalizedValue;
  }
}
function readJoinCacheRows(systemTableCache, tableName) {
  if (stryMutAct_9fa48("28552")) {
    {}
  } else {
    stryCov_9fa48("28552");
    if (stryMutAct_9fa48("28555") ? false : stryMutAct_9fa48("28554") ? true : stryMutAct_9fa48("28553") ? systemTableCache : (stryCov_9fa48("28553", "28554", "28555"), !systemTableCache)) {
      if (stryMutAct_9fa48("28556")) {
        {}
      } else {
        stryCov_9fa48("28556");
        return stryMutAct_9fa48("28557") ? ["Stryker was here"] : (stryCov_9fa48("28557"), []);
      }
    }
    if (stryMutAct_9fa48("28560") ? typeof systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("28559") ? false : stryMutAct_9fa48("28558") ? true : (stryCov_9fa48("28558", "28559", "28560"), typeof systemTableCache.getAll === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("28561")) {
        {}
      } else {
        stryCov_9fa48("28561");
        const rows = systemTableCache.getAll(tableName);
        return Array.isArray(rows) ? rows : stryMutAct_9fa48("28562") ? ["Stryker was here"] : (stryCov_9fa48("28562"), []);
      }
    }
    if (stryMutAct_9fa48("28565") ? typeof systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("28564") ? false : stryMutAct_9fa48("28563") ? true : (stryCov_9fa48("28563", "28564", "28565"), typeof systemTableCache.filter === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("28566")) {
        {}
      } else {
        stryCov_9fa48("28566");
        const rows = stryMutAct_9fa48("28567") ? systemTableCache : (stryCov_9fa48("28567"), systemTableCache.filter(tableName, stryMutAct_9fa48("28568") ? () => undefined : (stryCov_9fa48("28568"), () => stryMutAct_9fa48("28569") ? false : (stryCov_9fa48("28569"), true))));
        return Array.isArray(rows) ? rows : stryMutAct_9fa48("28570") ? ["Stryker was here"] : (stryCov_9fa48("28570"), []);
      }
    }
    return stryMutAct_9fa48("28571") ? ["Stryker was here"] : (stryCov_9fa48("28571"), []);
  }
}
function getJoinCacheRow(systemTableCache, tableName, key, predicate = null) {
  if (stryMutAct_9fa48("28572")) {
    {}
  } else {
    stryCov_9fa48("28572");
    if (stryMutAct_9fa48("28575") ? key !== null && key !== undefined || typeof systemTableCache?.get === TYPEOF.FUNCTION : stryMutAct_9fa48("28574") ? false : stryMutAct_9fa48("28573") ? true : (stryCov_9fa48("28573", "28574", "28575"), (stryMutAct_9fa48("28577") ? key !== null || key !== undefined : stryMutAct_9fa48("28576") ? true : (stryCov_9fa48("28576", "28577"), (stryMutAct_9fa48("28579") ? key === null : stryMutAct_9fa48("28578") ? true : (stryCov_9fa48("28578", "28579"), key !== null)) && (stryMutAct_9fa48("28581") ? key === undefined : stryMutAct_9fa48("28580") ? true : (stryCov_9fa48("28580", "28581"), key !== undefined)))) && (stryMutAct_9fa48("28583") ? typeof systemTableCache?.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("28582") ? true : (stryCov_9fa48("28582", "28583"), typeof (stryMutAct_9fa48("28584") ? systemTableCache.get : (stryCov_9fa48("28584"), systemTableCache?.get)) === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("28585")) {
        {}
      } else {
        stryCov_9fa48("28585");
        const row = systemTableCache.get(tableName, key);
        if (stryMutAct_9fa48("28587") ? false : stryMutAct_9fa48("28586") ? true : (stryCov_9fa48("28586", "28587"), row)) {
          if (stryMutAct_9fa48("28588")) {
            {}
          } else {
            stryCov_9fa48("28588");
            return row;
          }
        }
      }
    }
    if (stryMutAct_9fa48("28591") ? typeof predicate === TYPEOF.FUNCTION : stryMutAct_9fa48("28590") ? false : stryMutAct_9fa48("28589") ? true : (stryCov_9fa48("28589", "28590", "28591"), typeof predicate !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("28592")) {
        {}
      } else {
        stryCov_9fa48("28592");
        return null;
      }
    }
    return stryMutAct_9fa48("28595") ? readJoinCacheRows(systemTableCache, tableName).find(predicate) && null : stryMutAct_9fa48("28594") ? false : stryMutAct_9fa48("28593") ? true : (stryCov_9fa48("28593", "28594", "28595"), readJoinCacheRows(systemTableCache, tableName).find(predicate) || null);
  }
}
function filterRestorablePartitionServiceRows(serviceRows, partitionId) {
  if (stryMutAct_9fa48("28596")) {
    {}
  } else {
    stryCov_9fa48("28596");
    return stryMutAct_9fa48("28597") ? serviceRows : (stryCov_9fa48("28597"), serviceRows.filter(row => {
      if (stryMutAct_9fa48("28598")) {
        {}
      } else {
        stryCov_9fa48("28598");
        return stryMutAct_9fa48("28601") ? normalizeJoinMetadataString(row?.partition_id) === partitionId && normalizeJoinMetadataString(row?.service_type).toLowerCase() === SERVICE_TYPE.PARTITION || RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES.has(normalizeJoinMetadataString(row?.status).toLowerCase()) : stryMutAct_9fa48("28600") ? false : stryMutAct_9fa48("28599") ? true : (stryCov_9fa48("28599", "28600", "28601"), (stryMutAct_9fa48("28603") ? normalizeJoinMetadataString(row?.partition_id) === partitionId || normalizeJoinMetadataString(row?.service_type).toLowerCase() === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("28602") ? true : (stryCov_9fa48("28602", "28603"), (stryMutAct_9fa48("28605") ? normalizeJoinMetadataString(row?.partition_id) !== partitionId : stryMutAct_9fa48("28604") ? true : (stryCov_9fa48("28604", "28605"), normalizeJoinMetadataString(stryMutAct_9fa48("28606") ? row.partition_id : (stryCov_9fa48("28606"), row?.partition_id)) === partitionId)) && (stryMutAct_9fa48("28608") ? normalizeJoinMetadataString(row?.service_type).toLowerCase() !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("28607") ? true : (stryCov_9fa48("28607", "28608"), (stryMutAct_9fa48("28609") ? normalizeJoinMetadataString(row?.service_type).toUpperCase() : (stryCov_9fa48("28609"), normalizeJoinMetadataString(stryMutAct_9fa48("28610") ? row.service_type : (stryCov_9fa48("28610"), row?.service_type)).toLowerCase())) === SERVICE_TYPE.PARTITION)))) && RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES.has(stryMutAct_9fa48("28611") ? normalizeJoinMetadataString(row?.status).toUpperCase() : (stryCov_9fa48("28611"), normalizeJoinMetadataString(stryMutAct_9fa48("28612") ? row.status : (stryCov_9fa48("28612"), row?.status)).toLowerCase())));
      }
    }));
  }
}
function hasActiveReplicaOperationOwner(systemTableCache, partitionId) {
  if (stryMutAct_9fa48("28613")) {
    {}
  } else {
    stryCov_9fa48("28613");
    return stryMutAct_9fa48("28614") ? readJoinCacheRows(systemTableCache, TABLES.REPLICA_OPERATIONS).every(row => {
      const entityType = normalizeJoinMetadataString(row?.entity_type || row?.entityType).toLowerCase();
      if (entityType.length > NUM.ZERO && entityType !== SERVICE_TYPE.PARTITION) {
        return false;
      }
      const operationPartitionId = normalizeJoinMetadataString(row?.entity_id || row?.entityId || row?.partition_id || row?.partitionId);
      if (operationPartitionId !== partitionId) {
        return false;
      }
      const operationType = normalizeJoinMetadataString(row?.type).toUpperCase();
      const workflowStep = normalizeJoinMetadataString(row?.workflow_step || row?.workflowStep).toUpperCase();
      if (operationType.length > NUM.ZERO && workflowStep.length > NUM.ZERO && isValidWorkflowStep(operationType, workflowStep)) {
        return !isTerminalStep(operationType, workflowStep);
      }
      const status = normalizeJoinMetadataString(row?.status).toLowerCase();
      return status.length === NUM.ZERO || !TERMINAL_STATUSES.includes(status);
    }) : (stryCov_9fa48("28614"), readJoinCacheRows(systemTableCache, TABLES.REPLICA_OPERATIONS).some(row => {
      if (stryMutAct_9fa48("28615")) {
        {}
      } else {
        stryCov_9fa48("28615");
        const entityType = stryMutAct_9fa48("28616") ? normalizeJoinMetadataString(row?.entity_type || row?.entityType).toUpperCase() : (stryCov_9fa48("28616"), normalizeJoinMetadataString(stryMutAct_9fa48("28619") ? row?.entity_type && row?.entityType : stryMutAct_9fa48("28618") ? false : stryMutAct_9fa48("28617") ? true : (stryCov_9fa48("28617", "28618", "28619"), (stryMutAct_9fa48("28620") ? row.entity_type : (stryCov_9fa48("28620"), row?.entity_type)) || (stryMutAct_9fa48("28621") ? row.entityType : (stryCov_9fa48("28621"), row?.entityType)))).toLowerCase());
        if (stryMutAct_9fa48("28624") ? entityType.length > NUM.ZERO || entityType !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("28623") ? false : stryMutAct_9fa48("28622") ? true : (stryCov_9fa48("28622", "28623", "28624"), (stryMutAct_9fa48("28627") ? entityType.length <= NUM.ZERO : stryMutAct_9fa48("28626") ? entityType.length >= NUM.ZERO : stryMutAct_9fa48("28625") ? true : (stryCov_9fa48("28625", "28626", "28627"), entityType.length > NUM.ZERO)) && (stryMutAct_9fa48("28629") ? entityType === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("28628") ? true : (stryCov_9fa48("28628", "28629"), entityType !== SERVICE_TYPE.PARTITION)))) {
          if (stryMutAct_9fa48("28630")) {
            {}
          } else {
            stryCov_9fa48("28630");
            return stryMutAct_9fa48("28631") ? true : (stryCov_9fa48("28631"), false);
          }
        }
        const operationPartitionId = normalizeJoinMetadataString(stryMutAct_9fa48("28634") ? (row?.entity_id || row?.entityId || row?.partition_id) && row?.partitionId : stryMutAct_9fa48("28633") ? false : stryMutAct_9fa48("28632") ? true : (stryCov_9fa48("28632", "28633", "28634"), (stryMutAct_9fa48("28636") ? (row?.entity_id || row?.entityId) && row?.partition_id : stryMutAct_9fa48("28635") ? false : (stryCov_9fa48("28635", "28636"), (stryMutAct_9fa48("28638") ? row?.entity_id && row?.entityId : stryMutAct_9fa48("28637") ? false : (stryCov_9fa48("28637", "28638"), (stryMutAct_9fa48("28639") ? row.entity_id : (stryCov_9fa48("28639"), row?.entity_id)) || (stryMutAct_9fa48("28640") ? row.entityId : (stryCov_9fa48("28640"), row?.entityId)))) || (stryMutAct_9fa48("28641") ? row.partition_id : (stryCov_9fa48("28641"), row?.partition_id)))) || (stryMutAct_9fa48("28642") ? row.partitionId : (stryCov_9fa48("28642"), row?.partitionId))));
        if (stryMutAct_9fa48("28645") ? operationPartitionId === partitionId : stryMutAct_9fa48("28644") ? false : stryMutAct_9fa48("28643") ? true : (stryCov_9fa48("28643", "28644", "28645"), operationPartitionId !== partitionId)) {
          if (stryMutAct_9fa48("28646")) {
            {}
          } else {
            stryCov_9fa48("28646");
            return stryMutAct_9fa48("28647") ? true : (stryCov_9fa48("28647"), false);
          }
        }
        const operationType = stryMutAct_9fa48("28648") ? normalizeJoinMetadataString(row?.type).toLowerCase() : (stryCov_9fa48("28648"), normalizeJoinMetadataString(stryMutAct_9fa48("28649") ? row.type : (stryCov_9fa48("28649"), row?.type)).toUpperCase());
        const workflowStep = stryMutAct_9fa48("28650") ? normalizeJoinMetadataString(row?.workflow_step || row?.workflowStep).toLowerCase() : (stryCov_9fa48("28650"), normalizeJoinMetadataString(stryMutAct_9fa48("28653") ? row?.workflow_step && row?.workflowStep : stryMutAct_9fa48("28652") ? false : stryMutAct_9fa48("28651") ? true : (stryCov_9fa48("28651", "28652", "28653"), (stryMutAct_9fa48("28654") ? row.workflow_step : (stryCov_9fa48("28654"), row?.workflow_step)) || (stryMutAct_9fa48("28655") ? row.workflowStep : (stryCov_9fa48("28655"), row?.workflowStep)))).toUpperCase());
        if (stryMutAct_9fa48("28658") ? operationType.length > NUM.ZERO && workflowStep.length > NUM.ZERO || isValidWorkflowStep(operationType, workflowStep) : stryMutAct_9fa48("28657") ? false : stryMutAct_9fa48("28656") ? true : (stryCov_9fa48("28656", "28657", "28658"), (stryMutAct_9fa48("28660") ? operationType.length > NUM.ZERO || workflowStep.length > NUM.ZERO : stryMutAct_9fa48("28659") ? true : (stryCov_9fa48("28659", "28660"), (stryMutAct_9fa48("28663") ? operationType.length <= NUM.ZERO : stryMutAct_9fa48("28662") ? operationType.length >= NUM.ZERO : stryMutAct_9fa48("28661") ? true : (stryCov_9fa48("28661", "28662", "28663"), operationType.length > NUM.ZERO)) && (stryMutAct_9fa48("28666") ? workflowStep.length <= NUM.ZERO : stryMutAct_9fa48("28665") ? workflowStep.length >= NUM.ZERO : stryMutAct_9fa48("28664") ? true : (stryCov_9fa48("28664", "28665", "28666"), workflowStep.length > NUM.ZERO)))) && isValidWorkflowStep(operationType, workflowStep))) {
          if (stryMutAct_9fa48("28667")) {
            {}
          } else {
            stryCov_9fa48("28667");
            return stryMutAct_9fa48("28668") ? isTerminalStep(operationType, workflowStep) : (stryCov_9fa48("28668"), !isTerminalStep(operationType, workflowStep));
          }
        }
        const status = stryMutAct_9fa48("28669") ? normalizeJoinMetadataString(row?.status).toUpperCase() : (stryCov_9fa48("28669"), normalizeJoinMetadataString(stryMutAct_9fa48("28670") ? row.status : (stryCov_9fa48("28670"), row?.status)).toLowerCase());
        return stryMutAct_9fa48("28673") ? status.length === NUM.ZERO && !TERMINAL_STATUSES.includes(status) : stryMutAct_9fa48("28672") ? false : stryMutAct_9fa48("28671") ? true : (stryCov_9fa48("28671", "28672", "28673"), (stryMutAct_9fa48("28675") ? status.length !== NUM.ZERO : stryMutAct_9fa48("28674") ? false : (stryCov_9fa48("28674", "28675"), status.length === NUM.ZERO)) || (stryMutAct_9fa48("28676") ? TERMINAL_STATUSES.includes(status) : (stryCov_9fa48("28676"), !TERMINAL_STATUSES.includes(status))));
      }
    }));
  }
}
function shouldRestoreDurableRejoinPartition({
  systemTableCache,
  partitionId,
  partitionRow,
  partitionServiceRows
}) {
  if (stryMutAct_9fa48("28677")) {
    {}
  } else {
    stryCov_9fa48("28677");
    const configuredReplicaCount = normalizeJoinMetadataInteger(stryMutAct_9fa48("28678") ? partitionRow.replica_count : (stryCov_9fa48("28678"), partitionRow?.replica_count));
    if (stryMutAct_9fa48("28681") ? !Number.isInteger(configuredReplicaCount) && configuredReplicaCount <= NUM.ZERO : stryMutAct_9fa48("28680") ? false : stryMutAct_9fa48("28679") ? true : (stryCov_9fa48("28679", "28680", "28681"), (stryMutAct_9fa48("28682") ? Number.isInteger(configuredReplicaCount) : (stryCov_9fa48("28682"), !Number.isInteger(configuredReplicaCount))) || (stryMutAct_9fa48("28685") ? configuredReplicaCount > NUM.ZERO : stryMutAct_9fa48("28684") ? configuredReplicaCount < NUM.ZERO : stryMutAct_9fa48("28683") ? false : (stryCov_9fa48("28683", "28684", "28685"), configuredReplicaCount <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("28686")) {
        {}
      } else {
        stryCov_9fa48("28686");
        return stryMutAct_9fa48("28687") ? false : (stryCov_9fa48("28687"), true);
      }
    }
    if (stryMutAct_9fa48("28691") ? partitionServiceRows.length > configuredReplicaCount : stryMutAct_9fa48("28690") ? partitionServiceRows.length < configuredReplicaCount : stryMutAct_9fa48("28689") ? false : stryMutAct_9fa48("28688") ? true : (stryCov_9fa48("28688", "28689", "28690", "28691"), partitionServiceRows.length <= configuredReplicaCount)) {
      if (stryMutAct_9fa48("28692")) {
        {}
      } else {
        stryCov_9fa48("28692");
        return stryMutAct_9fa48("28693") ? false : (stryCov_9fa48("28693"), true);
      }
    }
    return hasActiveReplicaOperationOwner(systemTableCache, partitionId);
  }
}
function buildDurableRejoinPartitionRestoreOptions({
  systemTableCache,
  serviceRows,
  serviceRow,
  partitionId,
  replicaId,
  nodeId,
  dataDir
}) {
  if (stryMutAct_9fa48("28694")) {
    {}
  } else {
    stryCov_9fa48("28694");
    const partitionRow = getJoinCacheRow(systemTableCache, TABLES.PARTITIONS, partitionId, stryMutAct_9fa48("28695") ? () => undefined : (stryCov_9fa48("28695"), row => stryMutAct_9fa48("28698") ? normalizeJoinMetadataString(row?.partition_id) !== partitionId : stryMutAct_9fa48("28697") ? false : stryMutAct_9fa48("28696") ? true : (stryCov_9fa48("28696", "28697", "28698"), normalizeJoinMetadataString(stryMutAct_9fa48("28699") ? row.partition_id : (stryCov_9fa48("28699"), row?.partition_id)) === partitionId)));
    assertCritical(partitionRow, stryMutAct_9fa48("28700") ? `` : (stryCov_9fa48("28700"), `Missing partition metadata for durable rejoin replica ${replicaId}`));
    const tableId = normalizeJoinMetadataString(stryMutAct_9fa48("28703") ? partitionRow.table_id && partitionRow.table_name : stryMutAct_9fa48("28702") ? false : stryMutAct_9fa48("28701") ? true : (stryCov_9fa48("28701", "28702", "28703"), partitionRow.table_id || partitionRow.table_name));
    assertCritical(tableId, stryMutAct_9fa48("28704") ? `` : (stryCov_9fa48("28704"), `Missing table metadata reference for durable rejoin partition ${partitionId}`));
    const tableName = normalizeJoinMetadataString(stryMutAct_9fa48("28707") ? partitionRow.table_name && tableId : stryMutAct_9fa48("28706") ? false : stryMutAct_9fa48("28705") ? true : (stryCov_9fa48("28705", "28706", "28707"), partitionRow.table_name || tableId));
    const tableRow = getJoinCacheRow(systemTableCache, TABLES.TABLES, tableId, stryMutAct_9fa48("28708") ? () => undefined : (stryCov_9fa48("28708"), row => stryMutAct_9fa48("28711") ? normalizeJoinMetadataString(row?.table_id) === tableId && normalizeJoinMetadataString(row?.table_name) === tableName : stryMutAct_9fa48("28710") ? false : stryMutAct_9fa48("28709") ? true : (stryCov_9fa48("28709", "28710", "28711"), (stryMutAct_9fa48("28713") ? normalizeJoinMetadataString(row?.table_id) !== tableId : stryMutAct_9fa48("28712") ? false : (stryCov_9fa48("28712", "28713"), normalizeJoinMetadataString(stryMutAct_9fa48("28714") ? row.table_id : (stryCov_9fa48("28714"), row?.table_id)) === tableId)) || (stryMutAct_9fa48("28716") ? normalizeJoinMetadataString(row?.table_name) !== tableName : stryMutAct_9fa48("28715") ? false : (stryCov_9fa48("28715", "28716"), normalizeJoinMetadataString(stryMutAct_9fa48("28717") ? row.table_name : (stryCov_9fa48("28717"), row?.table_name)) === tableName)))));
    let schema = null;
    if (stryMutAct_9fa48("28720") ? tableRow.schema_definition : stryMutAct_9fa48("28719") ? false : stryMutAct_9fa48("28718") ? true : (stryCov_9fa48("28718", "28719", "28720"), tableRow?.schema_definition)) {
      if (stryMutAct_9fa48("28721")) {
        {}
      } else {
        stryCov_9fa48("28721");
        schema = (stryMutAct_9fa48("28724") ? typeof tableRow.schema_definition !== TYPEOF.STRING : stryMutAct_9fa48("28723") ? false : stryMutAct_9fa48("28722") ? true : (stryCov_9fa48("28722", "28723", "28724"), typeof tableRow.schema_definition === TYPEOF.STRING)) ? JSON.parse(tableRow.schema_definition) : tableRow.schema_definition;
      }
    } else {
      if (stryMutAct_9fa48("28725")) {
        {}
      } else {
        stryCov_9fa48("28725");
        schema = getSchemaByTableName(tableName);
      }
    }
    assertCritical(schema, stryMutAct_9fa48("28726") ? `` : (stryCov_9fa48("28726"), `Missing schema definition for durable rejoin partition ${partitionId}`));
    const partitionServiceRows = filterRestorablePartitionServiceRows(serviceRows, partitionId);
    const topology = buildReplicatedServiceBootstrapTopology(stryMutAct_9fa48("28727") ? {} : (stryCov_9fa48("28727"), {
      serviceType: SERVICE_TYPE.PARTITION,
      serviceRows: partitionServiceRows,
      targetReplicaId: replicaId,
      targetNodeId: nodeId,
      targetAddress: stryMutAct_9fa48("28728") ? serviceRow.address : (stryCov_9fa48("28728"), serviceRow?.address)
    }));
    const leaderNodeId = normalizeJoinMetadataString(stryMutAct_9fa48("28729") ? partitionRow.leader_node_id : (stryCov_9fa48("28729"), partitionRow?.leader_node_id));
    const leaderService = (stryMutAct_9fa48("28733") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("28732") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("28731") ? false : stryMutAct_9fa48("28730") ? true : (stryCov_9fa48("28730", "28731", "28732", "28733"), leaderNodeId.length > NUM.ZERO)) ? partitionServiceRows.find(stryMutAct_9fa48("28734") ? () => undefined : (stryCov_9fa48("28734"), row => stryMutAct_9fa48("28737") ? normalizeJoinMetadataString(row?.node_id) !== leaderNodeId : stryMutAct_9fa48("28736") ? false : stryMutAct_9fa48("28735") ? true : (stryCov_9fa48("28735", "28736", "28737"), normalizeJoinMetadataString(stryMutAct_9fa48("28738") ? row.node_id : (stryCov_9fa48("28738"), row?.node_id)) === leaderNodeId))) : null;
    const leaderReplicaId = normalizeJoinMetadataString(stryMutAct_9fa48("28741") ? leaderService?.replica_id && leaderService?.service_id : stryMutAct_9fa48("28740") ? false : stryMutAct_9fa48("28739") ? true : (stryCov_9fa48("28739", "28740", "28741"), (stryMutAct_9fa48("28742") ? leaderService.replica_id : (stryCov_9fa48("28742"), leaderService?.replica_id)) || (stryMutAct_9fa48("28743") ? leaderService.service_id : (stryCov_9fa48("28743"), leaderService?.service_id))));
    const leaderAddress = leaderService ? formatReplicatedServiceAddress(SERVICE_TYPE.PARTITION, leaderNodeId, leaderReplicaId, stryMutAct_9fa48("28744") ? leaderService.address : (stryCov_9fa48("28744"), leaderService?.address)) : null;
    return stryMutAct_9fa48("28745") ? {} : (stryCov_9fa48("28745"), {
      serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
      partitionId,
      tableId,
      tableName,
      schema,
      keyRange: stryMutAct_9fa48("28746") ? {} : (stryCov_9fa48("28746"), {
        start: stryMutAct_9fa48("28749") ? partitionRow.partition_key_start && null : stryMutAct_9fa48("28748") ? false : stryMutAct_9fa48("28747") ? true : (stryCov_9fa48("28747", "28748", "28749"), partitionRow.partition_key_start || null),
        end: stryMutAct_9fa48("28752") ? partitionRow.partition_key_end && null : stryMutAct_9fa48("28751") ? false : stryMutAct_9fa48("28750") ? true : (stryCov_9fa48("28750", "28751", "28752"), partitionRow.partition_key_end || null)
      }),
      replicaId,
      replicaIds: stryMutAct_9fa48("28755") ? topology?.replicaIds && [] : stryMutAct_9fa48("28754") ? false : stryMutAct_9fa48("28753") ? true : (stryCov_9fa48("28753", "28754", "28755"), (stryMutAct_9fa48("28756") ? topology.replicaIds : (stryCov_9fa48("28756"), topology?.replicaIds)) || (stryMutAct_9fa48("28757") ? ["Stryker was here"] : (stryCov_9fa48("28757"), []))),
      peerAddresses: stryMutAct_9fa48("28760") ? topology?.peerAddresses && [] : stryMutAct_9fa48("28759") ? false : stryMutAct_9fa48("28758") ? true : (stryCov_9fa48("28758", "28759", "28760"), (stryMutAct_9fa48("28761") ? topology.peerAddresses : (stryCov_9fa48("28761"), topology?.peerAddresses)) || (stryMutAct_9fa48("28762") ? ["Stryker was here"] : (stryCov_9fa48("28762"), []))),
      nodeId,
      dbPath: getPartitionDbPath(dataDir, partitionId, replicaId),
      leaderAddress,
      isJoiningExistingGroup: stryMutAct_9fa48("28763") ? true : (stryCov_9fa48("28763"), false),
      deferElection: stryMutAct_9fa48("28764") ? false : (stryCov_9fa48("28764"), true),
      suppressLifecycleLogs: stryMutAct_9fa48("28765") ? false : (stryCov_9fa48("28765"), true),
      restoringExistingReplica: stryMutAct_9fa48("28766") ? false : (stryCov_9fa48("28766"), true)
    });
  }
}
function buildDurableRejoinPartitionRestorePlans(options = {}) {
  if (stryMutAct_9fa48("28767")) {
    {}
  } else {
    stryCov_9fa48("28767");
    const systemTableCache = stryMutAct_9fa48("28770") ? options.systemTableCache && null : stryMutAct_9fa48("28769") ? false : stryMutAct_9fa48("28768") ? true : (stryCov_9fa48("28768", "28769", "28770"), options.systemTableCache || null);
    const nodeId = normalizeJoinMetadataString(options.nodeId);
    const dataDir = stryMutAct_9fa48("28773") ? options.dataDir && null : stryMutAct_9fa48("28772") ? false : stryMutAct_9fa48("28771") ? true : (stryCov_9fa48("28771", "28772", "28773"), options.dataDir || null);
    const serviceRows = readJoinCacheRows(systemTableCache, TABLES.SERVICES);
    const restorePlans = stryMutAct_9fa48("28774") ? ["Stryker was here"] : (stryCov_9fa48("28774"), []);
    const seenReplicaIds = new Set();
    const restoreEligibilityByPartitionId = new Map();
    for (const serviceRow of serviceRows) {
      if (stryMutAct_9fa48("28775")) {
        {}
      } else {
        stryCov_9fa48("28775");
        const serviceType = stryMutAct_9fa48("28776") ? normalizeJoinMetadataString(serviceRow?.service_type).toUpperCase() : (stryCov_9fa48("28776"), normalizeJoinMetadataString(stryMutAct_9fa48("28777") ? serviceRow.service_type : (stryCov_9fa48("28777"), serviceRow?.service_type)).toLowerCase());
        const serviceNodeId = normalizeJoinMetadataString(stryMutAct_9fa48("28778") ? serviceRow.node_id : (stryCov_9fa48("28778"), serviceRow?.node_id));
        const replicaId = normalizeJoinMetadataString(stryMutAct_9fa48("28781") ? serviceRow?.replica_id && serviceRow?.service_id : stryMutAct_9fa48("28780") ? false : stryMutAct_9fa48("28779") ? true : (stryCov_9fa48("28779", "28780", "28781"), (stryMutAct_9fa48("28782") ? serviceRow.replica_id : (stryCov_9fa48("28782"), serviceRow?.replica_id)) || (stryMutAct_9fa48("28783") ? serviceRow.service_id : (stryCov_9fa48("28783"), serviceRow?.service_id))));
        const partitionId = normalizeJoinMetadataString(stryMutAct_9fa48("28784") ? serviceRow.partition_id : (stryCov_9fa48("28784"), serviceRow?.partition_id));
        const status = stryMutAct_9fa48("28785") ? normalizeJoinMetadataString(serviceRow?.status).toUpperCase() : (stryCov_9fa48("28785"), normalizeJoinMetadataString(stryMutAct_9fa48("28786") ? serviceRow.status : (stryCov_9fa48("28786"), serviceRow?.status)).toLowerCase());
        if (stryMutAct_9fa48("28789") ? (serviceType !== SERVICE_TYPE.PARTITION || serviceNodeId !== nodeId || replicaId.length === NUM.ZERO || partitionId.length === NUM.ZERO || !RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES.has(status)) && seenReplicaIds.has(replicaId) : stryMutAct_9fa48("28788") ? false : stryMutAct_9fa48("28787") ? true : (stryCov_9fa48("28787", "28788", "28789"), (stryMutAct_9fa48("28791") ? (serviceType !== SERVICE_TYPE.PARTITION || serviceNodeId !== nodeId || replicaId.length === NUM.ZERO || partitionId.length === NUM.ZERO) && !RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES.has(status) : stryMutAct_9fa48("28790") ? false : (stryCov_9fa48("28790", "28791"), (stryMutAct_9fa48("28793") ? (serviceType !== SERVICE_TYPE.PARTITION || serviceNodeId !== nodeId || replicaId.length === NUM.ZERO) && partitionId.length === NUM.ZERO : stryMutAct_9fa48("28792") ? false : (stryCov_9fa48("28792", "28793"), (stryMutAct_9fa48("28795") ? (serviceType !== SERVICE_TYPE.PARTITION || serviceNodeId !== nodeId) && replicaId.length === NUM.ZERO : stryMutAct_9fa48("28794") ? false : (stryCov_9fa48("28794", "28795"), (stryMutAct_9fa48("28797") ? serviceType !== SERVICE_TYPE.PARTITION && serviceNodeId !== nodeId : stryMutAct_9fa48("28796") ? false : (stryCov_9fa48("28796", "28797"), (stryMutAct_9fa48("28799") ? serviceType === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("28798") ? false : (stryCov_9fa48("28798", "28799"), serviceType !== SERVICE_TYPE.PARTITION)) || (stryMutAct_9fa48("28801") ? serviceNodeId === nodeId : stryMutAct_9fa48("28800") ? false : (stryCov_9fa48("28800", "28801"), serviceNodeId !== nodeId)))) || (stryMutAct_9fa48("28803") ? replicaId.length !== NUM.ZERO : stryMutAct_9fa48("28802") ? false : (stryCov_9fa48("28802", "28803"), replicaId.length === NUM.ZERO)))) || (stryMutAct_9fa48("28805") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("28804") ? false : (stryCov_9fa48("28804", "28805"), partitionId.length === NUM.ZERO)))) || (stryMutAct_9fa48("28806") ? RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES.has(status) : (stryCov_9fa48("28806"), !RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES.has(status))))) || seenReplicaIds.has(replicaId))) {
          if (stryMutAct_9fa48("28807")) {
            {}
          } else {
            stryCov_9fa48("28807");
            continue;
          }
        }
        if (stryMutAct_9fa48("28810") ? false : stryMutAct_9fa48("28809") ? true : stryMutAct_9fa48("28808") ? restoreEligibilityByPartitionId.has(partitionId) : (stryCov_9fa48("28808", "28809", "28810"), !restoreEligibilityByPartitionId.has(partitionId))) {
          if (stryMutAct_9fa48("28811")) {
            {}
          } else {
            stryCov_9fa48("28811");
            const partitionRow = getJoinCacheRow(systemTableCache, TABLES.PARTITIONS, partitionId, stryMutAct_9fa48("28812") ? () => undefined : (stryCov_9fa48("28812"), row => stryMutAct_9fa48("28815") ? normalizeJoinMetadataString(row?.partition_id) !== partitionId : stryMutAct_9fa48("28814") ? false : stryMutAct_9fa48("28813") ? true : (stryCov_9fa48("28813", "28814", "28815"), normalizeJoinMetadataString(stryMutAct_9fa48("28816") ? row.partition_id : (stryCov_9fa48("28816"), row?.partition_id)) === partitionId)));
            assertCritical(partitionRow, stryMutAct_9fa48("28817") ? `` : (stryCov_9fa48("28817"), `Missing partition metadata for durable rejoin replica ${replicaId}`));
            restoreEligibilityByPartitionId.set(partitionId, shouldRestoreDurableRejoinPartition(stryMutAct_9fa48("28818") ? {} : (stryCov_9fa48("28818"), {
              systemTableCache,
              partitionId,
              partitionRow,
              partitionServiceRows: filterRestorablePartitionServiceRows(serviceRows, partitionId)
            })));
          }
        }
        if (stryMutAct_9fa48("28821") ? restoreEligibilityByPartitionId.get(partitionId) === true : stryMutAct_9fa48("28820") ? false : stryMutAct_9fa48("28819") ? true : (stryCov_9fa48("28819", "28820", "28821"), restoreEligibilityByPartitionId.get(partitionId) !== (stryMutAct_9fa48("28822") ? false : (stryCov_9fa48("28822"), true)))) {
          if (stryMutAct_9fa48("28823")) {
            {}
          } else {
            stryCov_9fa48("28823");
            continue;
          }
        }
        seenReplicaIds.add(replicaId);
        restorePlans.push(buildDurableRejoinPartitionRestoreOptions(stryMutAct_9fa48("28824") ? {} : (stryCov_9fa48("28824"), {
          systemTableCache,
          serviceRows,
          serviceRow,
          partitionId,
          replicaId,
          nodeId,
          dataDir
        })));
      }
    }
    return restorePlans;
  }
}
export { buildDurableRejoinPartitionRestorePlans };