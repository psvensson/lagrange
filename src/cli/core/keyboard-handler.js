const LOCAL_STR_NORMAL = 'normal';
const LOCAL_STR_FILTER = 'filter';
const LOCAL_STR_COMMAND = 'command';
const LOCAL_STR_NODES = 'nodes';
const LOCAL_STR_REPLICAS = 'replicas';
const LOCAL_STR_TABLES = 'tables';
const LOCAL_STR_PARTITIONS = 'partitions';
const LOCAL_STR_MESSAGE_GROUPS = 'message_groups';
const LOCAL_STR_SQL = 'sql';
const LOCAL_STR_LOGS = 'logs';
const LOCAL_STR_CONFIG = 'config';
const LOCAL_STR_CONTEXTS = 'contexts';
const LOCAL_STR_SERVICES = 'services';
const LOCAL_NUM_TEN = 10;
const LOCAL_STR_HELP_DISMISS = 'help:dismiss';
const LOCAL_STR_C = 'c';
const LOCAL_STR_APP_FORCE_QUIT = 'app:force-quit';
const LOCAL_STR_ESCAPE = 'escape';
const LOCAL_STR_FILTER_CANCEL = 'filter:cancel';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_FILTER_APPLY = 'filter:apply';
const LOCAL_STR_BACKSPACE = 'backspace';
const LOCAL_STR_FILTER_INPUT = 'filter:input';
const LOCAL_STR_COMMAND_INPUT = 'command:input';
const LOCAL_STR_VIEW_SWITCH = 'view:switch';
const LOCAL_STR_SLASH = '/';
const LOCAL_STR_MODE_FILTER = 'mode:filter';
const LOCAL_STR_COLON = ':';
const LOCAL_STR_MODE_COMMAND = 'mode:command';
const LOCAL_STR_QUESTION = '?';
const LOCAL_STR_HELP_SHOW = 'help:show';
const LOCAL_STR_COMMAND_CANCEL = 'command:cancel';
const LOCAL_STR_TAB = 'tab';
const LOCAL_STR_UP = 'up';
const LOCAL_STR_DOWN = 'down';
const LOCAL_STR_COMMAND_HISTORY = 'command:history';
const LOCAL_STR_COMMAND_ERROR = 'command:error';
const LOCAL_STR_COMMAND_EXECUTE = 'command:execute';
const LOCAL_STR_COMMAND_AUTOCOMPLETE = 'command:autocomplete';
const LOCAL_STR_COMMAND_COMPLETIONS = 'command:completions';
const LOCAL_STR_KEYBOARD_MODE = 'keyboard:mode';
const LOCAL_STR_KEYBOARD_INPUT = 'keyboard:input';
const LOCAL_STR_ENTER_2 = 'Enter';
const LOCAL_STR_APPLY_FILTER = 'Apply filter';
const LOCAL_STR_ESCAPE_2 = 'Escape';
const LOCAL_STR_CANCEL = 'Cancel';
const LOCAL_STR_EXECUTE_COMMAND = 'Execute command';
const LOCAL_STR_TAB_2 = 'Tab';
const LOCAL_STR_AUTOCOMPLETE = 'Autocomplete';
const LOCAL_STR_1UYVY = '↑/↓';
const LOCAL_STR_NAVIGATE = 'Navigate';
const LOCAL_STR_SELECT = 'Select';
const LOCAL_STR_FILTER_2 = 'Filter';
const LOCAL_STR_COMMAND_2 = 'Command';
const LOCAL_STR_P = 'p';
const LOCAL_STR_PAUSE_RESUME_CDC = 'Pause/Resume CDC';
const LOCAL_STR_R = 'r';
const LOCAL_STR_REFRESH = 'Refresh';
const LOCAL_STR_HELP = 'Help';
const LOCAL_STR_Q = 'q';
const LOCAL_STR_QUIT = 'Quit';

/**
 * KeyboardHandler - Centralized keyboard navigation and input handling
 *
 * Handles arrow keys, Page Up/Down, Home/End, number keys for view switching,
 * filter mode ('/'), command mode (':'), quit ('q'), and Escape for cancel/back.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8
 */

/**
 * Input modes for the keyboard handler
 */
export const INPUT_MODE = {
  NORMAL: LOCAL_STR_NORMAL,
  FILTER: LOCAL_STR_FILTER,
  COMMAND: LOCAL_STR_COMMAND,
};

/**
 * View mapping for number keys
 */
export const VIEW_KEYS = {
  '1': LOCAL_STR_NODES,
  '2': LOCAL_STR_REPLICAS,
  '3': LOCAL_STR_TABLES,
  '4': LOCAL_STR_PARTITIONS,
  '5': LOCAL_STR_MESSAGE_GROUPS,
  '6': LOCAL_STR_SQL,
  '7': LOCAL_STR_LOGS,
  '8': LOCAL_STR_CONFIG,
  '9': LOCAL_STR_CONTEXTS,
  '0': LOCAL_STR_SERVICES,
};

const NORMAL_MODE_NAVIGATION_ACTION = Object.freeze({
  backspace: {type: 'navigate:back'},
  down: {type: 'navigate:down'},
  end: {type: 'navigate:last'},
  enter: {type: 'navigate:select'},
  escape: {type: 'navigate:back'},
  home: {type: 'navigate:first'},
  pagedown: {type: 'navigate:pagedown', usesPageSize: true},
  pageup: {type: 'navigate:pageup', usesPageSize: true},
  up: {type: 'navigate:up'},
});

const NORMAL_MODE_CHARACTER_ACTION = Object.freeze({
  'd': 'detail:toggle',
  'e': 'config:edit',
  'p': 'cdc:toggle-pause',
  'q': 'app:quit',
  'r': 'cache:refresh',
  'R': 'config:revert',
  's': 'view:sort',
});

/**
 * @typedef {Object} KeyEvent
 * @property {string} name - Key name (e.g., 'up', 'down', 'enter')
 * @property {string} [ch] - Character for printable keys
 * @property {boolean} [ctrl] - Ctrl modifier
 * @property {boolean} [shift] - Shift modifier
 * @property {boolean} [meta] - Meta/Alt modifier
 * @property {string} [full] - Full key name with modifiers
 */

/**
 * @typedef {Object} KeyboardAction
 * @property {string} type - Action type
 * @property {*} [payload] - Action payload
 */

/**
 * KeyboardHandler class for centralized keyboard input handling
 */
export class KeyboardHandler {
  /**
   * @param {Object} options - Configuration options
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('./state-manager.js').StateManager} [options.stateManager] - State
   * @param {import('./navigation-controller.js').NavigationController} [options.navigation]
   * @param {import('./command-parser.js').CommandParser} [options.commandParser] - Parser
   * @param {import('./help-overlay.js').HelpOverlay} [options.helpOverlay] - Help overlay
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.stateManager = options.stateManager || null;
    this.navigation = options.navigation || null;
    this.commandParser = options.commandParser || null;
    this.helpOverlay = options.helpOverlay || null;

    // Current input mode
    this.mode = INPUT_MODE.NORMAL;

    // Input buffer for filter/command modes
    this.inputBuffer = '';

    // Page size for Page Up/Down
    this.pageSize = options.pageSize || LOCAL_NUM_TEN;

    // Callbacks for mode changes
    this.onModeChange = options.onModeChange || null;
    this.onInputChange = options.onInputChange || null;
    this.onAction = options.onAction || null;
  }

  /**
   * Handle a key event
   * @param {KeyEvent} key - Key event
   * @returns {KeyboardAction|null} Action to perform, or null if not handled
   */
  handleKey(key) {
    // Help overlay takes priority
    if (this.helpOverlay && this.helpOverlay.isVisible()) {
      this.helpOverlay.handleKey(key);
      return {type: LOCAL_STR_HELP_DISMISS};
    }

    // Route based on current mode
    if (this.mode === INPUT_MODE.FILTER) {
      return this.handleFilterMode(key);
    }
    if (this.mode === INPUT_MODE.COMMAND) {
      return this.handleCommandMode(key);
    }
    return this.handleNormalMode(key);
  }

  /**
   * Handle key in normal mode
   * @param {KeyEvent} key - Key event
   * @returns {KeyboardAction|null}
   */
  handleNormalMode(key) {
    const keyName = key.full || key.name || '';
    const navigationAction = this.handleNormalModeNavigationKey(keyName);
    if (navigationAction) {
      return navigationAction;
    }

    // Check for character keys
    const ch = key.ch || '';

    const viewSwitchAction = this.handleNormalModeViewSwitch(ch);
    if (viewSwitchAction) {
      return viewSwitchAction;
    }

    const inputModeAction = this.handleNormalModeInputModeSwitch(ch);
    if (inputModeAction) {
      return inputModeAction;
    }

    const helpAction = this.handleNormalModeHelp(ch);
    if (helpAction) {
      return helpAction;
    }

    if (key.ctrl && ch === LOCAL_STR_C) {
      return this.emitAction(LOCAL_STR_APP_FORCE_QUIT);
    }

    return this.handleNormalModeCharacterAction(ch);
  }

  /**
   * Handle key in filter mode
   * @param {KeyEvent} key - Key event
   * @returns {KeyboardAction|null}
   */
  handleFilterMode(key) {
    const keyName = key.full || key.name || '';

    // Escape exits filter mode
    if (keyName === LOCAL_STR_ESCAPE) {
      this.exitInputMode();
      return {type: LOCAL_STR_FILTER_CANCEL};
    }

    // Enter applies filter
    if (keyName === LOCAL_STR_ENTER) {
      const filter = this.inputBuffer;
      this.exitInputMode();
      return this.emitAction(LOCAL_STR_FILTER_APPLY, {pattern: filter});
    }

    // Backspace removes character
    if (keyName === LOCAL_STR_BACKSPACE) {
      if (this.inputBuffer.length > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, -1);
        this.notifyInputChange();
      }
      return {type: LOCAL_STR_FILTER_INPUT, value: this.inputBuffer};
    }

    // Add printable characters
    if (key.ch && key.ch.length === 1) {
      this.inputBuffer += key.ch;
      this.notifyInputChange();
      return {type: LOCAL_STR_FILTER_INPUT, value: this.inputBuffer};
    }

    return null;
  }

  /**
   * Handle key in command mode
   * @param {KeyEvent} key - Key event
   * @returns {KeyboardAction|null}
   */
  handleCommandMode(key) {
    const keyName = key.full || key.name || '';
    const specialAction = this.handleCommandModeSpecialKey(keyName);
    if (specialAction) {
      return specialAction;
    }

    return this.handleBufferedCharacterInput(key.ch, LOCAL_STR_COMMAND_INPUT);
  }

  handleNormalModeNavigationKey(keyName) {
    const descriptor = NORMAL_MODE_NAVIGATION_ACTION[keyName];
    if (!descriptor) {
      return null;
    }

    return descriptor.usesPageSize ?
      this.emitAction(descriptor.type, {count: this.pageSize}) :
      this.emitAction(descriptor.type);
  }

  handleNormalModeViewSwitch(ch) {
    const view = VIEW_KEYS[ch];
    return view ? this.emitAction(LOCAL_STR_VIEW_SWITCH, {view}) : null;
  }

  handleNormalModeInputModeSwitch(ch) {
    if (ch === LOCAL_STR_SLASH) {
      this.enterFilterMode();
      return {type: LOCAL_STR_MODE_FILTER};
    }
    if (ch === LOCAL_STR_COLON) {
      this.enterCommandMode();
      return {type: LOCAL_STR_MODE_COMMAND};
    }
    return null;
  }

  handleNormalModeHelp(ch) {
    if (ch !== LOCAL_STR_QUESTION) {
      return null;
    }
    if (this.helpOverlay) {
      this.helpOverlay.show();
    }
    return {type: LOCAL_STR_HELP_SHOW};
  }

  handleNormalModeCharacterAction(ch) {
    const actionType = NORMAL_MODE_CHARACTER_ACTION[ch];
    return actionType ? this.emitAction(actionType) : null;
  }

  handleCommandModeSpecialKey(keyName) {
    if (keyName === LOCAL_STR_ESCAPE) {
      this.exitInputMode();
      return {type: LOCAL_STR_COMMAND_CANCEL};
    }
    if (keyName === LOCAL_STR_ENTER) {
      return this.executeBufferedCommand();
    }
    if (keyName === LOCAL_STR_TAB) {
      return this.autocompleteCommandInput();
    }
    if (keyName === LOCAL_STR_UP) {
      return this.recallCommandHistory();
    }
    if (keyName === LOCAL_STR_DOWN) {
      return {type: LOCAL_STR_COMMAND_HISTORY, direction: LOCAL_STR_DOWN};
    }
    if (keyName === LOCAL_STR_BACKSPACE) {
      return this.removeBufferedCharacter(LOCAL_STR_COMMAND_INPUT);
    }
    return null;
  }

  executeBufferedCommand() {
    const command = this.inputBuffer;
    this.exitInputMode();

    if (this.commandParser) {
      const result = this.commandParser.parse(command);
      if (result.error) {
        return this.emitAction(LOCAL_STR_COMMAND_ERROR, {error: result.error});
      }
      return this.emitAction(LOCAL_STR_COMMAND_EXECUTE, {
        command: result.command,
        args: result.args,
      });
    }

    return {type: LOCAL_STR_COMMAND_EXECUTE, command};
  }

  autocompleteCommandInput() {
    if (!this.commandParser) {
      return {type: LOCAL_STR_COMMAND_AUTOCOMPLETE, value: this.inputBuffer};
    }

    const completions = this.commandParser.getCompletions(this.inputBuffer);
    if (completions.length === 1) {
      this.inputBuffer = completions[0];
      this.notifyInputChange();
    } else if (completions.length > 1) {
      return {type: LOCAL_STR_COMMAND_COMPLETIONS, completions};
    }

    return {type: LOCAL_STR_COMMAND_AUTOCOMPLETE, value: this.inputBuffer};
  }

  recallCommandHistory() {
    if (!this.commandParser) {
      return null;
    }

    const history = this.commandParser.getHistory();
    if (history.length > 0) {
      this.inputBuffer = history[0] || '';
      this.notifyInputChange();
    }
    return {type: LOCAL_STR_COMMAND_HISTORY, direction: LOCAL_STR_UP};
  }

  removeBufferedCharacter(actionType) {
    if (this.inputBuffer.length > 0) {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
      this.notifyInputChange();
    }
    return {type: actionType, value: this.inputBuffer};
  }

  handleBufferedCharacterInput(ch, actionType) {
    if (!ch || ch.length !== 1) {
      return null;
    }

    this.inputBuffer += ch;
    this.notifyInputChange();
    return {type: actionType, value: this.inputBuffer};
  }

  /**
   * Enter filter mode
   */
  enterFilterMode() {
    this.mode = INPUT_MODE.FILTER;
    this.inputBuffer = '';
    this.notifyModeChange();
  }

  /**
   * Enter command mode
   */
  enterCommandMode() {
    this.mode = INPUT_MODE.COMMAND;
    this.inputBuffer = '';
    this.notifyModeChange();
  }

  /**
   * Exit input mode and return to normal
   */
  exitInputMode() {
    this.mode = INPUT_MODE.NORMAL;
    this.inputBuffer = '';
    this.notifyModeChange();
  }

  /**
   * Get current input mode
   * @returns {string}
   */
  getMode() {
    return this.mode;
  }

  /**
   * Get current input buffer
   * @returns {string}
   */
  getInputBuffer() {
    return this.inputBuffer;
  }

  /**
   * Set input buffer (for external updates)
   * @param {string} value - New buffer value
   */
  setInputBuffer(value) {
    this.inputBuffer = value;
    this.notifyInputChange();
  }

  /**
   * Check if in input mode (filter or command)
   * @returns {boolean}
   */
  isInInputMode() {
    return this.mode !== INPUT_MODE.NORMAL;
  }

  /**
   * Emit an action
   * @param {string} type - Action type
   * @param {Object} [payload] - Action payload
   * @returns {KeyboardAction}
   */
  emitAction(type, payload = {}) {
    const action = {type, ...payload};

    if (this.onAction) {
      this.onAction(action);
    }

    if (this.eventBus) {
      this.eventBus.emit(`keyboard:${type}`, payload);
    }

    return action;
  }

  /**
   * Notify mode change
   */
  notifyModeChange() {
    if (this.onModeChange) {
      this.onModeChange(this.mode);
    }

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_KEYBOARD_MODE, {mode: this.mode});
    }
  }

  /**
   * Notify input change
   */
  notifyInputChange() {
    if (this.onInputChange) {
      this.onInputChange(this.inputBuffer);
    }

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_KEYBOARD_INPUT, {
        mode: this.mode,
        value: this.inputBuffer,
      });
    }
  }

  /**
   * Get available shortcuts for current mode
   * @returns {Array<{key: string, description: string}>}
   */
  getAvailableShortcuts() {
    if (this.mode === INPUT_MODE.FILTER) {
      return [
        {key: LOCAL_STR_ENTER_2, description: LOCAL_STR_APPLY_FILTER},
        {key: LOCAL_STR_ESCAPE_2, description: LOCAL_STR_CANCEL},
      ];
    }
    if (this.mode === INPUT_MODE.COMMAND) {
      return [
        {key: LOCAL_STR_ENTER_2, description: LOCAL_STR_EXECUTE_COMMAND},
        {key: LOCAL_STR_TAB_2, description: LOCAL_STR_AUTOCOMPLETE},
        {key: LOCAL_STR_ESCAPE_2, description: LOCAL_STR_CANCEL},
      ];
    }
    return [
      {key: LOCAL_STR_1UYVY, description: LOCAL_STR_NAVIGATE},
      {key: LOCAL_STR_ENTER_2, description: LOCAL_STR_SELECT},
      {key: LOCAL_STR_SLASH, description: LOCAL_STR_FILTER_2},
      {key: LOCAL_STR_COLON, description: LOCAL_STR_COMMAND_2},
      {key: LOCAL_STR_P, description: LOCAL_STR_PAUSE_RESUME_CDC},
      {key: LOCAL_STR_R, description: LOCAL_STR_REFRESH},
      {key: LOCAL_STR_QUESTION, description: LOCAL_STR_HELP},
      {key: LOCAL_STR_Q, description: LOCAL_STR_QUIT},
    ];
  }

  /**
   * Get status bar text for current mode
   * @returns {string}
   */
  getStatusBarText() {
    if (this.mode === INPUT_MODE.FILTER) {
      return `Filter: ${this.inputBuffer}_`;
    }
    if (this.mode === INPUT_MODE.COMMAND) {
      return `:${this.inputBuffer}_`;
    }
    return '';
  }

  /**
   * Check if a key is a navigation key
   * @param {KeyEvent} key - Key event
   * @returns {boolean}
   */
  isNavigationKey(key) {
    const navKeys = ['up', 'down', 'pageup', 'pagedown', 'home', 'end'];
    return navKeys.includes(key.name || key.full || '');
  }

  /**
   * Check if a key is a view switch key
   * @param {KeyEvent} key - Key event
   * @returns {boolean}
   */
  isViewSwitchKey(key) {
    return Object.prototype.hasOwnProperty.call(VIEW_KEYS, key.ch || '');
  }

  /**
   * Get view name for a key
   * @param {KeyEvent} key - Key event
   * @returns {string|null}
   */
  getViewForKey(key) {
    return VIEW_KEYS[key.ch || ''] || null;
  }
}
