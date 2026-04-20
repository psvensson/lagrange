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
  NORMAL: 'normal',
  FILTER: 'filter',
  COMMAND: 'command',
};

/**
 * View mapping for number keys
 */
export const VIEW_KEYS = {
  '1': 'nodes',
  '2': 'replicas',
  '3': 'tables',
  '4': 'partitions',
  '5': 'message_groups',
  '6': 'sql',
  '7': 'logs',
  '8': 'config',
  '9': 'contexts',
  '0': 'services',
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
    this.pageSize = options.pageSize || 10;

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
      return {type: 'help:dismiss'};
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

    if (key.ctrl && ch === 'c') {
      return this.emitAction('app:force-quit');
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
    if (keyName === 'escape') {
      this.exitInputMode();
      return {type: 'filter:cancel'};
    }

    // Enter applies filter
    if (keyName === 'enter') {
      const filter = this.inputBuffer;
      this.exitInputMode();
      return this.emitAction('filter:apply', {pattern: filter});
    }

    // Backspace removes character
    if (keyName === 'backspace') {
      if (this.inputBuffer.length > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, -1);
        this.notifyInputChange();
      }
      return {type: 'filter:input', value: this.inputBuffer};
    }

    // Add printable characters
    if (key.ch && key.ch.length === 1) {
      this.inputBuffer += key.ch;
      this.notifyInputChange();
      return {type: 'filter:input', value: this.inputBuffer};
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

    return this.handleBufferedCharacterInput(key.ch, 'command:input');
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
    return view ? this.emitAction('view:switch', {view}) : null;
  }

  handleNormalModeInputModeSwitch(ch) {
    if (ch === '/') {
      this.enterFilterMode();
      return {type: 'mode:filter'};
    }
    if (ch === ':') {
      this.enterCommandMode();
      return {type: 'mode:command'};
    }
    return null;
  }

  handleNormalModeHelp(ch) {
    if (ch !== '?') {
      return null;
    }
    if (this.helpOverlay) {
      this.helpOverlay.show();
    }
    return {type: 'help:show'};
  }

  handleNormalModeCharacterAction(ch) {
    const actionType = NORMAL_MODE_CHARACTER_ACTION[ch];
    return actionType ? this.emitAction(actionType) : null;
  }

  handleCommandModeSpecialKey(keyName) {
    if (keyName === 'escape') {
      this.exitInputMode();
      return {type: 'command:cancel'};
    }
    if (keyName === 'enter') {
      return this.executeBufferedCommand();
    }
    if (keyName === 'tab') {
      return this.autocompleteCommandInput();
    }
    if (keyName === 'up') {
      return this.recallCommandHistory();
    }
    if (keyName === 'down') {
      return {type: 'command:history', direction: 'down'};
    }
    if (keyName === 'backspace') {
      return this.removeBufferedCharacter('command:input');
    }
    return null;
  }

  executeBufferedCommand() {
    const command = this.inputBuffer;
    this.exitInputMode();

    if (this.commandParser) {
      const result = this.commandParser.parse(command);
      if (result.error) {
        return this.emitAction('command:error', {error: result.error});
      }
      return this.emitAction('command:execute', {
        command: result.command,
        args: result.args,
      });
    }

    return {type: 'command:execute', command};
  }

  autocompleteCommandInput() {
    if (!this.commandParser) {
      return {type: 'command:autocomplete', value: this.inputBuffer};
    }

    const completions = this.commandParser.getCompletions(this.inputBuffer);
    if (completions.length === 1) {
      this.inputBuffer = completions[0];
      this.notifyInputChange();
    } else if (completions.length > 1) {
      return {type: 'command:completions', completions};
    }

    return {type: 'command:autocomplete', value: this.inputBuffer};
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
    return {type: 'command:history', direction: 'up'};
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
      this.eventBus.emit('keyboard:mode', {mode: this.mode});
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
      this.eventBus.emit('keyboard:input', {
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
        {key: 'Enter', description: 'Apply filter'},
        {key: 'Escape', description: 'Cancel'},
      ];
    }
    if (this.mode === INPUT_MODE.COMMAND) {
      return [
        {key: 'Enter', description: 'Execute command'},
        {key: 'Tab', description: 'Autocomplete'},
        {key: 'Escape', description: 'Cancel'},
      ];
    }
    return [
      {key: '↑/↓', description: 'Navigate'},
      {key: 'Enter', description: 'Select'},
      {key: '/', description: 'Filter'},
      {key: ':', description: 'Command'},
      {key: 'p', description: 'Pause/Resume CDC'},
      {key: 'r', description: 'Refresh'},
      {key: '?', description: 'Help'},
      {key: 'q', description: 'Quit'},
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
