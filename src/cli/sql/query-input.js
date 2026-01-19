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
    this.value = '';
    this.cursorPosition = 0;
    this.historyIndex = -1;
    this.savedInput = ''; // Saved input when navigating history

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
    this.value = value || '';
    this.cursorPosition = this.value.length;
    this.render();
  }

  /**
   * Clear the input
   * Requirements: 9.5
   */
  clear() {
    this.value = '';
    this.cursorPosition = 0;
    this.historyIndex = -1;
    this.savedInput = '';
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
    this.cursorPosition = Math.max(0, Math.min(position, this.value.length));
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
    case 'escape':
      this.clear();
      return true;

    case 'backspace':
      this.deleteBackward();
      return true;

    case 'delete':
      this.deleteForward();
      return true;

    case 'left':
      this.moveCursorLeft();
      return true;

    case 'right':
      this.moveCursorRight();
      return true;

    case 'up':
      this.navigateHistoryUp();
      return true;

    case 'down':
      this.navigateHistoryDown();
      return true;

    case 'home':
      this.moveCursorToLineStart();
      return true;

    case 'end':
      this.moveCursorToLineEnd();
      return true;

    case 'tab':
      this.triggerAutocomplete();
      return true;

    case 'enter':
      this.insertNewline();
      return true;

    default:
      // Handle regular character input
      if (key.ch && key.ch.length === 1 && !key.ctrl && !key.meta) {
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
    this.value = this.value.slice(0, this.cursorPosition) +
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
    this.insertChar('\n');
  }

  /**
   * Insert text at cursor position
   * @param {string} text - Text to insert
   */
  insertText(text) {
    if (!text) return;

    this.value = this.value.slice(0, this.cursorPosition) +
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
    if (this.cursorPosition > 0) {
      this.value = this.value.slice(0, this.cursorPosition - 1) +
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
      this.value = this.value.slice(0, this.cursorPosition) +
                   this.value.slice(this.cursorPosition + 1);
      this.render();
      this.emitChange();
    }
  }

  /**
   * Move cursor left
   * Requirements: 7.4
   */
  moveCursorLeft() {
    if (this.cursorPosition > 0) {
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
    this.cursorPosition = lastNewline + 1;
    this.render();
  }

  /**
   * Move cursor to end of current line
   */
  moveCursorToLineEnd() {
    const afterCursor = this.value.slice(this.cursorPosition);
    const nextNewline = afterCursor.indexOf('\n');
    if (nextNewline === -1) {
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
    if (this.historyIndex === -1) {
      this.savedInput = this.value;
    }

    if (this.historyIndex < this.history.length - 1) {
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

    if (this.historyIndex > 0) {
      this.historyIndex--;
      const entry = this.history.getAt(this.historyIndex);
      if (entry !== null) {
        this.value = entry;
        this.cursorPosition = this.value.length;
        this.render();
        this.emitChange();
      }
    } else if (this.historyIndex === 0) {
      // Return to saved input
      this.historyIndex = -1;
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
    this.historyIndex = -1;
    this.savedInput = '';
  }

  /**
   * Trigger autocomplete
   * Requirements: 9.3
   */
  triggerAutocomplete() {
    if (!this.autocomplete) return;

    const context = this.getAutocompleteContext();
    const suggestions = this.autocomplete.getSuggestions(context);

    if (suggestions.length === 1) {
      this.applyCompletion(suggestions[0]);
    } else if (suggestions.length > 1) {
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
    return match ? match[0] : '';
  }

  /**
   * Apply an autocomplete suggestion
   * @param {string} suggestion - Suggestion to apply
   */
  applyCompletion(suggestion) {
    const currentWord = this.getCurrentWord();
    const wordStart = this.cursorPosition - currentWord.length;

    this.value = this.value.slice(0, wordStart) +
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
      this.eventBus.emit('queryinput:suggestions', {
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
      this.eventBus.emit('queryinput:render', {
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
      this.eventBus.emit('queryinput:change', {
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
    return this.value.trim() === '';
  }

  /**
   * Get line and column from cursor position
   * @return {{line: number, column: number}} Line and column (0-indexed)
   */
  getCursorLineColumn() {
    const beforeCursor = this.value.slice(0, this.cursorPosition);
    const lines = beforeCursor.split('\n');
    return {
      line: lines.length - 1,
      column: lines[lines.length - 1].length,
    };
  }

  /**
   * Get the number of lines in the input
   * @return {number} Line count
   */
  getLineCount() {
    return this.value.split('\n').length;
  }
}
