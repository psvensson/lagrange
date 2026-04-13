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
import { NUM, STRING } from '../constants/index.js';
const CLI_APP = Object.freeze(stryMutAct_9fa48("39515") ? {} : (stryCov_9fa48("39515"), {
  NAME: stryMutAct_9fa48("39516") ? "" : (stryCov_9fa48("39516"), 'DDB Admin CLI'),
  BIN: stryMutAct_9fa48("39517") ? "" : (stryCov_9fa48("39517"), 'ddb-admin')
}));
const CLI_VERSION = stryMutAct_9fa48("39518") ? "" : (stryCov_9fa48("39518"), '1.0.0');
const CLI_ENV = Object.freeze(stryMutAct_9fa48("39519") ? {} : (stryCov_9fa48("39519"), {
  NODE_ADDRESS: stryMutAct_9fa48("39520") ? "" : (stryCov_9fa48("39520"), 'DDB_NODE_ADDRESS'),
  REFRESH_INTERVAL: stryMutAct_9fa48("39521") ? "" : (stryCov_9fa48("39521"), 'DDB_REFRESH_INTERVAL'),
  DEBUG: stryMutAct_9fa48("39522") ? "" : (stryCov_9fa48("39522"), 'DDB_CLI_DEBUG'),
  DEBUG_ENABLED_VALUE: stryMutAct_9fa48("39523") ? "" : (stryCov_9fa48("39523"), '1')
}));
const CLI_FLAG = Object.freeze(stryMutAct_9fa48("39524") ? {} : (stryCov_9fa48("39524"), {
  READ_ONLY: stryMutAct_9fa48("39525") ? "" : (stryCov_9fa48("39525"), '--read-only'),
  HELP: stryMutAct_9fa48("39526") ? "" : (stryCov_9fa48("39526"), '--help'),
  HELP_SHORT: stryMutAct_9fa48("39527") ? "" : (stryCov_9fa48("39527"), '-h'),
  VERSION: stryMutAct_9fa48("39528") ? "" : (stryCov_9fa48("39528"), '--version'),
  VERSION_SHORT: stryMutAct_9fa48("39529") ? "" : (stryCov_9fa48("39529"), '-v')
}));
const CLI_PATH = Object.freeze(stryMutAct_9fa48("39530") ? {} : (stryCov_9fa48("39530"), {
  CONFIG_DIR_NAME: stryMutAct_9fa48("39531") ? "" : (stryCov_9fa48("39531"), '.ddb-admin'),
  CONFIG_FILE: stryMutAct_9fa48("39532") ? "" : (stryCov_9fa48("39532"), 'config.json'),
  CACHE_FILE: stryMutAct_9fa48("39533") ? "" : (stryCov_9fa48("39533"), 'cache.json'),
  ERROR_LOG_FILE: stryMutAct_9fa48("39534") ? "" : (stryCov_9fa48("39534"), 'error.log'),
  QUERY_HISTORY_FILE: stryMutAct_9fa48("39535") ? "" : (stryCov_9fa48("39535"), 'query_history.json'),
  DEBUG_LOG_FILE: stryMutAct_9fa48("39536") ? "" : (stryCov_9fa48("39536"), '/tmp/ddb-cli-debug.log')
}));
const CLI_COLOR_SCHEME = Object.freeze(stryMutAct_9fa48("39537") ? {} : (stryCov_9fa48("39537"), {
  DEFAULT: stryMutAct_9fa48("39538") ? "" : (stryCov_9fa48("39538"), 'default'),
  MONOCHROME: stryMutAct_9fa48("39539") ? "" : (stryCov_9fa48("39539"), 'monochrome')
}));
const CLI_VIEW = Object.freeze(stryMutAct_9fa48("39540") ? {} : (stryCov_9fa48("39540"), {
  NODES: stryMutAct_9fa48("39541") ? "" : (stryCov_9fa48("39541"), 'nodes'),
  SERVICES: stryMutAct_9fa48("39542") ? "" : (stryCov_9fa48("39542"), 'services'),
  REPLICAS: stryMutAct_9fa48("39543") ? "" : (stryCov_9fa48("39543"), 'replicas'),
  TABLES: stryMutAct_9fa48("39544") ? "" : (stryCov_9fa48("39544"), 'tables'),
  PARTITIONS: stryMutAct_9fa48("39545") ? "" : (stryCov_9fa48("39545"), 'partitions'),
  MESSAGE_GROUPS: stryMutAct_9fa48("39546") ? "" : (stryCov_9fa48("39546"), 'message_groups'),
  SQL: stryMutAct_9fa48("39547") ? "" : (stryCov_9fa48("39547"), 'sql'),
  LOGS: stryMutAct_9fa48("39548") ? "" : (stryCov_9fa48("39548"), 'logs'),
  CONFIG: stryMutAct_9fa48("39549") ? "" : (stryCov_9fa48("39549"), 'config'),
  CONTEXTS: stryMutAct_9fa48("39550") ? "" : (stryCov_9fa48("39550"), 'contexts')
}));
const CLI_VIEW_LIST = Object.freeze(stryMutAct_9fa48("39551") ? [] : (stryCov_9fa48("39551"), [CLI_VIEW.NODES, CLI_VIEW.SERVICES, CLI_VIEW.REPLICAS, CLI_VIEW.TABLES, CLI_VIEW.PARTITIONS, CLI_VIEW.MESSAGE_GROUPS, CLI_VIEW.SQL, CLI_VIEW.LOGS, CLI_VIEW.CONFIG, CLI_VIEW.CONTEXTS]));
const CLI_DEFAULT = Object.freeze(stryMutAct_9fa48("39552") ? {} : (stryCov_9fa48("39552"), {
  REFRESH_INTERVAL_MS: stryMutAct_9fa48("39553") ? NUM.TWO / NUM.THOUSAND : (stryCov_9fa48("39553"), NUM.TWO * NUM.THOUSAND),
  DEFAULT_VIEW: CLI_VIEW.NODES,
  COLOR_SCHEME: CLI_COLOR_SCHEME.DEFAULT,
  CACHE_PERSISTENCE: stryMutAct_9fa48("39554") ? false : (stryCov_9fa48("39554"), true),
  CDC_LAG_THRESHOLD_MS: stryMutAct_9fa48("39555") ? NUM.FIVE / NUM.THOUSAND : (stryCov_9fa48("39555"), NUM.FIVE * NUM.THOUSAND),
  READ_ONLY_MODE: stryMutAct_9fa48("39556") ? true : (stryCov_9fa48("39556"), false),
  MAX_HISTORY: NUM.HUNDRED,
  MAX_NOTIFICATIONS: stryMutAct_9fa48("39557") ? NUM.FIVE / NUM.TEN : (stryCov_9fa48("39557"), NUM.FIVE * NUM.TEN),
  DEFAULT_NOTIFICATION_DURATION_MS: stryMutAct_9fa48("39558") ? NUM.FIVE / NUM.THOUSAND : (stryCov_9fa48("39558"), NUM.FIVE * NUM.THOUSAND),
  MIN_TERMINAL_WIDTH: 80,
  MIN_TERMINAL_HEIGHT: 24
}));
const CLI_COMMAND = Object.freeze(stryMutAct_9fa48("39559") ? {} : (stryCov_9fa48("39559"), {
  CONNECT: stryMutAct_9fa48("39560") ? "" : (stryCov_9fa48("39560"), 'connect'),
  DRAIN: stryMutAct_9fa48("39561") ? "" : (stryCov_9fa48("39561"), 'drain'),
  ACTIVATE: stryMutAct_9fa48("39562") ? "" : (stryCov_9fa48("39562"), 'activate'),
  REMOVE_NODE: stryMutAct_9fa48("39563") ? "" : (stryCov_9fa48("39563"), 'remove-node'),
  REFRESH: stryMutAct_9fa48("39564") ? "" : (stryCov_9fa48("39564"), 'refresh'),
  FILTER: stryMutAct_9fa48("39565") ? "" : (stryCov_9fa48("39565"), 'filter'),
  SORT: stryMutAct_9fa48("39566") ? "" : (stryCov_9fa48("39566"), 'sort'),
  GOTO: stryMutAct_9fa48("39567") ? "" : (stryCov_9fa48("39567"), 'goto'),
  SQL: stryMutAct_9fa48("39568") ? "" : (stryCov_9fa48("39568"), 'sql'),
  SINCE: stryMutAct_9fa48("39569") ? "" : (stryCov_9fa48("39569"), 'since'),
  HELP: stryMutAct_9fa48("39570") ? "" : (stryCov_9fa48("39570"), 'help'),
  QUIT: stryMutAct_9fa48("39571") ? "" : (stryCov_9fa48("39571"), 'quit'),
  HISTORY: stryMutAct_9fa48("39572") ? "" : (stryCov_9fa48("39572"), 'history')
}));
const CLI_COMMAND_DEFINITIONS = Object.freeze(stryMutAct_9fa48("39573") ? [] : (stryCov_9fa48("39573"), [stryMutAct_9fa48("39574") ? {} : (stryCov_9fa48("39574"), {
  name: CLI_COMMAND.CONNECT,
  params: stryMutAct_9fa48("39575") ? [] : (stryCov_9fa48("39575"), [stryMutAct_9fa48("39576") ? "" : (stryCov_9fa48("39576"), 'address')]),
  description: stryMutAct_9fa48("39577") ? "" : (stryCov_9fa48("39577"), 'Connect to node at specified address'),
  aliases: stryMutAct_9fa48("39578") ? [] : (stryCov_9fa48("39578"), [stryMutAct_9fa48("39579") ? "" : (stryCov_9fa48("39579"), 'c')])
}), stryMutAct_9fa48("39580") ? {} : (stryCov_9fa48("39580"), {
  name: CLI_COMMAND.DRAIN,
  params: stryMutAct_9fa48("39581") ? [] : (stryCov_9fa48("39581"), [stryMutAct_9fa48("39582") ? "" : (stryCov_9fa48("39582"), 'node_id')]),
  description: stryMutAct_9fa48("39583") ? "" : (stryCov_9fa48("39583"), 'Mark a node as draining'),
  aliases: stryMutAct_9fa48("39584") ? ["Stryker was here"] : (stryCov_9fa48("39584"), [])
}), stryMutAct_9fa48("39585") ? {} : (stryCov_9fa48("39585"), {
  name: CLI_COMMAND.ACTIVATE,
  params: stryMutAct_9fa48("39586") ? [] : (stryCov_9fa48("39586"), [stryMutAct_9fa48("39587") ? "" : (stryCov_9fa48("39587"), 'node_id')]),
  description: stryMutAct_9fa48("39588") ? "" : (stryCov_9fa48("39588"), 'Mark a node as active'),
  aliases: stryMutAct_9fa48("39589") ? ["Stryker was here"] : (stryCov_9fa48("39589"), [])
}), stryMutAct_9fa48("39590") ? {} : (stryCov_9fa48("39590"), {
  name: CLI_COMMAND.REMOVE_NODE,
  params: stryMutAct_9fa48("39591") ? [] : (stryCov_9fa48("39591"), [stryMutAct_9fa48("39592") ? "" : (stryCov_9fa48("39592"), 'node_id')]),
  description: stryMutAct_9fa48("39593") ? "" : (stryCov_9fa48("39593"), 'Remove a node from cluster metadata'),
  aliases: stryMutAct_9fa48("39594") ? [] : (stryCov_9fa48("39594"), [stryMutAct_9fa48("39595") ? "" : (stryCov_9fa48("39595"), 'rm-node')])
}), stryMutAct_9fa48("39596") ? {} : (stryCov_9fa48("39596"), {
  name: CLI_COMMAND.REFRESH,
  params: stryMutAct_9fa48("39597") ? ["Stryker was here"] : (stryCov_9fa48("39597"), []),
  description: stryMutAct_9fa48("39598") ? "" : (stryCov_9fa48("39598"), 'Force refresh cache from server'),
  aliases: stryMutAct_9fa48("39599") ? [] : (stryCov_9fa48("39599"), [stryMutAct_9fa48("39600") ? "" : (stryCov_9fa48("39600"), 'r')])
}), stryMutAct_9fa48("39601") ? {} : (stryCov_9fa48("39601"), {
  name: CLI_COMMAND.FILTER,
  params: stryMutAct_9fa48("39602") ? [] : (stryCov_9fa48("39602"), [stryMutAct_9fa48("39603") ? "" : (stryCov_9fa48("39603"), 'pattern')]),
  description: stryMutAct_9fa48("39604") ? "" : (stryCov_9fa48("39604"), 'Filter current view by pattern'),
  aliases: stryMutAct_9fa48("39605") ? [] : (stryCov_9fa48("39605"), [stryMutAct_9fa48("39606") ? "" : (stryCov_9fa48("39606"), 'f'), stryMutAct_9fa48("39607") ? "" : (stryCov_9fa48("39607"), '/')])
}), stryMutAct_9fa48("39608") ? {} : (stryCov_9fa48("39608"), {
  name: CLI_COMMAND.SORT,
  params: stryMutAct_9fa48("39609") ? [] : (stryCov_9fa48("39609"), [stryMutAct_9fa48("39610") ? "" : (stryCov_9fa48("39610"), 'column'), stryMutAct_9fa48("39611") ? "" : (stryCov_9fa48("39611"), 'direction?')]),
  description: stryMutAct_9fa48("39612") ? "" : (stryCov_9fa48("39612"), 'Sort by column (direction: asc/desc)'),
  aliases: stryMutAct_9fa48("39613") ? [] : (stryCov_9fa48("39613"), [stryMutAct_9fa48("39614") ? "" : (stryCov_9fa48("39614"), 's')])
}), stryMutAct_9fa48("39615") ? {} : (stryCov_9fa48("39615"), {
  name: CLI_COMMAND.GOTO,
  params: stryMutAct_9fa48("39616") ? [] : (stryCov_9fa48("39616"), [stryMutAct_9fa48("39617") ? "" : (stryCov_9fa48("39617"), 'view')]),
  description: stryMutAct_9fa48("39618") ? "" : (stryCov_9fa48("39618"), 'Go to specified view'),
  aliases: stryMutAct_9fa48("39619") ? [] : (stryCov_9fa48("39619"), [stryMutAct_9fa48("39620") ? "" : (stryCov_9fa48("39620"), 'g')])
}), stryMutAct_9fa48("39621") ? {} : (stryCov_9fa48("39621"), {
  name: CLI_COMMAND.SQL,
  params: stryMutAct_9fa48("39622") ? ["Stryker was here"] : (stryCov_9fa48("39622"), []),
  description: stryMutAct_9fa48("39623") ? "" : (stryCov_9fa48("39623"), 'Open SQL query view'),
  aliases: stryMutAct_9fa48("39624") ? ["Stryker was here"] : (stryCov_9fa48("39624"), [])
}), stryMutAct_9fa48("39625") ? {} : (stryCov_9fa48("39625"), {
  name: CLI_COMMAND.SINCE,
  params: stryMutAct_9fa48("39626") ? [] : (stryCov_9fa48("39626"), [stryMutAct_9fa48("39627") ? "" : (stryCov_9fa48("39627"), 'value')]),
  description: stryMutAct_9fa48("39628") ? "" : (stryCov_9fa48("39628"), 'Set live logs start time (now, ISO/epoch, or relative like -5m)'),
  aliases: stryMutAct_9fa48("39629") ? ["Stryker was here"] : (stryCov_9fa48("39629"), [])
}), stryMutAct_9fa48("39630") ? {} : (stryCov_9fa48("39630"), {
  name: CLI_COMMAND.HELP,
  params: stryMutAct_9fa48("39631") ? [] : (stryCov_9fa48("39631"), [stryMutAct_9fa48("39632") ? "" : (stryCov_9fa48("39632"), 'command?')]),
  description: stryMutAct_9fa48("39633") ? "" : (stryCov_9fa48("39633"), 'Show help (optionally for specific command)'),
  aliases: stryMutAct_9fa48("39634") ? [] : (stryCov_9fa48("39634"), [stryMutAct_9fa48("39635") ? "" : (stryCov_9fa48("39635"), 'h'), stryMutAct_9fa48("39636") ? "" : (stryCov_9fa48("39636"), '?')])
}), stryMutAct_9fa48("39637") ? {} : (stryCov_9fa48("39637"), {
  name: CLI_COMMAND.QUIT,
  params: stryMutAct_9fa48("39638") ? ["Stryker was here"] : (stryCov_9fa48("39638"), []),
  description: stryMutAct_9fa48("39639") ? "" : (stryCov_9fa48("39639"), 'Exit application'),
  aliases: stryMutAct_9fa48("39640") ? [] : (stryCov_9fa48("39640"), [stryMutAct_9fa48("39641") ? "" : (stryCov_9fa48("39641"), 'q'), stryMutAct_9fa48("39642") ? "" : (stryCov_9fa48("39642"), 'exit')])
}), stryMutAct_9fa48("39643") ? {} : (stryCov_9fa48("39643"), {
  name: CLI_COMMAND.HISTORY,
  params: stryMutAct_9fa48("39644") ? [] : (stryCov_9fa48("39644"), [stryMutAct_9fa48("39645") ? "" : (stryCov_9fa48("39645"), 'replica_id')]),
  description: stryMutAct_9fa48("39646") ? "" : (stryCov_9fa48("39646"), 'Show state transition history for a replica'),
  aliases: stryMutAct_9fa48("39647") ? [] : (stryCov_9fa48("39647"), [stryMutAct_9fa48("39648") ? "" : (stryCov_9fa48("39648"), 'hist')])
})]));
const CLI_COMMAND_ERROR = Object.freeze(stryMutAct_9fa48("39649") ? {} : (stryCov_9fa48("39649"), {
  EMPTY_COMMAND: stryMutAct_9fa48("39650") ? "" : (stryCov_9fa48("39650"), 'Empty command'),
  UNKNOWN_COMMAND_PREFIX: stryMutAct_9fa48("39651") ? "" : (stryCov_9fa48("39651"), 'Unknown command: '),
  MISSING_PARAMS_PREFIX: stryMutAct_9fa48("39652") ? "" : (stryCov_9fa48("39652"), 'Missing required parameter(s): ')
}));
const CLI_ERROR_LEVEL = Object.freeze(stryMutAct_9fa48("39653") ? {} : (stryCov_9fa48("39653"), {
  DEBUG: stryMutAct_9fa48("39654") ? "" : (stryCov_9fa48("39654"), 'debug'),
  INFO: stryMutAct_9fa48("39655") ? "" : (stryCov_9fa48("39655"), 'info'),
  WARNING: stryMutAct_9fa48("39656") ? "" : (stryCov_9fa48("39656"), 'warning'),
  ERROR: stryMutAct_9fa48("39657") ? "" : (stryCov_9fa48("39657"), 'error'),
  CRITICAL: stryMutAct_9fa48("39658") ? "" : (stryCov_9fa48("39658"), 'critical')
}));
const CLI_NOTIFICATION_TYPE = Object.freeze(stryMutAct_9fa48("39659") ? {} : (stryCov_9fa48("39659"), {
  INFO: stryMutAct_9fa48("39660") ? "" : (stryCov_9fa48("39660"), 'info'),
  SUCCESS: stryMutAct_9fa48("39661") ? "" : (stryCov_9fa48("39661"), 'success'),
  WARNING: stryMutAct_9fa48("39662") ? "" : (stryCov_9fa48("39662"), 'warning'),
  ERROR: stryMutAct_9fa48("39663") ? "" : (stryCov_9fa48("39663"), 'error')
}));
const CLI_TERMINAL_SIZE = Object.freeze(stryMutAct_9fa48("39664") ? {} : (stryCov_9fa48("39664"), {
  width: CLI_DEFAULT.MIN_TERMINAL_WIDTH,
  height: CLI_DEFAULT.MIN_TERMINAL_HEIGHT
}));
const CLI_STREAM = Object.freeze(stryMutAct_9fa48("39665") ? {} : (stryCov_9fa48("39665"), {
  ADMIN_PATH: stryMutAct_9fa48("39666") ? "" : (stryCov_9fa48("39666"), '/api/admin/stream')
}));
const CLI_HELP_TEXT = Object.freeze(stryMutAct_9fa48("39667") ? {} : (stryCov_9fa48("39667"), {
  TITLE: stryMutAct_9fa48("39668") ? `` : (stryCov_9fa48("39668"), `${CLI_APP.NAME} - Terminal-based administration tool`),
  USAGE: stryMutAct_9fa48("39669") ? `` : (stryCov_9fa48("39669"), `Usage: ${CLI_APP.BIN} [options] [node-address]`),
  EXAMPLES: stryMutAct_9fa48("39670") ? [] : (stryCov_9fa48("39670"), [stryMutAct_9fa48("39671") ? `` : (stryCov_9fa48("39671"), `${CLI_APP.BIN}                     Connect to localhost:8081`), stryMutAct_9fa48("39672") ? `` : (stryCov_9fa48("39672"), `${CLI_APP.BIN} localhost:8081      Connect to specific node`), stryMutAct_9fa48("39673") ? `` : (stryCov_9fa48("39673"), `${CLI_APP.BIN} --read-only         Start in read-only mode`)])
}));
const CLI_VERSION_PREFIX = stryMutAct_9fa48("39674") ? "" : (stryCov_9fa48("39674"), 'ddb-admin version ');
export { CLI_APP, CLI_COLOR_SCHEME, CLI_COMMAND, CLI_COMMAND_DEFINITIONS, CLI_COMMAND_ERROR, CLI_DEFAULT, CLI_ENV, CLI_ERROR_LEVEL, CLI_FLAG, CLI_HELP_TEXT, CLI_NOTIFICATION_TYPE, CLI_PATH, CLI_STREAM, CLI_TERMINAL_SIZE, CLI_VERSION_PREFIX, CLI_VERSION, CLI_VIEW, CLI_VIEW_LIST, STRING };