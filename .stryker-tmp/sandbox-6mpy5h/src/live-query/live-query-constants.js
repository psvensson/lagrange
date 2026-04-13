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
import { CONFIG_KEY } from '../config/config-constants.js';
import { NUM, STRING, TIME_MS, TYPEOF } from '../constants/index.js';
const LIVE_QUERY_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("81733") ? {} : (stryCov_9fa48("81733"), {
  QUERY_GROUP: stryMutAct_9fa48("81734") ? "" : (stryCov_9fa48("81734"), 'query-group'),
  LIVE_QUERY_MANAGER: stryMutAct_9fa48("81735") ? "" : (stryCov_9fa48("81735"), 'live-query-manager'),
  LIVE_QUERY_SERVICE: stryMutAct_9fa48("81736") ? "" : (stryCov_9fa48("81736"), 'live-query-service')
}));
const LIVE_QUERY_EVENT = Object.freeze(stryMutAct_9fa48("81737") ? {} : (stryCov_9fa48("81737"), {
  INSERT: stryMutAct_9fa48("81738") ? "" : (stryCov_9fa48("81738"), 'insert'),
  UPDATE: stryMutAct_9fa48("81739") ? "" : (stryCov_9fa48("81739"), 'update'),
  DELETE: stryMutAct_9fa48("81740") ? "" : (stryCov_9fa48("81740"), 'delete'),
  SNAPSHOT: stryMutAct_9fa48("81741") ? "" : (stryCov_9fa48("81741"), 'snapshot'),
  ERROR: stryMutAct_9fa48("81742") ? "" : (stryCov_9fa48("81742"), 'error')
}));
const LIVE_QUERY_AST_TYPE = Object.freeze(stryMutAct_9fa48("81743") ? {} : (stryCov_9fa48("81743"), {
  BINARY: stryMutAct_9fa48("81744") ? "" : (stryCov_9fa48("81744"), 'binary'),
  UNARY: stryMutAct_9fa48("81745") ? "" : (stryCov_9fa48("81745"), 'unary'),
  LITERAL: stryMutAct_9fa48("81746") ? "" : (stryCov_9fa48("81746"), 'literal'),
  COLUMN_REF: stryMutAct_9fa48("81747") ? "" : (stryCov_9fa48("81747"), 'column_ref'),
  IN: stryMutAct_9fa48("81748") ? "" : (stryCov_9fa48("81748"), 'in'),
  BETWEEN: stryMutAct_9fa48("81749") ? "" : (stryCov_9fa48("81749"), 'between'),
  LIKE: stryMutAct_9fa48("81750") ? "" : (stryCov_9fa48("81750"), 'like'),
  STAR: stryMutAct_9fa48("81751") ? "" : (stryCov_9fa48("81751"), 'star')
}));
const LIVE_QUERY_OPERATOR = Object.freeze(stryMutAct_9fa48("81752") ? {} : (stryCov_9fa48("81752"), {
  AND: stryMutAct_9fa48("81753") ? "" : (stryCov_9fa48("81753"), 'AND'),
  OR: stryMutAct_9fa48("81754") ? "" : (stryCov_9fa48("81754"), 'OR'),
  NOT: stryMutAct_9fa48("81755") ? "" : (stryCov_9fa48("81755"), 'NOT'),
  EQUALS: stryMutAct_9fa48("81756") ? "" : (stryCov_9fa48("81756"), '='),
  NOT_EQUALS: stryMutAct_9fa48("81757") ? "" : (stryCov_9fa48("81757"), '!='),
  NOT_EQUALS_ALT: stryMutAct_9fa48("81758") ? "" : (stryCov_9fa48("81758"), '<>'),
  LESS_THAN: stryMutAct_9fa48("81759") ? "" : (stryCov_9fa48("81759"), '<'),
  LESS_THAN_OR_EQUAL: stryMutAct_9fa48("81760") ? "" : (stryCov_9fa48("81760"), '<='),
  GREATER_THAN: stryMutAct_9fa48("81761") ? "" : (stryCov_9fa48("81761"), '>'),
  GREATER_THAN_OR_EQUAL: stryMutAct_9fa48("81762") ? "" : (stryCov_9fa48("81762"), '>='),
  IS_NULL: stryMutAct_9fa48("81763") ? "" : (stryCov_9fa48("81763"), 'IS NULL'),
  IS_NOT_NULL: stryMutAct_9fa48("81764") ? "" : (stryCov_9fa48("81764"), 'IS NOT NULL')
}));
const LIVE_QUERY_SQL = Object.freeze(stryMutAct_9fa48("81765") ? {} : (stryCov_9fa48("81765"), {
  LIVE_PREFIX: stryMutAct_9fa48("81766") ? "" : (stryCov_9fa48("81766"), 'LIVE '),
  SELECT_PREFIX: stryMutAct_9fa48("81767") ? "" : (stryCov_9fa48("81767"), 'SELECT'),
  SELECT: stryMutAct_9fa48("81768") ? "" : (stryCov_9fa48("81768"), 'SELECT'),
  FROM: stryMutAct_9fa48("81769") ? "" : (stryCov_9fa48("81769"), 'FROM'),
  STAR: stryMutAct_9fa48("81770") ? "" : (stryCov_9fa48("81770"), '*')
}));
const LIVE_QUERY_LOG_MSG = Object.freeze(stryMutAct_9fa48("81771") ? {} : (stryCov_9fa48("81771"), {
  RENEWED: stryMutAct_9fa48("81772") ? "" : (stryCov_9fa48("81772"), 'Live query renewed'),
  CLEANED_UP: stryMutAct_9fa48("81773") ? "" : (stryCov_9fa48("81773"), 'Live query cleaned up'),
  CLIENT_JOINED: stryMutAct_9fa48("81774") ? "" : (stryCov_9fa48("81774"), 'Client joined query group'),
  CLIENT_LEFT: stryMutAct_9fa48("81775") ? "" : (stryCov_9fa48("81775"), 'Client left query group'),
  NO_PARTITION_KEY_FILTER: stryMutAct_9fa48("81776") ? "" : (stryCov_9fa48("81776"), 'Live query without partition key filter'),
  PARTITIONS_LOOKUP_FAILED: stryMutAct_9fa48("81777") ? "" : (stryCov_9fa48("81777"), 'Failed to find partitions for query'),
  FAILED_SEND_CLIENT: stryMutAct_9fa48("81778") ? "" : (stryCov_9fa48("81778"), 'Failed to send to client'),
  UNSUBSCRIBED_PARTITION: stryMutAct_9fa48("81779") ? "" : (stryCov_9fa48("81779"), 'Unsubscribed from partition'),
  SUBSCRIBED_PARTITION: stryMutAct_9fa48("81780") ? "" : (stryCov_9fa48("81780"), 'Subscribed to partition'),
  GROUP_CLEANED_UP: stryMutAct_9fa48("81781") ? "" : (stryCov_9fa48("81781"), 'Query group cleaned up'),
  MANAGER_INITIALIZED: stryMutAct_9fa48("81782") ? "" : (stryCov_9fa48("81782"), 'Live query manager initialized'),
  CLIENT_JOINED_EXISTING: stryMutAct_9fa48("81783") ? "" : (stryCov_9fa48("81783"), 'Client joined existing query group'),
  GROUP_CREATED: stryMutAct_9fa48("81784") ? "" : (stryCov_9fa48("81784"), 'Created new query group'),
  SUBSCRIPTION_CREATED: stryMutAct_9fa48("81785") ? "" : (stryCov_9fa48("81785"), 'Live query subscription created'),
  SNAPSHOT_ENGINE_UNAVAILABLE: stryMutAct_9fa48("81786") ? "" : (stryCov_9fa48("81786"), 'SQL query engine not available for snapshot'),
  SNAPSHOT_SENT: stryMutAct_9fa48("81787") ? "" : (stryCov_9fa48("81787"), 'Snapshot sent to client'),
  SNAPSHOT_FAILED: stryMutAct_9fa48("81788") ? "" : (stryCov_9fa48("81788"), 'Failed to send snapshot'),
  QUERY_RENEWED: stryMutAct_9fa48("81789") ? "" : (stryCov_9fa48("81789"), 'Live query renewed'),
  QUERY_RESUMED: stryMutAct_9fa48("81790") ? "" : (stryCov_9fa48("81790"), 'Live query resumed'),
  QUERY_UNREGISTERED: stryMutAct_9fa48("81791") ? "" : (stryCov_9fa48("81791"), 'Live query unregistered'),
  GROUP_REMOVED: stryMutAct_9fa48("81792") ? "" : (stryCov_9fa48("81792"), 'Query group removed'),
  CLIENT_DISCONNECTED_CLEANUP: stryMutAct_9fa48("81793") ? "" : (stryCov_9fa48("81793"), 'Client disconnected - cleaned up subscriptions'),
  SUBSCRIPTIONS_PARTITION_CHANGE: stryMutAct_9fa48("81794") ? "" : (stryCov_9fa48("81794"), 'Updating subscriptions for partition change'),
  SUBSCRIPTION_EXPIRED: stryMutAct_9fa48("81795") ? "" : (stryCov_9fa48("81795"), 'Live query subscription expired'),
  MANAGER_SHUTDOWN: stryMutAct_9fa48("81796") ? "" : (stryCov_9fa48("81796"), 'Live query manager shutdown')
}));
const LIVE_QUERY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("81797") ? {} : (stryCov_9fa48("81797"), {
  INVALID_SQL: stryMutAct_9fa48("81798") ? "" : (stryCov_9fa48("81798"), 'Invalid SQL: expected string'),
  LIVE_REQUIRES_SELECT: stryMutAct_9fa48("81799") ? "" : (stryCov_9fa48("81799"), 'LIVE must be followed by SELECT statement'),
  CURSOR_TOO_OLD: stryMutAct_9fa48("81800") ? "" : (stryCov_9fa48("81800"), 'Cursor too old - full resync required'),
  MAX_QUERIES_EXCEEDED_PREFIX: stryMutAct_9fa48("81801") ? "" : (stryCov_9fa48("81801"), 'Maximum concurrent live queries exceeded ('),
  MAX_QUERIES_EXCEEDED_SUFFIX: stryMutAct_9fa48("81802") ? "" : (stryCov_9fa48("81802"), ')'),
  QUERY_GROUP_NOT_FOUND_PREFIX: stryMutAct_9fa48("81803") ? "" : (stryCov_9fa48("81803"), 'Query group not found: ')
}));
const LIVE_QUERY_DEFAULT_VALUE = Object.freeze(stryMutAct_9fa48("81804") ? {} : (stryCov_9fa48("81804"), {
  UNKNOWN: STRING.UNKNOWN,
  PRIMARY_KEY_FALLBACK: stryMutAct_9fa48("81805") ? "" : (stryCov_9fa48("81805"), 'id'),
  EMPTY_WHERE: STRING.EMPTY
}));
const LIVE_QUERY_OPERATION = Object.freeze(stryMutAct_9fa48("81806") ? {} : (stryCov_9fa48("81806"), {
  INSERT: stryMutAct_9fa48("81807") ? "" : (stryCov_9fa48("81807"), 'INSERT'),
  UPDATE: stryMutAct_9fa48("81808") ? "" : (stryCov_9fa48("81808"), 'UPDATE'),
  DELETE: stryMutAct_9fa48("81809") ? "" : (stryCov_9fa48("81809"), 'DELETE')
}));
const LIVE_QUERY_REGEX = Object.freeze(stryMutAct_9fa48("81810") ? {} : (stryCov_9fa48("81810"), {
  REGEX_SPECIAL: stryMutAct_9fa48("81811") ? /[^.*+?^${}()|[\]\\]/g : (stryCov_9fa48("81811"), /[.*+?^${}()|[\]\\]/g),
  PERCENT: /%/g,
  UNDERSCORE: /_/g
}));
const LIVE_QUERY_REGEX_REPLACE = Object.freeze(stryMutAct_9fa48("81812") ? {} : (stryCov_9fa48("81812"), {
  ESCAPE: stryMutAct_9fa48("81813") ? "" : (stryCov_9fa48("81813"), '\\$&'),
  WILDCARD: stryMutAct_9fa48("81814") ? "" : (stryCov_9fa48("81814"), '.*'),
  SINGLE_CHAR: stryMutAct_9fa48("81815") ? "" : (stryCov_9fa48("81815"), '.')
}));
const LIVE_QUERY_REGEX_FLAG = Object.freeze(stryMutAct_9fa48("81816") ? {} : (stryCov_9fa48("81816"), {
  CASE_INSENSITIVE: stryMutAct_9fa48("81817") ? "" : (stryCov_9fa48("81817"), 'i')
}));
const LIVE_QUERY_CURSOR = Object.freeze(stryMutAct_9fa48("81818") ? {} : (stryCov_9fa48("81818"), {
  SEPARATOR: stryMutAct_9fa48("81819") ? "" : (stryCov_9fa48("81819"), ':')
}));
const LIVE_QUERY_EMIT = Object.freeze(stryMutAct_9fa48("81820") ? {} : (stryCov_9fa48("81820"), {
  CHANGE: stryMutAct_9fa48("81821") ? "" : (stryCov_9fa48("81821"), 'change'),
  SUBSCRIPTION_CREATED: stryMutAct_9fa48("81822") ? "" : (stryCov_9fa48("81822"), 'subscription-created'),
  SUBSCRIPTION_RENEWED: stryMutAct_9fa48("81823") ? "" : (stryCov_9fa48("81823"), 'subscription-renewed'),
  SUBSCRIPTION_REMOVED: stryMutAct_9fa48("81824") ? "" : (stryCov_9fa48("81824"), 'subscription-removed'),
  SUBSCRIPTION_EXPIRED: stryMutAct_9fa48("81825") ? "" : (stryCov_9fa48("81825"), 'subscription-expired')
}));
const LIVE_QUERY_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("81826") ? {} : (stryCov_9fa48("81826"), {
  DEFAULT_TTL_MS: CONFIG_KEY.LIVE_QUERY_DEFAULT_TTL_MS,
  MAX_PER_CLIENT: CONFIG_KEY.LIVE_QUERY_MAX_PER_CLIENT,
  CLEANUP_INTERVAL_MS: CONFIG_KEY.LIVE_QUERY_CLEANUP_INTERVAL_MS,
  CURSOR_RETENTION_MS: CONFIG_KEY.LIVE_QUERY_CURSOR_RETENTION_MS
}));
const LIVE_QUERY_DEFAULTS = Object.freeze(stryMutAct_9fa48("81827") ? {} : (stryCov_9fa48("81827"), {
  DEFAULT_TTL_MS: stryMutAct_9fa48("81828") ? TIME_MS.SECOND * NUM.TEN / NUM.THREE : (stryCov_9fa48("81828"), (stryMutAct_9fa48("81829") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("81829"), TIME_MS.SECOND * NUM.TEN)) * NUM.THREE),
  MAX_PER_CLIENT: NUM.HUNDRED,
  CLEANUP_INTERVAL_MS: stryMutAct_9fa48("81830") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("81830"), TIME_MS.SECOND * NUM.FIVE),
  CURSOR_RETENTION_MS: stryMutAct_9fa48("81831") ? TIME_MS.MINUTE / NUM.FIVE : (stryCov_9fa48("81831"), TIME_MS.MINUTE * NUM.FIVE)
}));
export { LIVE_QUERY_AST_TYPE, LIVE_QUERY_CONFIG_KEY, LIVE_QUERY_CURSOR, LIVE_QUERY_DEFAULTS, LIVE_QUERY_DEFAULT_VALUE, LIVE_QUERY_EMIT, LIVE_QUERY_ERROR_MSG, LIVE_QUERY_EVENT, LIVE_QUERY_LOG_MSG, LIVE_QUERY_OPERATION, LIVE_QUERY_OPERATOR, LIVE_QUERY_REGEX, LIVE_QUERY_REGEX_FLAG, LIVE_QUERY_REGEX_REPLACE, LIVE_QUERY_SQL, LIVE_QUERY_SUBSYSTEM, TYPEOF };