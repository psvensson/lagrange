/**
 * QueryInput - Multi-line text input component for SQL queries
 *
 * Provides text editing, cursor movement, history navigation,
 * and integration with syntax highlighting and autocomplete.
 *
 * Requirements: 7.3, 7.4, 9.5
 */
// @ts-nocheck


/**
 * QueryInput class for SQL query text editing
 */function stryNS_9fa48() {
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
    if (stryMutAct_9fa48("46923")) {
      {}
    } else {
      stryCov_9fa48("46923");
      this.screen = stryMutAct_9fa48("46926") ? options.screen && null : stryMutAct_9fa48("46925") ? false : stryMutAct_9fa48("46924") ? true : (stryCov_9fa48("46924", "46925", "46926"), options.screen || null);
      this.syntaxHighlighter = stryMutAct_9fa48("46929") ? options.syntaxHighlighter && null : stryMutAct_9fa48("46928") ? false : stryMutAct_9fa48("46927") ? true : (stryCov_9fa48("46927", "46928", "46929"), options.syntaxHighlighter || null);
      this.autocomplete = stryMutAct_9fa48("46932") ? options.autocomplete && null : stryMutAct_9fa48("46931") ? false : stryMutAct_9fa48("46930") ? true : (stryCov_9fa48("46930", "46931", "46932"), options.autocomplete || null);
      this.history = stryMutAct_9fa48("46935") ? options.history && null : stryMutAct_9fa48("46934") ? false : stryMutAct_9fa48("46933") ? true : (stryCov_9fa48("46933", "46934", "46935"), options.history || null);
      this.eventBus = stryMutAct_9fa48("46938") ? options.eventBus && null : stryMutAct_9fa48("46937") ? false : stryMutAct_9fa48("46936") ? true : (stryCov_9fa48("46936", "46937", "46938"), options.eventBus || null);

      // Text state
      this.value = stryMutAct_9fa48("46939") ? "Stryker was here!" : (stryCov_9fa48("46939"), '');
      this.cursorPosition = 0;
      this.historyIndex = stryMutAct_9fa48("46940") ? +1 : (stryCov_9fa48("46940"), -1);
      this.savedInput = stryMutAct_9fa48("46941") ? "Stryker was here!" : (stryCov_9fa48("46941"), ''); // Saved input when navigating history

      // Widget reference (for blessed integration)
      this.widget = null;
    }
  }

  /**
   * Get the current input value
   * @return {string} Current value
   */
  getValue() {
    if (stryMutAct_9fa48("46942")) {
      {}
    } else {
      stryCov_9fa48("46942");
      return this.value;
    }
  }

  /**
   * Set the input value
   * @param {string} value - New value
   */
  setValue(value) {
    if (stryMutAct_9fa48("46943")) {
      {}
    } else {
      stryCov_9fa48("46943");
      this.value = stryMutAct_9fa48("46946") ? value && '' : stryMutAct_9fa48("46945") ? false : stryMutAct_9fa48("46944") ? true : (stryCov_9fa48("46944", "46945", "46946"), value || (stryMutAct_9fa48("46947") ? "Stryker was here!" : (stryCov_9fa48("46947"), '')));
      this.cursorPosition = this.value.length;
      this.render();
    }
  }

  /**
   * Clear the input
   * Requirements: 9.5
   */
  clear() {
    if (stryMutAct_9fa48("46948")) {
      {}
    } else {
      stryCov_9fa48("46948");
      this.value = stryMutAct_9fa48("46949") ? "Stryker was here!" : (stryCov_9fa48("46949"), '');
      this.cursorPosition = 0;
      this.historyIndex = stryMutAct_9fa48("46950") ? +1 : (stryCov_9fa48("46950"), -1);
      this.savedInput = stryMutAct_9fa48("46951") ? "Stryker was here!" : (stryCov_9fa48("46951"), '');
      this.render();
      this.emitChange();
    }
  }

  /**
   * Get the cursor position
   * @return {number} Cursor position
   */
  getCursorPosition() {
    if (stryMutAct_9fa48("46952")) {
      {}
    } else {
      stryCov_9fa48("46952");
      return this.cursorPosition;
    }
  }

  /**
   * Set the cursor position
   * @param {number} position - New cursor position
   */
  setCursorPosition(position) {
    if (stryMutAct_9fa48("46953")) {
      {}
    } else {
      stryCov_9fa48("46953");
      this.cursorPosition = stryMutAct_9fa48("46954") ? Math.min(0, Math.min(position, this.value.length)) : (stryCov_9fa48("46954"), Math.max(0, stryMutAct_9fa48("46955") ? Math.max(position, this.value.length) : (stryCov_9fa48("46955"), Math.min(position, this.value.length))));
    }
  }

  /**
   * Handle key input
   * Requirements: 7.3, 7.4, 9.5
   * @param {Object} key - Key event object
   * @return {boolean} True if key was handled
   */
  handleKey(key) {
    if (stryMutAct_9fa48("46956")) {
      {}
    } else {
      stryCov_9fa48("46956");
      const keyName = stryMutAct_9fa48("46959") ? (key.full || key.name) && '' : stryMutAct_9fa48("46958") ? false : stryMutAct_9fa48("46957") ? true : (stryCov_9fa48("46957", "46958", "46959"), (stryMutAct_9fa48("46961") ? key.full && key.name : stryMutAct_9fa48("46960") ? false : (stryCov_9fa48("46960", "46961"), key.full || key.name)) || (stryMutAct_9fa48("46962") ? "Stryker was here!" : (stryCov_9fa48("46962"), '')));
      switch (keyName) {
        case stryMutAct_9fa48("46964") ? "" : (stryCov_9fa48("46964"), 'escape'):
          if (stryMutAct_9fa48("46963")) {} else {
            stryCov_9fa48("46963");
            this.clear();
            return stryMutAct_9fa48("46965") ? false : (stryCov_9fa48("46965"), true);
          }
        case stryMutAct_9fa48("46967") ? "" : (stryCov_9fa48("46967"), 'backspace'):
          if (stryMutAct_9fa48("46966")) {} else {
            stryCov_9fa48("46966");
            this.deleteBackward();
            return stryMutAct_9fa48("46968") ? false : (stryCov_9fa48("46968"), true);
          }
        case stryMutAct_9fa48("46970") ? "" : (stryCov_9fa48("46970"), 'delete'):
          if (stryMutAct_9fa48("46969")) {} else {
            stryCov_9fa48("46969");
            this.deleteForward();
            return stryMutAct_9fa48("46971") ? false : (stryCov_9fa48("46971"), true);
          }
        case stryMutAct_9fa48("46973") ? "" : (stryCov_9fa48("46973"), 'left'):
          if (stryMutAct_9fa48("46972")) {} else {
            stryCov_9fa48("46972");
            this.moveCursorLeft();
            return stryMutAct_9fa48("46974") ? false : (stryCov_9fa48("46974"), true);
          }
        case stryMutAct_9fa48("46976") ? "" : (stryCov_9fa48("46976"), 'right'):
          if (stryMutAct_9fa48("46975")) {} else {
            stryCov_9fa48("46975");
            this.moveCursorRight();
            return stryMutAct_9fa48("46977") ? false : (stryCov_9fa48("46977"), true);
          }
        case stryMutAct_9fa48("46979") ? "" : (stryCov_9fa48("46979"), 'up'):
          if (stryMutAct_9fa48("46978")) {} else {
            stryCov_9fa48("46978");
            this.navigateHistoryUp();
            return stryMutAct_9fa48("46980") ? false : (stryCov_9fa48("46980"), true);
          }
        case stryMutAct_9fa48("46982") ? "" : (stryCov_9fa48("46982"), 'down'):
          if (stryMutAct_9fa48("46981")) {} else {
            stryCov_9fa48("46981");
            this.navigateHistoryDown();
            return stryMutAct_9fa48("46983") ? false : (stryCov_9fa48("46983"), true);
          }
        case stryMutAct_9fa48("46985") ? "" : (stryCov_9fa48("46985"), 'home'):
          if (stryMutAct_9fa48("46984")) {} else {
            stryCov_9fa48("46984");
            this.moveCursorToLineStart();
            return stryMutAct_9fa48("46986") ? false : (stryCov_9fa48("46986"), true);
          }
        case stryMutAct_9fa48("46988") ? "" : (stryCov_9fa48("46988"), 'end'):
          if (stryMutAct_9fa48("46987")) {} else {
            stryCov_9fa48("46987");
            this.moveCursorToLineEnd();
            return stryMutAct_9fa48("46989") ? false : (stryCov_9fa48("46989"), true);
          }
        case stryMutAct_9fa48("46991") ? "" : (stryCov_9fa48("46991"), 'tab'):
          if (stryMutAct_9fa48("46990")) {} else {
            stryCov_9fa48("46990");
            this.triggerAutocomplete();
            return stryMutAct_9fa48("46992") ? false : (stryCov_9fa48("46992"), true);
          }
        case stryMutAct_9fa48("46994") ? "" : (stryCov_9fa48("46994"), 'enter'):
          if (stryMutAct_9fa48("46993")) {} else {
            stryCov_9fa48("46993");
            this.insertNewline();
            return stryMutAct_9fa48("46995") ? false : (stryCov_9fa48("46995"), true);
          }
        default:
          if (stryMutAct_9fa48("46996")) {} else {
            stryCov_9fa48("46996");
            // Handle regular character input
            if (stryMutAct_9fa48("46999") ? key.ch && key.ch.length === 1 && !key.ctrl || !key.meta : stryMutAct_9fa48("46998") ? false : stryMutAct_9fa48("46997") ? true : (stryCov_9fa48("46997", "46998", "46999"), (stryMutAct_9fa48("47001") ? key.ch && key.ch.length === 1 || !key.ctrl : stryMutAct_9fa48("47000") ? true : (stryCov_9fa48("47000", "47001"), (stryMutAct_9fa48("47003") ? key.ch || key.ch.length === 1 : stryMutAct_9fa48("47002") ? true : (stryCov_9fa48("47002", "47003"), key.ch && (stryMutAct_9fa48("47005") ? key.ch.length !== 1 : stryMutAct_9fa48("47004") ? true : (stryCov_9fa48("47004", "47005"), key.ch.length === 1)))) && (stryMutAct_9fa48("47006") ? key.ctrl : (stryCov_9fa48("47006"), !key.ctrl)))) && (stryMutAct_9fa48("47007") ? key.meta : (stryCov_9fa48("47007"), !key.meta)))) {
              if (stryMutAct_9fa48("47008")) {
                {}
              } else {
                stryCov_9fa48("47008");
                this.insertChar(key.ch);
                return stryMutAct_9fa48("47009") ? false : (stryCov_9fa48("47009"), true);
              }
            }
            return stryMutAct_9fa48("47010") ? true : (stryCov_9fa48("47010"), false);
          }
      }
    }
  }

  /**
   * Insert a character at cursor position
   * Requirements: 7.4
   * @param {string} char - Character to insert
   */
  insertChar(char) {
    if (stryMutAct_9fa48("47011")) {
      {}
    } else {
      stryCov_9fa48("47011");
      this.value = stryMutAct_9fa48("47012") ? this.value.slice(0, this.cursorPosition) + char - this.value.slice(this.cursorPosition) : (stryCov_9fa48("47012"), (stryMutAct_9fa48("47013") ? this.value.slice(0, this.cursorPosition) - char : (stryCov_9fa48("47013"), (stryMutAct_9fa48("47014") ? this.value : (stryCov_9fa48("47014"), this.value.slice(0, this.cursorPosition))) + char)) + (stryMutAct_9fa48("47015") ? this.value : (stryCov_9fa48("47015"), this.value.slice(this.cursorPosition))));
      stryMutAct_9fa48("47016") ? this.cursorPosition-- : (stryCov_9fa48("47016"), this.cursorPosition++);
      this.render();
      this.emitChange();
    }
  }

  /**
   * Insert a newline at cursor position
   * Requirements: 7.3
   */
  insertNewline() {
    if (stryMutAct_9fa48("47017")) {
      {}
    } else {
      stryCov_9fa48("47017");
      this.insertChar(stryMutAct_9fa48("47018") ? "" : (stryCov_9fa48("47018"), '\n'));
    }
  }

  /**
   * Insert text at cursor position
   * @param {string} text - Text to insert
   */
  insertText(text) {
    if (stryMutAct_9fa48("47019")) {
      {}
    } else {
      stryCov_9fa48("47019");
      if (stryMutAct_9fa48("47022") ? false : stryMutAct_9fa48("47021") ? true : stryMutAct_9fa48("47020") ? text : (stryCov_9fa48("47020", "47021", "47022"), !text)) return;
      this.value = stryMutAct_9fa48("47023") ? this.value.slice(0, this.cursorPosition) + text - this.value.slice(this.cursorPosition) : (stryCov_9fa48("47023"), (stryMutAct_9fa48("47024") ? this.value.slice(0, this.cursorPosition) - text : (stryCov_9fa48("47024"), (stryMutAct_9fa48("47025") ? this.value : (stryCov_9fa48("47025"), this.value.slice(0, this.cursorPosition))) + text)) + (stryMutAct_9fa48("47026") ? this.value : (stryCov_9fa48("47026"), this.value.slice(this.cursorPosition))));
      stryMutAct_9fa48("47027") ? this.cursorPosition -= text.length : (stryCov_9fa48("47027"), this.cursorPosition += text.length);
      this.render();
      this.emitChange();
    }
  }

  /**
   * Delete character before cursor
   * Requirements: 7.4
   */
  deleteBackward() {
    if (stryMutAct_9fa48("47028")) {
      {}
    } else {
      stryCov_9fa48("47028");
      if (stryMutAct_9fa48("47032") ? this.cursorPosition <= 0 : stryMutAct_9fa48("47031") ? this.cursorPosition >= 0 : stryMutAct_9fa48("47030") ? false : stryMutAct_9fa48("47029") ? true : (stryCov_9fa48("47029", "47030", "47031", "47032"), this.cursorPosition > 0)) {
        if (stryMutAct_9fa48("47033")) {
          {}
        } else {
          stryCov_9fa48("47033");
          this.value = stryMutAct_9fa48("47034") ? this.value.slice(0, this.cursorPosition - 1) - this.value.slice(this.cursorPosition) : (stryCov_9fa48("47034"), (stryMutAct_9fa48("47035") ? this.value : (stryCov_9fa48("47035"), this.value.slice(0, stryMutAct_9fa48("47036") ? this.cursorPosition + 1 : (stryCov_9fa48("47036"), this.cursorPosition - 1)))) + (stryMutAct_9fa48("47037") ? this.value : (stryCov_9fa48("47037"), this.value.slice(this.cursorPosition))));
          stryMutAct_9fa48("47038") ? this.cursorPosition++ : (stryCov_9fa48("47038"), this.cursorPosition--);
          this.render();
          this.emitChange();
        }
      }
    }
  }

  /**
   * Delete character after cursor
   * Requirements: 7.4
   */
  deleteForward() {
    if (stryMutAct_9fa48("47039")) {
      {}
    } else {
      stryCov_9fa48("47039");
      if (stryMutAct_9fa48("47043") ? this.cursorPosition >= this.value.length : stryMutAct_9fa48("47042") ? this.cursorPosition <= this.value.length : stryMutAct_9fa48("47041") ? false : stryMutAct_9fa48("47040") ? true : (stryCov_9fa48("47040", "47041", "47042", "47043"), this.cursorPosition < this.value.length)) {
        if (stryMutAct_9fa48("47044")) {
          {}
        } else {
          stryCov_9fa48("47044");
          this.value = stryMutAct_9fa48("47045") ? this.value.slice(0, this.cursorPosition) - this.value.slice(this.cursorPosition + 1) : (stryCov_9fa48("47045"), (stryMutAct_9fa48("47046") ? this.value : (stryCov_9fa48("47046"), this.value.slice(0, this.cursorPosition))) + (stryMutAct_9fa48("47047") ? this.value : (stryCov_9fa48("47047"), this.value.slice(stryMutAct_9fa48("47048") ? this.cursorPosition - 1 : (stryCov_9fa48("47048"), this.cursorPosition + 1)))));
          this.render();
          this.emitChange();
        }
      }
    }
  }

  /**
   * Move cursor left
   * Requirements: 7.4
   */
  moveCursorLeft() {
    if (stryMutAct_9fa48("47049")) {
      {}
    } else {
      stryCov_9fa48("47049");
      if (stryMutAct_9fa48("47053") ? this.cursorPosition <= 0 : stryMutAct_9fa48("47052") ? this.cursorPosition >= 0 : stryMutAct_9fa48("47051") ? false : stryMutAct_9fa48("47050") ? true : (stryCov_9fa48("47050", "47051", "47052", "47053"), this.cursorPosition > 0)) {
        if (stryMutAct_9fa48("47054")) {
          {}
        } else {
          stryCov_9fa48("47054");
          stryMutAct_9fa48("47055") ? this.cursorPosition++ : (stryCov_9fa48("47055"), this.cursorPosition--);
          this.render();
        }
      }
    }
  }

  /**
   * Move cursor right
   * Requirements: 7.4
   */
  moveCursorRight() {
    if (stryMutAct_9fa48("47056")) {
      {}
    } else {
      stryCov_9fa48("47056");
      if (stryMutAct_9fa48("47060") ? this.cursorPosition >= this.value.length : stryMutAct_9fa48("47059") ? this.cursorPosition <= this.value.length : stryMutAct_9fa48("47058") ? false : stryMutAct_9fa48("47057") ? true : (stryCov_9fa48("47057", "47058", "47059", "47060"), this.cursorPosition < this.value.length)) {
        if (stryMutAct_9fa48("47061")) {
          {}
        } else {
          stryCov_9fa48("47061");
          stryMutAct_9fa48("47062") ? this.cursorPosition-- : (stryCov_9fa48("47062"), this.cursorPosition++);
          this.render();
        }
      }
    }
  }

  /**
   * Move cursor to start of current line
   */
  moveCursorToLineStart() {
    if (stryMutAct_9fa48("47063")) {
      {}
    } else {
      stryCov_9fa48("47063");
      const beforeCursor = stryMutAct_9fa48("47064") ? this.value : (stryCov_9fa48("47064"), this.value.slice(0, this.cursorPosition));
      const lastNewline = beforeCursor.lastIndexOf(stryMutAct_9fa48("47065") ? "" : (stryCov_9fa48("47065"), '\n'));
      this.cursorPosition = stryMutAct_9fa48("47066") ? lastNewline - 1 : (stryCov_9fa48("47066"), lastNewline + 1);
      this.render();
    }
  }

  /**
   * Move cursor to end of current line
   */
  moveCursorToLineEnd() {
    if (stryMutAct_9fa48("47067")) {
      {}
    } else {
      stryCov_9fa48("47067");
      const afterCursor = stryMutAct_9fa48("47068") ? this.value : (stryCov_9fa48("47068"), this.value.slice(this.cursorPosition));
      const nextNewline = afterCursor.indexOf(stryMutAct_9fa48("47069") ? "" : (stryCov_9fa48("47069"), '\n'));
      if (stryMutAct_9fa48("47072") ? nextNewline !== -1 : stryMutAct_9fa48("47071") ? false : stryMutAct_9fa48("47070") ? true : (stryCov_9fa48("47070", "47071", "47072"), nextNewline === (stryMutAct_9fa48("47073") ? +1 : (stryCov_9fa48("47073"), -1)))) {
        if (stryMutAct_9fa48("47074")) {
          {}
        } else {
          stryCov_9fa48("47074");
          this.cursorPosition = this.value.length;
        }
      } else {
        if (stryMutAct_9fa48("47075")) {
          {}
        } else {
          stryCov_9fa48("47075");
          stryMutAct_9fa48("47076") ? this.cursorPosition -= nextNewline : (stryCov_9fa48("47076"), this.cursorPosition += nextNewline);
        }
      }
      this.render();
    }
  }

  /**
   * Navigate to previous history entry
   * Requirements: 8.2
   */
  navigateHistoryUp() {
    if (stryMutAct_9fa48("47077")) {
      {}
    } else {
      stryCov_9fa48("47077");
      if (stryMutAct_9fa48("47080") ? false : stryMutAct_9fa48("47079") ? true : stryMutAct_9fa48("47078") ? this.history : (stryCov_9fa48("47078", "47079", "47080"), !this.history)) return;

      // Save current input when starting history navigation
      if (stryMutAct_9fa48("47083") ? this.historyIndex !== -1 : stryMutAct_9fa48("47082") ? false : stryMutAct_9fa48("47081") ? true : (stryCov_9fa48("47081", "47082", "47083"), this.historyIndex === (stryMutAct_9fa48("47084") ? +1 : (stryCov_9fa48("47084"), -1)))) {
        if (stryMutAct_9fa48("47085")) {
          {}
        } else {
          stryCov_9fa48("47085");
          this.savedInput = this.value;
        }
      }
      if (stryMutAct_9fa48("47089") ? this.historyIndex >= this.history.length - 1 : stryMutAct_9fa48("47088") ? this.historyIndex <= this.history.length - 1 : stryMutAct_9fa48("47087") ? false : stryMutAct_9fa48("47086") ? true : (stryCov_9fa48("47086", "47087", "47088", "47089"), this.historyIndex < (stryMutAct_9fa48("47090") ? this.history.length + 1 : (stryCov_9fa48("47090"), this.history.length - 1)))) {
        if (stryMutAct_9fa48("47091")) {
          {}
        } else {
          stryCov_9fa48("47091");
          stryMutAct_9fa48("47092") ? this.historyIndex-- : (stryCov_9fa48("47092"), this.historyIndex++);
          const entry = this.history.getAt(this.historyIndex);
          if (stryMutAct_9fa48("47095") ? entry === null : stryMutAct_9fa48("47094") ? false : stryMutAct_9fa48("47093") ? true : (stryCov_9fa48("47093", "47094", "47095"), entry !== null)) {
            if (stryMutAct_9fa48("47096")) {
              {}
            } else {
              stryCov_9fa48("47096");
              this.value = entry;
              this.cursorPosition = this.value.length;
              this.render();
              this.emitChange();
            }
          }
        }
      }
    }
  }

  /**
   * Navigate to next history entry
   * Requirements: 8.2
   */
  navigateHistoryDown() {
    if (stryMutAct_9fa48("47097")) {
      {}
    } else {
      stryCov_9fa48("47097");
      if (stryMutAct_9fa48("47100") ? false : stryMutAct_9fa48("47099") ? true : stryMutAct_9fa48("47098") ? this.history : (stryCov_9fa48("47098", "47099", "47100"), !this.history)) return;
      if (stryMutAct_9fa48("47104") ? this.historyIndex <= 0 : stryMutAct_9fa48("47103") ? this.historyIndex >= 0 : stryMutAct_9fa48("47102") ? false : stryMutAct_9fa48("47101") ? true : (stryCov_9fa48("47101", "47102", "47103", "47104"), this.historyIndex > 0)) {
        if (stryMutAct_9fa48("47105")) {
          {}
        } else {
          stryCov_9fa48("47105");
          stryMutAct_9fa48("47106") ? this.historyIndex++ : (stryCov_9fa48("47106"), this.historyIndex--);
          const entry = this.history.getAt(this.historyIndex);
          if (stryMutAct_9fa48("47109") ? entry === null : stryMutAct_9fa48("47108") ? false : stryMutAct_9fa48("47107") ? true : (stryCov_9fa48("47107", "47108", "47109"), entry !== null)) {
            if (stryMutAct_9fa48("47110")) {
              {}
            } else {
              stryCov_9fa48("47110");
              this.value = entry;
              this.cursorPosition = this.value.length;
              this.render();
              this.emitChange();
            }
          }
        }
      } else if (stryMutAct_9fa48("47113") ? this.historyIndex !== 0 : stryMutAct_9fa48("47112") ? false : stryMutAct_9fa48("47111") ? true : (stryCov_9fa48("47111", "47112", "47113"), this.historyIndex === 0)) {
        if (stryMutAct_9fa48("47114")) {
          {}
        } else {
          stryCov_9fa48("47114");
          // Return to saved input
          this.historyIndex = stryMutAct_9fa48("47115") ? +1 : (stryCov_9fa48("47115"), -1);
          this.value = this.savedInput;
          this.cursorPosition = this.value.length;
          this.render();
          this.emitChange();
        }
      }
    }
  }

  /**
   * Reset history navigation state
   */
  resetHistoryNavigation() {
    if (stryMutAct_9fa48("47116")) {
      {}
    } else {
      stryCov_9fa48("47116");
      this.historyIndex = stryMutAct_9fa48("47117") ? +1 : (stryCov_9fa48("47117"), -1);
      this.savedInput = stryMutAct_9fa48("47118") ? "Stryker was here!" : (stryCov_9fa48("47118"), '');
    }
  }

  /**
   * Trigger autocomplete
   * Requirements: 9.3
   */
  triggerAutocomplete() {
    if (stryMutAct_9fa48("47119")) {
      {}
    } else {
      stryCov_9fa48("47119");
      if (stryMutAct_9fa48("47122") ? false : stryMutAct_9fa48("47121") ? true : stryMutAct_9fa48("47120") ? this.autocomplete : (stryCov_9fa48("47120", "47121", "47122"), !this.autocomplete)) return;
      const context = this.getAutocompleteContext();
      const suggestions = this.autocomplete.getSuggestions(context);
      if (stryMutAct_9fa48("47125") ? suggestions.length !== 1 : stryMutAct_9fa48("47124") ? false : stryMutAct_9fa48("47123") ? true : (stryCov_9fa48("47123", "47124", "47125"), suggestions.length === 1)) {
        if (stryMutAct_9fa48("47126")) {
          {}
        } else {
          stryCov_9fa48("47126");
          this.applyCompletion(suggestions[0]);
        }
      } else if (stryMutAct_9fa48("47130") ? suggestions.length <= 1 : stryMutAct_9fa48("47129") ? suggestions.length >= 1 : stryMutAct_9fa48("47128") ? false : stryMutAct_9fa48("47127") ? true : (stryCov_9fa48("47127", "47128", "47129", "47130"), suggestions.length > 1)) {
        if (stryMutAct_9fa48("47131")) {
          {}
        } else {
          stryCov_9fa48("47131");
          this.showSuggestions(suggestions);
        }
      }
    }
  }

  /**
   * Get context for autocomplete
   * @return {Object} Autocomplete context
   */
  getAutocompleteContext() {
    if (stryMutAct_9fa48("47132")) {
      {}
    } else {
      stryCov_9fa48("47132");
      return stryMutAct_9fa48("47133") ? {} : (stryCov_9fa48("47133"), {
        word: this.getCurrentWord(),
        position: this.cursorPosition,
        fullText: this.value
      });
    }
  }

  /**
   * Get the word at cursor position
   * @return {string} Current word
   */
  getCurrentWord() {
    if (stryMutAct_9fa48("47134")) {
      {}
    } else {
      stryCov_9fa48("47134");
      const before = stryMutAct_9fa48("47135") ? this.value : (stryCov_9fa48("47135"), this.value.slice(0, this.cursorPosition));
      const match = before.match(stryMutAct_9fa48("47138") ? /\W+$/ : stryMutAct_9fa48("47137") ? /\w$/ : stryMutAct_9fa48("47136") ? /\w+/ : (stryCov_9fa48("47136", "47137", "47138"), /\w+$/));
      return match ? match[0] : stryMutAct_9fa48("47139") ? "Stryker was here!" : (stryCov_9fa48("47139"), '');
    }
  }

  /**
   * Apply an autocomplete suggestion
   * @param {string} suggestion - Suggestion to apply
   */
  applyCompletion(suggestion) {
    if (stryMutAct_9fa48("47140")) {
      {}
    } else {
      stryCov_9fa48("47140");
      const currentWord = this.getCurrentWord();
      const wordStart = stryMutAct_9fa48("47141") ? this.cursorPosition + currentWord.length : (stryCov_9fa48("47141"), this.cursorPosition - currentWord.length);
      this.value = stryMutAct_9fa48("47142") ? this.value.slice(0, wordStart) + suggestion - this.value.slice(this.cursorPosition) : (stryCov_9fa48("47142"), (stryMutAct_9fa48("47143") ? this.value.slice(0, wordStart) - suggestion : (stryCov_9fa48("47143"), (stryMutAct_9fa48("47144") ? this.value : (stryCov_9fa48("47144"), this.value.slice(0, wordStart))) + suggestion)) + (stryMutAct_9fa48("47145") ? this.value : (stryCov_9fa48("47145"), this.value.slice(this.cursorPosition))));
      this.cursorPosition = stryMutAct_9fa48("47146") ? wordStart - suggestion.length : (stryCov_9fa48("47146"), wordStart + suggestion.length);
      this.render();
      this.emitChange();
    }
  }

  /**
   * Show autocomplete suggestions
   * @param {Array<string>} suggestions - Suggestions to show
   */
  showSuggestions(suggestions) {
    if (stryMutAct_9fa48("47147")) {
      {}
    } else {
      stryCov_9fa48("47147");
      if (stryMutAct_9fa48("47149") ? false : stryMutAct_9fa48("47148") ? true : (stryCov_9fa48("47148", "47149"), this.eventBus)) {
        if (stryMutAct_9fa48("47150")) {
          {}
        } else {
          stryCov_9fa48("47150");
          this.eventBus.emit(stryMutAct_9fa48("47151") ? "" : (stryCov_9fa48("47151"), 'queryinput:suggestions'), stryMutAct_9fa48("47152") ? {} : (stryCov_9fa48("47152"), {
            suggestions,
            position: this.cursorPosition,
            word: this.getCurrentWord()
          }));
        }
      }
    }
  }

  /**
   * Get highlighted content for display
   * @return {string} Highlighted content
   */
  getHighlightedContent() {
    if (stryMutAct_9fa48("47153")) {
      {}
    } else {
      stryCov_9fa48("47153");
      if (stryMutAct_9fa48("47155") ? false : stryMutAct_9fa48("47154") ? true : (stryCov_9fa48("47154", "47155"), this.syntaxHighlighter)) {
        if (stryMutAct_9fa48("47156")) {
          {}
        } else {
          stryCov_9fa48("47156");
          return this.syntaxHighlighter.highlight(this.value);
        }
      }
      return this.value;
    }
  }

  /**
   * Render the input
   */
  render() {
    if (stryMutAct_9fa48("47157")) {
      {}
    } else {
      stryCov_9fa48("47157");
      if (stryMutAct_9fa48("47159") ? false : stryMutAct_9fa48("47158") ? true : (stryCov_9fa48("47158", "47159"), this.widget)) {
        if (stryMutAct_9fa48("47160")) {
          {}
        } else {
          stryCov_9fa48("47160");
          const content = this.getHighlightedContent();
          this.widget.setContent(content);
          if (stryMutAct_9fa48("47162") ? false : stryMutAct_9fa48("47161") ? true : (stryCov_9fa48("47161", "47162"), this.screen)) {
            if (stryMutAct_9fa48("47163")) {
              {}
            } else {
              stryCov_9fa48("47163");
              this.screen.render();
            }
          }
        }
      }
      if (stryMutAct_9fa48("47165") ? false : stryMutAct_9fa48("47164") ? true : (stryCov_9fa48("47164", "47165"), this.eventBus)) {
        if (stryMutAct_9fa48("47166")) {
          {}
        } else {
          stryCov_9fa48("47166");
          this.eventBus.emit(stryMutAct_9fa48("47167") ? "" : (stryCov_9fa48("47167"), 'queryinput:render'), stryMutAct_9fa48("47168") ? {} : (stryCov_9fa48("47168"), {
            value: this.value,
            cursorPosition: this.cursorPosition,
            highlighted: this.getHighlightedContent()
          }));
        }
      }
    }
  }

  /**
   * Emit change event
   */
  emitChange() {
    if (stryMutAct_9fa48("47169")) {
      {}
    } else {
      stryCov_9fa48("47169");
      if (stryMutAct_9fa48("47171") ? false : stryMutAct_9fa48("47170") ? true : (stryCov_9fa48("47170", "47171"), this.eventBus)) {
        if (stryMutAct_9fa48("47172")) {
          {}
        } else {
          stryCov_9fa48("47172");
          this.eventBus.emit(stryMutAct_9fa48("47173") ? "" : (stryCov_9fa48("47173"), 'queryinput:change'), stryMutAct_9fa48("47174") ? {} : (stryCov_9fa48("47174"), {
            value: this.value,
            cursorPosition: this.cursorPosition
          }));
        }
      }
    }
  }

  /**
   * Set the widget reference
   * @param {Object} widget - Blessed widget
   */
  setWidget(widget) {
    if (stryMutAct_9fa48("47175")) {
      {}
    } else {
      stryCov_9fa48("47175");
      this.widget = widget;
    }
  }

  /**
   * Check if input is empty
   * @return {boolean} True if empty
   */
  isEmpty() {
    if (stryMutAct_9fa48("47176")) {
      {}
    } else {
      stryCov_9fa48("47176");
      return stryMutAct_9fa48("47179") ? this.value.trim() !== '' : stryMutAct_9fa48("47178") ? false : stryMutAct_9fa48("47177") ? true : (stryCov_9fa48("47177", "47178", "47179"), (stryMutAct_9fa48("47180") ? this.value : (stryCov_9fa48("47180"), this.value.trim())) === (stryMutAct_9fa48("47181") ? "Stryker was here!" : (stryCov_9fa48("47181"), '')));
    }
  }

  /**
   * Get line and column from cursor position
   * @return {{line: number, column: number}} Line and column (0-indexed)
   */
  getCursorLineColumn() {
    if (stryMutAct_9fa48("47182")) {
      {}
    } else {
      stryCov_9fa48("47182");
      const beforeCursor = stryMutAct_9fa48("47183") ? this.value : (stryCov_9fa48("47183"), this.value.slice(0, this.cursorPosition));
      const lines = beforeCursor.split(stryMutAct_9fa48("47184") ? "" : (stryCov_9fa48("47184"), '\n'));
      return stryMutAct_9fa48("47185") ? {} : (stryCov_9fa48("47185"), {
        line: stryMutAct_9fa48("47186") ? lines.length + 1 : (stryCov_9fa48("47186"), lines.length - 1),
        column: lines[stryMutAct_9fa48("47187") ? lines.length + 1 : (stryCov_9fa48("47187"), lines.length - 1)].length
      });
    }
  }

  /**
   * Get the number of lines in the input
   * @return {number} Line count
   */
  getLineCount() {
    if (stryMutAct_9fa48("47188")) {
      {}
    } else {
      stryCov_9fa48("47188");
      return this.value.split(stryMutAct_9fa48("47189") ? "" : (stryCov_9fa48("47189"), '\n')).length;
    }
  }
}