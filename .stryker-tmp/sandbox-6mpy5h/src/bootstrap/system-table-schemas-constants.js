/**
 * System Table Schemas - Hard-coded schemas for bootstrap.
 * Defines schemas for all system tables to avoid circular dependencies.
 * Requirements: 6.1, 6.2, 6.5, 14.6, 14.7, 31.3, 31.4
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
import { TABLES } from '../constants/index.js';
import { SD_COL, SERVICE_DEFINITION_COLUMN_LIST } from '../wasm-service/wasm-service-models.js';
import { LATENCY_ASSIGNMENT_STATE, LATENCY_GROUP_STATE } from '../topology/latency-topology-constants.js';

/**
 * Column type definitions for schema.
 */
const COLUMN_TYPE = stryMutAct_9fa48("31728") ? {} : (stryCov_9fa48("31728"), {
  TEXT: stryMutAct_9fa48("31729") ? "" : (stryCov_9fa48("31729"), 'TEXT'),
  INTEGER: stryMutAct_9fa48("31730") ? "" : (stryCov_9fa48("31730"), 'INTEGER'),
  REAL: stryMutAct_9fa48("31731") ? "" : (stryCov_9fa48("31731"), 'REAL'),
  BOOLEAN: stryMutAct_9fa48("31732") ? "" : (stryCov_9fa48("31732"), 'INTEGER') // SQLite uses INTEGER for boolean
});

/**
 * System table names.
 */
const SYSTEM_TABLE_NAME = stryMutAct_9fa48("31733") ? {} : (stryCov_9fa48("31733"), {
  TABLES: TABLES.TABLES,
  PARTITIONS: TABLES.PARTITIONS,
  INDICES: TABLES.INDICES,
  MESSAGE_GROUPS: TABLES.MESSAGE_GROUPS,
  NODES: TABLES.NODES,
  SERVICES: TABLES.SERVICES,
  LOGS: TABLES.LOGS,
  CONFIG: TABLES.CONFIG,
  LIVE_QUERIES: TABLES.LIVE_QUERIES,
  CONTEXTS: TABLES.CONTEXTS,
  CODE: TABLES.CODE,
  CONTROL_PLANE_PUBLICATIONS: TABLES.CONTROL_PLANE_PUBLICATIONS,
  REPLICA_OPERATIONS: TABLES.REPLICA_OPERATIONS,
  NODE_ENDPOINTS: TABLES.NODE_ENDPOINTS,
  SERVICE_DEFINITIONS: TABLES.SERVICE_DEFINITIONS,
  SERVICE_ENDPOINTS: TABLES.SERVICE_ENDPOINTS,
  SERVICE_TIMERS: TABLES.SERVICE_TIMERS,
  MODULE_MANIFESTS: TABLES.MODULE_MANIFESTS,
  PACKAGE_REGISTRY_MAPPINGS: TABLES.PACKAGE_REGISTRY_MAPPINGS,
  PACKAGE_REGISTRY_OVERRIDES: TABLES.PACKAGE_REGISTRY_OVERRIDES,
  MODULE_DEPENDENCY_LOCKS: TABLES.MODULE_DEPENDENCY_LOCKS,
  WASM_OPERATIONS: TABLES.WASM_OPERATIONS,
  SQL_TRANSACTIONS: TABLES.SQL_TRANSACTIONS,
  SQL_TRANSACTION_PARTICIPANTS: TABLES.SQL_TRANSACTION_PARTICIPANTS,
  SQL_WRITE_OPERATIONS: TABLES.SQL_WRITE_OPERATIONS,
  SCHEMA_MIGRATIONS: TABLES.SCHEMA_MIGRATIONS,
  SCHEMA_MIGRATION_PARTITIONS: TABLES.SCHEMA_MIGRATION_PARTITIONS,
  DEBUG_SESSIONS: TABLES.DEBUG_SESSIONS,
  DEBUG_BREAKPOINTS: TABLES.DEBUG_BREAKPOINTS,
  DEBUG_SNAPSHOTS: TABLES.DEBUG_SNAPSHOTS,
  STORAGE_RESERVATIONS: TABLES.STORAGE_RESERVATIONS,
  LATENCY_GROUPS: TABLES.LATENCY_GROUPS,
  INTER_GROUP_LATENCIES: TABLES.INTER_GROUP_LATENCIES
});

/**
 * Tables system table schema.
 * Stores metadata about all tables in the system.
 */
const TABLES_SCHEMA = stryMutAct_9fa48("31734") ? {} : (stryCov_9fa48("31734"), {
  tableName: SYSTEM_TABLE_NAME.TABLES,
  columns: stryMutAct_9fa48("31735") ? [] : (stryCov_9fa48("31735"), [stryMutAct_9fa48("31736") ? {} : (stryCov_9fa48("31736"), {
    name: stryMutAct_9fa48("31737") ? "" : (stryCov_9fa48("31737"), 'table_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("31738") ? false : (stryCov_9fa48("31738"), true)
  }), stryMutAct_9fa48("31739") ? {} : (stryCov_9fa48("31739"), {
    name: stryMutAct_9fa48("31740") ? "" : (stryCov_9fa48("31740"), 'table_name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31741") ? false : (stryCov_9fa48("31741"), true),
    unique: stryMutAct_9fa48("31742") ? false : (stryCov_9fa48("31742"), true)
  }), stryMutAct_9fa48("31743") ? {} : (stryCov_9fa48("31743"), {
    name: stryMutAct_9fa48("31744") ? "" : (stryCov_9fa48("31744"), 'schema_definition'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31745") ? false : (stryCov_9fa48("31745"), true)
  }), stryMutAct_9fa48("31746") ? {} : (stryCov_9fa48("31746"), {
    name: stryMutAct_9fa48("31747") ? "" : (stryCov_9fa48("31747"), 'partition_key'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31748") ? false : (stryCov_9fa48("31748"), true)
  }), stryMutAct_9fa48("31749") ? {} : (stryCov_9fa48("31749"), {
    name: stryMutAct_9fa48("31750") ? "" : (stryCov_9fa48("31750"), 'table_policies'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31751") ? false : (stryCov_9fa48("31751"), true),
    defaultValue: stryMutAct_9fa48("31752") ? "" : (stryCov_9fa48("31752"), '\'{}\'')
  }), stryMutAct_9fa48("31753") ? {} : (stryCov_9fa48("31753"), {
    name: stryMutAct_9fa48("31754") ? "" : (stryCov_9fa48("31754"), 'partition_count'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31755") ? false : (stryCov_9fa48("31755"), true),
    defaultValue: 1
  }), stryMutAct_9fa48("31756") ? {} : (stryCov_9fa48("31756"), {
    name: stryMutAct_9fa48("31757") ? "" : (stryCov_9fa48("31757"), 'active_partition_version'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31758") ? false : (stryCov_9fa48("31758"), true),
    defaultValue: 1
  }), stryMutAct_9fa48("31759") ? {} : (stryCov_9fa48("31759"), {
    name: stryMutAct_9fa48("31760") ? "" : (stryCov_9fa48("31760"), 'pending_partition_version'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("31761") ? {} : (stryCov_9fa48("31761"), {
    name: stryMutAct_9fa48("31762") ? "" : (stryCov_9fa48("31762"), 'partition_transition_state'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31763") ? {} : (stryCov_9fa48("31763"), {
    name: stryMutAct_9fa48("31764") ? "" : (stryCov_9fa48("31764"), 'partition_transition_metadata'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31765") ? {} : (stryCov_9fa48("31765"), {
    name: stryMutAct_9fa48("31766") ? "" : (stryCov_9fa48("31766"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31767") ? false : (stryCov_9fa48("31767"), true)
  }), stryMutAct_9fa48("31768") ? {} : (stryCov_9fa48("31768"), {
    name: stryMutAct_9fa48("31769") ? "" : (stryCov_9fa48("31769"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31770") ? false : (stryCov_9fa48("31770"), true)
  })]),
  indices: stryMutAct_9fa48("31771") ? [] : (stryCov_9fa48("31771"), [stryMutAct_9fa48("31772") ? {} : (stryCov_9fa48("31772"), {
    name: stryMutAct_9fa48("31773") ? "" : (stryCov_9fa48("31773"), 'idx_tables_name'),
    columns: stryMutAct_9fa48("31774") ? [] : (stryCov_9fa48("31774"), [stryMutAct_9fa48("31775") ? "" : (stryCov_9fa48("31775"), 'table_name')])
  })])
});

/**
 * Partitions system table schema.
 * Stores metadata about all partitions in the system.
 */
const PARTITIONS_SCHEMA = stryMutAct_9fa48("31776") ? {} : (stryCov_9fa48("31776"), {
  tableName: SYSTEM_TABLE_NAME.PARTITIONS,
  columns: stryMutAct_9fa48("31777") ? [] : (stryCov_9fa48("31777"), [stryMutAct_9fa48("31778") ? {} : (stryCov_9fa48("31778"), {
    name: stryMutAct_9fa48("31779") ? "" : (stryCov_9fa48("31779"), 'partition_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("31780") ? false : (stryCov_9fa48("31780"), true)
  }), stryMutAct_9fa48("31781") ? {} : (stryCov_9fa48("31781"), {
    name: stryMutAct_9fa48("31782") ? "" : (stryCov_9fa48("31782"), 'table_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31783") ? false : (stryCov_9fa48("31783"), true)
  }), stryMutAct_9fa48("31784") ? {} : (stryCov_9fa48("31784"), {
    name: stryMutAct_9fa48("31785") ? "" : (stryCov_9fa48("31785"), 'table_name'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31786") ? {} : (stryCov_9fa48("31786"), {
    name: stryMutAct_9fa48("31787") ? "" : (stryCov_9fa48("31787"), 'partition_key_start'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31788") ? {} : (stryCov_9fa48("31788"), {
    name: stryMutAct_9fa48("31789") ? "" : (stryCov_9fa48("31789"), 'partition_key_end'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31790") ? {} : (stryCov_9fa48("31790"), {
    name: stryMutAct_9fa48("31791") ? "" : (stryCov_9fa48("31791"), 'partition_version'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31792") ? false : (stryCov_9fa48("31792"), true),
    defaultValue: 1
  }), stryMutAct_9fa48("31793") ? {} : (stryCov_9fa48("31793"), {
    name: stryMutAct_9fa48("31794") ? "" : (stryCov_9fa48("31794"), 'replica_count'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31795") ? false : (stryCov_9fa48("31795"), true),
    defaultValue: 3
  }), stryMutAct_9fa48("31796") ? {} : (stryCov_9fa48("31796"), {
    name: stryMutAct_9fa48("31797") ? "" : (stryCov_9fa48("31797"), 'size_bytes'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31798") ? false : (stryCov_9fa48("31798"), true),
    defaultValue: 0
  }), stryMutAct_9fa48("31799") ? {} : (stryCov_9fa48("31799"), {
    name: stryMutAct_9fa48("31800") ? "" : (stryCov_9fa48("31800"), 'leader_node_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31801") ? {} : (stryCov_9fa48("31801"), {
    name: stryMutAct_9fa48("31802") ? "" : (stryCov_9fa48("31802"), 'state'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31803") ? false : (stryCov_9fa48("31803"), true),
    defaultValue: stryMutAct_9fa48("31804") ? "" : (stryCov_9fa48("31804"), '\'NORMAL\'')
  }), stryMutAct_9fa48("31805") ? {} : (stryCov_9fa48("31805"), {
    name: stryMutAct_9fa48("31806") ? "" : (stryCov_9fa48("31806"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31807") ? false : (stryCov_9fa48("31807"), true)
  }), stryMutAct_9fa48("31808") ? {} : (stryCov_9fa48("31808"), {
    name: stryMutAct_9fa48("31809") ? "" : (stryCov_9fa48("31809"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31810") ? false : (stryCov_9fa48("31810"), true)
  })]),
  indices: stryMutAct_9fa48("31811") ? [] : (stryCov_9fa48("31811"), [stryMutAct_9fa48("31812") ? {} : (stryCov_9fa48("31812"), {
    name: stryMutAct_9fa48("31813") ? "" : (stryCov_9fa48("31813"), 'idx_partitions_table'),
    columns: stryMutAct_9fa48("31814") ? [] : (stryCov_9fa48("31814"), [stryMutAct_9fa48("31815") ? "" : (stryCov_9fa48("31815"), 'table_id')])
  }), stryMutAct_9fa48("31816") ? {} : (stryCov_9fa48("31816"), {
    name: stryMutAct_9fa48("31817") ? "" : (stryCov_9fa48("31817"), 'idx_partitions_leader'),
    columns: stryMutAct_9fa48("31818") ? [] : (stryCov_9fa48("31818"), [stryMutAct_9fa48("31819") ? "" : (stryCov_9fa48("31819"), 'leader_node_id')])
  })])
});

/**
 * Indices system table schema.
 * Stores metadata about all indices in the system.
 */
const INDICES_SCHEMA = stryMutAct_9fa48("31820") ? {} : (stryCov_9fa48("31820"), {
  tableName: SYSTEM_TABLE_NAME.INDICES,
  columns: stryMutAct_9fa48("31821") ? [] : (stryCov_9fa48("31821"), [stryMutAct_9fa48("31822") ? {} : (stryCov_9fa48("31822"), {
    name: stryMutAct_9fa48("31823") ? "" : (stryCov_9fa48("31823"), 'index_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("31824") ? false : (stryCov_9fa48("31824"), true)
  }), stryMutAct_9fa48("31825") ? {} : (stryCov_9fa48("31825"), {
    name: stryMutAct_9fa48("31826") ? "" : (stryCov_9fa48("31826"), 'table_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31827") ? false : (stryCov_9fa48("31827"), true)
  }), stryMutAct_9fa48("31828") ? {} : (stryCov_9fa48("31828"), {
    name: stryMutAct_9fa48("31829") ? "" : (stryCov_9fa48("31829"), 'index_name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31830") ? false : (stryCov_9fa48("31830"), true)
  }), stryMutAct_9fa48("31831") ? {} : (stryCov_9fa48("31831"), {
    name: stryMutAct_9fa48("31832") ? "" : (stryCov_9fa48("31832"), 'column_names'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31833") ? false : (stryCov_9fa48("31833"), true)
  }), // JSON array
  stryMutAct_9fa48("31834") ? {} : (stryCov_9fa48("31834"), {
    name: stryMutAct_9fa48("31835") ? "" : (stryCov_9fa48("31835"), 'index_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31836") ? false : (stryCov_9fa48("31836"), true),
    defaultValue: stryMutAct_9fa48("31837") ? "" : (stryCov_9fa48("31837"), '\'btree\'')
  }), stryMutAct_9fa48("31838") ? {} : (stryCov_9fa48("31838"), {
    name: stryMutAct_9fa48("31839") ? "" : (stryCov_9fa48("31839"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31840") ? false : (stryCov_9fa48("31840"), true)
  })]),
  indices: stryMutAct_9fa48("31841") ? [] : (stryCov_9fa48("31841"), [stryMutAct_9fa48("31842") ? {} : (stryCov_9fa48("31842"), {
    name: stryMutAct_9fa48("31843") ? "" : (stryCov_9fa48("31843"), 'idx_indices_table'),
    columns: stryMutAct_9fa48("31844") ? [] : (stryCov_9fa48("31844"), [stryMutAct_9fa48("31845") ? "" : (stryCov_9fa48("31845"), 'table_id')])
  })])
});

/**
 * Message groups system table schema.
 * Stores metadata about all message groups in the system.
 */
const MESSAGE_GROUPS_SCHEMA = stryMutAct_9fa48("31846") ? {} : (stryCov_9fa48("31846"), {
  tableName: SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
  columns: stryMutAct_9fa48("31847") ? [] : (stryCov_9fa48("31847"), [stryMutAct_9fa48("31848") ? {} : (stryCov_9fa48("31848"), {
    name: stryMutAct_9fa48("31849") ? "" : (stryCov_9fa48("31849"), 'group_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("31850") ? false : (stryCov_9fa48("31850"), true)
  }), stryMutAct_9fa48("31851") ? {} : (stryCov_9fa48("31851"), {
    name: stryMutAct_9fa48("31852") ? "" : (stryCov_9fa48("31852"), 'group_name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31853") ? false : (stryCov_9fa48("31853"), true),
    unique: stryMutAct_9fa48("31854") ? false : (stryCov_9fa48("31854"), true)
  }), stryMutAct_9fa48("31855") ? {} : (stryCov_9fa48("31855"), {
    name: stryMutAct_9fa48("31856") ? "" : (stryCov_9fa48("31856"), 'replica_count'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31857") ? false : (stryCov_9fa48("31857"), true),
    defaultValue: 3
  }), stryMutAct_9fa48("31858") ? {} : (stryCov_9fa48("31858"), {
    name: stryMutAct_9fa48("31859") ? "" : (stryCov_9fa48("31859"), 'leader_node_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31860") ? {} : (stryCov_9fa48("31860"), {
    name: stryMutAct_9fa48("31861") ? "" : (stryCov_9fa48("31861"), 'policy'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31862") ? false : (stryCov_9fa48("31862"), true),
    defaultValue: stryMutAct_9fa48("31863") ? "" : (stryCov_9fa48("31863"), '\'{}\'')
  }), stryMutAct_9fa48("31864") ? {} : (stryCov_9fa48("31864"), {
    name: stryMutAct_9fa48("31865") ? "" : (stryCov_9fa48("31865"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31866") ? false : (stryCov_9fa48("31866"), true)
  }), stryMutAct_9fa48("31867") ? {} : (stryCov_9fa48("31867"), {
    name: stryMutAct_9fa48("31868") ? "" : (stryCov_9fa48("31868"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31869") ? false : (stryCov_9fa48("31869"), true)
  })]),
  indices: stryMutAct_9fa48("31870") ? [] : (stryCov_9fa48("31870"), [stryMutAct_9fa48("31871") ? {} : (stryCov_9fa48("31871"), {
    name: stryMutAct_9fa48("31872") ? "" : (stryCov_9fa48("31872"), 'idx_message_groups_name'),
    columns: stryMutAct_9fa48("31873") ? [] : (stryCov_9fa48("31873"), [stryMutAct_9fa48("31874") ? "" : (stryCov_9fa48("31874"), 'group_name')])
  })])
});

/**
 * Nodes system table schema.
 * Stores metadata about all nodes in the cluster.
 */
const NODES_SCHEMA = stryMutAct_9fa48("31875") ? {} : (stryCov_9fa48("31875"), {
  tableName: SYSTEM_TABLE_NAME.NODES,
  columns: stryMutAct_9fa48("31876") ? [] : (stryCov_9fa48("31876"), [stryMutAct_9fa48("31877") ? {} : (stryCov_9fa48("31877"), {
    name: stryMutAct_9fa48("31878") ? "" : (stryCov_9fa48("31878"), 'node_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("31879") ? false : (stryCov_9fa48("31879"), true)
  }), stryMutAct_9fa48("31880") ? {} : (stryCov_9fa48("31880"), {
    name: stryMutAct_9fa48("31881") ? "" : (stryCov_9fa48("31881"), 'node_address'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31882") ? false : (stryCov_9fa48("31882"), true),
    unique: stryMutAct_9fa48("31883") ? false : (stryCov_9fa48("31883"), true)
  }), stryMutAct_9fa48("31884") ? {} : (stryCov_9fa48("31884"), {
    name: stryMutAct_9fa48("31885") ? "" : (stryCov_9fa48("31885"), 'cpu_cores'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31886") ? false : (stryCov_9fa48("31886"), true)
  }), stryMutAct_9fa48("31887") ? {} : (stryCov_9fa48("31887"), {
    name: stryMutAct_9fa48("31888") ? "" : (stryCov_9fa48("31888"), 'memory_mb'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31889") ? false : (stryCov_9fa48("31889"), true)
  }), stryMutAct_9fa48("31890") ? {} : (stryCov_9fa48("31890"), {
    name: stryMutAct_9fa48("31891") ? "" : (stryCov_9fa48("31891"), 'disk_gb'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31892") ? false : (stryCov_9fa48("31892"), true)
  }), stryMutAct_9fa48("31893") ? {} : (stryCov_9fa48("31893"), {
    name: stryMutAct_9fa48("31894") ? "" : (stryCov_9fa48("31894"), 'cpu_usage_percent'),
    type: COLUMN_TYPE.REAL,
    defaultValue: 0
  }), stryMutAct_9fa48("31895") ? {} : (stryCov_9fa48("31895"), {
    name: stryMutAct_9fa48("31896") ? "" : (stryCov_9fa48("31896"), 'memory_usage_percent'),
    type: COLUMN_TYPE.REAL,
    defaultValue: 0
  }), stryMutAct_9fa48("31897") ? {} : (stryCov_9fa48("31897"), {
    name: stryMutAct_9fa48("31898") ? "" : (stryCov_9fa48("31898"), 'disk_usage_percent'),
    type: COLUMN_TYPE.REAL,
    defaultValue: 0
  }), stryMutAct_9fa48("31899") ? {} : (stryCov_9fa48("31899"), {
    name: stryMutAct_9fa48("31900") ? "" : (stryCov_9fa48("31900"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31901") ? false : (stryCov_9fa48("31901"), true),
    defaultValue: stryMutAct_9fa48("31902") ? "" : (stryCov_9fa48("31902"), '\'active\'')
  }), stryMutAct_9fa48("31903") ? {} : (stryCov_9fa48("31903"), {
    name: stryMutAct_9fa48("31904") ? "" : (stryCov_9fa48("31904"), 'connection_state'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31905") ? false : (stryCov_9fa48("31905"), true),
    defaultValue: stryMutAct_9fa48("31906") ? "" : (stryCov_9fa48("31906"), '\'disconnected\'')
  }), stryMutAct_9fa48("31907") ? {} : (stryCov_9fa48("31907"), {
    name: stryMutAct_9fa48("31908") ? "" : (stryCov_9fa48("31908"), 'capabilities'),
    type: COLUMN_TYPE.TEXT,
    defaultValue: stryMutAct_9fa48("31909") ? "" : (stryCov_9fa48("31909"), '\'[]\'')
  }), stryMutAct_9fa48("31910") ? {} : (stryCov_9fa48("31910"), {
    name: stryMutAct_9fa48("31911") ? "" : (stryCov_9fa48("31911"), 'last_heartbeat'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31912") ? false : (stryCov_9fa48("31912"), true)
  }), stryMutAct_9fa48("31913") ? {} : (stryCov_9fa48("31913"), {
    name: stryMutAct_9fa48("31914") ? "" : (stryCov_9fa48("31914"), 'ready_lease_expires_at'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("31915") ? {} : (stryCov_9fa48("31915"), {
    name: stryMutAct_9fa48("31916") ? "" : (stryCov_9fa48("31916"), 'storage_budget_bytes'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("31917") ? {} : (stryCov_9fa48("31917"), {
    name: stryMutAct_9fa48("31918") ? "" : (stryCov_9fa48("31918"), 'storage_budget_source'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31919") ? {} : (stryCov_9fa48("31919"), {
    name: stryMutAct_9fa48("31920") ? "" : (stryCov_9fa48("31920"), 'storage_budget_updated_at'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("31921") ? {} : (stryCov_9fa48("31921"), {
    name: stryMutAct_9fa48("31922") ? "" : (stryCov_9fa48("31922"), 'latency_group_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31923") ? {} : (stryCov_9fa48("31923"), {
    name: stryMutAct_9fa48("31924") ? "" : (stryCov_9fa48("31924"), 'last_latency_check_at'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("31925") ? {} : (stryCov_9fa48("31925"), {
    name: stryMutAct_9fa48("31926") ? "" : (stryCov_9fa48("31926"), 'latency_assignment_state'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31927") ? false : (stryCov_9fa48("31927"), true),
    defaultValue: stryMutAct_9fa48("31928") ? `` : (stryCov_9fa48("31928"), `'${LATENCY_ASSIGNMENT_STATE.UNASSIGNED}'`)
  }), stryMutAct_9fa48("31929") ? {} : (stryCov_9fa48("31929"), {
    name: stryMutAct_9fa48("31930") ? "" : (stryCov_9fa48("31930"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31931") ? false : (stryCov_9fa48("31931"), true)
  })]),
  indices: stryMutAct_9fa48("31932") ? [] : (stryCov_9fa48("31932"), [stryMutAct_9fa48("31933") ? {} : (stryCov_9fa48("31933"), {
    name: stryMutAct_9fa48("31934") ? "" : (stryCov_9fa48("31934"), 'idx_nodes_address'),
    columns: stryMutAct_9fa48("31935") ? [] : (stryCov_9fa48("31935"), [stryMutAct_9fa48("31936") ? "" : (stryCov_9fa48("31936"), 'node_address')])
  }), stryMutAct_9fa48("31937") ? {} : (stryCov_9fa48("31937"), {
    name: stryMutAct_9fa48("31938") ? "" : (stryCov_9fa48("31938"), 'idx_nodes_status'),
    columns: stryMutAct_9fa48("31939") ? [] : (stryCov_9fa48("31939"), [stryMutAct_9fa48("31940") ? "" : (stryCov_9fa48("31940"), 'status')])
  }), stryMutAct_9fa48("31941") ? {} : (stryCov_9fa48("31941"), {
    name: stryMutAct_9fa48("31942") ? "" : (stryCov_9fa48("31942"), 'idx_nodes_latency_group'),
    columns: stryMutAct_9fa48("31943") ? [] : (stryCov_9fa48("31943"), [stryMutAct_9fa48("31944") ? "" : (stryCov_9fa48("31944"), 'latency_group_id')])
  })])
});

/**
 * Latency groups system table schema.
 * Stores persisted metadata for latency-group membership ownership.
 */
const LATENCY_GROUPS_SCHEMA = stryMutAct_9fa48("31945") ? {} : (stryCov_9fa48("31945"), {
  tableName: SYSTEM_TABLE_NAME.LATENCY_GROUPS,
  columns: stryMutAct_9fa48("31946") ? [] : (stryCov_9fa48("31946"), [stryMutAct_9fa48("31947") ? {} : (stryCov_9fa48("31947"), {
    name: stryMutAct_9fa48("31948") ? "" : (stryCov_9fa48("31948"), 'group_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("31949") ? false : (stryCov_9fa48("31949"), true)
  }), stryMutAct_9fa48("31950") ? {} : (stryCov_9fa48("31950"), {
    name: stryMutAct_9fa48("31951") ? "" : (stryCov_9fa48("31951"), 'representative_node_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31952") ? {} : (stryCov_9fa48("31952"), {
    name: stryMutAct_9fa48("31953") ? "" : (stryCov_9fa48("31953"), 'coordinator_node_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("31954") ? {} : (stryCov_9fa48("31954"), {
    name: stryMutAct_9fa48("31955") ? "" : (stryCov_9fa48("31955"), 'state'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31956") ? false : (stryCov_9fa48("31956"), true),
    defaultValue: stryMutAct_9fa48("31957") ? `` : (stryCov_9fa48("31957"), `'${LATENCY_GROUP_STATE.ACTIVE}'`)
  }), stryMutAct_9fa48("31958") ? {} : (stryCov_9fa48("31958"), {
    name: stryMutAct_9fa48("31959") ? "" : (stryCov_9fa48("31959"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31960") ? false : (stryCov_9fa48("31960"), true)
  }), stryMutAct_9fa48("31961") ? {} : (stryCov_9fa48("31961"), {
    name: stryMutAct_9fa48("31962") ? "" : (stryCov_9fa48("31962"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31963") ? false : (stryCov_9fa48("31963"), true)
  })]),
  indices: stryMutAct_9fa48("31964") ? [] : (stryCov_9fa48("31964"), [stryMutAct_9fa48("31965") ? {} : (stryCov_9fa48("31965"), {
    name: stryMutAct_9fa48("31966") ? "" : (stryCov_9fa48("31966"), 'idx_latency_groups_rep_node'),
    columns: stryMutAct_9fa48("31967") ? [] : (stryCov_9fa48("31967"), [stryMutAct_9fa48("31968") ? "" : (stryCov_9fa48("31968"), 'representative_node_id')])
  }), stryMutAct_9fa48("31969") ? {} : (stryCov_9fa48("31969"), {
    name: stryMutAct_9fa48("31970") ? "" : (stryCov_9fa48("31970"), 'idx_latency_groups_coord_node'),
    columns: stryMutAct_9fa48("31971") ? [] : (stryCov_9fa48("31971"), [stryMutAct_9fa48("31972") ? "" : (stryCov_9fa48("31972"), 'coordinator_node_id')])
  }), stryMutAct_9fa48("31973") ? {} : (stryCov_9fa48("31973"), {
    name: stryMutAct_9fa48("31974") ? "" : (stryCov_9fa48("31974"), 'idx_latency_groups_state'),
    columns: stryMutAct_9fa48("31975") ? [] : (stryCov_9fa48("31975"), [stryMutAct_9fa48("31976") ? "" : (stryCov_9fa48("31976"), 'state')])
  })])
});

/**
 * Inter-group latencies system table schema.
 * Stores RTT sample aggregates between latency-group representatives.
 */
const INTER_GROUP_LATENCIES_SCHEMA = stryMutAct_9fa48("31977") ? {} : (stryCov_9fa48("31977"), {
  tableName: SYSTEM_TABLE_NAME.INTER_GROUP_LATENCIES,
  columns: stryMutAct_9fa48("31978") ? [] : (stryCov_9fa48("31978"), [stryMutAct_9fa48("31979") ? {} : (stryCov_9fa48("31979"), {
    name: stryMutAct_9fa48("31980") ? "" : (stryCov_9fa48("31980"), 'latency_edge_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("31981") ? false : (stryCov_9fa48("31981"), true)
  }), stryMutAct_9fa48("31982") ? {} : (stryCov_9fa48("31982"), {
    name: stryMutAct_9fa48("31983") ? "" : (stryCov_9fa48("31983"), 'source_group_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31984") ? false : (stryCov_9fa48("31984"), true)
  }), stryMutAct_9fa48("31985") ? {} : (stryCov_9fa48("31985"), {
    name: stryMutAct_9fa48("31986") ? "" : (stryCov_9fa48("31986"), 'target_group_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31987") ? false : (stryCov_9fa48("31987"), true)
  }), stryMutAct_9fa48("31988") ? {} : (stryCov_9fa48("31988"), {
    name: stryMutAct_9fa48("31989") ? "" : (stryCov_9fa48("31989"), 'latency_ms'),
    type: COLUMN_TYPE.REAL,
    notNull: stryMutAct_9fa48("31990") ? false : (stryCov_9fa48("31990"), true)
  }), stryMutAct_9fa48("31991") ? {} : (stryCov_9fa48("31991"), {
    name: stryMutAct_9fa48("31992") ? "" : (stryCov_9fa48("31992"), 'sample_count'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("31993") ? false : (stryCov_9fa48("31993"), true),
    defaultValue: 1
  }), stryMutAct_9fa48("31994") ? {} : (stryCov_9fa48("31994"), {
    name: stryMutAct_9fa48("31995") ? "" : (stryCov_9fa48("31995"), 'sample_quality'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("31996") ? false : (stryCov_9fa48("31996"), true),
    defaultValue: stryMutAct_9fa48("31997") ? "" : (stryCov_9fa48("31997"), '\'good\'')
  }), stryMutAct_9fa48("31998") ? {} : (stryCov_9fa48("31998"), {
    name: stryMutAct_9fa48("31999") ? "" : (stryCov_9fa48("31999"), 'last_measured_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32000") ? false : (stryCov_9fa48("32000"), true)
  }), stryMutAct_9fa48("32001") ? {} : (stryCov_9fa48("32001"), {
    name: stryMutAct_9fa48("32002") ? "" : (stryCov_9fa48("32002"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32003") ? false : (stryCov_9fa48("32003"), true)
  }), stryMutAct_9fa48("32004") ? {} : (stryCov_9fa48("32004"), {
    name: stryMutAct_9fa48("32005") ? "" : (stryCov_9fa48("32005"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32006") ? false : (stryCov_9fa48("32006"), true)
  })]),
  indices: stryMutAct_9fa48("32007") ? [] : (stryCov_9fa48("32007"), [stryMutAct_9fa48("32008") ? {} : (stryCov_9fa48("32008"), {
    name: stryMutAct_9fa48("32009") ? "" : (stryCov_9fa48("32009"), 'idx_inter_group_latencies_source_target'),
    columns: stryMutAct_9fa48("32010") ? [] : (stryCov_9fa48("32010"), [stryMutAct_9fa48("32011") ? "" : (stryCov_9fa48("32011"), 'source_group_id'), stryMutAct_9fa48("32012") ? "" : (stryCov_9fa48("32012"), 'target_group_id')])
  }), stryMutAct_9fa48("32013") ? {} : (stryCov_9fa48("32013"), {
    name: stryMutAct_9fa48("32014") ? "" : (stryCov_9fa48("32014"), 'idx_inter_group_latencies_measured'),
    columns: stryMutAct_9fa48("32015") ? [] : (stryCov_9fa48("32015"), [stryMutAct_9fa48("32016") ? "" : (stryCov_9fa48("32016"), 'last_measured_at')])
  })])
});

/**
 * Services system table schema.
 * Stores metadata about all services in the system.
 * Includes raft_role column for Raft-based services (Req 14.6, 14.7).
 * Includes state machine tracking columns (Req 4.1).
 */
const SERVICES_SCHEMA = stryMutAct_9fa48("32017") ? {} : (stryCov_9fa48("32017"), {
  tableName: SYSTEM_TABLE_NAME.SERVICES,
  columns: stryMutAct_9fa48("32018") ? [] : (stryCov_9fa48("32018"), [stryMutAct_9fa48("32019") ? {} : (stryCov_9fa48("32019"), {
    name: stryMutAct_9fa48("32020") ? "" : (stryCov_9fa48("32020"), 'service_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32021") ? false : (stryCov_9fa48("32021"), true)
  }), stryMutAct_9fa48("32022") ? {} : (stryCov_9fa48("32022"), {
    name: stryMutAct_9fa48("32023") ? "" : (stryCov_9fa48("32023"), 'service_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32024") ? false : (stryCov_9fa48("32024"), true)
  }), stryMutAct_9fa48("32025") ? {} : (stryCov_9fa48("32025"), {
    name: stryMutAct_9fa48("32026") ? "" : (stryCov_9fa48("32026"), 'node_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32027") ? false : (stryCov_9fa48("32027"), true)
  }), stryMutAct_9fa48("32028") ? {} : (stryCov_9fa48("32028"), {
    name: stryMutAct_9fa48("32029") ? "" : (stryCov_9fa48("32029"), 'partition_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32030") ? {} : (stryCov_9fa48("32030"), {
    name: stryMutAct_9fa48("32031") ? "" : (stryCov_9fa48("32031"), 'group_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32032") ? {} : (stryCov_9fa48("32032"), {
    name: stryMutAct_9fa48("32033") ? "" : (stryCov_9fa48("32033"), 'replica_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32034") ? {} : (stryCov_9fa48("32034"), {
    name: stryMutAct_9fa48("32035") ? "" : (stryCov_9fa48("32035"), 'raft_role'),
    type: COLUMN_TYPE.TEXT
  }), // leader, follower, candidate
  stryMutAct_9fa48("32036") ? {} : (stryCov_9fa48("32036"), {
    name: stryMutAct_9fa48("32037") ? "" : (stryCov_9fa48("32037"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32038") ? false : (stryCov_9fa48("32038"), true),
    defaultValue: stryMutAct_9fa48("32039") ? "" : (stryCov_9fa48("32039"), '\'active\'')
  }), // Timestamp when current state was entered
  stryMutAct_9fa48("32040") ? {} : (stryCov_9fa48("32040"), {
    name: stryMutAct_9fa48("32041") ? "" : (stryCov_9fa48("32041"), 'state_entered_at'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32042") ? {} : (stryCov_9fa48("32042"), {
    name: stryMutAct_9fa48("32043") ? "" : (stryCov_9fa48("32043"), 'previous_state'),
    type: COLUMN_TYPE.TEXT
  }), // Previous state for debugging
  stryMutAct_9fa48("32044") ? {} : (stryCov_9fa48("32044"), {
    name: stryMutAct_9fa48("32045") ? "" : (stryCov_9fa48("32045"), 'trigger_reason'),
    type: COLUMN_TYPE.TEXT
  }), // What triggered current state
  stryMutAct_9fa48("32046") ? {} : (stryCov_9fa48("32046"), {
    name: stryMutAct_9fa48("32047") ? "" : (stryCov_9fa48("32047"), 'error_message'),
    type: COLUMN_TYPE.TEXT
  }), // Error if in failed state
  stryMutAct_9fa48("32048") ? {} : (stryCov_9fa48("32048"), {
    name: stryMutAct_9fa48("32049") ? "" : (stryCov_9fa48("32049"), 'address'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32050") ? {} : (stryCov_9fa48("32050"), {
    name: stryMutAct_9fa48("32051") ? "" : (stryCov_9fa48("32051"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32052") ? false : (stryCov_9fa48("32052"), true)
  }), stryMutAct_9fa48("32053") ? {} : (stryCov_9fa48("32053"), {
    name: stryMutAct_9fa48("32054") ? "" : (stryCov_9fa48("32054"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32055") ? false : (stryCov_9fa48("32055"), true)
  })]),
  indices: stryMutAct_9fa48("32056") ? [] : (stryCov_9fa48("32056"), [stryMutAct_9fa48("32057") ? {} : (stryCov_9fa48("32057"), {
    name: stryMutAct_9fa48("32058") ? "" : (stryCov_9fa48("32058"), 'idx_services_node'),
    columns: stryMutAct_9fa48("32059") ? [] : (stryCov_9fa48("32059"), [stryMutAct_9fa48("32060") ? "" : (stryCov_9fa48("32060"), 'node_id')])
  }), stryMutAct_9fa48("32061") ? {} : (stryCov_9fa48("32061"), {
    name: stryMutAct_9fa48("32062") ? "" : (stryCov_9fa48("32062"), 'idx_services_partition'),
    columns: stryMutAct_9fa48("32063") ? [] : (stryCov_9fa48("32063"), [stryMutAct_9fa48("32064") ? "" : (stryCov_9fa48("32064"), 'partition_id')])
  }), stryMutAct_9fa48("32065") ? {} : (stryCov_9fa48("32065"), {
    name: stryMutAct_9fa48("32066") ? "" : (stryCov_9fa48("32066"), 'idx_services_group'),
    columns: stryMutAct_9fa48("32067") ? [] : (stryCov_9fa48("32067"), [stryMutAct_9fa48("32068") ? "" : (stryCov_9fa48("32068"), 'group_id')])
  }), stryMutAct_9fa48("32069") ? {} : (stryCov_9fa48("32069"), {
    name: stryMutAct_9fa48("32070") ? "" : (stryCov_9fa48("32070"), 'idx_services_type'),
    columns: stryMutAct_9fa48("32071") ? [] : (stryCov_9fa48("32071"), [stryMutAct_9fa48("32072") ? "" : (stryCov_9fa48("32072"), 'service_type')])
  }), stryMutAct_9fa48("32073") ? {} : (stryCov_9fa48("32073"), {
    name: stryMutAct_9fa48("32074") ? "" : (stryCov_9fa48("32074"), 'idx_services_raft_role'),
    columns: stryMutAct_9fa48("32075") ? [] : (stryCov_9fa48("32075"), [stryMutAct_9fa48("32076") ? "" : (stryCov_9fa48("32076"), 'raft_role')])
  }), stryMutAct_9fa48("32077") ? {} : (stryCov_9fa48("32077"), {
    name: stryMutAct_9fa48("32078") ? "" : (stryCov_9fa48("32078"), 'idx_services_status'),
    columns: stryMutAct_9fa48("32079") ? [] : (stryCov_9fa48("32079"), [stryMutAct_9fa48("32080") ? "" : (stryCov_9fa48("32080"), 'status')])
  })])
});

/**
 * Logs system table schema.
 * Stores structured log entries.
 */
const LOGS_SCHEMA = stryMutAct_9fa48("32081") ? {} : (stryCov_9fa48("32081"), {
  tableName: SYSTEM_TABLE_NAME.LOGS,
  columns: stryMutAct_9fa48("32082") ? [] : (stryCov_9fa48("32082"), [stryMutAct_9fa48("32083") ? {} : (stryCov_9fa48("32083"), {
    name: stryMutAct_9fa48("32084") ? "" : (stryCov_9fa48("32084"), 'log_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32085") ? false : (stryCov_9fa48("32085"), true)
  }), stryMutAct_9fa48("32086") ? {} : (stryCov_9fa48("32086"), {
    name: stryMutAct_9fa48("32087") ? "" : (stryCov_9fa48("32087"), 'timestamp'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32088") ? false : (stryCov_9fa48("32088"), true)
  }), stryMutAct_9fa48("32089") ? {} : (stryCov_9fa48("32089"), {
    name: stryMutAct_9fa48("32090") ? "" : (stryCov_9fa48("32090"), 'level'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32091") ? false : (stryCov_9fa48("32091"), true)
  }), stryMutAct_9fa48("32092") ? {} : (stryCov_9fa48("32092"), {
    name: stryMutAct_9fa48("32093") ? "" : (stryCov_9fa48("32093"), 'node_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32094") ? false : (stryCov_9fa48("32094"), true)
  }), stryMutAct_9fa48("32095") ? {} : (stryCov_9fa48("32095"), {
    name: stryMutAct_9fa48("32096") ? "" : (stryCov_9fa48("32096"), 'service_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32097") ? {} : (stryCov_9fa48("32097"), {
    name: stryMutAct_9fa48("32098") ? "" : (stryCov_9fa48("32098"), 'service_type'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32099") ? {} : (stryCov_9fa48("32099"), {
    name: stryMutAct_9fa48("32100") ? "" : (stryCov_9fa48("32100"), 'message'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32101") ? false : (stryCov_9fa48("32101"), true)
  }), stryMutAct_9fa48("32102") ? {} : (stryCov_9fa48("32102"), {
    name: stryMutAct_9fa48("32103") ? "" : (stryCov_9fa48("32103"), 'trace_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32104") ? {} : (stryCov_9fa48("32104"), {
    name: stryMutAct_9fa48("32105") ? "" : (stryCov_9fa48("32105"), 'metadata'),
    type: COLUMN_TYPE.TEXT
  }), // JSON
  stryMutAct_9fa48("32106") ? {} : (stryCov_9fa48("32106"), {
    name: stryMutAct_9fa48("32107") ? "" : (stryCov_9fa48("32107"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32108") ? false : (stryCov_9fa48("32108"), true)
  })]),
  indices: stryMutAct_9fa48("32109") ? [] : (stryCov_9fa48("32109"), [stryMutAct_9fa48("32110") ? {} : (stryCov_9fa48("32110"), {
    name: stryMutAct_9fa48("32111") ? "" : (stryCov_9fa48("32111"), 'idx_logs_timestamp'),
    columns: stryMutAct_9fa48("32112") ? [] : (stryCov_9fa48("32112"), [stryMutAct_9fa48("32113") ? "" : (stryCov_9fa48("32113"), 'timestamp')])
  }), stryMutAct_9fa48("32114") ? {} : (stryCov_9fa48("32114"), {
    name: stryMutAct_9fa48("32115") ? "" : (stryCov_9fa48("32115"), 'idx_logs_level'),
    columns: stryMutAct_9fa48("32116") ? [] : (stryCov_9fa48("32116"), [stryMutAct_9fa48("32117") ? "" : (stryCov_9fa48("32117"), 'level')])
  }), stryMutAct_9fa48("32118") ? {} : (stryCov_9fa48("32118"), {
    name: stryMutAct_9fa48("32119") ? "" : (stryCov_9fa48("32119"), 'idx_logs_node'),
    columns: stryMutAct_9fa48("32120") ? [] : (stryCov_9fa48("32120"), [stryMutAct_9fa48("32121") ? "" : (stryCov_9fa48("32121"), 'node_id')])
  }), stryMutAct_9fa48("32122") ? {} : (stryCov_9fa48("32122"), {
    name: stryMutAct_9fa48("32123") ? "" : (stryCov_9fa48("32123"), 'idx_logs_trace'),
    columns: stryMutAct_9fa48("32124") ? [] : (stryCov_9fa48("32124"), [stryMutAct_9fa48("32125") ? "" : (stryCov_9fa48("32125"), 'trace_id')])
  })])
});

/**
 * Config system table schema.
 * Stores dynamic configuration key-value pairs.
 */
const CONFIG_SCHEMA = stryMutAct_9fa48("32126") ? {} : (stryCov_9fa48("32126"), {
  tableName: SYSTEM_TABLE_NAME.CONFIG,
  columns: stryMutAct_9fa48("32127") ? [] : (stryCov_9fa48("32127"), [stryMutAct_9fa48("32128") ? {} : (stryCov_9fa48("32128"), {
    name: stryMutAct_9fa48("32129") ? "" : (stryCov_9fa48("32129"), 'config_key'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32130") ? false : (stryCov_9fa48("32130"), true)
  }), stryMutAct_9fa48("32131") ? {} : (stryCov_9fa48("32131"), {
    name: stryMutAct_9fa48("32132") ? "" : (stryCov_9fa48("32132"), 'config_value'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32133") ? false : (stryCov_9fa48("32133"), true)
  }), stryMutAct_9fa48("32134") ? {} : (stryCov_9fa48("32134"), {
    name: stryMutAct_9fa48("32135") ? "" : (stryCov_9fa48("32135"), 'value_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32136") ? false : (stryCov_9fa48("32136"), true)
  }), stryMutAct_9fa48("32137") ? {} : (stryCov_9fa48("32137"), {
    name: stryMutAct_9fa48("32138") ? "" : (stryCov_9fa48("32138"), 'requires_restart'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32139") ? false : (stryCov_9fa48("32139"), true),
    defaultValue: 0
  }), stryMutAct_9fa48("32140") ? {} : (stryCov_9fa48("32140"), {
    name: stryMutAct_9fa48("32141") ? "" : (stryCov_9fa48("32141"), 'description'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32142") ? {} : (stryCov_9fa48("32142"), {
    name: stryMutAct_9fa48("32143") ? "" : (stryCov_9fa48("32143"), 'default_value'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32144") ? false : (stryCov_9fa48("32144"), true)
  }), stryMutAct_9fa48("32145") ? {} : (stryCov_9fa48("32145"), {
    name: stryMutAct_9fa48("32146") ? "" : (stryCov_9fa48("32146"), 'updated_by'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32147") ? {} : (stryCov_9fa48("32147"), {
    name: stryMutAct_9fa48("32148") ? "" : (stryCov_9fa48("32148"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32149") ? {} : (stryCov_9fa48("32149"), {
    name: stryMutAct_9fa48("32150") ? "" : (stryCov_9fa48("32150"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32151") ? false : (stryCov_9fa48("32151"), true)
  })]),
  indices: stryMutAct_9fa48("32152") ? [] : (stryCov_9fa48("32152"), [stryMutAct_9fa48("32153") ? {} : (stryCov_9fa48("32153"), {
    name: stryMutAct_9fa48("32154") ? "" : (stryCov_9fa48("32154"), 'idx_config_requires_restart'),
    columns: stryMutAct_9fa48("32155") ? [] : (stryCov_9fa48("32155"), [stryMutAct_9fa48("32156") ? "" : (stryCov_9fa48("32156"), 'requires_restart')])
  })])
});

/**
 * Live queries system table schema.
 * Stores metadata about active live query subscriptions for monitoring.
 * Requirements: 33.18, 33.20
 */
const LIVE_QUERIES_SCHEMA = stryMutAct_9fa48("32157") ? {} : (stryCov_9fa48("32157"), {
  tableName: SYSTEM_TABLE_NAME.LIVE_QUERIES,
  columns: stryMutAct_9fa48("32158") ? [] : (stryCov_9fa48("32158"), [stryMutAct_9fa48("32159") ? {} : (stryCov_9fa48("32159"), {
    name: stryMutAct_9fa48("32160") ? "" : (stryCov_9fa48("32160"), 'query_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32161") ? false : (stryCov_9fa48("32161"), true)
  }), stryMutAct_9fa48("32162") ? {} : (stryCov_9fa48("32162"), {
    name: stryMutAct_9fa48("32163") ? "" : (stryCov_9fa48("32163"), 'table_name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32164") ? false : (stryCov_9fa48("32164"), true)
  }), stryMutAct_9fa48("32165") ? {} : (stryCov_9fa48("32165"), {
    name: stryMutAct_9fa48("32166") ? "" : (stryCov_9fa48("32166"), 'predicate_hash'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32167") ? false : (stryCov_9fa48("32167"), true)
  }), stryMutAct_9fa48("32168") ? {} : (stryCov_9fa48("32168"), {
    name: stryMutAct_9fa48("32169") ? "" : (stryCov_9fa48("32169"), 'predicate_sql'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32170") ? false : (stryCov_9fa48("32170"), true)
  }), stryMutAct_9fa48("32171") ? {} : (stryCov_9fa48("32171"), {
    name: stryMutAct_9fa48("32172") ? "" : (stryCov_9fa48("32172"), 'partition_key_value'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32173") ? {} : (stryCov_9fa48("32173"), {
    name: stryMutAct_9fa48("32174") ? "" : (stryCov_9fa48("32174"), 'client_count'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32175") ? false : (stryCov_9fa48("32175"), true),
    defaultValue: 0
  }), stryMutAct_9fa48("32176") ? {} : (stryCov_9fa48("32176"), {
    name: stryMutAct_9fa48("32177") ? "" : (stryCov_9fa48("32177"), 'node_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32178") ? false : (stryCov_9fa48("32178"), true)
  }), stryMutAct_9fa48("32179") ? {} : (stryCov_9fa48("32179"), {
    name: stryMutAct_9fa48("32180") ? "" : (stryCov_9fa48("32180"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32181") ? false : (stryCov_9fa48("32181"), true)
  }), stryMutAct_9fa48("32182") ? {} : (stryCov_9fa48("32182"), {
    name: stryMutAct_9fa48("32183") ? "" : (stryCov_9fa48("32183"), 'last_activity_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32184") ? false : (stryCov_9fa48("32184"), true)
  })]),
  indices: stryMutAct_9fa48("32185") ? [] : (stryCov_9fa48("32185"), [stryMutAct_9fa48("32186") ? {} : (stryCov_9fa48("32186"), {
    name: stryMutAct_9fa48("32187") ? "" : (stryCov_9fa48("32187"), 'idx_live_queries_table'),
    columns: stryMutAct_9fa48("32188") ? [] : (stryCov_9fa48("32188"), [stryMutAct_9fa48("32189") ? "" : (stryCov_9fa48("32189"), 'table_name')])
  }), stryMutAct_9fa48("32190") ? {} : (stryCov_9fa48("32190"), {
    name: stryMutAct_9fa48("32191") ? "" : (stryCov_9fa48("32191"), 'idx_live_queries_activity'),
    columns: stryMutAct_9fa48("32192") ? [] : (stryCov_9fa48("32192"), [stryMutAct_9fa48("32193") ? "" : (stryCov_9fa48("32193"), 'last_activity_at')])
  }), stryMutAct_9fa48("32194") ? {} : (stryCov_9fa48("32194"), {
    name: stryMutAct_9fa48("32195") ? "" : (stryCov_9fa48("32195"), 'idx_live_queries_node'),
    columns: stryMutAct_9fa48("32196") ? [] : (stryCov_9fa48("32196"), [stryMutAct_9fa48("32197") ? "" : (stryCov_9fa48("32197"), 'node_id')])
  })])
});

/**
 * Contexts system table schema.
 * Stores named state for external function executors.
 * Requirements: 34.1, 34.2, 34.3
 */
const CONTEXTS_SCHEMA = stryMutAct_9fa48("32198") ? {} : (stryCov_9fa48("32198"), {
  tableName: SYSTEM_TABLE_NAME.CONTEXTS,
  columns: stryMutAct_9fa48("32199") ? [] : (stryCov_9fa48("32199"), [stryMutAct_9fa48("32200") ? {} : (stryCov_9fa48("32200"), {
    name: stryMutAct_9fa48("32201") ? "" : (stryCov_9fa48("32201"), 'context_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32202") ? false : (stryCov_9fa48("32202"), true)
  }), stryMutAct_9fa48("32203") ? {} : (stryCov_9fa48("32203"), {
    name: stryMutAct_9fa48("32204") ? "" : (stryCov_9fa48("32204"), 'context_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32205") ? false : (stryCov_9fa48("32205"), true)
  }), stryMutAct_9fa48("32206") ? {} : (stryCov_9fa48("32206"), {
    name: stryMutAct_9fa48("32207") ? "" : (stryCov_9fa48("32207"), 'context_name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32208") ? false : (stryCov_9fa48("32208"), true)
  }), stryMutAct_9fa48("32209") ? {} : (stryCov_9fa48("32209"), {
    name: stryMutAct_9fa48("32210") ? "" : (stryCov_9fa48("32210"), 'context_data'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32211") ? false : (stryCov_9fa48("32211"), true)
  }), stryMutAct_9fa48("32212") ? {} : (stryCov_9fa48("32212"), {
    name: stryMutAct_9fa48("32213") ? "" : (stryCov_9fa48("32213"), 'owner_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32214") ? {} : (stryCov_9fa48("32214"), {
    name: stryMutAct_9fa48("32215") ? "" : (stryCov_9fa48("32215"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32216") ? false : (stryCov_9fa48("32216"), true)
  }), stryMutAct_9fa48("32217") ? {} : (stryCov_9fa48("32217"), {
    name: stryMutAct_9fa48("32218") ? "" : (stryCov_9fa48("32218"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32219") ? false : (stryCov_9fa48("32219"), true)
  })]),
  indices: stryMutAct_9fa48("32220") ? [] : (stryCov_9fa48("32220"), [stryMutAct_9fa48("32221") ? {} : (stryCov_9fa48("32221"), {
    name: stryMutAct_9fa48("32222") ? "" : (stryCov_9fa48("32222"), 'idx_contexts_type'),
    columns: stryMutAct_9fa48("32223") ? [] : (stryCov_9fa48("32223"), [stryMutAct_9fa48("32224") ? "" : (stryCov_9fa48("32224"), 'context_type')])
  }), stryMutAct_9fa48("32225") ? {} : (stryCov_9fa48("32225"), {
    name: stryMutAct_9fa48("32226") ? "" : (stryCov_9fa48("32226"), 'idx_contexts_owner'),
    columns: stryMutAct_9fa48("32227") ? [] : (stryCov_9fa48("32227"), [stryMutAct_9fa48("32228") ? "" : (stryCov_9fa48("32228"), 'owner_id')])
  }), stryMutAct_9fa48("32229") ? {} : (stryCov_9fa48("32229"), {
    name: stryMutAct_9fa48("32230") ? "" : (stryCov_9fa48("32230"), 'idx_contexts_type_name'),
    columns: stryMutAct_9fa48("32231") ? [] : (stryCov_9fa48("32231"), [stryMutAct_9fa48("32232") ? "" : (stryCov_9fa48("32232"), 'context_type'), stryMutAct_9fa48("32233") ? "" : (stryCov_9fa48("32233"), 'context_name')])
  })])
});

/**
 * Code system table schema.
 * Reserved schema for storing function definitions (implementation deferred).
 * Requirements: 34.4, 34.5, 34.18
 */
const CODE_SCHEMA = stryMutAct_9fa48("32234") ? {} : (stryCov_9fa48("32234"), {
  tableName: SYSTEM_TABLE_NAME.CODE,
  columns: stryMutAct_9fa48("32235") ? [] : (stryCov_9fa48("32235"), [stryMutAct_9fa48("32236") ? {} : (stryCov_9fa48("32236"), {
    name: stryMutAct_9fa48("32237") ? "" : (stryCov_9fa48("32237"), 'function_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32238") ? false : (stryCov_9fa48("32238"), true)
  }), stryMutAct_9fa48("32239") ? {} : (stryCov_9fa48("32239"), {
    name: stryMutAct_9fa48("32240") ? "" : (stryCov_9fa48("32240"), 'function_name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32241") ? false : (stryCov_9fa48("32241"), true),
    unique: stryMutAct_9fa48("32242") ? false : (stryCov_9fa48("32242"), true)
  }), stryMutAct_9fa48("32243") ? {} : (stryCov_9fa48("32243"), {
    name: stryMutAct_9fa48("32244") ? "" : (stryCov_9fa48("32244"), 'version'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32245") ? false : (stryCov_9fa48("32245"), true),
    defaultValue: 1
  }), stryMutAct_9fa48("32246") ? {} : (stryCov_9fa48("32246"), {
    name: stryMutAct_9fa48("32247") ? "" : (stryCov_9fa48("32247"), 'executor_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32248") ? false : (stryCov_9fa48("32248"), true),
    defaultValue: stryMutAct_9fa48("32249") ? "" : (stryCov_9fa48("32249"), '\'wasm\'')
  }), stryMutAct_9fa48("32250") ? {} : (stryCov_9fa48("32250"), {
    name: stryMutAct_9fa48("32251") ? "" : (stryCov_9fa48("32251"), 'code_blob'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32252") ? false : (stryCov_9fa48("32252"), true)
  }), stryMutAct_9fa48("32253") ? {} : (stryCov_9fa48("32253"), {
    name: stryMutAct_9fa48("32254") ? "" : (stryCov_9fa48("32254"), 'signature'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32255") ? false : (stryCov_9fa48("32255"), true)
  }), stryMutAct_9fa48("32256") ? {} : (stryCov_9fa48("32256"), {
    name: stryMutAct_9fa48("32257") ? "" : (stryCov_9fa48("32257"), 'permissions'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32258") ? false : (stryCov_9fa48("32258"), true),
    defaultValue: stryMutAct_9fa48("32259") ? "" : (stryCov_9fa48("32259"), '\'[]\'')
  }), stryMutAct_9fa48("32260") ? {} : (stryCov_9fa48("32260"), {
    name: stryMutAct_9fa48("32261") ? "" : (stryCov_9fa48("32261"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32262") ? false : (stryCov_9fa48("32262"), true)
  }), stryMutAct_9fa48("32263") ? {} : (stryCov_9fa48("32263"), {
    name: stryMutAct_9fa48("32264") ? "" : (stryCov_9fa48("32264"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32265") ? false : (stryCov_9fa48("32265"), true)
  })]),
  indices: stryMutAct_9fa48("32266") ? [] : (stryCov_9fa48("32266"), [stryMutAct_9fa48("32267") ? {} : (stryCov_9fa48("32267"), {
    name: stryMutAct_9fa48("32268") ? "" : (stryCov_9fa48("32268"), 'idx_code_name'),
    columns: stryMutAct_9fa48("32269") ? [] : (stryCov_9fa48("32269"), [stryMutAct_9fa48("32270") ? "" : (stryCov_9fa48("32270"), 'function_name')])
  }), stryMutAct_9fa48("32271") ? {} : (stryCov_9fa48("32271"), {
    name: stryMutAct_9fa48("32272") ? "" : (stryCov_9fa48("32272"), 'idx_code_type'),
    columns: stryMutAct_9fa48("32273") ? [] : (stryCov_9fa48("32273"), [stryMutAct_9fa48("32274") ? "" : (stryCov_9fa48("32274"), 'executor_type')])
  })])
});
const CONTROL_PLANE_PUBLICATIONS_SCHEMA = stryMutAct_9fa48("32275") ? {} : (stryCov_9fa48("32275"), {
  tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  columns: stryMutAct_9fa48("32276") ? [] : (stryCov_9fa48("32276"), [stryMutAct_9fa48("32277") ? {} : (stryCov_9fa48("32277"), {
    name: stryMutAct_9fa48("32278") ? "" : (stryCov_9fa48("32278"), 'publication_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32279") ? false : (stryCov_9fa48("32279"), true)
  }), stryMutAct_9fa48("32280") ? {} : (stryCov_9fa48("32280"), {
    name: stryMutAct_9fa48("32281") ? "" : (stryCov_9fa48("32281"), 'publication_kind'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32282") ? false : (stryCov_9fa48("32282"), true)
  }), stryMutAct_9fa48("32283") ? {} : (stryCov_9fa48("32283"), {
    name: stryMutAct_9fa48("32284") ? "" : (stryCov_9fa48("32284"), 'publication_epoch'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32285") ? false : (stryCov_9fa48("32285"), true)
  }), stryMutAct_9fa48("32286") ? {} : (stryCov_9fa48("32286"), {
    name: stryMutAct_9fa48("32287") ? "" : (stryCov_9fa48("32287"), 'publisher_node_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32288") ? false : (stryCov_9fa48("32288"), true)
  }), stryMutAct_9fa48("32289") ? {} : (stryCov_9fa48("32289"), {
    name: stryMutAct_9fa48("32290") ? "" : (stryCov_9fa48("32290"), 'source_topology_epoch'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32291") ? {} : (stryCov_9fa48("32291"), {
    name: stryMutAct_9fa48("32292") ? "" : (stryCov_9fa48("32292"), 'source_snapshot_version'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32293") ? {} : (stryCov_9fa48("32293"), {
    name: stryMutAct_9fa48("32294") ? "" : (stryCov_9fa48("32294"), 'published_active_node_ids'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32295") ? false : (stryCov_9fa48("32295"), true)
  }), stryMutAct_9fa48("32296") ? {} : (stryCov_9fa48("32296"), {
    name: stryMutAct_9fa48("32297") ? "" : (stryCov_9fa48("32297"), 'required_ack_node_ids'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32298") ? false : (stryCov_9fa48("32298"), true)
  }), stryMutAct_9fa48("32299") ? {} : (stryCov_9fa48("32299"), {
    name: stryMutAct_9fa48("32300") ? "" : (stryCov_9fa48("32300"), 'acknowledged_node_ids'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32301") ? false : (stryCov_9fa48("32301"), true)
  }), stryMutAct_9fa48("32302") ? {} : (stryCov_9fa48("32302"), {
    name: stryMutAct_9fa48("32303") ? "" : (stryCov_9fa48("32303"), 'priority_partition_summary'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32304") ? {} : (stryCov_9fa48("32304"), {
    name: stryMutAct_9fa48("32305") ? "" : (stryCov_9fa48("32305"), 'membership_lifecycle_summary'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32306") ? {} : (stryCov_9fa48("32306"), {
    name: stryMutAct_9fa48("32307") ? "" : (stryCov_9fa48("32307"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32308") ? false : (stryCov_9fa48("32308"), true)
  }), stryMutAct_9fa48("32309") ? {} : (stryCov_9fa48("32309"), {
    name: stryMutAct_9fa48("32310") ? "" : (stryCov_9fa48("32310"), 'reason_code'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32311") ? {} : (stryCov_9fa48("32311"), {
    name: stryMutAct_9fa48("32312") ? "" : (stryCov_9fa48("32312"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32313") ? false : (stryCov_9fa48("32313"), true)
  }), stryMutAct_9fa48("32314") ? {} : (stryCov_9fa48("32314"), {
    name: stryMutAct_9fa48("32315") ? "" : (stryCov_9fa48("32315"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32316") ? false : (stryCov_9fa48("32316"), true)
  }), stryMutAct_9fa48("32317") ? {} : (stryCov_9fa48("32317"), {
    name: stryMutAct_9fa48("32318") ? "" : (stryCov_9fa48("32318"), 'published_at'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32319") ? {} : (stryCov_9fa48("32319"), {
    name: stryMutAct_9fa48("32320") ? "" : (stryCov_9fa48("32320"), 'closed_at'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32321") ? {} : (stryCov_9fa48("32321"), {
    name: stryMutAct_9fa48("32322") ? "" : (stryCov_9fa48("32322"), 'transition_history'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32323") ? false : (stryCov_9fa48("32323"), true)
  })]),
  indices: stryMutAct_9fa48("32324") ? [] : (stryCov_9fa48("32324"), [stryMutAct_9fa48("32325") ? {} : (stryCov_9fa48("32325"), {
    name: stryMutAct_9fa48("32326") ? "" : (stryCov_9fa48("32326"), 'idx_control_plane_publications_kind_epoch'),
    columns: stryMutAct_9fa48("32327") ? [] : (stryCov_9fa48("32327"), [stryMutAct_9fa48("32328") ? "" : (stryCov_9fa48("32328"), 'publication_kind'), stryMutAct_9fa48("32329") ? "" : (stryCov_9fa48("32329"), 'publication_epoch')])
  }), stryMutAct_9fa48("32330") ? {} : (stryCov_9fa48("32330"), {
    name: stryMutAct_9fa48("32331") ? "" : (stryCov_9fa48("32331"), 'idx_control_plane_publications_status_updated'),
    columns: stryMutAct_9fa48("32332") ? [] : (stryCov_9fa48("32332"), [stryMutAct_9fa48("32333") ? "" : (stryCov_9fa48("32333"), 'status'), stryMutAct_9fa48("32334") ? "" : (stryCov_9fa48("32334"), 'updated_at')])
  })])
});
/**
 * Replica operations system table schema.
 * Stores persistent log of all replica operations for debugging and recovery.
 * Requirements: 9.1, 9.2
 */
const REPLICA_OPERATIONS_SCHEMA = stryMutAct_9fa48("32335") ? {} : (stryCov_9fa48("32335"), {
  tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  columns: stryMutAct_9fa48("32336") ? [] : (stryCov_9fa48("32336"), [stryMutAct_9fa48("32337") ? {} : (stryCov_9fa48("32337"), {
    name: stryMutAct_9fa48("32338") ? "" : (stryCov_9fa48("32338"), 'operation_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32339") ? false : (stryCov_9fa48("32339"), true)
  }), stryMutAct_9fa48("32340") ? {} : (stryCov_9fa48("32340"), {
    name: stryMutAct_9fa48("32341") ? "" : (stryCov_9fa48("32341"), 'type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32342") ? false : (stryCov_9fa48("32342"), true)
  }), // 'ADD' or 'REMOVE'
  stryMutAct_9fa48("32343") ? {} : (stryCov_9fa48("32343"), {
    name: stryMutAct_9fa48("32344") ? "" : (stryCov_9fa48("32344"), 'partition_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32345") ? false : (stryCov_9fa48("32345"), true)
  }), stryMutAct_9fa48("32346") ? {} : (stryCov_9fa48("32346"), {
    name: stryMutAct_9fa48("32347") ? "" : (stryCov_9fa48("32347"), 'entity_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32348") ? false : (stryCov_9fa48("32348"), true)
  }), stryMutAct_9fa48("32349") ? {} : (stryCov_9fa48("32349"), {
    name: stryMutAct_9fa48("32350") ? "" : (stryCov_9fa48("32350"), 'entity_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32351") ? false : (stryCov_9fa48("32351"), true)
  }), stryMutAct_9fa48("32352") ? {} : (stryCov_9fa48("32352"), {
    name: stryMutAct_9fa48("32353") ? "" : (stryCov_9fa48("32353"), 'replica_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32354") ? {} : (stryCov_9fa48("32354"), {
    name: stryMutAct_9fa48("32355") ? "" : (stryCov_9fa48("32355"), 'source_node_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32356") ? false : (stryCov_9fa48("32356"), true)
  }), stryMutAct_9fa48("32357") ? {} : (stryCov_9fa48("32357"), {
    name: stryMutAct_9fa48("32358") ? "" : (stryCov_9fa48("32358"), 'target_node_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32359") ? false : (stryCov_9fa48("32359"), true)
  }), stryMutAct_9fa48("32360") ? {} : (stryCov_9fa48("32360"), {
    name: stryMutAct_9fa48("32361") ? "" : (stryCov_9fa48("32361"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32362") ? false : (stryCov_9fa48("32362"), true)
  }), // ReplicaStatus value
  stryMutAct_9fa48("32363") ? {} : (stryCov_9fa48("32363"), {
    name: stryMutAct_9fa48("32364") ? "" : (stryCov_9fa48("32364"), 'workflow_step'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32365") ? false : (stryCov_9fa48("32365"), true)
  }), stryMutAct_9fa48("32366") ? {} : (stryCov_9fa48("32366"), {
    name: stryMutAct_9fa48("32367") ? "" : (stryCov_9fa48("32367"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32368") ? false : (stryCov_9fa48("32368"), true)
  }), stryMutAct_9fa48("32369") ? {} : (stryCov_9fa48("32369"), {
    name: stryMutAct_9fa48("32370") ? "" : (stryCov_9fa48("32370"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32371") ? false : (stryCov_9fa48("32371"), true)
  }), stryMutAct_9fa48("32372") ? {} : (stryCov_9fa48("32372"), {
    name: stryMutAct_9fa48("32373") ? "" : (stryCov_9fa48("32373"), 'completed_at'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32374") ? {} : (stryCov_9fa48("32374"), {
    name: stryMutAct_9fa48("32375") ? "" : (stryCov_9fa48("32375"), 'lease_expires_at'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32376") ? {} : (stryCov_9fa48("32376"), {
    name: stryMutAct_9fa48("32377") ? "" : (stryCov_9fa48("32377"), 'error_message'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32378") ? {} : (stryCov_9fa48("32378"), {
    name: stryMutAct_9fa48("32379") ? "" : (stryCov_9fa48("32379"), 'steps_history'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32380") ? false : (stryCov_9fa48("32380"), true)
  }) // JSON array
  ]),
  indices: stryMutAct_9fa48("32381") ? [] : (stryCov_9fa48("32381"), [stryMutAct_9fa48("32382") ? {} : (stryCov_9fa48("32382"), {
    name: stryMutAct_9fa48("32383") ? "" : (stryCov_9fa48("32383"), 'idx_replica_ops_status'),
    columns: stryMutAct_9fa48("32384") ? [] : (stryCov_9fa48("32384"), [stryMutAct_9fa48("32385") ? "" : (stryCov_9fa48("32385"), 'status')])
  }), stryMutAct_9fa48("32386") ? {} : (stryCov_9fa48("32386"), {
    name: stryMutAct_9fa48("32387") ? "" : (stryCov_9fa48("32387"), 'idx_replica_ops_partition'),
    columns: stryMutAct_9fa48("32388") ? [] : (stryCov_9fa48("32388"), [stryMutAct_9fa48("32389") ? "" : (stryCov_9fa48("32389"), 'partition_id')])
  }), stryMutAct_9fa48("32390") ? {} : (stryCov_9fa48("32390"), {
    name: stryMutAct_9fa48("32391") ? "" : (stryCov_9fa48("32391"), 'idx_replica_ops_entity'),
    columns: stryMutAct_9fa48("32392") ? [] : (stryCov_9fa48("32392"), [stryMutAct_9fa48("32393") ? "" : (stryCov_9fa48("32393"), 'entity_type'), stryMutAct_9fa48("32394") ? "" : (stryCov_9fa48("32394"), 'entity_id')])
  }), stryMutAct_9fa48("32395") ? {} : (stryCov_9fa48("32395"), {
    name: stryMutAct_9fa48("32396") ? "" : (stryCov_9fa48("32396"), 'idx_replica_ops_source_step_type'),
    columns: stryMutAct_9fa48("32397") ? [] : (stryCov_9fa48("32397"), [stryMutAct_9fa48("32398") ? "" : (stryCov_9fa48("32398"), 'source_node_id'), stryMutAct_9fa48("32399") ? "" : (stryCov_9fa48("32399"), 'workflow_step'), stryMutAct_9fa48("32400") ? "" : (stryCov_9fa48("32400"), 'type')])
  }), stryMutAct_9fa48("32401") ? {} : (stryCov_9fa48("32401"), {
    name: stryMutAct_9fa48("32402") ? "" : (stryCov_9fa48("32402"), 'idx_replica_ops_target_step_type'),
    columns: stryMutAct_9fa48("32403") ? [] : (stryCov_9fa48("32403"), [stryMutAct_9fa48("32404") ? "" : (stryCov_9fa48("32404"), 'target_node_id'), stryMutAct_9fa48("32405") ? "" : (stryCov_9fa48("32405"), 'workflow_step'), stryMutAct_9fa48("32406") ? "" : (stryCov_9fa48("32406"), 'type')])
  }), stryMutAct_9fa48("32407") ? {} : (stryCov_9fa48("32407"), {
    name: stryMutAct_9fa48("32408") ? "" : (stryCov_9fa48("32408"), 'idx_replica_ops_partition_target'),
    columns: stryMutAct_9fa48("32409") ? [] : (stryCov_9fa48("32409"), [stryMutAct_9fa48("32410") ? "" : (stryCov_9fa48("32410"), 'partition_id'), stryMutAct_9fa48("32411") ? "" : (stryCov_9fa48("32411"), 'target_node_id')])
  }), stryMutAct_9fa48("32412") ? {} : (stryCov_9fa48("32412"), {
    name: stryMutAct_9fa48("32413") ? "" : (stryCov_9fa48("32413"), 'idx_replica_ops_created'),
    columns: stryMutAct_9fa48("32414") ? [] : (stryCov_9fa48("32414"), [stryMutAct_9fa48("32415") ? "" : (stryCov_9fa48("32415"), 'created_at')])
  })])
});

/**
 * Node endpoints system table schema.
 * Stores transport endpoints for nodes (WebSocket, NATS, Veilid, etc.).
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
const NODE_ENDPOINTS_SCHEMA = stryMutAct_9fa48("32416") ? {} : (stryCov_9fa48("32416"), {
  tableName: SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
  columns: stryMutAct_9fa48("32417") ? [] : (stryCov_9fa48("32417"), [stryMutAct_9fa48("32418") ? {} : (stryCov_9fa48("32418"), {
    name: stryMutAct_9fa48("32419") ? "" : (stryCov_9fa48("32419"), 'endpoint_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32420") ? false : (stryCov_9fa48("32420"), true)
  }), stryMutAct_9fa48("32421") ? {} : (stryCov_9fa48("32421"), {
    name: stryMutAct_9fa48("32422") ? "" : (stryCov_9fa48("32422"), 'node_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32423") ? false : (stryCov_9fa48("32423"), true)
  }), stryMutAct_9fa48("32424") ? {} : (stryCov_9fa48("32424"), {
    name: stryMutAct_9fa48("32425") ? "" : (stryCov_9fa48("32425"), 'transport_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32426") ? false : (stryCov_9fa48("32426"), true)
  }), stryMutAct_9fa48("32427") ? {} : (stryCov_9fa48("32427"), {
    name: stryMutAct_9fa48("32428") ? "" : (stryCov_9fa48("32428"), 'address'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32429") ? false : (stryCov_9fa48("32429"), true)
  }), stryMutAct_9fa48("32430") ? {} : (stryCov_9fa48("32430"), {
    name: stryMutAct_9fa48("32431") ? "" : (stryCov_9fa48("32431"), 'priority'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32432") ? false : (stryCov_9fa48("32432"), true),
    defaultValue: 0
  }), stryMutAct_9fa48("32433") ? {} : (stryCov_9fa48("32433"), {
    name: stryMutAct_9fa48("32434") ? "" : (stryCov_9fa48("32434"), 'metadata'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32435") ? {} : (stryCov_9fa48("32435"), {
    name: stryMutAct_9fa48("32436") ? "" : (stryCov_9fa48("32436"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32437") ? false : (stryCov_9fa48("32437"), true),
    defaultValue: stryMutAct_9fa48("32438") ? "" : (stryCov_9fa48("32438"), '\'active\'')
  }), stryMutAct_9fa48("32439") ? {} : (stryCov_9fa48("32439"), {
    name: stryMutAct_9fa48("32440") ? "" : (stryCov_9fa48("32440"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32441") ? false : (stryCov_9fa48("32441"), true)
  }), stryMutAct_9fa48("32442") ? {} : (stryCov_9fa48("32442"), {
    name: stryMutAct_9fa48("32443") ? "" : (stryCov_9fa48("32443"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32444") ? false : (stryCov_9fa48("32444"), true)
  })]),
  indices: stryMutAct_9fa48("32445") ? [] : (stryCov_9fa48("32445"), [stryMutAct_9fa48("32446") ? {} : (stryCov_9fa48("32446"), {
    name: stryMutAct_9fa48("32447") ? "" : (stryCov_9fa48("32447"), 'idx_node_endpoints_node'),
    columns: stryMutAct_9fa48("32448") ? [] : (stryCov_9fa48("32448"), [stryMutAct_9fa48("32449") ? "" : (stryCov_9fa48("32449"), 'node_id')])
  }), stryMutAct_9fa48("32450") ? {} : (stryCov_9fa48("32450"), {
    name: stryMutAct_9fa48("32451") ? "" : (stryCov_9fa48("32451"), 'idx_node_endpoints_type'),
    columns: stryMutAct_9fa48("32452") ? [] : (stryCov_9fa48("32452"), [stryMutAct_9fa48("32453") ? "" : (stryCov_9fa48("32453"), 'transport_type')])
  }), stryMutAct_9fa48("32454") ? {} : (stryCov_9fa48("32454"), {
    name: stryMutAct_9fa48("32455") ? "" : (stryCov_9fa48("32455"), 'idx_node_endpoints_status'),
    columns: stryMutAct_9fa48("32456") ? [] : (stryCov_9fa48("32456"), [stryMutAct_9fa48("32457") ? "" : (stryCov_9fa48("32457"), 'status')])
  })])
});

/**
 * Service definitions system table schema.
 * Stores metadata about replicated service definitions.
 * Supports unified runtime model (native_js, wasm_component, oci_container).
 * Requirements: 5.1, 5.5, 12.3, 12.4, 12.5
 */
const SERVICE_DEFINITION_COLUMN_SPEC = Object.freeze(stryMutAct_9fa48("32458") ? {} : (stryCov_9fa48("32458"), {
  [SD_COL.SERVICE_ID]: Object.freeze(stryMutAct_9fa48("32459") ? {} : (stryCov_9fa48("32459"), {
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32460") ? false : (stryCov_9fa48("32460"), true)
  })),
  [SD_COL.SERVICE_NAME]: Object.freeze(stryMutAct_9fa48("32461") ? {} : (stryCov_9fa48("32461"), {
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32462") ? false : (stryCov_9fa48("32462"), true),
    unique: stryMutAct_9fa48("32463") ? false : (stryCov_9fa48("32463"), true)
  })),
  [SD_COL.SERVICE_PROFILE]: Object.freeze(stryMutAct_9fa48("32464") ? {} : (stryCov_9fa48("32464"), {
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32465") ? false : (stryCov_9fa48("32465"), true),
    defaultValue: stryMutAct_9fa48("32466") ? "" : (stryCov_9fa48("32466"), '\'default\'')
  })),
  [SD_COL.HANDLER_FUNCTION_ID]: Object.freeze(stryMutAct_9fa48("32467") ? {} : (stryCov_9fa48("32467"), {
    type: COLUMN_TYPE.TEXT
  })),
  [SD_COL.READ_CONSISTENCY]: Object.freeze(stryMutAct_9fa48("32468") ? {} : (stryCov_9fa48("32468"), {
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32469") ? false : (stryCov_9fa48("32469"), true),
    defaultValue: stryMutAct_9fa48("32470") ? "" : (stryCov_9fa48("32470"), '\'strong\'')
  })),
  [SD_COL.WRITE_CONSISTENCY]: Object.freeze(stryMutAct_9fa48("32471") ? {} : (stryCov_9fa48("32471"), {
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32472") ? false : (stryCov_9fa48("32472"), true),
    defaultValue: stryMutAct_9fa48("32473") ? "" : (stryCov_9fa48("32473"), '\'strong\'')
  })),
  [SD_COL.REPLICA_COUNT]: Object.freeze(stryMutAct_9fa48("32474") ? {} : (stryCov_9fa48("32474"), {
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32475") ? false : (stryCov_9fa48("32475"), true),
    defaultValue: 3
  })),
  [SD_COL.PROTOCOL]: Object.freeze(stryMutAct_9fa48("32476") ? {} : (stryCov_9fa48("32476"), {
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32477") ? false : (stryCov_9fa48("32477"), true),
    defaultValue: stryMutAct_9fa48("32478") ? "" : (stryCov_9fa48("32478"), '\'websocket\'')
  })),
  [SD_COL.RESOURCE_BUDGET]: Object.freeze(stryMutAct_9fa48("32479") ? {} : (stryCov_9fa48("32479"), {
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32480") ? false : (stryCov_9fa48("32480"), true),
    defaultValue: stryMutAct_9fa48("32481") ? "" : (stryCov_9fa48("32481"), '\'{}\'')
  })),
  [SD_COL.SAFETY_INTERVAL_MS]: Object.freeze(stryMutAct_9fa48("32482") ? {} : (stryCov_9fa48("32482"), {
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32483") ? false : (stryCov_9fa48("32483"), true),
    defaultValue: 500
  })),
  [SD_COL.RUNTIME_KIND]: Object.freeze(stryMutAct_9fa48("32484") ? {} : (stryCov_9fa48("32484"), {
    type: COLUMN_TYPE.TEXT
  })),
  [SD_COL.RUNTIME_REF]: Object.freeze(stryMutAct_9fa48("32485") ? {} : (stryCov_9fa48("32485"), {
    type: COLUMN_TYPE.TEXT
  })),
  [SD_COL.RUNTIME_CONFIG]: Object.freeze(stryMutAct_9fa48("32486") ? {} : (stryCov_9fa48("32486"), {
    type: COLUMN_TYPE.TEXT
  })),
  [SD_COL.STATUS]: Object.freeze(stryMutAct_9fa48("32487") ? {} : (stryCov_9fa48("32487"), {
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32488") ? false : (stryCov_9fa48("32488"), true),
    defaultValue: stryMutAct_9fa48("32489") ? "" : (stryCov_9fa48("32489"), '\'active\'')
  })),
  [SD_COL.CREATED_AT]: Object.freeze(stryMutAct_9fa48("32490") ? {} : (stryCov_9fa48("32490"), {
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32491") ? false : (stryCov_9fa48("32491"), true)
  })),
  [SD_COL.UPDATED_AT]: Object.freeze(stryMutAct_9fa48("32492") ? {} : (stryCov_9fa48("32492"), {
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32493") ? false : (stryCov_9fa48("32493"), true)
  }))
}));

/**
 * Build canonical service_definitions column descriptors from the shared
 * service-definition column list.
 * @return {Array<Object>} Ordered schema column descriptors.
 */
function createServiceDefinitionColumns() {
  if (stryMutAct_9fa48("32494")) {
    {}
  } else {
    stryCov_9fa48("32494");
    return SERVICE_DEFINITION_COLUMN_LIST.map(columnName => {
      if (stryMutAct_9fa48("32495")) {
        {}
      } else {
        stryCov_9fa48("32495");
        const spec = SERVICE_DEFINITION_COLUMN_SPEC[columnName];
        if (stryMutAct_9fa48("32498") ? false : stryMutAct_9fa48("32497") ? true : stryMutAct_9fa48("32496") ? spec : (stryCov_9fa48("32496", "32497", "32498"), !spec)) {
          if (stryMutAct_9fa48("32499")) {
            {}
          } else {
            stryCov_9fa48("32499");
            throw new Error(stryMutAct_9fa48("32500") ? `` : (stryCov_9fa48("32500"), `Missing schema spec for service_definitions column: ${columnName}`));
          }
        }
        return stryMutAct_9fa48("32501") ? {} : (stryCov_9fa48("32501"), {
          name: columnName,
          ...spec
        });
      }
    });
  }
}
const SERVICE_DEFINITIONS_SCHEMA = stryMutAct_9fa48("32502") ? {} : (stryCov_9fa48("32502"), {
  tableName: SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
  columns: createServiceDefinitionColumns(),
  indices: stryMutAct_9fa48("32503") ? [] : (stryCov_9fa48("32503"), [stryMutAct_9fa48("32504") ? {} : (stryCov_9fa48("32504"), {
    name: stryMutAct_9fa48("32505") ? "" : (stryCov_9fa48("32505"), 'idx_svc_def_name'),
    columns: stryMutAct_9fa48("32506") ? [] : (stryCov_9fa48("32506"), [SD_COL.SERVICE_NAME])
  }), stryMutAct_9fa48("32507") ? {} : (stryCov_9fa48("32507"), {
    name: stryMutAct_9fa48("32508") ? "" : (stryCov_9fa48("32508"), 'idx_svc_def_handler'),
    columns: stryMutAct_9fa48("32509") ? [] : (stryCov_9fa48("32509"), [SD_COL.HANDLER_FUNCTION_ID])
  }), stryMutAct_9fa48("32510") ? {} : (stryCov_9fa48("32510"), {
    name: stryMutAct_9fa48("32511") ? "" : (stryCov_9fa48("32511"), 'idx_svc_def_status'),
    columns: stryMutAct_9fa48("32512") ? [] : (stryCov_9fa48("32512"), [SD_COL.STATUS])
  }), stryMutAct_9fa48("32513") ? {} : (stryCov_9fa48("32513"), {
    name: stryMutAct_9fa48("32514") ? "" : (stryCov_9fa48("32514"), 'idx_svc_def_runtime_kind'),
    columns: stryMutAct_9fa48("32515") ? [] : (stryCov_9fa48("32515"), [SD_COL.RUNTIME_KIND])
  })])
});

/**
 * Service endpoints system table schema.
 * Stores externally reachable endpoints for WASM service replicas.
 * Requirements: 12.3, 12.4, 12.5
 */
const SERVICE_ENDPOINTS_SCHEMA = stryMutAct_9fa48("32516") ? {} : (stryCov_9fa48("32516"), {
  tableName: SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS,
  columns: stryMutAct_9fa48("32517") ? [] : (stryCov_9fa48("32517"), [stryMutAct_9fa48("32518") ? {} : (stryCov_9fa48("32518"), {
    name: stryMutAct_9fa48("32519") ? "" : (stryCov_9fa48("32519"), 'endpoint_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32520") ? false : (stryCov_9fa48("32520"), true)
  }), stryMutAct_9fa48("32521") ? {} : (stryCov_9fa48("32521"), {
    name: stryMutAct_9fa48("32522") ? "" : (stryCov_9fa48("32522"), 'service_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32523") ? false : (stryCov_9fa48("32523"), true)
  }), stryMutAct_9fa48("32524") ? {} : (stryCov_9fa48("32524"), {
    name: stryMutAct_9fa48("32525") ? "" : (stryCov_9fa48("32525"), 'node_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32526") ? false : (stryCov_9fa48("32526"), true)
  }), stryMutAct_9fa48("32527") ? {} : (stryCov_9fa48("32527"), {
    name: stryMutAct_9fa48("32528") ? "" : (stryCov_9fa48("32528"), 'protocol'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32529") ? false : (stryCov_9fa48("32529"), true)
  }), stryMutAct_9fa48("32530") ? {} : (stryCov_9fa48("32530"), {
    name: stryMutAct_9fa48("32531") ? "" : (stryCov_9fa48("32531"), 'address'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32532") ? false : (stryCov_9fa48("32532"), true)
  }), stryMutAct_9fa48("32533") ? {} : (stryCov_9fa48("32533"), {
    name: stryMutAct_9fa48("32534") ? "" : (stryCov_9fa48("32534"), 'port'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32535") ? false : (stryCov_9fa48("32535"), true)
  }), stryMutAct_9fa48("32536") ? {} : (stryCov_9fa48("32536"), {
    name: stryMutAct_9fa48("32537") ? "" : (stryCov_9fa48("32537"), 'health_status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32538") ? false : (stryCov_9fa48("32538"), true),
    defaultValue: stryMutAct_9fa48("32539") ? "" : (stryCov_9fa48("32539"), '\'healthy\'')
  }), stryMutAct_9fa48("32540") ? {} : (stryCov_9fa48("32540"), {
    name: stryMutAct_9fa48("32541") ? "" : (stryCov_9fa48("32541"), 'metadata'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32542") ? false : (stryCov_9fa48("32542"), true),
    defaultValue: stryMutAct_9fa48("32543") ? "" : (stryCov_9fa48("32543"), '\'{}\'')
  }), stryMutAct_9fa48("32544") ? {} : (stryCov_9fa48("32544"), {
    name: stryMutAct_9fa48("32545") ? "" : (stryCov_9fa48("32545"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32546") ? false : (stryCov_9fa48("32546"), true)
  }), stryMutAct_9fa48("32547") ? {} : (stryCov_9fa48("32547"), {
    name: stryMutAct_9fa48("32548") ? "" : (stryCov_9fa48("32548"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32549") ? false : (stryCov_9fa48("32549"), true)
  })]),
  indices: stryMutAct_9fa48("32550") ? [] : (stryCov_9fa48("32550"), [stryMutAct_9fa48("32551") ? {} : (stryCov_9fa48("32551"), {
    name: stryMutAct_9fa48("32552") ? "" : (stryCov_9fa48("32552"), 'idx_svc_ep_service'),
    columns: stryMutAct_9fa48("32553") ? [] : (stryCov_9fa48("32553"), [stryMutAct_9fa48("32554") ? "" : (stryCov_9fa48("32554"), 'service_id')])
  }), stryMutAct_9fa48("32555") ? {} : (stryCov_9fa48("32555"), {
    name: stryMutAct_9fa48("32556") ? "" : (stryCov_9fa48("32556"), 'idx_svc_ep_node'),
    columns: stryMutAct_9fa48("32557") ? [] : (stryCov_9fa48("32557"), [stryMutAct_9fa48("32558") ? "" : (stryCov_9fa48("32558"), 'node_id')])
  }), stryMutAct_9fa48("32559") ? {} : (stryCov_9fa48("32559"), {
    name: stryMutAct_9fa48("32560") ? "" : (stryCov_9fa48("32560"), 'idx_svc_ep_health'),
    columns: stryMutAct_9fa48("32561") ? [] : (stryCov_9fa48("32561"), [stryMutAct_9fa48("32562") ? "" : (stryCov_9fa48("32562"), 'health_status')])
  })])
});

/**
 * Service timers system table schema.
 * Stores persistent timer entries for WASM service groups.
 * Requirements: 12.3, 12.4, 12.5
 */
const SERVICE_TIMERS_SCHEMA = stryMutAct_9fa48("32563") ? {} : (stryCov_9fa48("32563"), {
  tableName: SYSTEM_TABLE_NAME.SERVICE_TIMERS,
  columns: stryMutAct_9fa48("32564") ? [] : (stryCov_9fa48("32564"), [stryMutAct_9fa48("32565") ? {} : (stryCov_9fa48("32565"), {
    name: stryMutAct_9fa48("32566") ? "" : (stryCov_9fa48("32566"), 'timer_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32567") ? false : (stryCov_9fa48("32567"), true)
  }), stryMutAct_9fa48("32568") ? {} : (stryCov_9fa48("32568"), {
    name: stryMutAct_9fa48("32569") ? "" : (stryCov_9fa48("32569"), 'service_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32570") ? false : (stryCov_9fa48("32570"), true)
  }), stryMutAct_9fa48("32571") ? {} : (stryCov_9fa48("32571"), {
    name: stryMutAct_9fa48("32572") ? "" : (stryCov_9fa48("32572"), 'delay_ms'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32573") ? false : (stryCov_9fa48("32573"), true)
  }), stryMutAct_9fa48("32574") ? {} : (stryCov_9fa48("32574"), {
    name: stryMutAct_9fa48("32575") ? "" : (stryCov_9fa48("32575"), 'fire_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32576") ? false : (stryCov_9fa48("32576"), true)
  }), stryMutAct_9fa48("32577") ? {} : (stryCov_9fa48("32577"), {
    name: stryMutAct_9fa48("32578") ? "" : (stryCov_9fa48("32578"), 'payload'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32579") ? false : (stryCov_9fa48("32579"), true),
    defaultValue: stryMutAct_9fa48("32580") ? "" : (stryCov_9fa48("32580"), '\'{}\'')
  }), stryMutAct_9fa48("32581") ? {} : (stryCov_9fa48("32581"), {
    name: stryMutAct_9fa48("32582") ? "" : (stryCov_9fa48("32582"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32583") ? false : (stryCov_9fa48("32583"), true),
    defaultValue: stryMutAct_9fa48("32584") ? "" : (stryCov_9fa48("32584"), '\'active\'')
  }), stryMutAct_9fa48("32585") ? {} : (stryCov_9fa48("32585"), {
    name: stryMutAct_9fa48("32586") ? "" : (stryCov_9fa48("32586"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32587") ? false : (stryCov_9fa48("32587"), true)
  }), stryMutAct_9fa48("32588") ? {} : (stryCov_9fa48("32588"), {
    name: stryMutAct_9fa48("32589") ? "" : (stryCov_9fa48("32589"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32590") ? false : (stryCov_9fa48("32590"), true)
  })]),
  indices: stryMutAct_9fa48("32591") ? [] : (stryCov_9fa48("32591"), [stryMutAct_9fa48("32592") ? {} : (stryCov_9fa48("32592"), {
    name: stryMutAct_9fa48("32593") ? "" : (stryCov_9fa48("32593"), 'idx_svc_timer_service'),
    columns: stryMutAct_9fa48("32594") ? [] : (stryCov_9fa48("32594"), [stryMutAct_9fa48("32595") ? "" : (stryCov_9fa48("32595"), 'service_id')])
  }), stryMutAct_9fa48("32596") ? {} : (stryCov_9fa48("32596"), {
    name: stryMutAct_9fa48("32597") ? "" : (stryCov_9fa48("32597"), 'idx_svc_timer_status'),
    columns: stryMutAct_9fa48("32598") ? [] : (stryCov_9fa48("32598"), [stryMutAct_9fa48("32599") ? "" : (stryCov_9fa48("32599"), 'status')])
  }), stryMutAct_9fa48("32600") ? {} : (stryCov_9fa48("32600"), {
    name: stryMutAct_9fa48("32601") ? "" : (stryCov_9fa48("32601"), 'idx_svc_timer_fire'),
    columns: stryMutAct_9fa48("32602") ? [] : (stryCov_9fa48("32602"), [stryMutAct_9fa48("32603") ? "" : (stryCov_9fa48("32603"), 'fire_at')])
  })])
});

/**
 * Module manifests system table schema.
 * Stores WASM module/package metadata with component-model identity.
 * Requirements: 3.2, 5.2, 10.1, 10.2
 */
const MODULE_MANIFESTS_SCHEMA = stryMutAct_9fa48("32604") ? {} : (stryCov_9fa48("32604"), {
  tableName: SYSTEM_TABLE_NAME.MODULE_MANIFESTS,
  columns: stryMutAct_9fa48("32605") ? [] : (stryCov_9fa48("32605"), [stryMutAct_9fa48("32606") ? {} : (stryCov_9fa48("32606"), {
    name: stryMutAct_9fa48("32607") ? "" : (stryCov_9fa48("32607"), 'namespace'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32608") ? false : (stryCov_9fa48("32608"), true)
  }), stryMutAct_9fa48("32609") ? {} : (stryCov_9fa48("32609"), {
    name: stryMutAct_9fa48("32610") ? "" : (stryCov_9fa48("32610"), 'name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32611") ? false : (stryCov_9fa48("32611"), true)
  }), stryMutAct_9fa48("32612") ? {} : (stryCov_9fa48("32612"), {
    name: stryMutAct_9fa48("32613") ? "" : (stryCov_9fa48("32613"), 'version'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32614") ? false : (stryCov_9fa48("32614"), true)
  }), stryMutAct_9fa48("32615") ? {} : (stryCov_9fa48("32615"), {
    name: stryMutAct_9fa48("32616") ? "" : (stryCov_9fa48("32616"), 'digest'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32617") ? false : (stryCov_9fa48("32617"), true)
  }), stryMutAct_9fa48("32618") ? {} : (stryCov_9fa48("32618"), {
    name: stryMutAct_9fa48("32619") ? "" : (stryCov_9fa48("32619"), 'run_export'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32620") ? false : (stryCov_9fa48("32620"), true)
  }), stryMutAct_9fa48("32621") ? {} : (stryCov_9fa48("32621"), {
    name: stryMutAct_9fa48("32622") ? "" : (stryCov_9fa48("32622"), 'exports'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32623") ? false : (stryCov_9fa48("32623"), true),
    defaultValue: stryMutAct_9fa48("32624") ? "" : (stryCov_9fa48("32624"), '\'[]\'')
  }), stryMutAct_9fa48("32625") ? {} : (stryCov_9fa48("32625"), {
    name: stryMutAct_9fa48("32626") ? "" : (stryCov_9fa48("32626"), 'dependencies'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32627") ? false : (stryCov_9fa48("32627"), true),
    defaultValue: stryMutAct_9fa48("32628") ? "" : (stryCov_9fa48("32628"), '\'[]\'')
  }), stryMutAct_9fa48("32629") ? {} : (stryCov_9fa48("32629"), {
    name: stryMutAct_9fa48("32630") ? "" : (stryCov_9fa48("32630"), 'capabilities'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32631") ? false : (stryCov_9fa48("32631"), true),
    defaultValue: stryMutAct_9fa48("32632") ? "" : (stryCov_9fa48("32632"), '\'[]\'')
  }), stryMutAct_9fa48("32633") ? {} : (stryCov_9fa48("32633"), {
    name: stryMutAct_9fa48("32634") ? "" : (stryCov_9fa48("32634"), 'source_reference'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32635") ? {} : (stryCov_9fa48("32635"), {
    name: stryMutAct_9fa48("32636") ? "" : (stryCov_9fa48("32636"), 'artifact_pointer'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32637") ? {} : (stryCov_9fa48("32637"), {
    name: stryMutAct_9fa48("32638") ? "" : (stryCov_9fa48("32638"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32639") ? false : (stryCov_9fa48("32639"), true)
  })]),
  primaryKey: stryMutAct_9fa48("32640") ? [] : (stryCov_9fa48("32640"), [stryMutAct_9fa48("32641") ? "" : (stryCov_9fa48("32641"), 'namespace'), stryMutAct_9fa48("32642") ? "" : (stryCov_9fa48("32642"), 'name'), stryMutAct_9fa48("32643") ? "" : (stryCov_9fa48("32643"), 'version')]),
  indices: stryMutAct_9fa48("32644") ? [] : (stryCov_9fa48("32644"), [stryMutAct_9fa48("32645") ? {} : (stryCov_9fa48("32645"), {
    name: stryMutAct_9fa48("32646") ? "" : (stryCov_9fa48("32646"), 'idx_module_manifests_digest'),
    columns: stryMutAct_9fa48("32647") ? [] : (stryCov_9fa48("32647"), [stryMutAct_9fa48("32648") ? "" : (stryCov_9fa48("32648"), 'digest')])
  }), stryMutAct_9fa48("32649") ? {} : (stryCov_9fa48("32649"), {
    name: stryMutAct_9fa48("32650") ? "" : (stryCov_9fa48("32650"), 'idx_module_manifests_namespace'),
    columns: stryMutAct_9fa48("32651") ? [] : (stryCov_9fa48("32651"), [stryMutAct_9fa48("32652") ? "" : (stryCov_9fa48("32652"), 'namespace')])
  })])
});

/**
 * Package registry mappings system table schema.
 * Stores namespace-to-registry resolution rules.
 * Requirements: 4.1, 10.1, 10.2
 */
const PACKAGE_REGISTRY_MAPPINGS_SCHEMA = stryMutAct_9fa48("32653") ? {} : (stryCov_9fa48("32653"), {
  tableName: SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_MAPPINGS,
  columns: stryMutAct_9fa48("32654") ? [] : (stryCov_9fa48("32654"), [stryMutAct_9fa48("32655") ? {} : (stryCov_9fa48("32655"), {
    name: stryMutAct_9fa48("32656") ? "" : (stryCov_9fa48("32656"), 'namespace'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32657") ? false : (stryCov_9fa48("32657"), true)
  }), stryMutAct_9fa48("32658") ? {} : (stryCov_9fa48("32658"), {
    name: stryMutAct_9fa48("32659") ? "" : (stryCov_9fa48("32659"), 'registry_url'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32660") ? false : (stryCov_9fa48("32660"), true)
  }), stryMutAct_9fa48("32661") ? {} : (stryCov_9fa48("32661"), {
    name: stryMutAct_9fa48("32662") ? "" : (stryCov_9fa48("32662"), 'policy_metadata'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32663") ? false : (stryCov_9fa48("32663"), true),
    defaultValue: stryMutAct_9fa48("32664") ? "" : (stryCov_9fa48("32664"), '\'{}\'')
  }), stryMutAct_9fa48("32665") ? {} : (stryCov_9fa48("32665"), {
    name: stryMutAct_9fa48("32666") ? "" : (stryCov_9fa48("32666"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32667") ? false : (stryCov_9fa48("32667"), true)
  }), stryMutAct_9fa48("32668") ? {} : (stryCov_9fa48("32668"), {
    name: stryMutAct_9fa48("32669") ? "" : (stryCov_9fa48("32669"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32670") ? false : (stryCov_9fa48("32670"), true)
  })]),
  indices: stryMutAct_9fa48("32671") ? ["Stryker was here"] : (stryCov_9fa48("32671"), [])
});

/**
 * Package registry overrides system table schema.
 * Stores per-package registry override rules.
 * Requirements: 4.2, 10.1, 10.2
 */
const PACKAGE_REGISTRY_OVERRIDES_SCHEMA = stryMutAct_9fa48("32672") ? {} : (stryCov_9fa48("32672"), {
  tableName: SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_OVERRIDES,
  columns: stryMutAct_9fa48("32673") ? [] : (stryCov_9fa48("32673"), [stryMutAct_9fa48("32674") ? {} : (stryCov_9fa48("32674"), {
    name: stryMutAct_9fa48("32675") ? "" : (stryCov_9fa48("32675"), 'namespace'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32676") ? false : (stryCov_9fa48("32676"), true)
  }), stryMutAct_9fa48("32677") ? {} : (stryCov_9fa48("32677"), {
    name: stryMutAct_9fa48("32678") ? "" : (stryCov_9fa48("32678"), 'name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32679") ? false : (stryCov_9fa48("32679"), true)
  }), stryMutAct_9fa48("32680") ? {} : (stryCov_9fa48("32680"), {
    name: stryMutAct_9fa48("32681") ? "" : (stryCov_9fa48("32681"), 'registry_url'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32682") ? false : (stryCov_9fa48("32682"), true)
  }), stryMutAct_9fa48("32683") ? {} : (stryCov_9fa48("32683"), {
    name: stryMutAct_9fa48("32684") ? "" : (stryCov_9fa48("32684"), 'policy_metadata'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32685") ? false : (stryCov_9fa48("32685"), true),
    defaultValue: stryMutAct_9fa48("32686") ? "" : (stryCov_9fa48("32686"), '\'{}\'')
  }), stryMutAct_9fa48("32687") ? {} : (stryCov_9fa48("32687"), {
    name: stryMutAct_9fa48("32688") ? "" : (stryCov_9fa48("32688"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32689") ? false : (stryCov_9fa48("32689"), true)
  }), stryMutAct_9fa48("32690") ? {} : (stryCov_9fa48("32690"), {
    name: stryMutAct_9fa48("32691") ? "" : (stryCov_9fa48("32691"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32692") ? false : (stryCov_9fa48("32692"), true)
  })]),
  primaryKey: stryMutAct_9fa48("32693") ? [] : (stryCov_9fa48("32693"), [stryMutAct_9fa48("32694") ? "" : (stryCov_9fa48("32694"), 'namespace'), stryMutAct_9fa48("32695") ? "" : (stryCov_9fa48("32695"), 'name')]),
  indices: stryMutAct_9fa48("32696") ? ["Stryker was here"] : (stryCov_9fa48("32696"), [])
});

/**
 * Module dependency locks system table schema.
 * Stores resolved dependency graphs pinned to immutable digests.
 * Requirements: 5.2, 10.1, 10.2
 */
const MODULE_DEPENDENCY_LOCKS_SCHEMA = stryMutAct_9fa48("32697") ? {} : (stryCov_9fa48("32697"), {
  tableName: SYSTEM_TABLE_NAME.MODULE_DEPENDENCY_LOCKS,
  columns: stryMutAct_9fa48("32698") ? [] : (stryCov_9fa48("32698"), [stryMutAct_9fa48("32699") ? {} : (stryCov_9fa48("32699"), {
    name: stryMutAct_9fa48("32700") ? "" : (stryCov_9fa48("32700"), 'lock_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32701") ? false : (stryCov_9fa48("32701"), true)
  }), stryMutAct_9fa48("32702") ? {} : (stryCov_9fa48("32702"), {
    name: stryMutAct_9fa48("32703") ? "" : (stryCov_9fa48("32703"), 'target_module_namespace'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32704") ? false : (stryCov_9fa48("32704"), true)
  }), stryMutAct_9fa48("32705") ? {} : (stryCov_9fa48("32705"), {
    name: stryMutAct_9fa48("32706") ? "" : (stryCov_9fa48("32706"), 'target_module_name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32707") ? false : (stryCov_9fa48("32707"), true)
  }), stryMutAct_9fa48("32708") ? {} : (stryCov_9fa48("32708"), {
    name: stryMutAct_9fa48("32709") ? "" : (stryCov_9fa48("32709"), 'target_module_version'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32710") ? false : (stryCov_9fa48("32710"), true)
  }), stryMutAct_9fa48("32711") ? {} : (stryCov_9fa48("32711"), {
    name: stryMutAct_9fa48("32712") ? "" : (stryCov_9fa48("32712"), 'target_service_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32713") ? {} : (stryCov_9fa48("32713"), {
    name: stryMutAct_9fa48("32714") ? "" : (stryCov_9fa48("32714"), 'resolved_dependencies'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32715") ? false : (stryCov_9fa48("32715"), true),
    defaultValue: stryMutAct_9fa48("32716") ? "" : (stryCov_9fa48("32716"), '\'[]\'')
  }), stryMutAct_9fa48("32717") ? {} : (stryCov_9fa48("32717"), {
    name: stryMutAct_9fa48("32718") ? "" : (stryCov_9fa48("32718"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32719") ? false : (stryCov_9fa48("32719"), true)
  })]),
  indices: stryMutAct_9fa48("32720") ? [] : (stryCov_9fa48("32720"), [stryMutAct_9fa48("32721") ? {} : (stryCov_9fa48("32721"), {
    name: stryMutAct_9fa48("32722") ? "" : (stryCov_9fa48("32722"), 'idx_dep_locks_target'),
    columns: stryMutAct_9fa48("32723") ? [] : (stryCov_9fa48("32723"), [stryMutAct_9fa48("32724") ? "" : (stryCov_9fa48("32724"), 'target_module_namespace'), stryMutAct_9fa48("32725") ? "" : (stryCov_9fa48("32725"), 'target_module_name'), stryMutAct_9fa48("32726") ? "" : (stryCov_9fa48("32726"), 'target_module_version')])
  }), stryMutAct_9fa48("32727") ? {} : (stryCov_9fa48("32727"), {
    name: stryMutAct_9fa48("32728") ? "" : (stryCov_9fa48("32728"), 'idx_dep_locks_service'),
    columns: stryMutAct_9fa48("32729") ? [] : (stryCov_9fa48("32729"), [stryMutAct_9fa48("32730") ? "" : (stryCov_9fa48("32730"), 'target_service_id')])
  })])
});

/**
 * WASM operations system table schema.
 * Stores async operation workflow state and idempotency metadata.
 * Requirements: 8.1, 8.3, 10.1, 10.2
 */
const WASM_OPERATIONS_SCHEMA = stryMutAct_9fa48("32731") ? {} : (stryCov_9fa48("32731"), {
  tableName: SYSTEM_TABLE_NAME.WASM_OPERATIONS,
  columns: stryMutAct_9fa48("32732") ? [] : (stryCov_9fa48("32732"), [stryMutAct_9fa48("32733") ? {} : (stryCov_9fa48("32733"), {
    name: stryMutAct_9fa48("32734") ? "" : (stryCov_9fa48("32734"), 'operation_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32735") ? false : (stryCov_9fa48("32735"), true)
  }), stryMutAct_9fa48("32736") ? {} : (stryCov_9fa48("32736"), {
    name: stryMutAct_9fa48("32737") ? "" : (stryCov_9fa48("32737"), 'tenant_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32738") ? false : (stryCov_9fa48("32738"), true)
  }), stryMutAct_9fa48("32739") ? {} : (stryCov_9fa48("32739"), {
    name: stryMutAct_9fa48("32740") ? "" : (stryCov_9fa48("32740"), 'command'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32741") ? false : (stryCov_9fa48("32741"), true)
  }), stryMutAct_9fa48("32742") ? {} : (stryCov_9fa48("32742"), {
    name: stryMutAct_9fa48("32743") ? "" : (stryCov_9fa48("32743"), 'idempotency_key'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32744") ? {} : (stryCov_9fa48("32744"), {
    name: stryMutAct_9fa48("32745") ? "" : (stryCov_9fa48("32745"), 'state'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32746") ? false : (stryCov_9fa48("32746"), true),
    defaultValue: stryMutAct_9fa48("32747") ? "" : (stryCov_9fa48("32747"), '\'pending\'')
  }), stryMutAct_9fa48("32748") ? {} : (stryCov_9fa48("32748"), {
    name: stryMutAct_9fa48("32749") ? "" : (stryCov_9fa48("32749"), 'result'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32750") ? false : (stryCov_9fa48("32750"), true),
    defaultValue: stryMutAct_9fa48("32751") ? "" : (stryCov_9fa48("32751"), '\'{}\'')
  }), stryMutAct_9fa48("32752") ? {} : (stryCov_9fa48("32752"), {
    name: stryMutAct_9fa48("32753") ? "" : (stryCov_9fa48("32753"), 'error'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32754") ? false : (stryCov_9fa48("32754"), true),
    defaultValue: stryMutAct_9fa48("32755") ? "" : (stryCov_9fa48("32755"), '\'{}\'')
  }), stryMutAct_9fa48("32756") ? {} : (stryCov_9fa48("32756"), {
    name: stryMutAct_9fa48("32757") ? "" : (stryCov_9fa48("32757"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32758") ? false : (stryCov_9fa48("32758"), true)
  }), stryMutAct_9fa48("32759") ? {} : (stryCov_9fa48("32759"), {
    name: stryMutAct_9fa48("32760") ? "" : (stryCov_9fa48("32760"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32761") ? false : (stryCov_9fa48("32761"), true)
  })]),
  indices: stryMutAct_9fa48("32762") ? [] : (stryCov_9fa48("32762"), [stryMutAct_9fa48("32763") ? {} : (stryCov_9fa48("32763"), {
    name: stryMutAct_9fa48("32764") ? "" : (stryCov_9fa48("32764"), 'idx_wasm_ops_tenant'),
    columns: stryMutAct_9fa48("32765") ? [] : (stryCov_9fa48("32765"), [stryMutAct_9fa48("32766") ? "" : (stryCov_9fa48("32766"), 'tenant_id')])
  }), stryMutAct_9fa48("32767") ? {} : (stryCov_9fa48("32767"), {
    name: stryMutAct_9fa48("32768") ? "" : (stryCov_9fa48("32768"), 'idx_wasm_ops_state'),
    columns: stryMutAct_9fa48("32769") ? [] : (stryCov_9fa48("32769"), [stryMutAct_9fa48("32770") ? "" : (stryCov_9fa48("32770"), 'state')])
  }), stryMutAct_9fa48("32771") ? {} : (stryCov_9fa48("32771"), {
    name: stryMutAct_9fa48("32772") ? "" : (stryCov_9fa48("32772"), 'idx_wasm_ops_idempotency'),
    columns: stryMutAct_9fa48("32773") ? [] : (stryCov_9fa48("32773"), [stryMutAct_9fa48("32774") ? "" : (stryCov_9fa48("32774"), 'tenant_id'), stryMutAct_9fa48("32775") ? "" : (stryCov_9fa48("32775"), 'idempotency_key')])
  })])
});

/**
 * SQL transactions system table schema.
 * Stores distributed transaction coordinator state for restart recovery.
 */
const SQL_TRANSACTIONS_SCHEMA = stryMutAct_9fa48("32776") ? {} : (stryCov_9fa48("32776"), {
  tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  columns: stryMutAct_9fa48("32777") ? [] : (stryCov_9fa48("32777"), [stryMutAct_9fa48("32778") ? {} : (stryCov_9fa48("32778"), {
    name: stryMutAct_9fa48("32779") ? "" : (stryCov_9fa48("32779"), 'transaction_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32780") ? false : (stryCov_9fa48("32780"), true)
  }), stryMutAct_9fa48("32781") ? {} : (stryCov_9fa48("32781"), {
    name: stryMutAct_9fa48("32782") ? "" : (stryCov_9fa48("32782"), 'session_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32783") ? false : (stryCov_9fa48("32783"), true)
  }), stryMutAct_9fa48("32784") ? {} : (stryCov_9fa48("32784"), {
    name: stryMutAct_9fa48("32785") ? "" : (stryCov_9fa48("32785"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32786") ? false : (stryCov_9fa48("32786"), true)
  }), stryMutAct_9fa48("32787") ? {} : (stryCov_9fa48("32787"), {
    name: stryMutAct_9fa48("32788") ? "" : (stryCov_9fa48("32788"), 'transaction_epoch'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32789") ? {} : (stryCov_9fa48("32789"), {
    name: stryMutAct_9fa48("32790") ? "" : (stryCov_9fa48("32790"), 'timeout_deadline'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32791") ? {} : (stryCov_9fa48("32791"), {
    name: stryMutAct_9fa48("32792") ? "" : (stryCov_9fa48("32792"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32793") ? false : (stryCov_9fa48("32793"), true)
  }), stryMutAct_9fa48("32794") ? {} : (stryCov_9fa48("32794"), {
    name: stryMutAct_9fa48("32795") ? "" : (stryCov_9fa48("32795"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32796") ? false : (stryCov_9fa48("32796"), true)
  })]),
  indices: stryMutAct_9fa48("32797") ? [] : (stryCov_9fa48("32797"), [stryMutAct_9fa48("32798") ? {} : (stryCov_9fa48("32798"), {
    name: stryMutAct_9fa48("32799") ? "" : (stryCov_9fa48("32799"), 'idx_sql_transactions_session'),
    columns: stryMutAct_9fa48("32800") ? [] : (stryCov_9fa48("32800"), [stryMutAct_9fa48("32801") ? "" : (stryCov_9fa48("32801"), 'session_id')])
  }), stryMutAct_9fa48("32802") ? {} : (stryCov_9fa48("32802"), {
    name: stryMutAct_9fa48("32803") ? "" : (stryCov_9fa48("32803"), 'idx_sql_transactions_status'),
    columns: stryMutAct_9fa48("32804") ? [] : (stryCov_9fa48("32804"), [stryMutAct_9fa48("32805") ? "" : (stryCov_9fa48("32805"), 'status')])
  })])
});

/**
 * SQL transaction participants system table schema.
 * Stores participant partition state for distributed transactions.
 */
const SQL_TRANSACTION_PARTICIPANTS_SCHEMA = stryMutAct_9fa48("32806") ? {} : (stryCov_9fa48("32806"), {
  tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  columns: stryMutAct_9fa48("32807") ? [] : (stryCov_9fa48("32807"), [stryMutAct_9fa48("32808") ? {} : (stryCov_9fa48("32808"), {
    name: stryMutAct_9fa48("32809") ? "" : (stryCov_9fa48("32809"), 'participant_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32810") ? false : (stryCov_9fa48("32810"), true)
  }), stryMutAct_9fa48("32811") ? {} : (stryCov_9fa48("32811"), {
    name: stryMutAct_9fa48("32812") ? "" : (stryCov_9fa48("32812"), 'transaction_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32813") ? false : (stryCov_9fa48("32813"), true)
  }), stryMutAct_9fa48("32814") ? {} : (stryCov_9fa48("32814"), {
    name: stryMutAct_9fa48("32815") ? "" : (stryCov_9fa48("32815"), 'partition_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32816") ? false : (stryCov_9fa48("32816"), true)
  }), stryMutAct_9fa48("32817") ? {} : (stryCov_9fa48("32817"), {
    name: stryMutAct_9fa48("32818") ? "" : (stryCov_9fa48("32818"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32819") ? false : (stryCov_9fa48("32819"), true)
  }), stryMutAct_9fa48("32820") ? {} : (stryCov_9fa48("32820"), {
    name: stryMutAct_9fa48("32821") ? "" : (stryCov_9fa48("32821"), 'last_error'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32822") ? {} : (stryCov_9fa48("32822"), {
    name: stryMutAct_9fa48("32823") ? "" : (stryCov_9fa48("32823"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32824") ? false : (stryCov_9fa48("32824"), true)
  }), stryMutAct_9fa48("32825") ? {} : (stryCov_9fa48("32825"), {
    name: stryMutAct_9fa48("32826") ? "" : (stryCov_9fa48("32826"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32827") ? false : (stryCov_9fa48("32827"), true)
  })]),
  indices: stryMutAct_9fa48("32828") ? [] : (stryCov_9fa48("32828"), [stryMutAct_9fa48("32829") ? {} : (stryCov_9fa48("32829"), {
    name: stryMutAct_9fa48("32830") ? "" : (stryCov_9fa48("32830"), 'idx_sql_tx_participants_tx_partition'),
    columns: stryMutAct_9fa48("32831") ? [] : (stryCov_9fa48("32831"), [stryMutAct_9fa48("32832") ? "" : (stryCov_9fa48("32832"), 'transaction_id'), stryMutAct_9fa48("32833") ? "" : (stryCov_9fa48("32833"), 'partition_id')])
  }), stryMutAct_9fa48("32834") ? {} : (stryCov_9fa48("32834"), {
    name: stryMutAct_9fa48("32835") ? "" : (stryCov_9fa48("32835"), 'idx_sql_tx_participants_partition'),
    columns: stryMutAct_9fa48("32836") ? [] : (stryCov_9fa48("32836"), [stryMutAct_9fa48("32837") ? "" : (stryCov_9fa48("32837"), 'partition_id')])
  }), stryMutAct_9fa48("32838") ? {} : (stryCov_9fa48("32838"), {
    name: stryMutAct_9fa48("32839") ? "" : (stryCov_9fa48("32839"), 'idx_sql_tx_participants_status'),
    columns: stryMutAct_9fa48("32840") ? [] : (stryCov_9fa48("32840"), [stryMutAct_9fa48("32841") ? "" : (stryCov_9fa48("32841"), 'status')])
  })])
});

/**
 * SQL write operations system table schema.
 * Stores idempotent distributed write operation state.
 */
const SQL_WRITE_OPERATIONS_SCHEMA = stryMutAct_9fa48("32842") ? {} : (stryCov_9fa48("32842"), {
  tableName: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
  columns: stryMutAct_9fa48("32843") ? [] : (stryCov_9fa48("32843"), [stryMutAct_9fa48("32844") ? {} : (stryCov_9fa48("32844"), {
    name: stryMutAct_9fa48("32845") ? "" : (stryCov_9fa48("32845"), 'operation_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32846") ? false : (stryCov_9fa48("32846"), true)
  }), stryMutAct_9fa48("32847") ? {} : (stryCov_9fa48("32847"), {
    name: stryMutAct_9fa48("32848") ? "" : (stryCov_9fa48("32848"), 'transaction_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32849") ? {} : (stryCov_9fa48("32849"), {
    name: stryMutAct_9fa48("32850") ? "" : (stryCov_9fa48("32850"), 'statement_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32851") ? false : (stryCov_9fa48("32851"), true)
  }), stryMutAct_9fa48("32852") ? {} : (stryCov_9fa48("32852"), {
    name: stryMutAct_9fa48("32853") ? "" : (stryCov_9fa48("32853"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32854") ? false : (stryCov_9fa48("32854"), true)
  }), stryMutAct_9fa48("32855") ? {} : (stryCov_9fa48("32855"), {
    name: stryMutAct_9fa48("32856") ? "" : (stryCov_9fa48("32856"), 'idempotency_key'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32857") ? false : (stryCov_9fa48("32857"), true)
  }), stryMutAct_9fa48("32858") ? {} : (stryCov_9fa48("32858"), {
    name: stryMutAct_9fa48("32859") ? "" : (stryCov_9fa48("32859"), 'payload_hash'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32860") ? false : (stryCov_9fa48("32860"), true)
  }), stryMutAct_9fa48("32861") ? {} : (stryCov_9fa48("32861"), {
    name: stryMutAct_9fa48("32862") ? "" : (stryCov_9fa48("32862"), 'partition_ids'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32863") ? false : (stryCov_9fa48("32863"), true),
    defaultValue: stryMutAct_9fa48("32864") ? "" : (stryCov_9fa48("32864"), '\'[]\'')
  }), stryMutAct_9fa48("32865") ? {} : (stryCov_9fa48("32865"), {
    name: stryMutAct_9fa48("32866") ? "" : (stryCov_9fa48("32866"), 'retry_count'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32867") ? false : (stryCov_9fa48("32867"), true),
    defaultValue: 0
  }), stryMutAct_9fa48("32868") ? {} : (stryCov_9fa48("32868"), {
    name: stryMutAct_9fa48("32869") ? "" : (stryCov_9fa48("32869"), 'last_error'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32870") ? {} : (stryCov_9fa48("32870"), {
    name: stryMutAct_9fa48("32871") ? "" : (stryCov_9fa48("32871"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32872") ? false : (stryCov_9fa48("32872"), true)
  }), stryMutAct_9fa48("32873") ? {} : (stryCov_9fa48("32873"), {
    name: stryMutAct_9fa48("32874") ? "" : (stryCov_9fa48("32874"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32875") ? false : (stryCov_9fa48("32875"), true)
  })]),
  indices: stryMutAct_9fa48("32876") ? [] : (stryCov_9fa48("32876"), [stryMutAct_9fa48("32877") ? {} : (stryCov_9fa48("32877"), {
    name: stryMutAct_9fa48("32878") ? "" : (stryCov_9fa48("32878"), 'idx_sql_write_ops_tx'),
    columns: stryMutAct_9fa48("32879") ? [] : (stryCov_9fa48("32879"), [stryMutAct_9fa48("32880") ? "" : (stryCov_9fa48("32880"), 'transaction_id')])
  }), stryMutAct_9fa48("32881") ? {} : (stryCov_9fa48("32881"), {
    name: stryMutAct_9fa48("32882") ? "" : (stryCov_9fa48("32882"), 'idx_sql_write_ops_status'),
    columns: stryMutAct_9fa48("32883") ? [] : (stryCov_9fa48("32883"), [stryMutAct_9fa48("32884") ? "" : (stryCov_9fa48("32884"), 'status')])
  }), stryMutAct_9fa48("32885") ? {} : (stryCov_9fa48("32885"), {
    name: stryMutAct_9fa48("32886") ? "" : (stryCov_9fa48("32886"), 'idx_sql_write_ops_idempotency'),
    columns: stryMutAct_9fa48("32887") ? [] : (stryCov_9fa48("32887"), [stryMutAct_9fa48("32888") ? "" : (stryCov_9fa48("32888"), 'idempotency_key')])
  })])
});

/**
 * Schema migrations system table schema.
 * Stores durable migration workflow state for user table schema changes.
 */
const SCHEMA_MIGRATIONS_SCHEMA = stryMutAct_9fa48("32889") ? {} : (stryCov_9fa48("32889"), {
  tableName: SYSTEM_TABLE_NAME.SCHEMA_MIGRATIONS,
  columns: stryMutAct_9fa48("32890") ? [] : (stryCov_9fa48("32890"), [stryMutAct_9fa48("32891") ? {} : (stryCov_9fa48("32891"), {
    name: stryMutAct_9fa48("32892") ? "" : (stryCov_9fa48("32892"), 'migration_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32893") ? false : (stryCov_9fa48("32893"), true)
  }), stryMutAct_9fa48("32894") ? {} : (stryCov_9fa48("32894"), {
    name: stryMutAct_9fa48("32895") ? "" : (stryCov_9fa48("32895"), 'table_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32896") ? false : (stryCov_9fa48("32896"), true)
  }), stryMutAct_9fa48("32897") ? {} : (stryCov_9fa48("32897"), {
    name: stryMutAct_9fa48("32898") ? "" : (stryCov_9fa48("32898"), 'table_name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32899") ? false : (stryCov_9fa48("32899"), true)
  }), stryMutAct_9fa48("32900") ? {} : (stryCov_9fa48("32900"), {
    name: stryMutAct_9fa48("32901") ? "" : (stryCov_9fa48("32901"), 'migration_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32902") ? false : (stryCov_9fa48("32902"), true)
  }), stryMutAct_9fa48("32903") ? {} : (stryCov_9fa48("32903"), {
    name: stryMutAct_9fa48("32904") ? "" : (stryCov_9fa48("32904"), 'source_schema'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32905") ? false : (stryCov_9fa48("32905"), true)
  }), stryMutAct_9fa48("32906") ? {} : (stryCov_9fa48("32906"), {
    name: stryMutAct_9fa48("32907") ? "" : (stryCov_9fa48("32907"), 'target_schema'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32908") ? false : (stryCov_9fa48("32908"), true)
  }), stryMutAct_9fa48("32909") ? {} : (stryCov_9fa48("32909"), {
    name: stryMutAct_9fa48("32910") ? "" : (stryCov_9fa48("32910"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32911") ? false : (stryCov_9fa48("32911"), true)
  }), stryMutAct_9fa48("32912") ? {} : (stryCov_9fa48("32912"), {
    name: stryMutAct_9fa48("32913") ? "" : (stryCov_9fa48("32913"), 'current_stage'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32914") ? false : (stryCov_9fa48("32914"), true)
  }), stryMutAct_9fa48("32915") ? {} : (stryCov_9fa48("32915"), {
    name: stryMutAct_9fa48("32916") ? "" : (stryCov_9fa48("32916"), 'error_message'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32917") ? {} : (stryCov_9fa48("32917"), {
    name: stryMutAct_9fa48("32918") ? "" : (stryCov_9fa48("32918"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32919") ? false : (stryCov_9fa48("32919"), true)
  }), stryMutAct_9fa48("32920") ? {} : (stryCov_9fa48("32920"), {
    name: stryMutAct_9fa48("32921") ? "" : (stryCov_9fa48("32921"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32922") ? false : (stryCov_9fa48("32922"), true)
  }), stryMutAct_9fa48("32923") ? {} : (stryCov_9fa48("32923"), {
    name: stryMutAct_9fa48("32924") ? "" : (stryCov_9fa48("32924"), 'completed_at'),
    type: COLUMN_TYPE.INTEGER
  })]),
  indices: stryMutAct_9fa48("32925") ? [] : (stryCov_9fa48("32925"), [stryMutAct_9fa48("32926") ? {} : (stryCov_9fa48("32926"), {
    name: stryMutAct_9fa48("32927") ? "" : (stryCov_9fa48("32927"), 'idx_schema_migrations_table'),
    columns: stryMutAct_9fa48("32928") ? [] : (stryCov_9fa48("32928"), [stryMutAct_9fa48("32929") ? "" : (stryCov_9fa48("32929"), 'table_id')])
  }), stryMutAct_9fa48("32930") ? {} : (stryCov_9fa48("32930"), {
    name: stryMutAct_9fa48("32931") ? "" : (stryCov_9fa48("32931"), 'idx_schema_migrations_status'),
    columns: stryMutAct_9fa48("32932") ? [] : (stryCov_9fa48("32932"), [stryMutAct_9fa48("32933") ? "" : (stryCov_9fa48("32933"), 'status')])
  })])
});

/**
 * Schema migration partitions system table schema.
 * Stores per-partition migration progress for each migration workflow.
 */
const SCHEMA_MIGRATION_PARTITIONS_SCHEMA = stryMutAct_9fa48("32934") ? {} : (stryCov_9fa48("32934"), {
  tableName: SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS,
  columns: stryMutAct_9fa48("32935") ? [] : (stryCov_9fa48("32935"), [stryMutAct_9fa48("32936") ? {} : (stryCov_9fa48("32936"), {
    name: stryMutAct_9fa48("32937") ? "" : (stryCov_9fa48("32937"), 'migration_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32938") ? false : (stryCov_9fa48("32938"), true)
  }), stryMutAct_9fa48("32939") ? {} : (stryCov_9fa48("32939"), {
    name: stryMutAct_9fa48("32940") ? "" : (stryCov_9fa48("32940"), 'partition_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32941") ? false : (stryCov_9fa48("32941"), true)
  }), stryMutAct_9fa48("32942") ? {} : (stryCov_9fa48("32942"), {
    name: stryMutAct_9fa48("32943") ? "" : (stryCov_9fa48("32943"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32944") ? false : (stryCov_9fa48("32944"), true)
  }), stryMutAct_9fa48("32945") ? {} : (stryCov_9fa48("32945"), {
    name: stryMutAct_9fa48("32946") ? "" : (stryCov_9fa48("32946"), 'backfill_cursor'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32947") ? {} : (stryCov_9fa48("32947"), {
    name: stryMutAct_9fa48("32948") ? "" : (stryCov_9fa48("32948"), 'retry_count'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32949") ? false : (stryCov_9fa48("32949"), true),
    defaultValue: 0
  }), stryMutAct_9fa48("32950") ? {} : (stryCov_9fa48("32950"), {
    name: stryMutAct_9fa48("32951") ? "" : (stryCov_9fa48("32951"), 'error_message'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32952") ? {} : (stryCov_9fa48("32952"), {
    name: stryMutAct_9fa48("32953") ? "" : (stryCov_9fa48("32953"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32954") ? false : (stryCov_9fa48("32954"), true)
  })]),
  primaryKey: stryMutAct_9fa48("32955") ? [] : (stryCov_9fa48("32955"), [stryMutAct_9fa48("32956") ? "" : (stryCov_9fa48("32956"), 'migration_id'), stryMutAct_9fa48("32957") ? "" : (stryCov_9fa48("32957"), 'partition_id')]),
  indices: stryMutAct_9fa48("32958") ? [] : (stryCov_9fa48("32958"), [stryMutAct_9fa48("32959") ? {} : (stryCov_9fa48("32959"), {
    name: stryMutAct_9fa48("32960") ? "" : (stryCov_9fa48("32960"), 'idx_schema_migration_partitions_status'),
    columns: stryMutAct_9fa48("32961") ? [] : (stryCov_9fa48("32961"), [stryMutAct_9fa48("32962") ? "" : (stryCov_9fa48("32962"), 'migration_id'), stryMutAct_9fa48("32963") ? "" : (stryCov_9fa48("32963"), 'status')])
  })])
});

/**
 * Debug sessions system table schema.
 * Stores tenant-scoped distributed debug session metadata.
 */
const DEBUG_SESSIONS_SCHEMA = stryMutAct_9fa48("32964") ? {} : (stryCov_9fa48("32964"), {
  tableName: SYSTEM_TABLE_NAME.DEBUG_SESSIONS,
  columns: stryMutAct_9fa48("32965") ? [] : (stryCov_9fa48("32965"), [stryMutAct_9fa48("32966") ? {} : (stryCov_9fa48("32966"), {
    name: stryMutAct_9fa48("32967") ? "" : (stryCov_9fa48("32967"), 'session_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("32968") ? false : (stryCov_9fa48("32968"), true)
  }), stryMutAct_9fa48("32969") ? {} : (stryCov_9fa48("32969"), {
    name: stryMutAct_9fa48("32970") ? "" : (stryCov_9fa48("32970"), 'tenant_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32971") ? false : (stryCov_9fa48("32971"), true)
  }), stryMutAct_9fa48("32972") ? {} : (stryCov_9fa48("32972"), {
    name: stryMutAct_9fa48("32973") ? "" : (stryCov_9fa48("32973"), 'service_name'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32974") ? false : (stryCov_9fa48("32974"), true)
  }), stryMutAct_9fa48("32975") ? {} : (stryCov_9fa48("32975"), {
    name: stryMutAct_9fa48("32976") ? "" : (stryCov_9fa48("32976"), 'lineage_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32977") ? {} : (stryCov_9fa48("32977"), {
    name: stryMutAct_9fa48("32978") ? "" : (stryCov_9fa48("32978"), 'stage_id'),
    type: COLUMN_TYPE.INTEGER
  }), stryMutAct_9fa48("32979") ? {} : (stryCov_9fa48("32979"), {
    name: stryMutAct_9fa48("32980") ? "" : (stryCov_9fa48("32980"), 'node_id'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32981") ? {} : (stryCov_9fa48("32981"), {
    name: stryMutAct_9fa48("32982") ? "" : (stryCov_9fa48("32982"), 'endpoint'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("32983") ? {} : (stryCov_9fa48("32983"), {
    name: stryMutAct_9fa48("32984") ? "" : (stryCov_9fa48("32984"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("32985") ? false : (stryCov_9fa48("32985"), true),
    defaultValue: stryMutAct_9fa48("32986") ? "" : (stryCov_9fa48("32986"), '\'active\'')
  }), stryMutAct_9fa48("32987") ? {} : (stryCov_9fa48("32987"), {
    name: stryMutAct_9fa48("32988") ? "" : (stryCov_9fa48("32988"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32989") ? false : (stryCov_9fa48("32989"), true)
  }), stryMutAct_9fa48("32990") ? {} : (stryCov_9fa48("32990"), {
    name: stryMutAct_9fa48("32991") ? "" : (stryCov_9fa48("32991"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("32992") ? false : (stryCov_9fa48("32992"), true)
  })]),
  indices: stryMutAct_9fa48("32993") ? [] : (stryCov_9fa48("32993"), [stryMutAct_9fa48("32994") ? {} : (stryCov_9fa48("32994"), {
    name: stryMutAct_9fa48("32995") ? "" : (stryCov_9fa48("32995"), 'idx_debug_sessions_tenant'),
    columns: stryMutAct_9fa48("32996") ? [] : (stryCov_9fa48("32996"), [stryMutAct_9fa48("32997") ? "" : (stryCov_9fa48("32997"), 'tenant_id')])
  }), stryMutAct_9fa48("32998") ? {} : (stryCov_9fa48("32998"), {
    name: stryMutAct_9fa48("32999") ? "" : (stryCov_9fa48("32999"), 'idx_debug_sessions_lineage_stage'),
    columns: stryMutAct_9fa48("33000") ? [] : (stryCov_9fa48("33000"), [stryMutAct_9fa48("33001") ? "" : (stryCov_9fa48("33001"), 'lineage_id'), stryMutAct_9fa48("33002") ? "" : (stryCov_9fa48("33002"), 'stage_id')])
  }), stryMutAct_9fa48("33003") ? {} : (stryCov_9fa48("33003"), {
    name: stryMutAct_9fa48("33004") ? "" : (stryCov_9fa48("33004"), 'idx_debug_sessions_service_name'),
    columns: stryMutAct_9fa48("33005") ? [] : (stryCov_9fa48("33005"), [stryMutAct_9fa48("33006") ? "" : (stryCov_9fa48("33006"), 'service_name')])
  })])
});

/**
 * Debug breakpoints system table schema.
 * Stores resolved source breakpoints for a debug session.
 */
const DEBUG_BREAKPOINTS_SCHEMA = stryMutAct_9fa48("33007") ? {} : (stryCov_9fa48("33007"), {
  tableName: SYSTEM_TABLE_NAME.DEBUG_BREAKPOINTS,
  columns: stryMutAct_9fa48("33008") ? [] : (stryCov_9fa48("33008"), [stryMutAct_9fa48("33009") ? {} : (stryCov_9fa48("33009"), {
    name: stryMutAct_9fa48("33010") ? "" : (stryCov_9fa48("33010"), 'breakpoint_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("33011") ? false : (stryCov_9fa48("33011"), true)
  }), stryMutAct_9fa48("33012") ? {} : (stryCov_9fa48("33012"), {
    name: stryMutAct_9fa48("33013") ? "" : (stryCov_9fa48("33013"), 'session_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33014") ? false : (stryCov_9fa48("33014"), true)
  }), stryMutAct_9fa48("33015") ? {} : (stryCov_9fa48("33015"), {
    name: stryMutAct_9fa48("33016") ? "" : (stryCov_9fa48("33016"), 'tenant_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33017") ? false : (stryCov_9fa48("33017"), true)
  }), stryMutAct_9fa48("33018") ? {} : (stryCov_9fa48("33018"), {
    name: stryMutAct_9fa48("33019") ? "" : (stryCov_9fa48("33019"), 'module_ref'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33020") ? false : (stryCov_9fa48("33020"), true)
  }), stryMutAct_9fa48("33021") ? {} : (stryCov_9fa48("33021"), {
    name: stryMutAct_9fa48("33022") ? "" : (stryCov_9fa48("33022"), 'source_file_url'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33023") ? false : (stryCov_9fa48("33023"), true)
  }), stryMutAct_9fa48("33024") ? {} : (stryCov_9fa48("33024"), {
    name: stryMutAct_9fa48("33025") ? "" : (stryCov_9fa48("33025"), 'line_number'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33026") ? false : (stryCov_9fa48("33026"), true)
  }), stryMutAct_9fa48("33027") ? {} : (stryCov_9fa48("33027"), {
    name: stryMutAct_9fa48("33028") ? "" : (stryCov_9fa48("33028"), 'column_number'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33029") ? false : (stryCov_9fa48("33029"), true),
    defaultValue: 0
  }), stryMutAct_9fa48("33030") ? {} : (stryCov_9fa48("33030"), {
    name: stryMutAct_9fa48("33031") ? "" : (stryCov_9fa48("33031"), 'condition'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("33032") ? {} : (stryCov_9fa48("33032"), {
    name: stryMutAct_9fa48("33033") ? "" : (stryCov_9fa48("33033"), 'resolved'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33034") ? false : (stryCov_9fa48("33034"), true),
    defaultValue: 0
  }), stryMutAct_9fa48("33035") ? {} : (stryCov_9fa48("33035"), {
    name: stryMutAct_9fa48("33036") ? "" : (stryCov_9fa48("33036"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33037") ? false : (stryCov_9fa48("33037"), true)
  }), stryMutAct_9fa48("33038") ? {} : (stryCov_9fa48("33038"), {
    name: stryMutAct_9fa48("33039") ? "" : (stryCov_9fa48("33039"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33040") ? false : (stryCov_9fa48("33040"), true)
  })]),
  indices: stryMutAct_9fa48("33041") ? [] : (stryCov_9fa48("33041"), [stryMutAct_9fa48("33042") ? {} : (stryCov_9fa48("33042"), {
    name: stryMutAct_9fa48("33043") ? "" : (stryCov_9fa48("33043"), 'idx_debug_breakpoints_session'),
    columns: stryMutAct_9fa48("33044") ? [] : (stryCov_9fa48("33044"), [stryMutAct_9fa48("33045") ? "" : (stryCov_9fa48("33045"), 'session_id')])
  }), stryMutAct_9fa48("33046") ? {} : (stryCov_9fa48("33046"), {
    name: stryMutAct_9fa48("33047") ? "" : (stryCov_9fa48("33047"), 'idx_debug_breakpoints_tenant_session'),
    columns: stryMutAct_9fa48("33048") ? [] : (stryCov_9fa48("33048"), [stryMutAct_9fa48("33049") ? "" : (stryCov_9fa48("33049"), 'tenant_id'), stryMutAct_9fa48("33050") ? "" : (stryCov_9fa48("33050"), 'session_id')])
  }), stryMutAct_9fa48("33051") ? {} : (stryCov_9fa48("33051"), {
    name: stryMutAct_9fa48("33052") ? "" : (stryCov_9fa48("33052"), 'idx_debug_breakpoints_module_source_line'),
    columns: stryMutAct_9fa48("33053") ? [] : (stryCov_9fa48("33053"), [stryMutAct_9fa48("33054") ? "" : (stryCov_9fa48("33054"), 'module_ref'), stryMutAct_9fa48("33055") ? "" : (stryCov_9fa48("33055"), 'source_file_url'), stryMutAct_9fa48("33056") ? "" : (stryCov_9fa48("33056"), 'line_number')])
  })])
});

/**
 * Debug snapshots system table schema.
 * Stores serialized deterministic snapshot artifacts.
 */
const DEBUG_SNAPSHOTS_SCHEMA = stryMutAct_9fa48("33057") ? {} : (stryCov_9fa48("33057"), {
  tableName: SYSTEM_TABLE_NAME.DEBUG_SNAPSHOTS,
  columns: stryMutAct_9fa48("33058") ? [] : (stryCov_9fa48("33058"), [stryMutAct_9fa48("33059") ? {} : (stryCov_9fa48("33059"), {
    name: stryMutAct_9fa48("33060") ? "" : (stryCov_9fa48("33060"), 'snapshot_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("33061") ? false : (stryCov_9fa48("33061"), true)
  }), stryMutAct_9fa48("33062") ? {} : (stryCov_9fa48("33062"), {
    name: stryMutAct_9fa48("33063") ? "" : (stryCov_9fa48("33063"), 'session_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33064") ? false : (stryCov_9fa48("33064"), true)
  }), stryMutAct_9fa48("33065") ? {} : (stryCov_9fa48("33065"), {
    name: stryMutAct_9fa48("33066") ? "" : (stryCov_9fa48("33066"), 'tenant_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33067") ? false : (stryCov_9fa48("33067"), true)
  }), stryMutAct_9fa48("33068") ? {} : (stryCov_9fa48("33068"), {
    name: stryMutAct_9fa48("33069") ? "" : (stryCov_9fa48("33069"), 'module_ref'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33070") ? false : (stryCov_9fa48("33070"), true)
  }), stryMutAct_9fa48("33071") ? {} : (stryCov_9fa48("33071"), {
    name: stryMutAct_9fa48("33072") ? "" : (stryCov_9fa48("33072"), 'module_digest'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33073") ? false : (stryCov_9fa48("33073"), true)
  }), stryMutAct_9fa48("33074") ? {} : (stryCov_9fa48("33074"), {
    name: stryMutAct_9fa48("33075") ? "" : (stryCov_9fa48("33075"), 'captured_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33076") ? false : (stryCov_9fa48("33076"), true)
  }), stryMutAct_9fa48("33077") ? {} : (stryCov_9fa48("33077"), {
    name: stryMutAct_9fa48("33078") ? "" : (stryCov_9fa48("33078"), 'format_version'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33079") ? false : (stryCov_9fa48("33079"), true)
  }), stryMutAct_9fa48("33080") ? {} : (stryCov_9fa48("33080"), {
    name: stryMutAct_9fa48("33081") ? "" : (stryCov_9fa48("33081"), 'snapshot_bytes_base64'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33082") ? false : (stryCov_9fa48("33082"), true)
  }), stryMutAct_9fa48("33083") ? {} : (stryCov_9fa48("33083"), {
    name: stryMutAct_9fa48("33084") ? "" : (stryCov_9fa48("33084"), 'manifest_json'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33085") ? false : (stryCov_9fa48("33085"), true)
  }), stryMutAct_9fa48("33086") ? {} : (stryCov_9fa48("33086"), {
    name: stryMutAct_9fa48("33087") ? "" : (stryCov_9fa48("33087"), 'total_bytes'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33088") ? false : (stryCov_9fa48("33088"), true)
  }), stryMutAct_9fa48("33089") ? {} : (stryCov_9fa48("33089"), {
    name: stryMutAct_9fa48("33090") ? "" : (stryCov_9fa48("33090"), 'frame_count'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33091") ? false : (stryCov_9fa48("33091"), true)
  }), stryMutAct_9fa48("33092") ? {} : (stryCov_9fa48("33092"), {
    name: stryMutAct_9fa48("33093") ? "" : (stryCov_9fa48("33093"), 'host_call_count'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33094") ? false : (stryCov_9fa48("33094"), true)
  }), stryMutAct_9fa48("33095") ? {} : (stryCov_9fa48("33095"), {
    name: stryMutAct_9fa48("33096") ? "" : (stryCov_9fa48("33096"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33097") ? false : (stryCov_9fa48("33097"), true)
  }), stryMutAct_9fa48("33098") ? {} : (stryCov_9fa48("33098"), {
    name: stryMutAct_9fa48("33099") ? "" : (stryCov_9fa48("33099"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33100") ? false : (stryCov_9fa48("33100"), true)
  })]),
  indices: stryMutAct_9fa48("33101") ? [] : (stryCov_9fa48("33101"), [stryMutAct_9fa48("33102") ? {} : (stryCov_9fa48("33102"), {
    name: stryMutAct_9fa48("33103") ? "" : (stryCov_9fa48("33103"), 'idx_debug_snapshots_session'),
    columns: stryMutAct_9fa48("33104") ? [] : (stryCov_9fa48("33104"), [stryMutAct_9fa48("33105") ? "" : (stryCov_9fa48("33105"), 'session_id')])
  }), stryMutAct_9fa48("33106") ? {} : (stryCov_9fa48("33106"), {
    name: stryMutAct_9fa48("33107") ? "" : (stryCov_9fa48("33107"), 'idx_debug_snapshots_tenant_session'),
    columns: stryMutAct_9fa48("33108") ? [] : (stryCov_9fa48("33108"), [stryMutAct_9fa48("33109") ? "" : (stryCov_9fa48("33109"), 'tenant_id'), stryMutAct_9fa48("33110") ? "" : (stryCov_9fa48("33110"), 'session_id')])
  }), stryMutAct_9fa48("33111") ? {} : (stryCov_9fa48("33111"), {
    name: stryMutAct_9fa48("33112") ? "" : (stryCov_9fa48("33112"), 'idx_debug_snapshots_captured_at'),
    columns: stryMutAct_9fa48("33113") ? [] : (stryCov_9fa48("33113"), [stryMutAct_9fa48("33114") ? "" : (stryCov_9fa48("33114"), 'captured_at')])
  })])
});

/**
 * Storage reservations system table schema.
 * Tracks in-flight storage reservations for admission control.
 * Requirements: 1.2, 2.1, 12.1
 */
const STORAGE_RESERVATIONS_SCHEMA = stryMutAct_9fa48("33115") ? {} : (stryCov_9fa48("33115"), {
  tableName: SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
  columns: stryMutAct_9fa48("33116") ? [] : (stryCov_9fa48("33116"), [stryMutAct_9fa48("33117") ? {} : (stryCov_9fa48("33117"), {
    name: stryMutAct_9fa48("33118") ? "" : (stryCov_9fa48("33118"), 'reservation_id'),
    type: COLUMN_TYPE.TEXT,
    primaryKey: stryMutAct_9fa48("33119") ? false : (stryCov_9fa48("33119"), true)
  }), stryMutAct_9fa48("33120") ? {} : (stryCov_9fa48("33120"), {
    name: stryMutAct_9fa48("33121") ? "" : (stryCov_9fa48("33121"), 'operation_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33122") ? false : (stryCov_9fa48("33122"), true)
  }), stryMutAct_9fa48("33123") ? {} : (stryCov_9fa48("33123"), {
    name: stryMutAct_9fa48("33124") ? "" : (stryCov_9fa48("33124"), 'entity_type'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33125") ? false : (stryCov_9fa48("33125"), true)
  }), stryMutAct_9fa48("33126") ? {} : (stryCov_9fa48("33126"), {
    name: stryMutAct_9fa48("33127") ? "" : (stryCov_9fa48("33127"), 'entity_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33128") ? false : (stryCov_9fa48("33128"), true)
  }), stryMutAct_9fa48("33129") ? {} : (stryCov_9fa48("33129"), {
    name: stryMutAct_9fa48("33130") ? "" : (stryCov_9fa48("33130"), 'partition_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33131") ? false : (stryCov_9fa48("33131"), true)
  }), stryMutAct_9fa48("33132") ? {} : (stryCov_9fa48("33132"), {
    name: stryMutAct_9fa48("33133") ? "" : (stryCov_9fa48("33133"), 'target_node_id'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33134") ? false : (stryCov_9fa48("33134"), true)
  }), stryMutAct_9fa48("33135") ? {} : (stryCov_9fa48("33135"), {
    name: stryMutAct_9fa48("33136") ? "" : (stryCov_9fa48("33136"), 'estimated_bytes'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33137") ? false : (stryCov_9fa48("33137"), true)
  }), stryMutAct_9fa48("33138") ? {} : (stryCov_9fa48("33138"), {
    name: stryMutAct_9fa48("33139") ? "" : (stryCov_9fa48("33139"), 'amplification_factor'),
    type: COLUMN_TYPE.REAL,
    notNull: stryMutAct_9fa48("33140") ? false : (stryCov_9fa48("33140"), true),
    defaultValue: 1
  }), stryMutAct_9fa48("33141") ? {} : (stryCov_9fa48("33141"), {
    name: stryMutAct_9fa48("33142") ? "" : (stryCov_9fa48("33142"), 'status'),
    type: COLUMN_TYPE.TEXT,
    notNull: stryMutAct_9fa48("33143") ? false : (stryCov_9fa48("33143"), true),
    defaultValue: stryMutAct_9fa48("33144") ? "" : (stryCov_9fa48("33144"), '\'active\'')
  }), stryMutAct_9fa48("33145") ? {} : (stryCov_9fa48("33145"), {
    name: stryMutAct_9fa48("33146") ? "" : (stryCov_9fa48("33146"), 'reason_code'),
    type: COLUMN_TYPE.TEXT
  }), stryMutAct_9fa48("33147") ? {} : (stryCov_9fa48("33147"), {
    name: stryMutAct_9fa48("33148") ? "" : (stryCov_9fa48("33148"), 'created_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33149") ? false : (stryCov_9fa48("33149"), true)
  }), stryMutAct_9fa48("33150") ? {} : (stryCov_9fa48("33150"), {
    name: stryMutAct_9fa48("33151") ? "" : (stryCov_9fa48("33151"), 'updated_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33152") ? false : (stryCov_9fa48("33152"), true)
  }), stryMutAct_9fa48("33153") ? {} : (stryCov_9fa48("33153"), {
    name: stryMutAct_9fa48("33154") ? "" : (stryCov_9fa48("33154"), 'expires_at'),
    type: COLUMN_TYPE.INTEGER,
    notNull: stryMutAct_9fa48("33155") ? false : (stryCov_9fa48("33155"), true)
  }), stryMutAct_9fa48("33156") ? {} : (stryCov_9fa48("33156"), {
    name: stryMutAct_9fa48("33157") ? "" : (stryCov_9fa48("33157"), 'released_at'),
    type: COLUMN_TYPE.INTEGER
  })]),
  indices: stryMutAct_9fa48("33158") ? [] : (stryCov_9fa48("33158"), [stryMutAct_9fa48("33159") ? {} : (stryCov_9fa48("33159"), {
    name: stryMutAct_9fa48("33160") ? "" : (stryCov_9fa48("33160"), 'idx_storage_res_node_status'),
    columns: stryMutAct_9fa48("33161") ? [] : (stryCov_9fa48("33161"), [stryMutAct_9fa48("33162") ? "" : (stryCov_9fa48("33162"), 'target_node_id'), stryMutAct_9fa48("33163") ? "" : (stryCov_9fa48("33163"), 'status')])
  }), stryMutAct_9fa48("33164") ? {} : (stryCov_9fa48("33164"), {
    name: stryMutAct_9fa48("33165") ? "" : (stryCov_9fa48("33165"), 'idx_storage_res_operation'),
    columns: stryMutAct_9fa48("33166") ? [] : (stryCov_9fa48("33166"), [stryMutAct_9fa48("33167") ? "" : (stryCov_9fa48("33167"), 'operation_id')])
  }), stryMutAct_9fa48("33168") ? {} : (stryCov_9fa48("33168"), {
    name: stryMutAct_9fa48("33169") ? "" : (stryCov_9fa48("33169"), 'idx_storage_res_entity_status'),
    columns: stryMutAct_9fa48("33170") ? [] : (stryCov_9fa48("33170"), [stryMutAct_9fa48("33171") ? "" : (stryCov_9fa48("33171"), 'entity_type'), stryMutAct_9fa48("33172") ? "" : (stryCov_9fa48("33172"), 'entity_id'), stryMutAct_9fa48("33173") ? "" : (stryCov_9fa48("33173"), 'status')])
  }), stryMutAct_9fa48("33174") ? {} : (stryCov_9fa48("33174"), {
    name: stryMutAct_9fa48("33175") ? "" : (stryCov_9fa48("33175"), 'idx_storage_res_expires_status'),
    columns: stryMutAct_9fa48("33176") ? [] : (stryCov_9fa48("33176"), [stryMutAct_9fa48("33177") ? "" : (stryCov_9fa48("33177"), 'expires_at'), stryMutAct_9fa48("33178") ? "" : (stryCov_9fa48("33178"), 'status')])
  })])
});

/**
 * All system table schemas in creation order.
 * Order matters for foreign key dependencies.
 */
const SYSTEM_TABLE_SCHEMAS = stryMutAct_9fa48("33179") ? [] : (stryCov_9fa48("33179"), [TABLES_SCHEMA, NODES_SCHEMA, LATENCY_GROUPS_SCHEMA, INTER_GROUP_LATENCIES_SCHEMA, MESSAGE_GROUPS_SCHEMA, PARTITIONS_SCHEMA, SERVICES_SCHEMA, INDICES_SCHEMA, LOGS_SCHEMA, CONFIG_SCHEMA, LIVE_QUERIES_SCHEMA, CONTEXTS_SCHEMA, CODE_SCHEMA, CONTROL_PLANE_PUBLICATIONS_SCHEMA, REPLICA_OPERATIONS_SCHEMA, NODE_ENDPOINTS_SCHEMA, SERVICE_DEFINITIONS_SCHEMA, SERVICE_ENDPOINTS_SCHEMA, SERVICE_TIMERS_SCHEMA, MODULE_MANIFESTS_SCHEMA, PACKAGE_REGISTRY_MAPPINGS_SCHEMA, PACKAGE_REGISTRY_OVERRIDES_SCHEMA, MODULE_DEPENDENCY_LOCKS_SCHEMA, WASM_OPERATIONS_SCHEMA, SQL_TRANSACTIONS_SCHEMA, SQL_TRANSACTION_PARTICIPANTS_SCHEMA, SQL_WRITE_OPERATIONS_SCHEMA, SCHEMA_MIGRATIONS_SCHEMA, SCHEMA_MIGRATION_PARTITIONS_SCHEMA, DEBUG_SESSIONS_SCHEMA, DEBUG_BREAKPOINTS_SCHEMA, DEBUG_SNAPSHOTS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA]);

/**
 * Pre-assigned IDs for initial system table partitions.
 * These avoid circular dependencies during bootstrap.
 */
const INITIAL_PARTITION_IDS = stryMutAct_9fa48("33180") ? {} : (stryCov_9fa48("33180"), {
  [SYSTEM_TABLE_NAME.TABLES]: stryMutAct_9fa48("33181") ? "" : (stryCov_9fa48("33181"), 'tables-p1'),
  [SYSTEM_TABLE_NAME.PARTITIONS]: stryMutAct_9fa48("33182") ? "" : (stryCov_9fa48("33182"), 'partitions-p1'),
  [SYSTEM_TABLE_NAME.INDICES]: stryMutAct_9fa48("33183") ? "" : (stryCov_9fa48("33183"), 'indices-p1'),
  [SYSTEM_TABLE_NAME.MESSAGE_GROUPS]: stryMutAct_9fa48("33184") ? "" : (stryCov_9fa48("33184"), 'message_groups-p1'),
  [SYSTEM_TABLE_NAME.NODES]: stryMutAct_9fa48("33185") ? "" : (stryCov_9fa48("33185"), 'nodes-p1'),
  [SYSTEM_TABLE_NAME.SERVICES]: stryMutAct_9fa48("33186") ? "" : (stryCov_9fa48("33186"), 'services-p1'),
  [SYSTEM_TABLE_NAME.LOGS]: stryMutAct_9fa48("33187") ? "" : (stryCov_9fa48("33187"), 'logs-p1'),
  [SYSTEM_TABLE_NAME.CONFIG]: stryMutAct_9fa48("33188") ? "" : (stryCov_9fa48("33188"), 'config-p1'),
  [SYSTEM_TABLE_NAME.LIVE_QUERIES]: stryMutAct_9fa48("33189") ? "" : (stryCov_9fa48("33189"), 'live_queries-p1'),
  [SYSTEM_TABLE_NAME.CONTEXTS]: stryMutAct_9fa48("33190") ? "" : (stryCov_9fa48("33190"), 'contexts-p1'),
  [SYSTEM_TABLE_NAME.CODE]: stryMutAct_9fa48("33191") ? "" : (stryCov_9fa48("33191"), 'code-p1'),
  [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]: stryMutAct_9fa48("33192") ? "" : (stryCov_9fa48("33192"), 'control_plane_publications-p1'),
  [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: stryMutAct_9fa48("33193") ? "" : (stryCov_9fa48("33193"), 'replica_operations-p1'),
  [SYSTEM_TABLE_NAME.NODE_ENDPOINTS]: stryMutAct_9fa48("33194") ? "" : (stryCov_9fa48("33194"), 'node_endpoints-p1'),
  [SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS]: stryMutAct_9fa48("33195") ? "" : (stryCov_9fa48("33195"), 'service_definitions-p1'),
  [SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS]: stryMutAct_9fa48("33196") ? "" : (stryCov_9fa48("33196"), 'service_endpoints-p1'),
  [SYSTEM_TABLE_NAME.SERVICE_TIMERS]: stryMutAct_9fa48("33197") ? "" : (stryCov_9fa48("33197"), 'service_timers-p1'),
  [SYSTEM_TABLE_NAME.MODULE_MANIFESTS]: stryMutAct_9fa48("33198") ? "" : (stryCov_9fa48("33198"), 'module_manifests-p1'),
  [SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_MAPPINGS]: stryMutAct_9fa48("33199") ? "" : (stryCov_9fa48("33199"), 'package_registry_mappings-p1'),
  [SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_OVERRIDES]: stryMutAct_9fa48("33200") ? "" : (stryCov_9fa48("33200"), 'package_registry_overrides-p1'),
  [SYSTEM_TABLE_NAME.MODULE_DEPENDENCY_LOCKS]: stryMutAct_9fa48("33201") ? "" : (stryCov_9fa48("33201"), 'module_dependency_locks-p1'),
  [SYSTEM_TABLE_NAME.WASM_OPERATIONS]: stryMutAct_9fa48("33202") ? "" : (stryCov_9fa48("33202"), 'wasm_operations-p1'),
  [SYSTEM_TABLE_NAME.SQL_TRANSACTIONS]: stryMutAct_9fa48("33203") ? "" : (stryCov_9fa48("33203"), 'sql_transactions-p1'),
  [SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS]: stryMutAct_9fa48("33204") ? "" : (stryCov_9fa48("33204"), 'sql_transaction_participants-p1'),
  [SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS]: stryMutAct_9fa48("33205") ? "" : (stryCov_9fa48("33205"), 'sql_write_operations-p1'),
  [SYSTEM_TABLE_NAME.SCHEMA_MIGRATIONS]: stryMutAct_9fa48("33206") ? "" : (stryCov_9fa48("33206"), 'schema_migrations-p1'),
  [SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS]: stryMutAct_9fa48("33207") ? "" : (stryCov_9fa48("33207"), 'schema_migration_partitions-p1'),
  [SYSTEM_TABLE_NAME.DEBUG_SESSIONS]: stryMutAct_9fa48("33208") ? "" : (stryCov_9fa48("33208"), 'debug_sessions-p1'),
  [SYSTEM_TABLE_NAME.DEBUG_BREAKPOINTS]: stryMutAct_9fa48("33209") ? "" : (stryCov_9fa48("33209"), 'debug_breakpoints-p1'),
  [SYSTEM_TABLE_NAME.DEBUG_SNAPSHOTS]: stryMutAct_9fa48("33210") ? "" : (stryCov_9fa48("33210"), 'debug_snapshots-p1'),
  [SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS]: stryMutAct_9fa48("33211") ? "" : (stryCov_9fa48("33211"), 'storage_reservations-p1'),
  [SYSTEM_TABLE_NAME.LATENCY_GROUPS]: stryMutAct_9fa48("33212") ? "" : (stryCov_9fa48("33212"), 'latency_groups-p1'),
  [SYSTEM_TABLE_NAME.INTER_GROUP_LATENCIES]: stryMutAct_9fa48("33213") ? "" : (stryCov_9fa48("33213"), 'inter_group_latencies-p1')
});
const PRIORITY_CONTROL_PLANE_PARTITION_IDS = new Set(stryMutAct_9fa48("33214") ? [] : (stryCov_9fa48("33214"), [INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS], INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS], INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTIONS], INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS], INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS]]));

/**
 * Pre-assigned replica IDs for initial system table partitions.
 * Each partition has 3 replicas on the seed node.
 */
const INITIAL_REPLICA_IDS = stryMutAct_9fa48("33215") ? {} : (stryCov_9fa48("33215"), {
  [SYSTEM_TABLE_NAME.TABLES]: stryMutAct_9fa48("33216") ? [] : (stryCov_9fa48("33216"), [stryMutAct_9fa48("33217") ? "" : (stryCov_9fa48("33217"), 'tables-p1-r1'), stryMutAct_9fa48("33218") ? "" : (stryCov_9fa48("33218"), 'tables-p1-r2'), stryMutAct_9fa48("33219") ? "" : (stryCov_9fa48("33219"), 'tables-p1-r3')]),
  [SYSTEM_TABLE_NAME.PARTITIONS]: stryMutAct_9fa48("33220") ? [] : (stryCov_9fa48("33220"), [stryMutAct_9fa48("33221") ? "" : (stryCov_9fa48("33221"), 'partitions-p1-r1'), stryMutAct_9fa48("33222") ? "" : (stryCov_9fa48("33222"), 'partitions-p1-r2'), stryMutAct_9fa48("33223") ? "" : (stryCov_9fa48("33223"), 'partitions-p1-r3')]),
  [SYSTEM_TABLE_NAME.INDICES]: stryMutAct_9fa48("33224") ? [] : (stryCov_9fa48("33224"), [stryMutAct_9fa48("33225") ? "" : (stryCov_9fa48("33225"), 'indices-p1-r1'), stryMutAct_9fa48("33226") ? "" : (stryCov_9fa48("33226"), 'indices-p1-r2'), stryMutAct_9fa48("33227") ? "" : (stryCov_9fa48("33227"), 'indices-p1-r3')]),
  [SYSTEM_TABLE_NAME.MESSAGE_GROUPS]: stryMutAct_9fa48("33228") ? [] : (stryCov_9fa48("33228"), [stryMutAct_9fa48("33229") ? "" : (stryCov_9fa48("33229"), 'message_groups-p1-r1'), stryMutAct_9fa48("33230") ? "" : (stryCov_9fa48("33230"), 'message_groups-p1-r2'), stryMutAct_9fa48("33231") ? "" : (stryCov_9fa48("33231"), 'message_groups-p1-r3')]),
  [SYSTEM_TABLE_NAME.NODES]: stryMutAct_9fa48("33232") ? [] : (stryCov_9fa48("33232"), [stryMutAct_9fa48("33233") ? "" : (stryCov_9fa48("33233"), 'nodes-p1-r1'), stryMutAct_9fa48("33234") ? "" : (stryCov_9fa48("33234"), 'nodes-p1-r2'), stryMutAct_9fa48("33235") ? "" : (stryCov_9fa48("33235"), 'nodes-p1-r3')]),
  [SYSTEM_TABLE_NAME.SERVICES]: stryMutAct_9fa48("33236") ? [] : (stryCov_9fa48("33236"), [stryMutAct_9fa48("33237") ? "" : (stryCov_9fa48("33237"), 'services-p1-r1'), stryMutAct_9fa48("33238") ? "" : (stryCov_9fa48("33238"), 'services-p1-r2'), stryMutAct_9fa48("33239") ? "" : (stryCov_9fa48("33239"), 'services-p1-r3')]),
  [SYSTEM_TABLE_NAME.LOGS]: stryMutAct_9fa48("33240") ? [] : (stryCov_9fa48("33240"), [stryMutAct_9fa48("33241") ? "" : (stryCov_9fa48("33241"), 'logs-p1-r1'), stryMutAct_9fa48("33242") ? "" : (stryCov_9fa48("33242"), 'logs-p1-r2'), stryMutAct_9fa48("33243") ? "" : (stryCov_9fa48("33243"), 'logs-p1-r3')]),
  [SYSTEM_TABLE_NAME.CONFIG]: stryMutAct_9fa48("33244") ? [] : (stryCov_9fa48("33244"), [stryMutAct_9fa48("33245") ? "" : (stryCov_9fa48("33245"), 'config-p1-r1'), stryMutAct_9fa48("33246") ? "" : (stryCov_9fa48("33246"), 'config-p1-r2'), stryMutAct_9fa48("33247") ? "" : (stryCov_9fa48("33247"), 'config-p1-r3')]),
  [SYSTEM_TABLE_NAME.LIVE_QUERIES]: stryMutAct_9fa48("33248") ? [] : (stryCov_9fa48("33248"), [stryMutAct_9fa48("33249") ? "" : (stryCov_9fa48("33249"), 'live_queries-p1-r1'), stryMutAct_9fa48("33250") ? "" : (stryCov_9fa48("33250"), 'live_queries-p1-r2'), stryMutAct_9fa48("33251") ? "" : (stryCov_9fa48("33251"), 'live_queries-p1-r3')]),
  [SYSTEM_TABLE_NAME.CONTEXTS]: stryMutAct_9fa48("33252") ? [] : (stryCov_9fa48("33252"), [stryMutAct_9fa48("33253") ? "" : (stryCov_9fa48("33253"), 'contexts-p1-r1'), stryMutAct_9fa48("33254") ? "" : (stryCov_9fa48("33254"), 'contexts-p1-r2'), stryMutAct_9fa48("33255") ? "" : (stryCov_9fa48("33255"), 'contexts-p1-r3')]),
  [SYSTEM_TABLE_NAME.CODE]: stryMutAct_9fa48("33256") ? [] : (stryCov_9fa48("33256"), [stryMutAct_9fa48("33257") ? "" : (stryCov_9fa48("33257"), 'code-p1-r1'), stryMutAct_9fa48("33258") ? "" : (stryCov_9fa48("33258"), 'code-p1-r2'), stryMutAct_9fa48("33259") ? "" : (stryCov_9fa48("33259"), 'code-p1-r3')]),
  [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]: stryMutAct_9fa48("33260") ? [] : (stryCov_9fa48("33260"), [stryMutAct_9fa48("33261") ? "" : (stryCov_9fa48("33261"), 'control_plane_publications-p1-r1'), stryMutAct_9fa48("33262") ? "" : (stryCov_9fa48("33262"), 'control_plane_publications-p1-r2'), stryMutAct_9fa48("33263") ? "" : (stryCov_9fa48("33263"), 'control_plane_publications-p1-r3')]),
  [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: stryMutAct_9fa48("33264") ? [] : (stryCov_9fa48("33264"), [stryMutAct_9fa48("33265") ? "" : (stryCov_9fa48("33265"), 'replica_operations-p1-r1'), stryMutAct_9fa48("33266") ? "" : (stryCov_9fa48("33266"), 'replica_operations-p1-r2'), stryMutAct_9fa48("33267") ? "" : (stryCov_9fa48("33267"), 'replica_operations-p1-r3')]),
  [SYSTEM_TABLE_NAME.NODE_ENDPOINTS]: stryMutAct_9fa48("33268") ? [] : (stryCov_9fa48("33268"), [stryMutAct_9fa48("33269") ? "" : (stryCov_9fa48("33269"), 'node_endpoints-p1-r1'), stryMutAct_9fa48("33270") ? "" : (stryCov_9fa48("33270"), 'node_endpoints-p1-r2'), stryMutAct_9fa48("33271") ? "" : (stryCov_9fa48("33271"), 'node_endpoints-p1-r3')]),
  [SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS]: stryMutAct_9fa48("33272") ? [] : (stryCov_9fa48("33272"), [stryMutAct_9fa48("33273") ? "" : (stryCov_9fa48("33273"), 'service_definitions-p1-r1'), stryMutAct_9fa48("33274") ? "" : (stryCov_9fa48("33274"), 'service_definitions-p1-r2'), stryMutAct_9fa48("33275") ? "" : (stryCov_9fa48("33275"), 'service_definitions-p1-r3')]),
  [SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS]: stryMutAct_9fa48("33276") ? [] : (stryCov_9fa48("33276"), [stryMutAct_9fa48("33277") ? "" : (stryCov_9fa48("33277"), 'service_endpoints-p1-r1'), stryMutAct_9fa48("33278") ? "" : (stryCov_9fa48("33278"), 'service_endpoints-p1-r2'), stryMutAct_9fa48("33279") ? "" : (stryCov_9fa48("33279"), 'service_endpoints-p1-r3')]),
  [SYSTEM_TABLE_NAME.SERVICE_TIMERS]: stryMutAct_9fa48("33280") ? [] : (stryCov_9fa48("33280"), [stryMutAct_9fa48("33281") ? "" : (stryCov_9fa48("33281"), 'service_timers-p1-r1'), stryMutAct_9fa48("33282") ? "" : (stryCov_9fa48("33282"), 'service_timers-p1-r2'), stryMutAct_9fa48("33283") ? "" : (stryCov_9fa48("33283"), 'service_timers-p1-r3')]),
  [SYSTEM_TABLE_NAME.MODULE_MANIFESTS]: stryMutAct_9fa48("33284") ? [] : (stryCov_9fa48("33284"), [stryMutAct_9fa48("33285") ? "" : (stryCov_9fa48("33285"), 'module_manifests-p1-r1'), stryMutAct_9fa48("33286") ? "" : (stryCov_9fa48("33286"), 'module_manifests-p1-r2'), stryMutAct_9fa48("33287") ? "" : (stryCov_9fa48("33287"), 'module_manifests-p1-r3')]),
  [SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_MAPPINGS]: stryMutAct_9fa48("33288") ? [] : (stryCov_9fa48("33288"), [stryMutAct_9fa48("33289") ? "" : (stryCov_9fa48("33289"), 'package_registry_mappings-p1-r1'), stryMutAct_9fa48("33290") ? "" : (stryCov_9fa48("33290"), 'package_registry_mappings-p1-r2'), stryMutAct_9fa48("33291") ? "" : (stryCov_9fa48("33291"), 'package_registry_mappings-p1-r3')]),
  [SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_OVERRIDES]: stryMutAct_9fa48("33292") ? [] : (stryCov_9fa48("33292"), [stryMutAct_9fa48("33293") ? "" : (stryCov_9fa48("33293"), 'package_registry_overrides-p1-r1'), stryMutAct_9fa48("33294") ? "" : (stryCov_9fa48("33294"), 'package_registry_overrides-p1-r2'), stryMutAct_9fa48("33295") ? "" : (stryCov_9fa48("33295"), 'package_registry_overrides-p1-r3')]),
  [SYSTEM_TABLE_NAME.MODULE_DEPENDENCY_LOCKS]: stryMutAct_9fa48("33296") ? [] : (stryCov_9fa48("33296"), [stryMutAct_9fa48("33297") ? "" : (stryCov_9fa48("33297"), 'module_dependency_locks-p1-r1'), stryMutAct_9fa48("33298") ? "" : (stryCov_9fa48("33298"), 'module_dependency_locks-p1-r2'), stryMutAct_9fa48("33299") ? "" : (stryCov_9fa48("33299"), 'module_dependency_locks-p1-r3')]),
  [SYSTEM_TABLE_NAME.WASM_OPERATIONS]: stryMutAct_9fa48("33300") ? [] : (stryCov_9fa48("33300"), [stryMutAct_9fa48("33301") ? "" : (stryCov_9fa48("33301"), 'wasm_operations-p1-r1'), stryMutAct_9fa48("33302") ? "" : (stryCov_9fa48("33302"), 'wasm_operations-p1-r2'), stryMutAct_9fa48("33303") ? "" : (stryCov_9fa48("33303"), 'wasm_operations-p1-r3')]),
  [SYSTEM_TABLE_NAME.SQL_TRANSACTIONS]: stryMutAct_9fa48("33304") ? [] : (stryCov_9fa48("33304"), [stryMutAct_9fa48("33305") ? "" : (stryCov_9fa48("33305"), 'sql_transactions-p1-r1'), stryMutAct_9fa48("33306") ? "" : (stryCov_9fa48("33306"), 'sql_transactions-p1-r2'), stryMutAct_9fa48("33307") ? "" : (stryCov_9fa48("33307"), 'sql_transactions-p1-r3')]),
  [SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS]: stryMutAct_9fa48("33308") ? [] : (stryCov_9fa48("33308"), [stryMutAct_9fa48("33309") ? "" : (stryCov_9fa48("33309"), 'sql_transaction_participants-p1-r1'), stryMutAct_9fa48("33310") ? "" : (stryCov_9fa48("33310"), 'sql_transaction_participants-p1-r2'), stryMutAct_9fa48("33311") ? "" : (stryCov_9fa48("33311"), 'sql_transaction_participants-p1-r3')]),
  [SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS]: stryMutAct_9fa48("33312") ? [] : (stryCov_9fa48("33312"), [stryMutAct_9fa48("33313") ? "" : (stryCov_9fa48("33313"), 'sql_write_operations-p1-r1'), stryMutAct_9fa48("33314") ? "" : (stryCov_9fa48("33314"), 'sql_write_operations-p1-r2'), stryMutAct_9fa48("33315") ? "" : (stryCov_9fa48("33315"), 'sql_write_operations-p1-r3')]),
  [SYSTEM_TABLE_NAME.SCHEMA_MIGRATIONS]: stryMutAct_9fa48("33316") ? [] : (stryCov_9fa48("33316"), [stryMutAct_9fa48("33317") ? "" : (stryCov_9fa48("33317"), 'schema_migrations-p1-r1'), stryMutAct_9fa48("33318") ? "" : (stryCov_9fa48("33318"), 'schema_migrations-p1-r2'), stryMutAct_9fa48("33319") ? "" : (stryCov_9fa48("33319"), 'schema_migrations-p1-r3')]),
  [SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS]: stryMutAct_9fa48("33320") ? [] : (stryCov_9fa48("33320"), [stryMutAct_9fa48("33321") ? "" : (stryCov_9fa48("33321"), 'schema_migration_partitions-p1-r1'), stryMutAct_9fa48("33322") ? "" : (stryCov_9fa48("33322"), 'schema_migration_partitions-p1-r2'), stryMutAct_9fa48("33323") ? "" : (stryCov_9fa48("33323"), 'schema_migration_partitions-p1-r3')]),
  [SYSTEM_TABLE_NAME.DEBUG_SESSIONS]: stryMutAct_9fa48("33324") ? [] : (stryCov_9fa48("33324"), [stryMutAct_9fa48("33325") ? "" : (stryCov_9fa48("33325"), 'debug_sessions-p1-r1'), stryMutAct_9fa48("33326") ? "" : (stryCov_9fa48("33326"), 'debug_sessions-p1-r2'), stryMutAct_9fa48("33327") ? "" : (stryCov_9fa48("33327"), 'debug_sessions-p1-r3')]),
  [SYSTEM_TABLE_NAME.DEBUG_BREAKPOINTS]: stryMutAct_9fa48("33328") ? [] : (stryCov_9fa48("33328"), [stryMutAct_9fa48("33329") ? "" : (stryCov_9fa48("33329"), 'debug_breakpoints-p1-r1'), stryMutAct_9fa48("33330") ? "" : (stryCov_9fa48("33330"), 'debug_breakpoints-p1-r2'), stryMutAct_9fa48("33331") ? "" : (stryCov_9fa48("33331"), 'debug_breakpoints-p1-r3')]),
  [SYSTEM_TABLE_NAME.DEBUG_SNAPSHOTS]: stryMutAct_9fa48("33332") ? [] : (stryCov_9fa48("33332"), [stryMutAct_9fa48("33333") ? "" : (stryCov_9fa48("33333"), 'debug_snapshots-p1-r1'), stryMutAct_9fa48("33334") ? "" : (stryCov_9fa48("33334"), 'debug_snapshots-p1-r2'), stryMutAct_9fa48("33335") ? "" : (stryCov_9fa48("33335"), 'debug_snapshots-p1-r3')]),
  [SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS]: stryMutAct_9fa48("33336") ? [] : (stryCov_9fa48("33336"), [stryMutAct_9fa48("33337") ? "" : (stryCov_9fa48("33337"), 'storage_reservations-p1-r1'), stryMutAct_9fa48("33338") ? "" : (stryCov_9fa48("33338"), 'storage_reservations-p1-r2'), stryMutAct_9fa48("33339") ? "" : (stryCov_9fa48("33339"), 'storage_reservations-p1-r3')]),
  [SYSTEM_TABLE_NAME.LATENCY_GROUPS]: stryMutAct_9fa48("33340") ? [] : (stryCov_9fa48("33340"), [stryMutAct_9fa48("33341") ? "" : (stryCov_9fa48("33341"), 'latency_groups-p1-r1'), stryMutAct_9fa48("33342") ? "" : (stryCov_9fa48("33342"), 'latency_groups-p1-r2'), stryMutAct_9fa48("33343") ? "" : (stryCov_9fa48("33343"), 'latency_groups-p1-r3')]),
  [SYSTEM_TABLE_NAME.INTER_GROUP_LATENCIES]: stryMutAct_9fa48("33344") ? [] : (stryCov_9fa48("33344"), [stryMutAct_9fa48("33345") ? "" : (stryCov_9fa48("33345"), 'inter_group_latencies-p1-r1'), stryMutAct_9fa48("33346") ? "" : (stryCov_9fa48("33346"), 'inter_group_latencies-p1-r2'), stryMutAct_9fa48("33347") ? "" : (stryCov_9fa48("33347"), 'inter_group_latencies-p1-r3')])
});

/**
 * Initial message group ID for seed node.
 */
const INITIAL_MESSAGE_GROUP_ID = stryMutAct_9fa48("33348") ? "" : (stryCov_9fa48("33348"), 'mg-1');

/**
 * Initial message group replica IDs for seed node.
 */
const INITIAL_MESSAGE_GROUP_REPLICA_IDS = stryMutAct_9fa48("33349") ? [] : (stryCov_9fa48("33349"), [stryMutAct_9fa48("33350") ? "" : (stryCov_9fa48("33350"), 'mg-1-r1'), stryMutAct_9fa48("33351") ? "" : (stryCov_9fa48("33351"), 'mg-1-r2'), stryMutAct_9fa48("33352") ? "" : (stryCov_9fa48("33352"), 'mg-1-r3')]);

/**
 * Generate SQL CREATE TABLE statement from schema.
 * @param {Object} schema - Table schema definition.
 * @return {string} SQL CREATE TABLE statement.
 */
function generateCreateTableSQL(schema) {
  if (stryMutAct_9fa48("33353")) {
    {}
  } else {
    stryCov_9fa48("33353");
    const columnDefs = schema.columns.map(col => {
      if (stryMutAct_9fa48("33354")) {
        {}
      } else {
        stryCov_9fa48("33354");
        let def = stryMutAct_9fa48("33355") ? `` : (stryCov_9fa48("33355"), `${col.name} ${col.type}`);
        if (stryMutAct_9fa48("33357") ? false : stryMutAct_9fa48("33356") ? true : (stryCov_9fa48("33356", "33357"), col.primaryKey)) {
          if (stryMutAct_9fa48("33358")) {
            {}
          } else {
            stryCov_9fa48("33358");
            def += stryMutAct_9fa48("33359") ? "" : (stryCov_9fa48("33359"), ' PRIMARY KEY');
          }
        }
        if (stryMutAct_9fa48("33361") ? false : stryMutAct_9fa48("33360") ? true : (stryCov_9fa48("33360", "33361"), col.notNull)) {
          if (stryMutAct_9fa48("33362")) {
            {}
          } else {
            stryCov_9fa48("33362");
            def += stryMutAct_9fa48("33363") ? "" : (stryCov_9fa48("33363"), ' NOT NULL');
          }
        }
        if (stryMutAct_9fa48("33365") ? false : stryMutAct_9fa48("33364") ? true : (stryCov_9fa48("33364", "33365"), col.unique)) {
          if (stryMutAct_9fa48("33366")) {
            {}
          } else {
            stryCov_9fa48("33366");
            def += stryMutAct_9fa48("33367") ? "" : (stryCov_9fa48("33367"), ' UNIQUE');
          }
        }
        if (stryMutAct_9fa48("33370") ? col.defaultValue === undefined : stryMutAct_9fa48("33369") ? false : stryMutAct_9fa48("33368") ? true : (stryCov_9fa48("33368", "33369", "33370"), col.defaultValue !== undefined)) {
          if (stryMutAct_9fa48("33371")) {
            {}
          } else {
            stryCov_9fa48("33371");
            def += stryMutAct_9fa48("33372") ? `` : (stryCov_9fa48("33372"), ` DEFAULT ${col.defaultValue}`);
          }
        }
        return def;
      }
    }).join(stryMutAct_9fa48("33373") ? "" : (stryCov_9fa48("33373"), ', '));
    let sql = stryMutAct_9fa48("33374") ? `` : (stryCov_9fa48("33374"), `CREATE TABLE IF NOT EXISTS ${schema.tableName} (${columnDefs}`);
    if (stryMutAct_9fa48("33377") ? schema.primaryKey || schema.primaryKey.length > 0 : stryMutAct_9fa48("33376") ? false : stryMutAct_9fa48("33375") ? true : (stryCov_9fa48("33375", "33376", "33377"), schema.primaryKey && (stryMutAct_9fa48("33380") ? schema.primaryKey.length <= 0 : stryMutAct_9fa48("33379") ? schema.primaryKey.length >= 0 : stryMutAct_9fa48("33378") ? true : (stryCov_9fa48("33378", "33379", "33380"), schema.primaryKey.length > 0)))) {
      if (stryMutAct_9fa48("33381")) {
        {}
      } else {
        stryCov_9fa48("33381");
        const pkCols = schema.primaryKey.join(stryMutAct_9fa48("33382") ? "" : (stryCov_9fa48("33382"), ', '));
        sql += stryMutAct_9fa48("33383") ? `` : (stryCov_9fa48("33383"), `, PRIMARY KEY (${pkCols})`);
      }
    }
    sql += stryMutAct_9fa48("33384") ? "" : (stryCov_9fa48("33384"), ')');
    return sql;
  }
}

/**
 * Generate SQL CREATE INDEX statements from schema.
 * @param {Object} schema - Table schema definition.
 * @return {Array<string>} Array of SQL CREATE INDEX statements.
 */
function generateCreateIndexSQL(schema) {
  if (stryMutAct_9fa48("33385")) {
    {}
  } else {
    stryCov_9fa48("33385");
    if (stryMutAct_9fa48("33388") ? !schema.indices && schema.indices.length === 0 : stryMutAct_9fa48("33387") ? false : stryMutAct_9fa48("33386") ? true : (stryCov_9fa48("33386", "33387", "33388"), (stryMutAct_9fa48("33389") ? schema.indices : (stryCov_9fa48("33389"), !schema.indices)) || (stryMutAct_9fa48("33391") ? schema.indices.length !== 0 : stryMutAct_9fa48("33390") ? false : (stryCov_9fa48("33390", "33391"), schema.indices.length === 0)))) {
      if (stryMutAct_9fa48("33392")) {
        {}
      } else {
        stryCov_9fa48("33392");
        return stryMutAct_9fa48("33393") ? ["Stryker was here"] : (stryCov_9fa48("33393"), []);
      }
    }
    return schema.indices.map(idx => {
      if (stryMutAct_9fa48("33394")) {
        {}
      } else {
        stryCov_9fa48("33394");
        const columns = idx.columns.join(stryMutAct_9fa48("33395") ? "" : (stryCov_9fa48("33395"), ', '));
        return stryMutAct_9fa48("33396") ? `` : (stryCov_9fa48("33396"), `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${schema.tableName}(${columns})`);
      }
    });
  }
}

/**
 * Get schema by table name.
 * @param {string} tableName - Table name.
 * @return {Object|null} Schema or null if not found.
 */
function getSchemaByTableName(tableName) {
  if (stryMutAct_9fa48("33397")) {
    {}
  } else {
    stryCov_9fa48("33397");
    return stryMutAct_9fa48("33400") ? SYSTEM_TABLE_SCHEMAS.find(s => s.tableName === tableName) && null : stryMutAct_9fa48("33399") ? false : stryMutAct_9fa48("33398") ? true : (stryCov_9fa48("33398", "33399", "33400"), SYSTEM_TABLE_SCHEMAS.find(stryMutAct_9fa48("33401") ? () => undefined : (stryCov_9fa48("33401"), s => stryMutAct_9fa48("33404") ? s.tableName !== tableName : stryMutAct_9fa48("33403") ? false : stryMutAct_9fa48("33402") ? true : (stryCov_9fa48("33402", "33403", "33404"), s.tableName === tableName))) || null);
  }
}

/**
 * Get partition ID for a system table.
 * @param {string} tableName - Table name.
 * @return {string|null} Partition ID or null if not found.
 */
function getInitialPartitionId(tableName) {
  if (stryMutAct_9fa48("33405")) {
    {}
  } else {
    stryCov_9fa48("33405");
    return stryMutAct_9fa48("33408") ? INITIAL_PARTITION_IDS[tableName] && null : stryMutAct_9fa48("33407") ? false : stryMutAct_9fa48("33406") ? true : (stryCov_9fa48("33406", "33407", "33408"), INITIAL_PARTITION_IDS[tableName] || null);
  }
}

/**
 * Get replica IDs for a system table partition.
 * @param {string} tableName - Table name.
 * @return {Array<string>|null} Replica IDs or null if not found.
 */
function getInitialReplicaIds(tableName) {
  if (stryMutAct_9fa48("33409")) {
    {}
  } else {
    stryCov_9fa48("33409");
    return stryMutAct_9fa48("33412") ? INITIAL_REPLICA_IDS[tableName] && null : stryMutAct_9fa48("33411") ? false : stryMutAct_9fa48("33410") ? true : (stryCov_9fa48("33410", "33411", "33412"), INITIAL_REPLICA_IDS[tableName] || null);
  }
}
export { COLUMN_TYPE, SYSTEM_TABLE_NAME, TABLES_SCHEMA, PARTITIONS_SCHEMA, INDICES_SCHEMA, MESSAGE_GROUPS_SCHEMA, NODES_SCHEMA, LATENCY_GROUPS_SCHEMA, INTER_GROUP_LATENCIES_SCHEMA, SERVICES_SCHEMA, LOGS_SCHEMA, CONFIG_SCHEMA, LIVE_QUERIES_SCHEMA, CONTEXTS_SCHEMA, CODE_SCHEMA, CONTROL_PLANE_PUBLICATIONS_SCHEMA, REPLICA_OPERATIONS_SCHEMA, NODE_ENDPOINTS_SCHEMA, SERVICE_DEFINITIONS_SCHEMA, SERVICE_ENDPOINTS_SCHEMA, SERVICE_TIMERS_SCHEMA, MODULE_MANIFESTS_SCHEMA, PACKAGE_REGISTRY_MAPPINGS_SCHEMA, PACKAGE_REGISTRY_OVERRIDES_SCHEMA, MODULE_DEPENDENCY_LOCKS_SCHEMA, WASM_OPERATIONS_SCHEMA, SQL_TRANSACTIONS_SCHEMA, SQL_TRANSACTION_PARTICIPANTS_SCHEMA, SQL_WRITE_OPERATIONS_SCHEMA, SCHEMA_MIGRATIONS_SCHEMA, SCHEMA_MIGRATION_PARTITIONS_SCHEMA, DEBUG_SESSIONS_SCHEMA, DEBUG_BREAKPOINTS_SCHEMA, DEBUG_SNAPSHOTS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA, SYSTEM_TABLE_SCHEMAS, INITIAL_PARTITION_IDS, PRIORITY_CONTROL_PLANE_PARTITION_IDS, INITIAL_REPLICA_IDS, INITIAL_MESSAGE_GROUP_ID, INITIAL_MESSAGE_GROUP_REPLICA_IDS, generateCreateTableSQL, generateCreateIndexSQL, getSchemaByTableName, getInitialPartitionId, getInitialReplicaIds };