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
import { CDC_OPERATION, NUM } from '../constants/index.js';
const CDC_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("35281") ? {} : (stryCov_9fa48("35281"), {
  INTEGRATION: stryMutAct_9fa48("35282") ? "" : (stryCov_9fa48("35282"), 'cdc-integration')
}));
const CDC_EVENT = Object.freeze(stryMutAct_9fa48("35283") ? {} : (stryCov_9fa48("35283"), {
  INSERT: stryMutAct_9fa48("35284") ? "" : (stryCov_9fa48("35284"), 'insert'),
  UPDATE: stryMutAct_9fa48("35285") ? "" : (stryCov_9fa48("35285"), 'update'),
  DELETE: stryMutAct_9fa48("35286") ? "" : (stryCov_9fa48("35286"), 'delete'),
  UPSERT: stryMutAct_9fa48("35287") ? "" : (stryCov_9fa48("35287"), 'upsert'),
  ERROR: stryMutAct_9fa48("35288") ? "" : (stryCov_9fa48("35288"), 'error'),
  READ_MODEL_DIVERGENCE: stryMutAct_9fa48("35289") ? "" : (stryCov_9fa48("35289"), 'readModelDivergence'),
  EPOCH_CHANGE: stryMutAct_9fa48("35290") ? "" : (stryCov_9fa48("35290"), 'epochChange'),
  NODE_STATE_CHANGE: stryMutAct_9fa48("35291") ? "" : (stryCov_9fa48("35291"), 'nodeStateChange'),
  NODE_JOINED: stryMutAct_9fa48("35292") ? "" : (stryCov_9fa48("35292"), 'nodeJoined')
}));
const CDC_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("35293") ? {} : (stryCov_9fa48("35293"), {
  RETRY_MAX_ATTEMPTS: stryMutAct_9fa48("35294") ? "" : (stryCov_9fa48("35294"), 'cdc.retryMaxAttempts'),
  RETRY_DELAY_MS: stryMutAct_9fa48("35295") ? "" : (stryCov_9fa48("35295"), 'cdc.retryDelayMs'),
  CACHE_WAIT_TIMEOUT_MS: stryMutAct_9fa48("35296") ? "" : (stryCov_9fa48("35296"), 'cdc.cacheWaitTimeoutMs')
}));
const CDC_DEFAULTS = Object.freeze(stryMutAct_9fa48("35297") ? {} : (stryCov_9fa48("35297"), {
  // Leader election / system-cache warmup during bootstrap and node join can take a few seconds.
  // Use retries + backoff to make control-plane writes eventually succeed.
  RETRY_MAX_ATTEMPTS: 6,
  RETRY_DELAY_MS: 100,
  // Wait briefly for CDC to apply to the cache after successful writes.
  CACHE_WAIT_TIMEOUT_MS: 1000
}));

// Config key for the current assignment epoch persisted in the config table.
const CDC_EPOCH_CONFIG_KEY = stryMutAct_9fa48("35298") ? "" : (stryCov_9fa48("35298"), 'current_epoch');
const CDC_SOURCE = Object.freeze(stryMutAct_9fa48("35299") ? {} : (stryCov_9fa48("35299"), {
  CDC: stryMutAct_9fa48("35300") ? "" : (stryCov_9fa48("35300"), 'cdc')
}));
const CDC_SKIP_REASON = Object.freeze(stryMutAct_9fa48("35301") ? {} : (stryCov_9fa48("35301"), {
  SELF: stryMutAct_9fa48("35302") ? "" : (stryCov_9fa48("35302"), 'self'),
  ALREADY_CONNECTED: stryMutAct_9fa48("35303") ? "" : (stryCov_9fa48("35303"), 'already_connected')
}));
const CDC_RETRY = Object.freeze(stryMutAct_9fa48("35304") ? {} : (stryCov_9fa48("35304"), {
  MIN_ATTEMPTS: NUM.ONE,
  MIN_DELAY_MS: NUM.ZERO,
  BACKOFF_BASE: NUM.TWO,
  MAX_EXPONENT: NUM.SIX,
  MAX_DELAY_MS: 2000
}));
const CDC_SQL = Object.freeze(stryMutAct_9fa48("35305") ? {} : (stryCov_9fa48("35305"), {
  PARAM_PLACEHOLDER: stryMutAct_9fa48("35306") ? "" : (stryCov_9fa48("35306"), '?'),
  COMMA_SPACE: stryMutAct_9fa48("35307") ? "" : (stryCov_9fa48("35307"), ', '),
  WHERE_AND: stryMutAct_9fa48("35308") ? "" : (stryCov_9fa48("35308"), ' AND '),
  ASSIGNMENT_PLACEHOLDER: stryMutAct_9fa48("35309") ? "" : (stryCov_9fa48("35309"), ' = ?')
}));
const CDC_SESSION = Object.freeze(stryMutAct_9fa48("35310") ? {} : (stryCov_9fa48("35310"), {
  SYSTEM_WRITE_PREFIX: stryMutAct_9fa48("35311") ? "" : (stryCov_9fa48("35311"), 'cdc-system-write')
}));
const CDC_OPERATION_LABEL = Object.freeze(stryMutAct_9fa48("35312") ? {} : (stryCov_9fa48("35312"), {
  INSERT: CDC_OPERATION.INSERT,
  UPDATE_WHERE: stryMutAct_9fa48("35313") ? "" : (stryCov_9fa48("35313"), 'UPDATE whereClause'),
  UPDATE_DATA: stryMutAct_9fa48("35314") ? "" : (stryCov_9fa48("35314"), 'UPDATE data'),
  DELETE_WHERE: stryMutAct_9fa48("35315") ? "" : (stryCov_9fa48("35315"), 'DELETE whereClause'),
  UPSERT: CDC_OPERATION.UPSERT
}));
const CDC_PRIMARY_KEY = Object.freeze(stryMutAct_9fa48("35316") ? {} : (stryCov_9fa48("35316"), {
  FALLBACK: stryMutAct_9fa48("35317") ? "" : (stryCov_9fa48("35317"), 'id')
}));
const CDC_STATS_DEFAULT = Object.freeze(stryMutAct_9fa48("35318") ? {} : (stryCov_9fa48("35318"), {
  inserts: NUM.ZERO,
  updates: NUM.ZERO,
  deletes: NUM.ZERO,
  failures: NUM.ZERO,
  epochChanges: NUM.ZERO,
  nodeStateChanges: NUM.ZERO
}));
const CDC_LOG_MSG = Object.freeze(stryMutAct_9fa48("35319") ? {} : (stryCov_9fa48("35319"), {
  INITIALIZED: stryMutAct_9fa48("35320") ? "" : (stryCov_9fa48("35320"), 'CDC integration service initialized'),
  SQL_ENGINE_SET: stryMutAct_9fa48("35321") ? "" : (stryCov_9fa48("35321"), 'SQL query engine set for CDC integration'),
  TRANSIENT_SQL_RETRY: stryMutAct_9fa48("35322") ? "" : (stryCov_9fa48("35322"), 'Transient CDC SQL error, retrying'),
  TRANSIENT_SQL_EXCEPTION_RETRY: stryMutAct_9fa48("35323") ? "" : (stryCov_9fa48("35323"), 'Transient CDC SQL exception, retrying'),
  INSERTING_ROW: stryMutAct_9fa48("35324") ? "" : (stryCov_9fa48("35324"), 'Inserting system table row via SQL'),
  INSERTED_ROW: stryMutAct_9fa48("35325") ? "" : (stryCov_9fa48("35325"), 'System table row inserted'),
  INSERT_FAILED: stryMutAct_9fa48("35326") ? "" : (stryCov_9fa48("35326"), 'Failed to insert system table row'),
  UPDATING_ROW: stryMutAct_9fa48("35327") ? "" : (stryCov_9fa48("35327"), 'Updating system table row via SQL'),
  UPDATED_ROW: stryMutAct_9fa48("35328") ? "" : (stryCov_9fa48("35328"), 'System table row updated'),
  UPDATE_FAILED: stryMutAct_9fa48("35329") ? "" : (stryCov_9fa48("35329"), 'Failed to update system table row'),
  DELETING_ROW: stryMutAct_9fa48("35330") ? "" : (stryCov_9fa48("35330"), 'Deleting system table row via SQL'),
  DELETED_ROW: stryMutAct_9fa48("35331") ? "" : (stryCov_9fa48("35331"), 'System table row deleted'),
  DELETE_FAILED: stryMutAct_9fa48("35332") ? "" : (stryCov_9fa48("35332"), 'Failed to delete system table row'),
  UPSERTING_ROW: stryMutAct_9fa48("35333") ? "" : (stryCov_9fa48("35333"), 'Upserting system table row via SQL'),
  UPSERTED_ROW: stryMutAct_9fa48("35334") ? "" : (stryCov_9fa48("35334"), 'System table row upserted'),
  UPSERT_FAILED: stryMutAct_9fa48("35335") ? "" : (stryCov_9fa48("35335"), 'Failed to upsert system table row'),
  EPOCH_MANAGER_SET: stryMutAct_9fa48("35336") ? "" : (stryCov_9fa48("35336"), 'Epoch manager set for CDC integration'),
  EPOCH_MANAGER_MISSING: stryMutAct_9fa48("35337") ? "" : (stryCov_9fa48("35337"), 'Epoch change CDC received but no epoch manager set'),
  EPOCH_PARSE_FAILED: stryMutAct_9fa48("35338") ? "" : (stryCov_9fa48("35338"), 'Failed to parse epoch data from CDC event'),
  EPOCH_CREATE_FAILED: stryMutAct_9fa48("35339") ? "" : (stryCov_9fa48("35339"), 'Failed to create AssignmentEpoch from CDC data'),
  EPOCH_APPLIED: stryMutAct_9fa48("35340") ? "" : (stryCov_9fa48("35340"), 'Epoch change applied from CDC'),
  EPOCH_SKIPPED: stryMutAct_9fa48("35341") ? "" : (stryCov_9fa48("35341"), 'Epoch change not applied (stale or equal epoch)'),
  REBALANCER_SET: stryMutAct_9fa48("35342") ? "" : (stryCov_9fa48("35342"), 'Rebalancer set for CDC integration'),
  NODE_STATE_UNCHANGED: stryMutAct_9fa48("35343") ? "" : (stryCov_9fa48("35343"), 'Node state unchanged, skipping'),
  NODE_STATE_DETECTED: stryMutAct_9fa48("35344") ? "" : (stryCov_9fa48("35344"), 'Node state change detected via CDC'),
  REBALANCER_NOTIFIED: stryMutAct_9fa48("35345") ? "" : (stryCov_9fa48("35345"), 'Rebalancer notified of node state change'),
  REBALANCER_NOTIFY_FAILED: stryMutAct_9fa48("35346") ? "" : (stryCov_9fa48("35346"), 'Failed to notify rebalancer of node state change'),
  REBALANCER_NOT_SET: stryMutAct_9fa48("35347") ? "" : (stryCov_9fa48("35347"), 'No rebalancer set, skipping rebalancer notification'),
  MESSAGE_ROUTER_SET: stryMutAct_9fa48("35348") ? "" : (stryCov_9fa48("35348"), 'Message router set for CDC mesh connectivity'),
  METRICS_LOG_FAILED: stryMutAct_9fa48("35349") ? "" : (stryCov_9fa48("35349"), 'CDC metrics logging failed'),
  BOOTSTRAP_MODE_REQUIRES_PARTITION_MAP: stryMutAct_9fa48("35350") ? "" : (stryCov_9fa48("35350"), 'Bootstrap mode requires a Map of local partition services'),
  BOOTSTRAP_MODE_ENABLED: stryMutAct_9fa48("35351") ? "" : (stryCov_9fa48("35351"), 'Bootstrap mode enabled - writes go directly to local partitions'),
  BOOTSTRAP_MODE_DISABLED: stryMutAct_9fa48("35352") ? "" : (stryCov_9fa48("35352"), 'Bootstrap mode disabled - writes will route through SQL engine'),
  BOOTSTRAP_MODE_REQUIRED_FOR_DIRECT_SQL: stryMutAct_9fa48("35353") ? "" : (stryCov_9fa48("35353"), 'executeSQLDirectToLocalPartition can only be called in bootstrap mode'),
  NEW_NODE_DETECTED: stryMutAct_9fa48("35354") ? "" : (stryCov_9fa48("35354"), 'New node detected via CDC, establishing connection'),
  NEW_NODE_CONNECTED: stryMutAct_9fa48("35355") ? "" : (stryCov_9fa48("35355"), 'Connected to new node via CDC event'),
  NEW_NODE_CONNECT_FAILED: stryMutAct_9fa48("35356") ? "" : (stryCov_9fa48("35356"), 'Failed to connect to new node via CDC event'),
  NEW_NODE_SKIP_SELF: stryMutAct_9fa48("35357") ? "" : (stryCov_9fa48("35357"), 'Skipping connection to self node'),
  NEW_NODE_SKIP_CONNECTED: stryMutAct_9fa48("35358") ? "" : (stryCov_9fa48("35358"), 'Skipping already connected node'),
  NEW_NODE_MISSING_ADDRESS: stryMutAct_9fa48("35359") ? "" : (stryCov_9fa48("35359"), 'New node missing address, cannot connect'),
  OVERLAY_RESEED_ON_TABLE_NOT_FOUND: stryMutAct_9fa48("35360") ? "" : (stryCov_9fa48("35360"), 'Re-seeding bootstrap routing overlay after table-not-found'),
  OVERLAY_RESEED_RETRY_RESULT: stryMutAct_9fa48("35361") ? "" : (stryCov_9fa48("35361"), 'Bootstrap overlay re-seed retry completed')
}));
const CDC_ERROR_MSG = Object.freeze(stryMutAct_9fa48("35362") ? {} : (stryCov_9fa48("35362"), {
  INVALID_TABLE_PREFIX: stryMutAct_9fa48("35363") ? "" : (stryCov_9fa48("35363"), 'Invalid system table name: '),
  VALID_TABLES_PREFIX: stryMutAct_9fa48("35364") ? "" : (stryCov_9fa48("35364"), 'Valid tables are: '),
  DATA_REQUIRED_SUFFIX: stryMutAct_9fa48("35365") ? "" : (stryCov_9fa48("35365"), ' requires data object'),
  SCHEMA_MISSING_PREFIX: stryMutAct_9fa48("35366") ? "" : (stryCov_9fa48("35366"), 'Schema not found for system table: '),
  INSERT_VALID_COLUMNS_PREFIX: stryMutAct_9fa48("35367") ? "" : (stryCov_9fa48("35367"), 'INSERT requires data with valid columns for '),
  UPDATE_VALID_COLUMNS_PREFIX: stryMutAct_9fa48("35368") ? "" : (stryCov_9fa48("35368"), 'UPDATE requires data with valid columns for '),
  UPDATE_PRIMARY_KEY_PREFIX: stryMutAct_9fa48("35369") ? "" : (stryCov_9fa48("35369"), 'UPDATE requires primary key ('),
  UPDATE_PRIMARY_KEY_SUFFIX: stryMutAct_9fa48("35370") ? "" : (stryCov_9fa48("35370"), ') in whereClause'),
  DELETE_PRIMARY_KEY_PREFIX: stryMutAct_9fa48("35371") ? "" : (stryCov_9fa48("35371"), 'DELETE requires primary key ('),
  DELETE_PRIMARY_KEY_SUFFIX: stryMutAct_9fa48("35372") ? "" : (stryCov_9fa48("35372"), ') in whereClause'),
  UPSERT_PRIMARY_KEY_PREFIX: stryMutAct_9fa48("35373") ? "" : (stryCov_9fa48("35373"), 'UPSERT requires primary key ('),
  UPSERT_PRIMARY_KEY_SUFFIX: stryMutAct_9fa48("35374") ? "" : (stryCov_9fa48("35374"), ') in data'),
  UPSERT_VALID_COLUMNS_PREFIX: stryMutAct_9fa48("35375") ? "" : (stryCov_9fa48("35375"), 'UPSERT requires data with valid columns for '),
  CDC_ENGINE_MISSING_PREFIX: stryMutAct_9fa48("35376") ? "" : (stryCov_9fa48("35376"), 'CDCIntegrationService not properly initialized: '),
  CDC_ENGINE_MISSING_DETAIL: stryMutAct_9fa48("35377") ? "" : (stryCov_9fa48("35377"), 'sqlQueryEngine not provided'),
  INSERT_FAILED: stryMutAct_9fa48("35378") ? "" : (stryCov_9fa48("35378"), 'Insert failed'),
  UPDATE_FAILED: stryMutAct_9fa48("35379") ? "" : (stryCov_9fa48("35379"), 'Update failed'),
  DELETE_FAILED: stryMutAct_9fa48("35380") ? "" : (stryCov_9fa48("35380"), 'Delete failed'),
  UPSERT_FAILED: stryMutAct_9fa48("35381") ? "" : (stryCov_9fa48("35381"), 'Upsert failed'),
  CACHE_WAIT_TIMEOUT: stryMutAct_9fa48("35382") ? () => undefined : (stryCov_9fa48("35382"), (tableName, key, timeoutMs) => stryMutAct_9fa48("35383") ? `` : (stryCov_9fa48("35383"), `Cache update not observed for ${tableName}:${key} within ${timeoutMs}ms`)),
  INVALID_EVENT: stryMutAct_9fa48("35384") ? "" : (stryCov_9fa48("35384"), 'Invalid CDC event: event must be an object'),
  NOT_EPOCH_CHANGE_PREFIX: stryMutAct_9fa48("35385") ? "" : (stryCov_9fa48("35385"), 'Not an epoch change event: config_key is '),
  EPOCH_MANAGER_REQUIRED: stryMutAct_9fa48("35386") ? "" : (stryCov_9fa48("35386"), 'epochManager is required'),
  EPOCH_MANAGER_NOT_SET: stryMutAct_9fa48("35387") ? "" : (stryCov_9fa48("35387"), 'Epoch manager not set'),
  EPOCH_DATA_INVALID: stryMutAct_9fa48("35388") ? "" : (stryCov_9fa48("35388"), 'config_value must be a string or object'),
  PARSE_EPOCH_PREFIX: stryMutAct_9fa48("35389") ? "" : (stryCov_9fa48("35389"), 'Failed to parse epoch data: '),
  CREATE_EPOCH_PREFIX: stryMutAct_9fa48("35390") ? "" : (stryCov_9fa48("35390"), 'Failed to create epoch: '),
  EPOCH_NOT_APPLIED: stryMutAct_9fa48("35391") ? "" : (stryCov_9fa48("35391"), 'Epoch not applied (stale or equal to current)'),
  REBALANCER_REQUIRED: stryMutAct_9fa48("35392") ? "" : (stryCov_9fa48("35392"), 'rebalancer is required'),
  NOT_NODES_TABLE_PREFIX: stryMutAct_9fa48("35393") ? "" : (stryCov_9fa48("35393"), 'Not a nodes table event: tableName is '),
  NODE_ID_MISSING: stryMutAct_9fa48("35394") ? "" : (stryCov_9fa48("35394"), 'Missing node_id in CDC event data'),
  NODE_STATUS_MISSING: stryMutAct_9fa48("35395") ? "" : (stryCov_9fa48("35395"), 'Missing status in CDC event data'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("35396") ? "" : (stryCov_9fa48("35396"), 'messageRouter is required'),
  NOT_INSERT_OPERATION: stryMutAct_9fa48("35397") ? "" : (stryCov_9fa48("35397"), 'Not an INSERT operation'),
  MESSAGE_ROUTER_NOT_SET: stryMutAct_9fa48("35398") ? "" : (stryCov_9fa48("35398"), 'Message router not set'),
  BOOTSTRAP_REENTRY_FORBIDDEN: stryMutAct_9fa48("35399") ? "" : (stryCov_9fa48("35399"), 'Cannot re-enable bootstrap mode after it has been cleared')
}));
export { CDC_CONFIG_KEY, CDC_DEFAULTS, CDC_EPOCH_CONFIG_KEY, CDC_EVENT, CDC_ERROR_MSG, CDC_LOG_MSG, CDC_OPERATION_LABEL, CDC_PRIMARY_KEY, CDC_RETRY, CDC_SESSION, CDC_SKIP_REASON, CDC_SOURCE, CDC_SQL, CDC_STATS_DEFAULT, CDC_SUBSYSTEM };