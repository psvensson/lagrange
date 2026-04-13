// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ResultsPanel, RESULT_TYPE} from '../../../src/cli/sql/results-panel.js';

/**
 * Property 16: Query Error Display
 * Validates: Requirements 7.11
 *
 * For any failed query execution, the results panel SHALL display
 * the error message from the query engine.
 */

test('Property 16: Query Error Display', async (t) => {
  // Arbitrary for error messages
  const errorMessageArb = fc.string({minLength: 1, maxLength: 100})
    .filter((s) => s.trim().length > 0);

  // Arbitrary for error codes
  const _errorCodeArb = fc.oneof(
    fc.constant(undefined),
    fc.string({minLength: 1, maxLength: 20}),
  );

  // Arbitrary for error details
  const _errorDetailArb = fc.oneof(
    fc.constant(undefined),
    fc.string({minLength: 1, maxLength: 200}),
  );

  t.test('error message is stored in panel', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        (message) => {
          const panel = new ResultsPanel();

          panel.displayError({message});

          return panel.error !== null &&
                     panel.error.message === message;
        },
      ),
      {numRuns: 10},
    );
    t.pass('error message is stored in panel');
  });

  t.test('result type is set to ERROR', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        (message) => {
          const panel = new ResultsPanel();

          panel.displayError({message});

          return panel.resultType === RESULT_TYPE.ERROR;
        },
      ),
      {numRuns: 10},
    );
    t.pass('result type is set to ERROR');
  });

  t.test('hasError returns true after displayError', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        (message) => {
          const panel = new ResultsPanel();

          panel.displayError({message});

          return panel.hasError() === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('hasError returns true after displayError');
  });

  t.test('hasResults returns false after displayError', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        (message) => {
          const panel = new ResultsPanel();

          panel.displayError({message});

          return panel.hasResults() === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('hasResults returns false after displayError');
  });

  t.test('error code is preserved when provided', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        fc.string({minLength: 1, maxLength: 20}),
        (message, code) => {
          const panel = new ResultsPanel();

          panel.displayError({message, code});

          return panel.error.code === code;
        },
      ),
      {numRuns: 10},
    );
    t.pass('error code is preserved when provided');
  });

  t.test('error detail is preserved when provided', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        fc.string({minLength: 1, maxLength: 100}),
        (message, detail) => {
          const panel = new ResultsPanel();

          panel.displayError({message, detail});

          return panel.error.detail === detail;
        },
      ),
      {numRuns: 10},
    );
    t.pass('error detail is preserved when provided');
  });

  t.test('status line contains error message', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        (message) => {
          const panel = new ResultsPanel();

          panel.displayError({message});

          const statusLine = panel.getStatusLine();

          return statusLine.includes('Error:') &&
                     statusLine.includes(message);
        },
      ),
      {numRuns: 10},
    );
    t.pass('status line contains error message');
  });

  t.test('error message content includes error text', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        (message) => {
          const panel = new ResultsPanel();

          panel.displayError({message});

          const content = panel.getErrorMessage();

          return content.includes(message);
        },
      ),
      {numRuns: 10},
    );
    t.pass('error message content includes error text');
  });

  t.test('error message content includes code when provided', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        fc.string({minLength: 1, maxLength: 20}),
        (message, code) => {
          const panel = new ResultsPanel();

          panel.displayError({message, code});

          const content = panel.getErrorMessage();

          return content.includes('Code:') && content.includes(code);
        },
      ),
      {numRuns: 10},
    );
    t.pass('error message content includes code when provided');
  });

  t.test('error message content includes detail when provided', async (t) => {
    fc.assert(
      fc.property(
        errorMessageArb,
        fc.string({minLength: 1, maxLength: 100}),
        (message, detail) => {
          const panel = new ResultsPanel();

          panel.displayError({message, detail});

          const content = panel.getErrorMessage();

          return content.includes('Detail:') && content.includes(detail);
        },
      ),
      {numRuns: 10},
    );
    t.pass('error message content includes detail when provided');
  });

  t.test('displayError clears previous result state', async (t) => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer(),
            name: fc.string(),
          }),
          {minLength: 1, maxLength: 5},
        ),
        fc.integer({min: 1, max: 1000}),
        errorMessageArb,
        (rows, execTime, errorMessage) => {
          const panel = new ResultsPanel();

          // First display a successful result
          panel.displaySelectResult({rows}, execTime);

          // Then display an error
          panel.displayError({message: errorMessage});

          // Previous result state should be cleared
          return panel.currentResult === null &&
                     panel.executionTime === null &&
                     panel.rowCount === null &&
                     panel.affectedRows === null &&
                     panel.partitions.length === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('displayError clears previous result state');
  });

  t.test('unknown error handled gracefully', async (t) => {
    const panel = new ResultsPanel();

    // Display error with empty object
    panel.displayError({});

    // Should have default message
    t.equal(panel.error.message, 'Unknown error');
    t.equal(panel.resultType, RESULT_TYPE.ERROR);
    t.pass('unknown error handled gracefully');
  });
});
