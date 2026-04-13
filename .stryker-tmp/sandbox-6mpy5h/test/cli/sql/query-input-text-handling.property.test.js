// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryInput} from '../../../src/cli/sql/query-input.js';

/**
 * Property 24: Query Input Text Handling
 * Validates: Requirements 7.3, 7.4
 *
 * For any sequence of text insertions and deletions, the QueryInput
 * should maintain consistent state where:
 * - The cursor position is always within valid bounds
 * - Character insertions increase length by 1
 * - Character deletions decrease length by 1 (when possible)
 * - Multi-line input is supported via newline insertion
 */

test('Property 24: Query Input Text Handling', async (t) => {
  t.test('insertChar always increases value length by 1', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 100}),
        fc.char(),
        (initialValue, charToInsert) => {
          const input = new QueryInput();
          input.setValue(initialValue);
          const initialLength = input.getValue().length;

          input.insertChar(charToInsert);

          return input.getValue().length === initialLength + 1;
        },
      ),
      {numRuns: 10},
    );
    t.pass('insertChar always increases length by 1');
  });

  t.test('deleteBackward decreases length by 1 when cursor > 0', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 100}),
        fc.integer({min: 1, max: 100}),
        (initialValue, cursorOffset) => {
          const input = new QueryInput();
          input.setValue(initialValue);
          const cursorPos = Math.min(cursorOffset, initialValue.length);
          input.setCursorPosition(cursorPos);
          const initialLength = input.getValue().length;

          input.deleteBackward();

          return input.getValue().length === initialLength - 1;
        },
      ),
      {numRuns: 10},
    );
    t.pass('deleteBackward decreases length by 1 when cursor > 0');
  });

  t.test('deleteBackward preserves length when cursor at 0', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 100}),
        (initialValue) => {
          const input = new QueryInput();
          input.setValue(initialValue);
          input.setCursorPosition(0);
          const initialLength = input.getValue().length;

          input.deleteBackward();

          return input.getValue().length === initialLength;
        },
      ),
      {numRuns: 10},
    );
    t.pass('deleteBackward preserves length when cursor at 0');
  });

  t.test('cursor position always within valid bounds after operations', async (t) => {
    // Generate a sequence of operations
    const operationArb = fc.oneof(
      fc.constant({type: 'left'}),
      fc.constant({type: 'right'}),
      fc.constant({type: 'home'}),
      fc.constant({type: 'end'}),
      fc.constant({type: 'backspace'}),
      fc.constant({type: 'delete'}),
      fc.record({type: fc.constant('char'), char: fc.char()}),
    );

    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 50}),
        fc.array(operationArb, {minLength: 1, maxLength: 20}),
        (initialValue, operations) => {
          const input = new QueryInput();
          input.setValue(initialValue);

          for (const op of operations) {
            switch (op.type) {
            case 'left':
              input.handleKey({full: 'left'});
              break;
            case 'right':
              input.handleKey({full: 'right'});
              break;
            case 'home':
              input.handleKey({full: 'home'});
              break;
            case 'end':
              input.handleKey({full: 'end'});
              break;
            case 'backspace':
              input.handleKey({full: 'backspace'});
              break;
            case 'delete':
              input.handleKey({full: 'delete'});
              break;
            case 'char':
              input.handleKey({ch: op.char});
              break;
            }

            // Invariant: cursor is always within bounds
            const pos = input.getCursorPosition();
            const len = input.getValue().length;
            if (pos < 0 || pos > len) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('cursor position always within valid bounds');
  });

  t.test('multi-line input supported via newline insertion', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 20}), {minLength: 2, maxLength: 5}),
        (lines) => {
          const input = new QueryInput();

          // Build multi-line input
          for (let i = 0; i < lines.length; i++) {
            input.insertText(lines[i]);
            if (i < lines.length - 1) {
              input.insertNewline();
            }
          }

          // Verify line count matches
          return input.getLineCount() === lines.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('multi-line input supported via newline insertion');
  });

  t.test('insertText followed by getValue returns consistent result', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 100}),
        (text) => {
          const input = new QueryInput();

          input.insertText(text);

          return input.getValue() === text;
        },
      ),
      {numRuns: 10},
    );
    t.pass('insertText followed by getValue returns consistent result');
  });

  t.test('cursor movement is bounded', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 50}),
        fc.integer({min: 0, max: 100}),
        (value, moves) => {
          const input = new QueryInput();
          input.setValue(value);

          // Move left many times
          for (let i = 0; i < moves; i++) {
            input.moveCursorLeft();
          }
          const afterLeft = input.getCursorPosition();

          // Move right many times
          for (let i = 0; i < moves * 2; i++) {
            input.moveCursorRight();
          }
          const afterRight = input.getCursorPosition();

          return afterLeft >= 0 && afterRight <= value.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('cursor movement is bounded');
  });
});
