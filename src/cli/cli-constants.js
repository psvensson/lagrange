import {NUM, STRING} from '../constants/index.js';

const CLI_APP = Object.freeze({
  NAME: 'DDB Admin CLI',
  BIN: 'ddb-admin',
});

const CLI_VERSION = '1.0.0';

const CLI_ENV = Object.freeze({
  NODE_ADDRESS: 'DDB_NODE_ADDRESS',
  REFRESH_INTERVAL: 'DDB_REFRESH_INTERVAL',
  DEBUG: 'DDB_CLI_DEBUG',
  DEBUG_ENABLED_VALUE: '1',
});

const CLI_FLAG = Object.freeze({
  READ_ONLY: '--read-only',
  HELP: '--help',
  HELP_SHORT: '-h',
  VERSION: '--version',
  VERSION_SHORT: '-v',
});

const CLI_PATH = Object.freeze({
  CONFIG_DIR_NAME: '.ddb-admin',
  CONFIG_FILE: 'config.json',
  CACHE_FILE: 'cache.json',
  ERROR_LOG_FILE: 'error.log',
  QUERY_HISTORY_FILE: 'query_history.json',
  DEBUG_LOG_FILE: '/tmp/ddb-cli-debug.log',
});

const CLI_COLOR_SCHEME = Object.freeze({
  DEFAULT: 'default',
  MONOCHROME: 'monochrome',
});

const CLI_VIEW = Object.freeze({
  NODES: 'nodes',
  SERVICES: 'services',
  TABLES: 'tables',
  PARTITIONS: 'partitions',
  MESSAGE_GROUPS: 'message_groups',
  SQL: 'sql',
  LOGS: 'logs',
  CONFIG: 'config',
  CONTEXTS: 'contexts',
});

const CLI_VIEW_LIST = Object.freeze([
  CLI_VIEW.NODES,
  CLI_VIEW.SERVICES,
  CLI_VIEW.TABLES,
  CLI_VIEW.PARTITIONS,
  CLI_VIEW.MESSAGE_GROUPS,
  CLI_VIEW.SQL,
  CLI_VIEW.LOGS,
  CLI_VIEW.CONFIG,
  CLI_VIEW.CONTEXTS,
]);

const CLI_DEFAULT = Object.freeze({
  REFRESH_INTERVAL_MS: NUM.TWO * NUM.THOUSAND,
  DEFAULT_VIEW: CLI_VIEW.NODES,
  COLOR_SCHEME: CLI_COLOR_SCHEME.DEFAULT,
  CACHE_PERSISTENCE: true,
  CDC_LAG_THRESHOLD_MS: NUM.FIVE * NUM.THOUSAND,
  READ_ONLY_MODE: false,
  MAX_HISTORY: NUM.HUNDRED,
  MAX_NOTIFICATIONS: NUM.FIVE * NUM.TEN,
  DEFAULT_NOTIFICATION_DURATION_MS: NUM.FIVE * NUM.THOUSAND,
  MIN_TERMINAL_WIDTH: 80,
  MIN_TERMINAL_HEIGHT: 24,
});

const CLI_COMMAND = Object.freeze({
  CONNECT: 'connect',
  REFRESH: 'refresh',
  FILTER: 'filter',
  SORT: 'sort',
  GOTO: 'goto',
  SQL: 'sql',
  HELP: 'help',
  QUIT: 'quit',
  HISTORY: 'history',
});

const CLI_COMMAND_DEFINITIONS = Object.freeze([
  {
    name: CLI_COMMAND.CONNECT,
    params: ['address'],
    description: 'Connect to node at specified address',
    aliases: ['c'],
  },
  {
    name: CLI_COMMAND.REFRESH,
    params: [],
    description: 'Force refresh cache from server',
    aliases: ['r'],
  },
  {
    name: CLI_COMMAND.FILTER,
    params: ['pattern'],
    description: 'Filter current view by pattern',
    aliases: ['f', '/'],
  },
  {
    name: CLI_COMMAND.SORT,
    params: ['column', 'direction?'],
    description: 'Sort by column (direction: asc/desc)',
    aliases: ['s'],
  },
  {
    name: CLI_COMMAND.GOTO,
    params: ['view'],
    description: 'Go to specified view',
    aliases: ['g'],
  },
  {
    name: CLI_COMMAND.SQL,
    params: [],
    description: 'Open SQL query view',
    aliases: [],
  },
  {
    name: CLI_COMMAND.HELP,
    params: ['command?'],
    description: 'Show help (optionally for specific command)',
    aliases: ['h', '?'],
  },
  {
    name: CLI_COMMAND.QUIT,
    params: [],
    description: 'Exit application',
    aliases: ['q', 'exit'],
  },
  {
    name: CLI_COMMAND.HISTORY,
    params: ['replica_id'],
    description: 'Show state transition history for a replica',
    aliases: ['hist'],
  },
]);

const CLI_COMMAND_ERROR = Object.freeze({
  EMPTY_COMMAND: 'Empty command',
  UNKNOWN_COMMAND_PREFIX: 'Unknown command: ',
  MISSING_PARAMS_PREFIX: 'Missing required parameter(s): ',
});

const CLI_ERROR_LEVEL = Object.freeze({
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
});

const CLI_NOTIFICATION_TYPE = Object.freeze({
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
});

const CLI_TERMINAL_SIZE = Object.freeze({
  width: CLI_DEFAULT.MIN_TERMINAL_WIDTH,
  height: CLI_DEFAULT.MIN_TERMINAL_HEIGHT,
});

const CLI_STREAM = Object.freeze({
  ADMIN_PATH: '/api/admin/stream',
});

const CLI_HELP_TEXT = Object.freeze({
  TITLE: `${CLI_APP.NAME} - Terminal-based administration tool`,
  USAGE: `Usage: ${CLI_APP.BIN} [options] [node-address]`,
  EXAMPLES: [
    `${CLI_APP.BIN}                     Connect to localhost:8081`,
    `${CLI_APP.BIN} localhost:8080      Connect to specific node`,
    `${CLI_APP.BIN} --read-only         Start in read-only mode`,
  ],
});

const CLI_VERSION_PREFIX = 'ddb-admin version ';

export {
  CLI_APP,
  CLI_COLOR_SCHEME,
  CLI_COMMAND,
  CLI_COMMAND_DEFINITIONS,
  CLI_COMMAND_ERROR,
  CLI_DEFAULT,
  CLI_ENV,
  CLI_ERROR_LEVEL,
  CLI_FLAG,
  CLI_HELP_TEXT,
  CLI_NOTIFICATION_TYPE,
  CLI_PATH,
  CLI_STREAM,
  CLI_TERMINAL_SIZE,
  CLI_VERSION_PREFIX,
  CLI_VERSION,
  CLI_VIEW,
  CLI_VIEW_LIST,
  STRING,
};
