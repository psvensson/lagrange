import {CLI_VIEW} from './cli-constants.js';

const LOCAL_STR_YELLOW = 'yellow';
const LOCAL_NUM_TWO_THOUSAND = 2000;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_RESIZE = 'resize';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_100 = '100%';
const LOCAL_NUM_THREE = 3;
const LOCAL_STR_LINE = 'line';
const LOCAL_STR_BLUE = 'blue';
const LOCAL_STR_100_6 = '100%-6';
const LOCAL_STR_CYAN = 'cyan';
const LOCAL_STR_WHITE = 'white';
const LOCAL_NUM_TWO = 2;
const LOCAL_NUM_TWENTY = 20;
const LOCAL_NUM_TWELVE = 12;
const LOCAL_NUM_TEN = 10;
const LOCAL_STR_CENTER = 'center';
const LOCAL_STR_80 = '80%';
const LOCAL_STR_GREEN = 'green';
const LOCAL_STR_BLACK = 'black';
const LOCAL_STR_40 = '40%';
const LOCAL_STR_MAGENTA = 'magenta';
const LOCAL_STR_100_14 = '100%-14';
const LOCAL_NUM_FIVE = 5;
const LOCAL_STR_CRB9D = ' SQL Query (Ctrl+X to execute, Esc to clear) ';
const LOCAL_STR_EXECUTE = ' Execute ';
const LOCAL_STR_MIDDLE = 'middle';
const LOCAL_NUM_SIX = 6;
const LOCAL_STR_60 = '60%';
const LOCAL_STR_100_8 = '100%-8';
const LOCAL_NUM_FIFTEEN = 15;
const LOCAL_STR_15RD3 = ' Results (↑↓ navigate, Tab: detail panel) ';
const LOCAL_STR_ROW_DETAILS = ' Row Details ';
const LOCAL_STR_100_2 = '100%-2';
const LOCAL_STR_RESULTS = ' Results ';
const LOCAL_NUM_SIXTY = 60;
const LOCAL_STR_EDIT_CONFIGURATION = ' Edit Configuration ';
const LOCAL_STR_EMPTY = '';
const LOCAL_NUM_FOUR = 4;
const LOCAL_NUM_EIGHT = 8;
const LOCAL_STR_LVBX0 = '{cyan-fg}Enter{/cyan-fg}:Save  {cyan-fg}Esc{/cyan-fg}:Cancel';
const LOCAL_STR_ESCAPE = 'escape';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_SUBMIT = 'submit';
const LOCAL_STR_C_X = 'C-x';
const LOCAL_STR_PRESS = 'press';
const LOCAL_STR_NODES = 'nodes';
const LOCAL_STR_SERVICES = 'services';
const LOCAL_STR_REPLICAS = 'replicas';
const LOCAL_STR_TABLES = 'tables';
const LOCAL_STR_PARTITIONS = 'partitions';
const LOCAL_STR_MESSAGE_GROUPS = 'message_groups';
const LOCAL_STR_LOGS = 'logs';
const LOCAL_STR_CONFIG = 'config';
const LOCAL_STR_CONTEXTS = 'contexts';
const LOCAL_STR_SQL = 'sql';
const LOCAL_STR_KEYPRESS = 'keypress';
const LOCAL_STR_CACHE_UPDATE = 'cache:update';
const LOCAL_STR_NAVIGATION_CHANGED = 'navigation:changed';
const LOCAL_STR_VIEW_REFRESH = 'view:refresh';
const LOCAL_STR_HELP_SHOW = 'help:show';
const LOCAL_STR_HELP_HIDE = 'help:hide';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_CONNECTED = 'connected';
const LOCAL_STR_1KRB7 = 'Connected - Waiting for cache...';
const LOCAL_STR_RECONNECTING = 'reconnecting';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_CONNECTION_FAILED = 'Connection failed';
const LOCAL_STR_RED = 'red';
const LOCAL_STR_DISCONNECTED = 'disconnected';
const LOCAL_STR_DISCONNECTED_2 = 'Disconnected';
const LOCAL_STR_128KJ = ', ';
const LOCAL_STR_SGZMJ = 'switchView(nodes) called - initial load';
const LOCAL_STR_1L5NX = 'refreshCurrentView() called - cache refresh';
const LOCAL_STR_QUERY_RESULT = 'query:result';
const LOCAL_STR_1ABO2 = 'Calling connectionManager.connect()';
const LOCAL_STR_462KR = 'connectionManager.connect() resolved';
const LOCAL_STR_1TP34 = 'SQL Query Interface';
const LOCAL_STR_FW0U6 = 'Enter a query above and press Ctrl+X to execute';
const LOCAL_STR_1CINP = '{bold}{cyan-fg}SQL Query Interface{/cyan-fg}{/bold}\n\n';
const LOCAL_STR_19GO0 = 'Enter a SQL query in the input box above and press ';
const LOCAL_STR_1L6CE = '{green-fg}Ctrl+X{/green-fg} or click {green-fg}Execute{/green-fg} to run.\n\n';
const LOCAL_STR_BOLD_EXAMPLES_BOLD = '{bold}Examples:{/bold}\n';
const LOCAL_STR_SELECT_FROM_NODES = '  SELECT * FROM nodes\n';
const LOCAL_STR_SELECT_FROM_TABLES = '  SELECT * FROM tables\n';
const LOCAL_STR_1LNVC = '  SELECT * FROM partitions\n';
const LOCAL_STR_B9JZ8 = '  SELECT * FROM services\n\n';
const LOCAL_STR_1B022 = '{bold}Navigation:{/bold}\n';
const LOCAL_STR_IQU5C = '  {cyan-fg}↑/↓{/cyan-fg}      Navigate results\n';
const LOCAL_STR_1J862 = '  {cyan-fg}PgUp/PgDn{/cyan-fg} Page through results\n';
const LOCAL_STR_1IRSA = '  {cyan-fg}g/G{/cyan-fg}      First/Last row\n\n';
const LOCAL_STR_5HIDN = '{bold}Shortcuts:{/bold}\n';
const LOCAL_STR_QM582 = '  {cyan-fg}Ctrl+X{/cyan-fg}   Execute query\n';
const LOCAL_STR_141HM = '  {cyan-fg}Esc{/cyan-fg}      Clear input\n';
const LOCAL_STR_1B05O = '  {cyan-fg}0-9{/cyan-fg}      Switch to other views';
const LOCAL_STR_CZGPU = '{cyan-fg}Ctrl+X{/cyan-fg}:Execute  ';
const LOCAL_STR_ZH2EO = '{cyan-fg}↑↓{/cyan-fg}:Navigate  ';
const LOCAL_STR_8G5X6 = '{cyan-fg}Esc{/cyan-fg}:Clear  ';
const LOCAL_STR_RS5HY = '{cyan-fg}0-9{/cyan-fg}:Views  ';
const LOCAL_STR_QUTO4 = '{cyan-fg}?{/cyan-fg}:Help';
const LOCAL_STR_5AG4A = '{cyan-fg}e{/cyan-fg}:Edit  ';
const LOCAL_STR_1BG3N = '{cyan-fg}R{/cyan-fg}:Revert  ';
const LOCAL_STR_108BZ = '{cyan-fg}d{/cyan-fg}:Details  ';
const LOCAL_STR_157A5 = '{cyan-fg}/{/cyan-fg}:Filter  ';
const LOCAL_STR_NAVIGATE_UP = 'navigate:up';
const LOCAL_STR_NAVIGATE_DOWN = 'navigate:down';
const LOCAL_STR_NAVIGATE_PAGEUP = 'navigate:pageup';
const LOCAL_STR_NAVIGATE_PAGEDOWN = 'navigate:pagedown';
const LOCAL_STR_NAVIGATE_FIRST = 'navigate:first';
const LOCAL_STR_NAVIGATE_LAST = 'navigate:last';
const LOCAL_STR_NAVIGATE_SELECT = 'navigate:select';
const LOCAL_STR_NAVIGATE_BACK = 'navigate:back';
const LOCAL_STR_VIEW_SWITCH = 'view:switch';
const LOCAL_STR_FILTER_APPLY = 'filter:apply';
const LOCAL_STR_COMMAND_EXECUTE = 'command:execute';
const LOCAL_STR_DETAIL_TOGGLE = 'detail:toggle';
const LOCAL_STR_CACHE_REFRESH = 'cache:refresh';
const LOCAL_STR_CDC_TOGGLE_PAUSE = 'cdc:toggle-pause';
const LOCAL_STR_CONFIG_EDIT = 'config:edit';
const LOCAL_STR_CONFIG_REVERT = 'config:revert';
const LOCAL_STR_APP_QUIT = 'app:quit';
const LOCAL_STR_APP_FORCE_QUIT = 'app:force-quit';
const LOCAL_STR_DRILLDOWN = 'drillDown';
const LOCAL_STR_GOTO = 'goto';
const LOCAL_STR_FILTER = 'filter';
const LOCAL_STR_REFRESH = 'refresh';
const LOCAL_STR_HELP = 'help';
const LOCAL_STR_QUIT = 'quit';
const LOCAL_STR_CONNECT = 'connect';
const LOCAL_STR_DRAIN = 'drain';
const LOCAL_STR_DRAINING = 'draining';
const LOCAL_STR_ACTIVATE = 'activate';
const LOCAL_STR_ACTIVE = 'active';
const LOCAL_STR_REMOVE_NODE = 'remove-node';
const LOCAL_STR_HISTORY = 'history';
const LOCAL_STR_SINCE = 'since';
const LOCAL_STR_GKTW6 = ' No details available';
const LOCAL_STR_NO_ITEM_SELECTED = ' No item selected';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_LMXQX = '{cyan-fg}── Related ──{/cyan-fg}\n';
const LOCAL_STR_14QE4 = '{cyan-fg}── Navigation ──{/cyan-fg}\n';
const LOCAL_STR_REFRESHING = 'Refreshing...';
const LOCAL_STR_CDC_UPDATES_PAUSED = 'CDC updates paused';
const LOCAL_STR_1V74X = 'CDC updates resumed';

/**
 * View name to number key mapping
 */
const VIEW_NUMBERS = {
  [CLI_VIEW.NODES]: '1',
  [CLI_VIEW.REPLICAS]: '2',
  [CLI_VIEW.TABLES]: '3',
  [CLI_VIEW.PARTITIONS]: '4',
  [CLI_VIEW.MESSAGE_GROUPS]: '5',
  [CLI_VIEW.SQL]: '6',
  [CLI_VIEW.LOGS]: '7',
  [CLI_VIEW.CONFIG]: '8',
  [CLI_VIEW.CONTEXTS]: '9',
  [CLI_VIEW.SERVICES]: '0',
};

export {
  LOCAL_STR_YELLOW,
  LOCAL_NUM_TWO_THOUSAND,
  LOCAL_NUM_ONE,
  LOCAL_STR_RESIZE,
  LOCAL_NUM_ZERO,
  LOCAL_STR_100,
  LOCAL_NUM_THREE,
  LOCAL_STR_LINE,
  LOCAL_STR_BLUE,
  LOCAL_STR_100_6,
  LOCAL_STR_CYAN,
  LOCAL_STR_WHITE,
  LOCAL_NUM_TWO,
  LOCAL_NUM_TWENTY,
  LOCAL_NUM_TWELVE,
  LOCAL_NUM_TEN,
  LOCAL_STR_CENTER,
  LOCAL_STR_80,
  LOCAL_STR_GREEN,
  LOCAL_STR_BLACK,
  LOCAL_STR_40,
  LOCAL_STR_MAGENTA,
  LOCAL_STR_100_14,
  LOCAL_NUM_FIVE,
  LOCAL_STR_CRB9D,
  LOCAL_STR_EXECUTE,
  LOCAL_STR_MIDDLE,
  LOCAL_NUM_SIX,
  LOCAL_STR_60,
  LOCAL_STR_100_8,
  LOCAL_NUM_FIFTEEN,
  LOCAL_STR_15RD3,
  LOCAL_STR_ROW_DETAILS,
  LOCAL_STR_100_2,
  LOCAL_STR_RESULTS,
  LOCAL_NUM_SIXTY,
  LOCAL_STR_EDIT_CONFIGURATION,
  LOCAL_STR_EMPTY,
  LOCAL_NUM_FOUR,
  LOCAL_NUM_EIGHT,
  LOCAL_STR_LVBX0,
  LOCAL_STR_ESCAPE,
  LOCAL_STR_ENTER,
  LOCAL_STR_SUBMIT,
  LOCAL_STR_C_X,
  LOCAL_STR_PRESS,
  LOCAL_STR_NODES,
  LOCAL_STR_SERVICES,
  LOCAL_STR_REPLICAS,
  LOCAL_STR_TABLES,
  LOCAL_STR_PARTITIONS,
  LOCAL_STR_MESSAGE_GROUPS,
  LOCAL_STR_LOGS,
  LOCAL_STR_CONFIG,
  LOCAL_STR_CONTEXTS,
  LOCAL_STR_SQL,
  LOCAL_STR_KEYPRESS,
  LOCAL_STR_CACHE_UPDATE,
  LOCAL_STR_NAVIGATION_CHANGED,
  LOCAL_STR_VIEW_REFRESH,
  LOCAL_STR_HELP_SHOW,
  LOCAL_STR_HELP_HIDE,
  LOCAL_STR_ERROR,
  LOCAL_STR_CONNECTED,
  LOCAL_STR_1KRB7,
  LOCAL_STR_RECONNECTING,
  LOCAL_STR_FAILED,
  LOCAL_STR_CONNECTION_FAILED,
  LOCAL_STR_RED,
  LOCAL_STR_DISCONNECTED,
  LOCAL_STR_DISCONNECTED_2,
  LOCAL_STR_128KJ,
  LOCAL_STR_SGZMJ,
  LOCAL_STR_1L5NX,
  LOCAL_STR_QUERY_RESULT,
  LOCAL_STR_1ABO2,
  LOCAL_STR_462KR,
  LOCAL_STR_1TP34,
  LOCAL_STR_FW0U6,
  LOCAL_STR_1CINP,
  LOCAL_STR_19GO0,
  LOCAL_STR_1L6CE,
  LOCAL_STR_BOLD_EXAMPLES_BOLD,
  LOCAL_STR_SELECT_FROM_NODES,
  LOCAL_STR_SELECT_FROM_TABLES,
  LOCAL_STR_1LNVC,
  LOCAL_STR_B9JZ8,
  LOCAL_STR_1B022,
  LOCAL_STR_IQU5C,
  LOCAL_STR_1J862,
  LOCAL_STR_1IRSA,
  LOCAL_STR_5HIDN,
  LOCAL_STR_QM582,
  LOCAL_STR_141HM,
  LOCAL_STR_1B05O,
  LOCAL_STR_CZGPU,
  LOCAL_STR_ZH2EO,
  LOCAL_STR_8G5X6,
  LOCAL_STR_RS5HY,
  LOCAL_STR_QUTO4,
  LOCAL_STR_5AG4A,
  LOCAL_STR_1BG3N,
  LOCAL_STR_108BZ,
  LOCAL_STR_157A5,
  LOCAL_STR_NAVIGATE_UP,
  LOCAL_STR_NAVIGATE_DOWN,
  LOCAL_STR_NAVIGATE_PAGEUP,
  LOCAL_STR_NAVIGATE_PAGEDOWN,
  LOCAL_STR_NAVIGATE_FIRST,
  LOCAL_STR_NAVIGATE_LAST,
  LOCAL_STR_NAVIGATE_SELECT,
  LOCAL_STR_NAVIGATE_BACK,
  LOCAL_STR_VIEW_SWITCH,
  LOCAL_STR_FILTER_APPLY,
  LOCAL_STR_COMMAND_EXECUTE,
  LOCAL_STR_DETAIL_TOGGLE,
  LOCAL_STR_CACHE_REFRESH,
  LOCAL_STR_CDC_TOGGLE_PAUSE,
  LOCAL_STR_CONFIG_EDIT,
  LOCAL_STR_CONFIG_REVERT,
  LOCAL_STR_APP_QUIT,
  LOCAL_STR_APP_FORCE_QUIT,
  LOCAL_STR_DRILLDOWN,
  LOCAL_STR_GOTO,
  LOCAL_STR_FILTER,
  LOCAL_STR_REFRESH,
  LOCAL_STR_HELP,
  LOCAL_STR_QUIT,
  LOCAL_STR_CONNECT,
  LOCAL_STR_DRAIN,
  LOCAL_STR_DRAINING,
  LOCAL_STR_ACTIVATE,
  LOCAL_STR_ACTIVE,
  LOCAL_STR_REMOVE_NODE,
  LOCAL_STR_HISTORY,
  LOCAL_STR_SINCE,
  LOCAL_STR_GKTW6,
  LOCAL_STR_NO_ITEM_SELECTED,
  LOCAL_STR_NEWLINE,
  LOCAL_STR_LMXQX,
  LOCAL_STR_14QE4,
  LOCAL_STR_REFRESHING,
  LOCAL_STR_CDC_UPDATES_PAUSED,
  LOCAL_STR_1V74X,
  VIEW_NUMBERS,
};
