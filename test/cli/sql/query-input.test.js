import {test} from 'tap';
import {QueryInput} from '../../../src/cli/sql/query-input.js';

/**
 * Create a mock history object
 * @param {Array<string>} entries - History entries
 * @return {Object} Mock history
 */
function createMockHistory(entries = []) {
  return {
    entries: [...entries],
    get length() {
      return this.entries.length;
    },
    getAt(index) {
      return this.entries[index] || null;
    },
    add(query) {
      this.entries.unshift(query);
    },
  };
}

/**
 * Create a mock event bus
 * @return {Object} Mock event bus with captured events
 */
function createMockEventBus() {
  const events = [];
  return {
    events,
    emit(event, data) {
      events.push({event, data});
    },
    getEvents(eventName) {
      return events.filter((e) => e.event === eventName);
    },
  };
}

test('QueryInput', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const input = new QueryInput();

    t.equal(input.getValue(), '');
    t.equal(input.getCursorPosition(), 0);
    t.equal(input.historyIndex, -1);
  });

  t.test('setValue sets value and moves cursor to end', async (t) => {
    const input = new QueryInput();

    input.setValue('SELECT * FROM users');

    t.equal(input.getValue(), 'SELECT * FROM users');
    t.equal(input.getCursorPosition(), 19);
  });

  t.test('setValue handles null/undefined', async (t) => {
    const input = new QueryInput();
    input.setValue('test');

    input.setValue(null);
    t.equal(input.getValue(), '');

    input.setValue(undefined);
    t.equal(input.getValue(), '');
  });

  t.test('clear resets all state', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT * FROM users');
    input.historyIndex = 2;
    input.savedInput = 'saved';

    input.clear();

    t.equal(input.getValue(), '');
    t.equal(input.getCursorPosition(), 0);
    t.equal(input.historyIndex, -1);
    t.equal(input.savedInput, '');
  });

  t.test('insertChar inserts character at cursor', async (t) => {
    const input = new QueryInput();
    input.setValue('SELCT');
    input.setCursorPosition(3);

    input.insertChar('E');

    t.equal(input.getValue(), 'SELECT');
    t.equal(input.getCursorPosition(), 4);
  });

  t.test('insertNewline inserts newline character', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT *');

    input.insertNewline();

    t.equal(input.getValue(), 'SELECT *\n');
    t.equal(input.getCursorPosition(), 9);
  });

  t.test('insertText inserts multiple characters', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT ');

    input.insertText('* FROM users');

    t.equal(input.getValue(), 'SELECT * FROM users');
    t.equal(input.getCursorPosition(), 19);
  });

  t.test('deleteBackward removes character before cursor', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECTT');
    input.setCursorPosition(7);

    input.deleteBackward();

    t.equal(input.getValue(), 'SELECT');
    t.equal(input.getCursorPosition(), 6);
  });

  t.test('deleteBackward does nothing at start', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');
    input.setCursorPosition(0);

    input.deleteBackward();

    t.equal(input.getValue(), 'SELECT');
    t.equal(input.getCursorPosition(), 0);
  });

  t.test('deleteForward removes character after cursor', async (t) => {
    const input = new QueryInput();
    input.setValue('SEELECT');
    input.setCursorPosition(2);

    input.deleteForward();

    t.equal(input.getValue(), 'SELECT');
    t.equal(input.getCursorPosition(), 2);
  });

  t.test('deleteForward does nothing at end', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');

    input.deleteForward();

    t.equal(input.getValue(), 'SELECT');
    t.equal(input.getCursorPosition(), 6);
  });

  t.test('moveCursorLeft moves cursor left', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');

    input.moveCursorLeft();

    t.equal(input.getCursorPosition(), 5);
  });

  t.test('moveCursorLeft stops at start', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');
    input.setCursorPosition(0);

    input.moveCursorLeft();

    t.equal(input.getCursorPosition(), 0);
  });

  t.test('moveCursorRight moves cursor right', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');
    input.setCursorPosition(0);

    input.moveCursorRight();

    t.equal(input.getCursorPosition(), 1);
  });

  t.test('moveCursorRight stops at end', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');

    input.moveCursorRight();

    t.equal(input.getCursorPosition(), 6);
  });

  t.test('moveCursorToLineStart moves to line start', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT *\nFROM users');
    input.setCursorPosition(14); // Middle of second line

    input.moveCursorToLineStart();

    t.equal(input.getCursorPosition(), 9); // Start of second line
  });

  t.test('moveCursorToLineEnd moves to line end', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT *\nFROM users');
    input.setCursorPosition(9); // Start of second line

    input.moveCursorToLineEnd();

    t.equal(input.getCursorPosition(), 19); // End of second line
  });

  t.test('handleKey handles escape to clear', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT * FROM users');

    const handled = input.handleKey({full: 'escape'});

    t.equal(handled, true);
    t.equal(input.getValue(), '');
  });

  t.test('handleKey handles backspace', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');

    const handled = input.handleKey({full: 'backspace'});

    t.equal(handled, true);
    t.equal(input.getValue(), 'SELEC');
  });

  t.test('handleKey handles delete', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');
    input.setCursorPosition(0);

    const handled = input.handleKey({full: 'delete'});

    t.equal(handled, true);
    t.equal(input.getValue(), 'ELECT');
  });

  t.test('handleKey handles arrow keys', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');
    input.setCursorPosition(3);

    input.handleKey({full: 'left'});
    t.equal(input.getCursorPosition(), 2);

    input.handleKey({full: 'right'});
    t.equal(input.getCursorPosition(), 3);
  });

  t.test('handleKey handles home/end', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');
    input.setCursorPosition(3);

    input.handleKey({full: 'home'});
    t.equal(input.getCursorPosition(), 0);

    input.handleKey({full: 'end'});
    t.equal(input.getCursorPosition(), 6);
  });

  t.test('handleKey handles enter for newline', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT *');

    const handled = input.handleKey({full: 'enter'});

    t.equal(handled, true);
    t.equal(input.getValue(), 'SELECT *\n');
  });

  t.test('handleKey handles character input', async (t) => {
    const input = new QueryInput();

    const handled = input.handleKey({ch: 'A'});

    t.equal(handled, true);
    t.equal(input.getValue(), 'A');
  });

  t.test('handleKey ignores ctrl+char', async (t) => {
    const input = new QueryInput();

    const handled = input.handleKey({ch: 'c', ctrl: true});

    t.equal(handled, false);
    t.equal(input.getValue(), '');
  });

  t.test('handleKey returns false for unhandled keys', async (t) => {
    const input = new QueryInput();

    const handled = input.handleKey({full: 'f12'});

    t.equal(handled, false);
  });

  t.test('navigateHistoryUp navigates to previous entry', async (t) => {
    const history = createMockHistory(['query1', 'query2', 'query3']);
    const input = new QueryInput({history});
    input.setValue('current');

    input.navigateHistoryUp();

    t.equal(input.getValue(), 'query1');
    t.equal(input.historyIndex, 0);
    t.equal(input.savedInput, 'current');
  });

  t.test('navigateHistoryUp continues through history', async (t) => {
    const history = createMockHistory(['query1', 'query2', 'query3']);
    const input = new QueryInput({history});

    input.navigateHistoryUp();
    input.navigateHistoryUp();
    input.navigateHistoryUp();

    t.equal(input.getValue(), 'query3');
    t.equal(input.historyIndex, 2);
  });

  t.test('navigateHistoryUp stops at end of history', async (t) => {
    const history = createMockHistory(['query1']);
    const input = new QueryInput({history});

    input.navigateHistoryUp();
    input.navigateHistoryUp();
    input.navigateHistoryUp();

    t.equal(input.getValue(), 'query1');
    t.equal(input.historyIndex, 0);
  });

  t.test('navigateHistoryDown returns to newer entries', async (t) => {
    const history = createMockHistory(['query1', 'query2', 'query3']);
    const input = new QueryInput({history});

    input.navigateHistoryUp();
    input.navigateHistoryUp();
    input.navigateHistoryDown();

    t.equal(input.getValue(), 'query1');
    t.equal(input.historyIndex, 0);
  });

  t.test('navigateHistoryDown returns to saved input', async (t) => {
    const history = createMockHistory(['query1', 'query2']);
    const input = new QueryInput({history});
    input.setValue('my current query');

    input.navigateHistoryUp();
    input.navigateHistoryDown();

    t.equal(input.getValue(), 'my current query');
    t.equal(input.historyIndex, -1);
  });

  t.test('navigateHistoryUp does nothing without history', async (t) => {
    const input = new QueryInput();
    input.setValue('test');

    input.navigateHistoryUp();

    t.equal(input.getValue(), 'test');
  });

  t.test('getCurrentWord returns word at cursor', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT * FROM users');
    input.setCursorPosition(6); // End of SELECT

    t.equal(input.getCurrentWord(), 'SELECT');
  });

  t.test('getCurrentWord returns partial word', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT * FROM users');
    input.setCursorPosition(3); // Middle of SELECT

    t.equal(input.getCurrentWord(), 'SEL');
  });

  t.test('getCurrentWord returns empty for non-word position', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT * FROM users');
    input.setCursorPosition(7); // After space

    t.equal(input.getCurrentWord(), '');
  });

  t.test('applyCompletion replaces current word', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT * FROM use');
    input.setCursorPosition(17); // End of 'use'

    input.applyCompletion('users');

    t.equal(input.getValue(), 'SELECT * FROM users');
    t.equal(input.getCursorPosition(), 19);
  });

  t.test('isEmpty returns true for empty input', async (t) => {
    const input = new QueryInput();

    t.equal(input.isEmpty(), true);
  });

  t.test('isEmpty returns true for whitespace only', async (t) => {
    const input = new QueryInput();
    input.setValue('   \n\t  ');

    t.equal(input.isEmpty(), true);
  });

  t.test('isEmpty returns false for non-empty input', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');

    t.equal(input.isEmpty(), false);
  });

  t.test('getCursorLineColumn returns correct position', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT *\nFROM users\nWHERE id = 1');
    input.setCursorPosition(14); // 'u' in 'users'

    const pos = input.getCursorLineColumn();

    t.equal(pos.line, 1);
    t.equal(pos.column, 5);
  });

  t.test('getLineCount returns correct count', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT *\nFROM users\nWHERE id = 1');

    t.equal(input.getLineCount(), 3);
  });

  t.test('getLineCount returns 1 for single line', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT * FROM users');

    t.equal(input.getLineCount(), 1);
  });

  t.test('emits change events', async (t) => {
    const eventBus = createMockEventBus();
    const input = new QueryInput({eventBus});

    input.insertChar('A');

    const changeEvents = eventBus.getEvents('queryinput:change');
    t.equal(changeEvents.length, 1);
    t.equal(changeEvents[0].data.value, 'A');
  });

  t.test('emits change event on clear', async (t) => {
    const eventBus = createMockEventBus();
    const input = new QueryInput({eventBus});
    input.setValue('test');
    eventBus.events.length = 0; // Clear previous events

    input.clear();

    const changeEvents = eventBus.getEvents('queryinput:change');
    t.equal(changeEvents.length, 1);
    t.equal(changeEvents[0].data.value, '');
  });

  t.test('setCursorPosition clamps to valid range', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT');

    input.setCursorPosition(-5);
    t.equal(input.getCursorPosition(), 0);

    input.setCursorPosition(100);
    t.equal(input.getCursorPosition(), 6);
  });

  t.test('getHighlightedContent returns value without highlighter', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT * FROM users');

    t.equal(input.getHighlightedContent(), 'SELECT * FROM users');
  });

  t.test('getHighlightedContent uses syntax highlighter', async (t) => {
    const highlighter = {
      highlight: (sql) => sql.replace(/SELECT/g, '{blue-fg}SELECT{/}'),
    };
    const input = new QueryInput({syntaxHighlighter: highlighter});
    input.setValue('SELECT * FROM users');

    t.equal(input.getHighlightedContent(), '{blue-fg}SELECT{/} * FROM users');
  });

  t.test('triggerAutocomplete applies single suggestion', async (t) => {
    const autocomplete = {
      getSuggestions: () => ['users'],
    };
    const input = new QueryInput({autocomplete});
    input.setValue('SELECT * FROM use');
    input.setCursorPosition(17);

    input.triggerAutocomplete();

    t.equal(input.getValue(), 'SELECT * FROM users');
  });

  t.test('triggerAutocomplete emits event for multiple suggestions', async (t) => {
    const eventBus = createMockEventBus();
    const autocomplete = {
      getSuggestions: () => ['users', 'user_roles', 'user_sessions'],
    };
    const input = new QueryInput({autocomplete, eventBus});
    input.setValue('SELECT * FROM use');
    input.setCursorPosition(17);

    input.triggerAutocomplete();

    const suggestionEvents = eventBus.getEvents('queryinput:suggestions');
    t.equal(suggestionEvents.length, 1);
    t.equal(suggestionEvents[0].data.suggestions.length, 3);
  });

  t.test('triggerAutocomplete does nothing without autocomplete', async (t) => {
    const input = new QueryInput();
    input.setValue('SELECT * FROM use');

    // Should not throw
    input.triggerAutocomplete();

    t.equal(input.getValue(), 'SELECT * FROM use');
  });
});
