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
import { NUM, TYPEOF } from '../constants/index.js';
import { INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME } from './system-table-schemas-constants.js';
const PARTITION_ID_CANONICAL_PATTERN = stryMutAct_9fa48("31535") ? /^(.+)-p\D+$/ : stryMutAct_9fa48("31534") ? /^(.+)-p\d$/ : stryMutAct_9fa48("31533") ? /^(.)-p\d+$/ : stryMutAct_9fa48("31532") ? /^(.+)-p\d+/ : stryMutAct_9fa48("31531") ? /(.+)-p\d+$/ : (stryCov_9fa48("31531", "31532", "31533", "31534", "31535"), /^(.+)-p\d+$/);
const PARTITION_ID_SPLIT_SEPARATOR = stryMutAct_9fa48("31536") ? "" : (stryCov_9fa48("31536"), '_p_');
const SYSTEM_TABLE_IDS = new Set(Object.values(SYSTEM_TABLE_NAME));
const PRIORITY_CONTROL_PLANE_TABLE_IDS = new Set(stryMutAct_9fa48("31537") ? [] : (stryCov_9fa48("31537"), [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, SYSTEM_TABLE_NAME.SQL_TRANSACTIONS, SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS, SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS]));
const CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS = new Set(stryMutAct_9fa48("31538") ? [] : (stryCov_9fa48("31538"), [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]));
const INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID = new Map(Object.entries(INITIAL_PARTITION_IDS).map(stryMutAct_9fa48("31539") ? () => undefined : (stryCov_9fa48("31539"), ([tableId, partitionId]) => stryMutAct_9fa48("31540") ? [] : (stryCov_9fa48("31540"), [partitionId, tableId]))));
function normalizeNonEmptyString(value) {
  if (stryMutAct_9fa48("31541")) {
    {}
  } else {
    stryCov_9fa48("31541");
    if (stryMutAct_9fa48("31544") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("31543") ? false : stryMutAct_9fa48("31542") ? true : (stryCov_9fa48("31542", "31543", "31544"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("31545")) {
        {}
      } else {
        stryCov_9fa48("31545");
        return null;
      }
    }
    const normalized = stryMutAct_9fa48("31546") ? value : (stryCov_9fa48("31546"), value.trim());
    return (stryMutAct_9fa48("31550") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("31549") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("31548") ? false : stryMutAct_9fa48("31547") ? true : (stryCov_9fa48("31547", "31548", "31549", "31550"), normalized.length > NUM.ZERO)) ? normalized : null;
  }
}
function getPartitionIdFromPartitionRow(partitionRow = null) {
  if (stryMutAct_9fa48("31551")) {
    {}
  } else {
    stryCov_9fa48("31551");
    if (stryMutAct_9fa48("31554") ? !partitionRow && typeof partitionRow !== TYPEOF.OBJECT : stryMutAct_9fa48("31553") ? false : stryMutAct_9fa48("31552") ? true : (stryCov_9fa48("31552", "31553", "31554"), (stryMutAct_9fa48("31555") ? partitionRow : (stryCov_9fa48("31555"), !partitionRow)) || (stryMutAct_9fa48("31557") ? typeof partitionRow === TYPEOF.OBJECT : stryMutAct_9fa48("31556") ? false : (stryCov_9fa48("31556", "31557"), typeof partitionRow !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("31558")) {
        {}
      } else {
        stryCov_9fa48("31558");
        return null;
      }
    }
    return normalizeNonEmptyString(stryMutAct_9fa48("31559") ? partitionRow.partition_id && partitionRow.partitionId : (stryCov_9fa48("31559"), partitionRow.partition_id ?? partitionRow.partitionId));
  }
}
function getTableIdFromPartitionRow(partitionRow = null) {
  if (stryMutAct_9fa48("31560")) {
    {}
  } else {
    stryCov_9fa48("31560");
    if (stryMutAct_9fa48("31563") ? !partitionRow && typeof partitionRow !== TYPEOF.OBJECT : stryMutAct_9fa48("31562") ? false : stryMutAct_9fa48("31561") ? true : (stryCov_9fa48("31561", "31562", "31563"), (stryMutAct_9fa48("31564") ? partitionRow : (stryCov_9fa48("31564"), !partitionRow)) || (stryMutAct_9fa48("31566") ? typeof partitionRow === TYPEOF.OBJECT : stryMutAct_9fa48("31565") ? false : (stryCov_9fa48("31565", "31566"), typeof partitionRow !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("31567")) {
        {}
      } else {
        stryCov_9fa48("31567");
        return null;
      }
    }
    return normalizeNonEmptyString(stryMutAct_9fa48("31568") ? partitionRow.table_id && partitionRow.tableId : (stryCov_9fa48("31568"), partitionRow.table_id ?? partitionRow.tableId));
  }
}
function resolvePartitionTableIdFromPartitionId(partitionId) {
  if (stryMutAct_9fa48("31569")) {
    {}
  } else {
    stryCov_9fa48("31569");
    const normalizedPartitionId = normalizeNonEmptyString(partitionId);
    if (stryMutAct_9fa48("31572") ? false : stryMutAct_9fa48("31571") ? true : stryMutAct_9fa48("31570") ? normalizedPartitionId : (stryCov_9fa48("31570", "31571", "31572"), !normalizedPartitionId)) {
      if (stryMutAct_9fa48("31573")) {
        {}
      } else {
        stryCov_9fa48("31573");
        return null;
      }
    }
    if (stryMutAct_9fa48("31575") ? false : stryMutAct_9fa48("31574") ? true : (stryCov_9fa48("31574", "31575"), INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID.has(normalizedPartitionId))) {
      if (stryMutAct_9fa48("31576")) {
        {}
      } else {
        stryCov_9fa48("31576");
        return INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID.get(normalizedPartitionId);
      }
    }
    const canonicalMatch = normalizedPartitionId.match(PARTITION_ID_CANONICAL_PATTERN);
    if (stryMutAct_9fa48("31579") ? canonicalMatch || canonicalMatch[NUM.ONE] : stryMutAct_9fa48("31578") ? false : stryMutAct_9fa48("31577") ? true : (stryCov_9fa48("31577", "31578", "31579"), canonicalMatch && canonicalMatch[NUM.ONE])) {
      if (stryMutAct_9fa48("31580")) {
        {}
      } else {
        stryCov_9fa48("31580");
        return canonicalMatch[NUM.ONE];
      }
    }
    const splitSeparatorIndex = normalizedPartitionId.indexOf(PARTITION_ID_SPLIT_SEPARATOR);
    if (stryMutAct_9fa48("31584") ? splitSeparatorIndex <= NUM.ZERO : stryMutAct_9fa48("31583") ? splitSeparatorIndex >= NUM.ZERO : stryMutAct_9fa48("31582") ? false : stryMutAct_9fa48("31581") ? true : (stryCov_9fa48("31581", "31582", "31583", "31584"), splitSeparatorIndex > NUM.ZERO)) {
      if (stryMutAct_9fa48("31585")) {
        {}
      } else {
        stryCov_9fa48("31585");
        return stryMutAct_9fa48("31586") ? normalizedPartitionId : (stryCov_9fa48("31586"), normalizedPartitionId.slice(NUM.ZERO, splitSeparatorIndex));
      }
    }
    return null;
  }
}
function resolvePartitionTableId(options = {}) {
  if (stryMutAct_9fa48("31587")) {
    {}
  } else {
    stryCov_9fa48("31587");
    const partitionRow = stryMutAct_9fa48("31590") ? options.partitionRow && null : stryMutAct_9fa48("31589") ? false : stryMutAct_9fa48("31588") ? true : (stryCov_9fa48("31588", "31589", "31590"), options.partitionRow || null);
    const rowTableId = getTableIdFromPartitionRow(partitionRow);
    if (stryMutAct_9fa48("31592") ? false : stryMutAct_9fa48("31591") ? true : (stryCov_9fa48("31591", "31592"), rowTableId)) {
      if (stryMutAct_9fa48("31593")) {
        {}
      } else {
        stryCov_9fa48("31593");
        return rowTableId;
      }
    }
    const rowPartitionId = getPartitionIdFromPartitionRow(partitionRow);
    if (stryMutAct_9fa48("31595") ? false : stryMutAct_9fa48("31594") ? true : (stryCov_9fa48("31594", "31595"), rowPartitionId)) {
      if (stryMutAct_9fa48("31596")) {
        {}
      } else {
        stryCov_9fa48("31596");
        const parsedTableId = resolvePartitionTableIdFromPartitionId(rowPartitionId);
        if (stryMutAct_9fa48("31598") ? false : stryMutAct_9fa48("31597") ? true : (stryCov_9fa48("31597", "31598"), parsedTableId)) {
          if (stryMutAct_9fa48("31599")) {
            {}
          } else {
            stryCov_9fa48("31599");
            return parsedTableId;
          }
        }
      }
    }
    return resolvePartitionTableIdFromPartitionId(options.partitionId);
  }
}
function isSystemTablePartition(options = {}) {
  if (stryMutAct_9fa48("31600")) {
    {}
  } else {
    stryCov_9fa48("31600");
    const tableId = resolvePartitionTableId(options);
    return stryMutAct_9fa48("31603") ? tableId !== null || SYSTEM_TABLE_IDS.has(tableId) : stryMutAct_9fa48("31602") ? false : stryMutAct_9fa48("31601") ? true : (stryCov_9fa48("31601", "31602", "31603"), (stryMutAct_9fa48("31605") ? tableId === null : stryMutAct_9fa48("31604") ? true : (stryCov_9fa48("31604", "31605"), tableId !== null)) && SYSTEM_TABLE_IDS.has(tableId));
  }
}
function isPriorityControlPlanePartition(options = {}) {
  if (stryMutAct_9fa48("31606")) {
    {}
  } else {
    stryCov_9fa48("31606");
    const tableId = resolvePartitionTableId(options);
    return stryMutAct_9fa48("31609") ? tableId !== null || PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId) : stryMutAct_9fa48("31608") ? false : stryMutAct_9fa48("31607") ? true : (stryCov_9fa48("31607", "31608", "31609"), (stryMutAct_9fa48("31611") ? tableId === null : stryMutAct_9fa48("31610") ? true : (stryCov_9fa48("31610", "31611"), tableId !== null)) && PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId));
  }
}
function isCriticalTransportControlPlanePartition(options = {}) {
  if (stryMutAct_9fa48("31612")) {
    {}
  } else {
    stryCov_9fa48("31612");
    const tableId = resolvePartitionTableId(options);
    return stryMutAct_9fa48("31615") ? tableId !== null || CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS.has(tableId) : stryMutAct_9fa48("31614") ? false : stryMutAct_9fa48("31613") ? true : (stryCov_9fa48("31613", "31614", "31615"), (stryMutAct_9fa48("31617") ? tableId === null : stryMutAct_9fa48("31616") ? true : (stryCov_9fa48("31616", "31617"), tableId !== null)) && CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS.has(tableId));
  }
}
function getPartitionRowFromCache(systemTableCache, partitionId) {
  if (stryMutAct_9fa48("31618")) {
    {}
  } else {
    stryCov_9fa48("31618");
    const normalizedPartitionId = normalizeNonEmptyString(partitionId);
    if (stryMutAct_9fa48("31621") ? !normalizedPartitionId && !systemTableCache : stryMutAct_9fa48("31620") ? false : stryMutAct_9fa48("31619") ? true : (stryCov_9fa48("31619", "31620", "31621"), (stryMutAct_9fa48("31622") ? normalizedPartitionId : (stryCov_9fa48("31622"), !normalizedPartitionId)) || (stryMutAct_9fa48("31623") ? systemTableCache : (stryCov_9fa48("31623"), !systemTableCache)))) {
      if (stryMutAct_9fa48("31624")) {
        {}
      } else {
        stryCov_9fa48("31624");
        return null;
      }
    }
    if (stryMutAct_9fa48("31627") ? typeof systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("31626") ? false : stryMutAct_9fa48("31625") ? true : (stryCov_9fa48("31625", "31626", "31627"), typeof systemTableCache.get === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("31628")) {
        {}
      } else {
        stryCov_9fa48("31628");
        const directRow = systemTableCache.get(SYSTEM_TABLE_NAME.PARTITIONS, normalizedPartitionId);
        if (stryMutAct_9fa48("31631") ? directRow || typeof directRow === TYPEOF.OBJECT : stryMutAct_9fa48("31630") ? false : stryMutAct_9fa48("31629") ? true : (stryCov_9fa48("31629", "31630", "31631"), directRow && (stryMutAct_9fa48("31633") ? typeof directRow !== TYPEOF.OBJECT : stryMutAct_9fa48("31632") ? true : (stryCov_9fa48("31632", "31633"), typeof directRow === TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("31634")) {
            {}
          } else {
            stryCov_9fa48("31634");
            return directRow;
          }
        }
      }
    }
    if (stryMutAct_9fa48("31637") ? typeof systemTableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("31636") ? false : stryMutAct_9fa48("31635") ? true : (stryCov_9fa48("31635", "31636", "31637"), typeof systemTableCache.filter !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("31638")) {
        {}
      } else {
        stryCov_9fa48("31638");
        return null;
      }
    }
    const matchingRows = stryMutAct_9fa48("31639") ? systemTableCache : (stryCov_9fa48("31639"), systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, partitionRow => {
      if (stryMutAct_9fa48("31640")) {
        {}
      } else {
        stryCov_9fa48("31640");
        return stryMutAct_9fa48("31643") ? getPartitionIdFromPartitionRow(partitionRow) !== normalizedPartitionId : stryMutAct_9fa48("31642") ? false : stryMutAct_9fa48("31641") ? true : (stryCov_9fa48("31641", "31642", "31643"), getPartitionIdFromPartitionRow(partitionRow) === normalizedPartitionId);
      }
    }));
    return Array.isArray(matchingRows) ? stryMutAct_9fa48("31646") ? matchingRows[NUM.ZERO] && null : stryMutAct_9fa48("31645") ? false : stryMutAct_9fa48("31644") ? true : (stryCov_9fa48("31644", "31645", "31646"), matchingRows[NUM.ZERO] || null) : null;
  }
}
function buildPartitionRowByPartitionId(partitionRows = stryMutAct_9fa48("31647") ? ["Stryker was here"] : (stryCov_9fa48("31647"), [])) {
  if (stryMutAct_9fa48("31648")) {
    {}
  } else {
    stryCov_9fa48("31648");
    const partitionRowByPartitionId = new Map();
    const rows = Array.isArray(partitionRows) ? partitionRows : stryMutAct_9fa48("31649") ? ["Stryker was here"] : (stryCov_9fa48("31649"), []);
    for (const partitionRow of rows) {
      if (stryMutAct_9fa48("31650")) {
        {}
      } else {
        stryCov_9fa48("31650");
        const partitionId = getPartitionIdFromPartitionRow(partitionRow);
        if (stryMutAct_9fa48("31653") ? false : stryMutAct_9fa48("31652") ? true : stryMutAct_9fa48("31651") ? partitionId : (stryCov_9fa48("31651", "31652", "31653"), !partitionId)) {
          if (stryMutAct_9fa48("31654")) {
            {}
          } else {
            stryCov_9fa48("31654");
            continue;
          }
        }
        partitionRowByPartitionId.set(partitionId, partitionRow);
      }
    }
    return partitionRowByPartitionId;
  }
}
function addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, partitionId) {
  if (stryMutAct_9fa48("31655")) {
    {}
  } else {
    stryCov_9fa48("31655");
    if (stryMutAct_9fa48("31658") ? (!tableId || !partitionId) && !PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId) : stryMutAct_9fa48("31657") ? false : stryMutAct_9fa48("31656") ? true : (stryCov_9fa48("31656", "31657", "31658"), (stryMutAct_9fa48("31660") ? !tableId && !partitionId : stryMutAct_9fa48("31659") ? false : (stryCov_9fa48("31659", "31660"), (stryMutAct_9fa48("31661") ? tableId : (stryCov_9fa48("31661"), !tableId)) || (stryMutAct_9fa48("31662") ? partitionId : (stryCov_9fa48("31662"), !partitionId)))) || (stryMutAct_9fa48("31663") ? PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId) : (stryCov_9fa48("31663"), !PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId))))) {
      if (stryMutAct_9fa48("31664")) {
        {}
      } else {
        stryCov_9fa48("31664");
        return;
      }
    }
    if (stryMutAct_9fa48("31667") ? false : stryMutAct_9fa48("31666") ? true : stryMutAct_9fa48("31665") ? priorityPartitionIdsByTableId.has(tableId) : (stryCov_9fa48("31665", "31666", "31667"), !priorityPartitionIdsByTableId.has(tableId))) {
      if (stryMutAct_9fa48("31668")) {
        {}
      } else {
        stryCov_9fa48("31668");
        priorityPartitionIdsByTableId.set(tableId, new Set());
      }
    }
    priorityPartitionIdsByTableId.get(tableId).add(partitionId);
  }
}
function resolvePriorityControlPlanePartitionIds(options = {}) {
  if (stryMutAct_9fa48("31669")) {
    {}
  } else {
    stryCov_9fa48("31669");
    const partitionRows = Array.isArray(options.partitionRows) ? options.partitionRows : stryMutAct_9fa48("31670") ? ["Stryker was here"] : (stryCov_9fa48("31670"), []);
    const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : stryMutAct_9fa48("31671") ? ["Stryker was here"] : (stryCov_9fa48("31671"), []);
    const includeInitialWhenMissing = stryMutAct_9fa48("31674") ? options.includeInitialWhenMissing === false : stryMutAct_9fa48("31673") ? false : stryMutAct_9fa48("31672") ? true : (stryCov_9fa48("31672", "31673", "31674"), options.includeInitialWhenMissing !== (stryMutAct_9fa48("31675") ? true : (stryCov_9fa48("31675"), false)));
    const partitionRowByPartitionId = options.partitionRowByPartitionId instanceof Map ? options.partitionRowByPartitionId : buildPartitionRowByPartitionId(partitionRows);
    const priorityPartitionIdsByTableId = new Map();
    for (const partitionRow of partitionRows) {
      if (stryMutAct_9fa48("31676")) {
        {}
      } else {
        stryCov_9fa48("31676");
        const partitionId = getPartitionIdFromPartitionRow(partitionRow);
        const tableId = resolvePartitionTableId(stryMutAct_9fa48("31677") ? {} : (stryCov_9fa48("31677"), {
          partitionId,
          partitionRow
        }));
        addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, partitionId);
      }
    }
    for (const serviceRow of serviceRows) {
      if (stryMutAct_9fa48("31678")) {
        {}
      } else {
        stryCov_9fa48("31678");
        if (stryMutAct_9fa48("31681") ? !serviceRow && typeof serviceRow !== TYPEOF.OBJECT : stryMutAct_9fa48("31680") ? false : stryMutAct_9fa48("31679") ? true : (stryCov_9fa48("31679", "31680", "31681"), (stryMutAct_9fa48("31682") ? serviceRow : (stryCov_9fa48("31682"), !serviceRow)) || (stryMutAct_9fa48("31684") ? typeof serviceRow === TYPEOF.OBJECT : stryMutAct_9fa48("31683") ? false : (stryCov_9fa48("31683", "31684"), typeof serviceRow !== TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("31685")) {
            {}
          } else {
            stryCov_9fa48("31685");
            continue;
          }
        }
        const partitionId = normalizeNonEmptyString(stryMutAct_9fa48("31686") ? serviceRow.partition_id && serviceRow.partitionId : (stryCov_9fa48("31686"), serviceRow.partition_id ?? serviceRow.partitionId));
        if (stryMutAct_9fa48("31689") ? false : stryMutAct_9fa48("31688") ? true : stryMutAct_9fa48("31687") ? partitionId : (stryCov_9fa48("31687", "31688", "31689"), !partitionId)) {
          if (stryMutAct_9fa48("31690")) {
            {}
          } else {
            stryCov_9fa48("31690");
            continue;
          }
        }
        const partitionRow = stryMutAct_9fa48("31693") ? partitionRowByPartitionId.get(partitionId) && null : stryMutAct_9fa48("31692") ? false : stryMutAct_9fa48("31691") ? true : (stryCov_9fa48("31691", "31692", "31693"), partitionRowByPartitionId.get(partitionId) || null);
        const tableId = resolvePartitionTableId(stryMutAct_9fa48("31694") ? {} : (stryCov_9fa48("31694"), {
          partitionId,
          partitionRow
        }));
        addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, partitionId);
      }
    }
    for (const tableId of PRIORITY_CONTROL_PLANE_TABLE_IDS) {
      if (stryMutAct_9fa48("31695")) {
        {}
      } else {
        stryCov_9fa48("31695");
        if (stryMutAct_9fa48("31697") ? false : stryMutAct_9fa48("31696") ? true : (stryCov_9fa48("31696", "31697"), priorityPartitionIdsByTableId.has(tableId))) {
          if (stryMutAct_9fa48("31698")) {
            {}
          } else {
            stryCov_9fa48("31698");
            continue;
          }
        }
        if (stryMutAct_9fa48("31701") ? false : stryMutAct_9fa48("31700") ? true : stryMutAct_9fa48("31699") ? includeInitialWhenMissing : (stryCov_9fa48("31699", "31700", "31701"), !includeInitialWhenMissing)) {
          if (stryMutAct_9fa48("31702")) {
            {}
          } else {
            stryCov_9fa48("31702");
            continue;
          }
        }
        const fallbackPartitionId = normalizeNonEmptyString(INITIAL_PARTITION_IDS[tableId]);
        if (stryMutAct_9fa48("31705") ? false : stryMutAct_9fa48("31704") ? true : stryMutAct_9fa48("31703") ? fallbackPartitionId : (stryCov_9fa48("31703", "31704", "31705"), !fallbackPartitionId)) {
          if (stryMutAct_9fa48("31706")) {
            {}
          } else {
            stryCov_9fa48("31706");
            continue;
          }
        }
        addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, fallbackPartitionId);
      }
    }
    const partitionIds = stryMutAct_9fa48("31707") ? ["Stryker was here"] : (stryCov_9fa48("31707"), []);
    for (const partitionIdSet of priorityPartitionIdsByTableId.values()) {
      if (stryMutAct_9fa48("31708")) {
        {}
      } else {
        stryCov_9fa48("31708");
        for (const partitionId of partitionIdSet) {
          if (stryMutAct_9fa48("31709")) {
            {}
          } else {
            stryCov_9fa48("31709");
            partitionIds.push(partitionId);
          }
        }
      }
    }
    return stryMutAct_9fa48("31710") ? [...new Set(partitionIds)] : (stryCov_9fa48("31710"), (stryMutAct_9fa48("31711") ? [] : (stryCov_9fa48("31711"), [...new Set(partitionIds)])).sort(stryMutAct_9fa48("31712") ? () => undefined : (stryCov_9fa48("31712"), (left, right) => left.localeCompare(right))));
  }
}
export { CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS, PRIORITY_CONTROL_PLANE_TABLE_IDS, buildPartitionRowByPartitionId, getPartitionRowFromCache, isCriticalTransportControlPlanePartition, isPriorityControlPlanePartition, isSystemTablePartition, resolvePartitionTableId, resolvePriorityControlPlanePartitionIds };