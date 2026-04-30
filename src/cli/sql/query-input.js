const LOCAL_STR_EMPTY = '';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_ESCAPE = 'escape';
const LOCAL_STR_BACKSPACE = 'backspace';
const LOCAL_STR_DELETE = 'delete';
const LOCAL_STR_LEFT = 'left';
const LOCAL_STR_RIGHT = 'right';
const LOCAL_STR_UP = 'up';
const LOCAL_STR_DOWN = 'down';
const LOCAL_STR_HOME = 'home';
const LOCAL_STR_END = 'end';
const LOCAL_STR_TAB = 'tab';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_V0H0S = 'queryinput:suggestions';
const LOCAL_STR_QUERYINPUT_RENDER = 'queryinput:render';
const LOCAL_STR_QUERYINPUT_CHANGE = 'queryinput:change';

/**
 * QueryInput - Multi-line text input component for SQL queries
 *
 * Provides text editing, cursor movement, history navigation,
 * and integration with syntax highlighting and autocomplete.
 *
 * Requirements: 7.3, 7.4, 9.5
 */

/**
 * QueryInput class for SQL query text editing
 */
export class QueryInput {
  /**
   * Creates a new QueryInput
   * @param {Object} options - Input options
   * @param {Object} [options.screen] - Blessed screen instance
   * @param {Object} [options.syntaxHighlighter] - SQL syntax highlighter
   * @param {Object} [options.autocomplete] - Table autocomplete provider
   * @param {Object} [options.history] - Query history manager
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    this.screen = options.screen || null;
    this.syntaxHighlighter = options.syntaxHighlighter || null;
    this.autocomplete = options.autocomplete || null;
    this.history = options.history || null;
    this.eventBus = options.eventBus || null;

    // Text state
    this.value = LOCAL_STR_EMPTY;
    this.cursorPosition = LOCAL_NUM_ZERO;
    this.historyIndex = -LOCAL_NUM_ONE;
    this.savedInput = LOCAL_STR_EMPTY; // Saved input when navigating history

    // Widget reference (for blessed integration)
    this.widget = null;
  }

  /**
   * Get the current input value
   * @return {string} Current value
   */
  getValue() {
    return this.value;
  }

  /**
   * Set the input value
   * @param {string} value - New value
   */
  setValue(value) {
    this.value = value || LOCAL_STR_EMPTY;
    this.cursorPosition = this.value.length;
    this.render();
  }

  /**
   * Clear the input
   * Requirements: 9.5
   */
  clear() {
    this.value = LOCAL_STR_EMPTY;
    this.cursorPosition = LOCAL_NUM_ZERO;
    this.historyIndex = -LOCAL_NUM_ONE;
    this.savedInput = LOCAL_STR_EMPTY;
    this.render();
    this.emitChange();
  }

  /**
   * Get the cursor position
   * @return {number} Cursor position
   */
  getCursorPosition() {
    return this.cursorPosition;
  }

  /**
   * Set the cursor position
   * @param {number} position - New cursor position
   */
  setCursorPosition(position) {
    this.cursorPosition = Math.max(LOCAL_NUM_ZERO, Math.min(position, this.value.length));
  }

  /**
   * Handle key input
   * Requirements: 7.3, 7.4, 9.5
   * @param {Object} key - Key event object
   * @return {boolean} True if key was handled
   */
  handleKey(key) {
    const keyName = key.full || key.name || '';

    switch (keyName) {
    case LOCAL_STR_ESCAPE:
      this.clear();
      return true;

    case LOCAL_STR_BACKSPACE:
      this.deleteBackward();
      return true;

    case LOCAL_STR_DELETE:
      this.deleteForward();
      return true;

    case LOCAL_STR_LEFT:
      this.moveCursorLeft();
      return true;

    case LOCAL_STR_RIGHT:
      this.moveCursorRight();
      return true;

    case LOCAL_STR_UP:
      this.navigateHistoryUp();
      return true;

    case LOCAL_STR_DOWN:
      this.navigateHistoryDown();
      return true;

    case LOCAL_STR_HOME:
      this.moveCursorToLineStart();
      return true;

    case LOCAL_STR_END:
      this.moveCursorToLineEnd();
      return true;

    case LOCAL_STR_TAB:
      this.triggerAutocomplete();
      return true;

    case LOCAL_STR_ENTER:
      this.insertNewline();
      return true;

    default:
      // Handle regular character input
      if (key.ch && key.ch.length === LOCAL_NUM_ONE && !key.ctrl && !key.meta) {
        this.insertChar(key.ch);
        return true;
      }
      return false;
    }
  }

  /**
   * Insert a character at cursor position
   * Requirements: 7.4
   * @param {string} char - Character to insert
   */
  insertChar(char) {
    this.value = this.value.slice(LOCAL_NUM_ZERO, this.cursorPosition) +
                 char +
                 this.value.slice(this.cursorPosition);
    this.cursorPosition++;
    this.render();
    this.emitChange();
  }

  /**
   * Insert a newline at cursor position
   * Requirements: 7.3
   */
  insertNewline() {
    this.insertChar(LOCAL_STR_NEWLINE);
  }

  /**
   * Insert text at cursor position
   * @param {string} text - Text to insert
   */
  insertText(text) {
    if (!text) return;

    this.value = this.value.slice(LOCAL_NUM_ZERO, this.cursorPosition) +
                 text +
                 this.value.slice(this.cursorPosition);
    this.cursorPosition += text.length;
    this.render();
    this.emitChange();
  }

  /**
   * Delete character before cursor
   * Requirements: 7.4
   */
  deleteBackward() {
    if (this.cursorPosition > LOCAL_NUM_ZERO) {
      this.value = this.value.slice(LOCAL_NUM_ZERO, this.cursorPosition - LOCAL_NUM_ONE) +
                   this.value.slice(this.cursorPosition);
      this.cursorPosition--;
      this.render();
      this.emitChange();
    }
  }

  /**
   * Delete character after cursor
   * Requirements: 7.4
   */
  deleteForward() {
    if (this.cursorPosition < this.value.length) {
      this.value = this.value.slice(LOCAL_NUM_ZERO, this.cursorPosition) +
                   this.value.slice(this.cursorPosition + LOCAL_NUM_ONE);
      this.render();
      this.emitChange();
    }
  }

  /**
   * Move cursor left
   * Requirements: 7.4
   */
  moveCursorLeft() {
    if (this.cursorPosition > LOCAL_NUM_ZERO) {
      this.cursorPosition--;
      this.render();
    }
  }

  /**
   * Move cursor right
   * Requirements: 7.4
   */
  moveCursorRight() {
    if (this.cursorPosition < this.value.length) {
      this.cursorPosition++;
      this.render();
    }
  }

  /**
   * Move cursor to start of current line
   */
  moveCursorToLineStart() {
    const beforeCursor = this.value.slice(0, this.cursorPosition);
    const lastNewline = beforeCursor.lastIndexOf('\n');
    this.cursorPosition = lastNewline + LOCAL_NUM_ONE;
    this.render();
  }

  /**
   * Move cursor to end of current line
   */
  moveCursorToLineEnd() {
    const afterCursor = this.value.slice(this.cursorPosition);
    const nextNewline = afterCursor.indexOf('\n');
    if (nextNewline === -LOCAL_NUM_ONE) {
      this.cursorPosition = this.value.length;
    } else {
      this.cursorPosition += nextNewline;
    }
    this.render();
  }

  /**
   * Navigate to previous history entry
   * Requirements: 8.2
   */
  navigateHistoryUp() {
    if (!this.history) return;

    // Save current input when starting history navigation
    if (this.historyIndex === -LOCAL_NUM_ONE) {
      this.savedInput = this.value;
    }

    if (this.historyIndex < this.history.length - LOCAL_NUM_ONE) {
      this.historyIndex++;
      const entry = this.history.getAt(this.historyIndex);
      if (entry !== null) {
        this.value = entry;
        this.cursorPosition = this.value.length;
        this.render();
        this.emitChange();
      }
    }
  }

  /**
   * Navigate to next history entry
   * Requirements: 8.2
   */
  navigateHistoryDown() {
    if (!this.history) return;

    if (this.historyIndex > LOCAL_NUM_ZERO) {
      this.historyIndex--;
      const entry = this.history.getAt(this.historyIndex);
      if (entry !== null) {
        this.value = entry;
        this.cursorPosition = this.value.length;
        this.render();
        this.emitChange();
      }
    } else if (this.historyIndex === LOCAL_NUM_ZERO) {
      // Return to saved input
      this.historyIndex = -LOCAL_NUM_ONE;
      this.value = this.savedInput;
      this.cursorPosition = this.value.length;
      this.render();
      this.emitChange();
    }
  }

  /**
   * Reset history navigation state
   */
  resetHistoryNavigation() {
    this.historyIndex = -LOCAL_NUM_ONE;
    this.savedInput = LOCAL_STR_EMPTY;
  }

  /**
   * Trigger autocomplete
   * Requirements: 9.3
   */
  triggerAutocomplete() {
    if (!this.autocomplete) return;

    const context = this.getAutocompleteContext();
    const suggestions = this.autocomplete.getSuggestions(context);

    if (suggestions.length === LOCAL_NUM_ONE) {
      this.applyCompletion(suggestions[LOCAL_NUM_ZERO]);
    } else if (suggestions.length > LOCAL_NUM_ONE) {
      this.showSuggestions(suggestions);
    }
  }

  /**
   * Get context for autocomplete
   * @return {Object} Autocomplete context
   */
  getAutocompleteContext() {
    return {
      word: this.getCurrentWord(),
      position: this.cursorPosition,
      fullText: this.value,
    };
  }

  /**
   * Get the word at cursor position
   * @return {string} Current word
   */
  getCurrentWord() {
    const before = this.value.slice(0, this.cursorPosition);
    const match = before.match(/\w+$/);
    return match ? match[LOCAL_NUM_ZERO] : LOCAL_STR_EMPTY;
  }

  /**
   * Apply an autocomplete suggestion
   * @param {string} suggestion - Suggestion to apply
   */
  applyCompletion(suggestion) {
    const currentWord = this.getCurrentWord();
    const wordStart = this.cursorPosition - currentWord.length;

    this.value = this.value.slice(LOCAL_NUM_ZERO, wordStart) +
                 suggestion +
                 this.value.slice(this.cursorPosition);
    this.cursorPosition = wordStart + suggestion.length;
    this.render();
    this.emitChange();
  }

  /**
   * Show autocomplete suggestions
   * @param {Array<string>} suggestions - Suggestions to show
   */
  showSuggestions(suggestions) {
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_V0H0S, {
        suggestions,
        position: this.cursorPosition,
        word: this.getCurrentWord(),
      });
    }
  }

  /**
   * Get highlighted content for display
   * @return {string} Highlighted content
   */
  getHighlightedContent() {
    if (this.syntaxHighlighter) {
      return this.syntaxHighlighter.highlight(this.value);
    }
    return this.value;
  }

  /**
   * Render the input
   */
  render() {
    if (this.widget) {
      const content = this.getHighlightedContent();
      this.widget.setContent(content);
      if (this.screen) {
        this.screen.render();
      }
    }

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_QUERYINPUT_RENDER, {
        value: this.value,
        cursorPosition: this.cursorPosition,
        highlighted: this.getHighlightedContent(),
      });
    }
  }

  /**
   * Emit change event
   */
  emitChange() {
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_QUERYINPUT_CHANGE, {
        value: this.value,
        cursorPosition: this.cursorPosition,
      });
    }
  }

  /**
   * Set the widget reference
   * @param {Object} widget - Blessed widget
   */
  setWidget(widget) {
    this.widget = widget;
  }

  /**
   * Check if input is empty
   * @return {boolean} True if empty
   */
  isEmpty() {
    return this.value.trim() === LOCAL_STR_EMPTY;
  }

  /**
   * Get line and column from cursor position
   * @return {{line: number, column: number}} Line and column (0-indexed)
   */
  getCursorLineColumn() {
    const beforeCursor = this.value.slice(0, this.cursorPosition);
    const lines = beforeCursor.split('\n');
    return {
      line: lines.length - LOCAL_NUM_ONE,
      column: lines[lines.length - LOCAL_NUM_ONE].length,
    };
  }

  /**
   * Get the number of lines in the input
   * @return {number} Line count
   */
  getLineCount() {
    return this.value.split(LOCAL_STR_NEWLINE).length;
  }
}
