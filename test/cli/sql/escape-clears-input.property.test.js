import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryInput} from '../../../src/cli/sql/query-input.js';

/**
 * Property 25: Escape Clears Input
 * Validates: Requirements 9.5
 *
 * For any input state (value, cursor position, history index),
 * pressing Escape should clear the input completely, resetting:
 * - Value to empty string
 * - Cursor position to 0
 * - History navigation state
 */

test('Property 25: Escape Clears Input', async (t) => {
  t.test('escape clears any input value', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 200}),
        (inputValue) => {
          const input = new QueryInput();
          input.setValue(inputValue);

          input.handleKey({full: 'escape'});

          return input.getValue() === '' &&
                     input.getCursorPosition() === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('escape clears any input value');
  });

  t.test('escape clears input regardless of cursor position', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 100}),
        fc.integer({min: 0, max: 100}),
        (inputValue, cursorOffset) => {
          const input = new QueryInput();
          input.setValue(inputValue);
          const cursorPos = Math.min(cursorOffset, inputValue.length);
          input.setCursorPosition(cursorPos);

          input.handleKey({full: 'escape'});

          return input.getValue() === '' &&
                     input.getCursorPosition() === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('escape clears input regardless of cursor position');
  });

  t.test('escape resets history navigation state', async (t) => {
    const createMockHistory = (entries) => ({
      entries: [...entries],
      get length() {
        return this.entries.length;
      },
      getAt(index) {
        return this.entries[index] || null;
      },
    });

    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 50}), {minLength: 1, maxLength: 10}),
        fc.integer({min: 0, max: 9}),
        (historyEntries, navigations) => {
          const history = createMockHistory(historyEntries);
          const input = new QueryInput({history});
          input.setValue('current input');

          // Navigate through history
          const navCount = Math.min(navigations, historyEntries.length);
          for (let i = 0; i < navCount; i++) {
            input.navigateHistoryUp();
          }

          // Press escape
          input.handleKey({full: 'escape'});

          return input.getValue() === '' &&
                     input.historyIndex === -1 &&
                     input.savedInput === '';
        },
      ),
      {numRuns: 10},
    );
    t.pass('escape resets history navigation state');
  });

  t.test('escape clears multi-line input', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 30}), {minLength: 2, maxLength: 5}),
        (lines) => {
          const input = new QueryInput();
          const multiLineValue = lines.join('\n');
          input.setValue(multiLineValue);

          input.handleKey({full: 'escape'});

          return input.getValue() === '' &&
                     input.getLineCount() === 1;
        },
      ),
      {numRuns: 10},
    );
    t.pass('escape clears multi-line input');
  });

  t.test('escape is idempotent', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 100}),
        fc.integer({min: 1, max: 5}),
        (inputValue, escapeCount) => {
          const input = new QueryInput();
          input.setValue(inputValue);

          // Press escape multiple times
          for (let i = 0; i < escapeCount; i++) {
            input.handleKey({full: 'escape'});
          }

          return input.getValue() === '' &&
                     input.getCursorPosition() === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('escape is idempotent');
  });

  t.test('escape returns true indicating key was handled', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 100}),
        (inputValue) => {
          const input = new QueryInput();
          input.setValue(inputValue);

          const handled = input.handleKey({full: 'escape'});

          return handled === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('escape returns true indicating key was handled');
  });
});
