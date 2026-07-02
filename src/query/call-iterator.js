
/**
 * CallIterator — async iterator wrapper for Iterator_Mode
 * of `ctx.call(query, params?)`.
 *
 * Executes a query via the injected queryExecutor and yields
 * result rows one at a time, checking cancellation before
 * each yield.
 *
 * Requirements: 5.1
 * @module query/call-iterator
 */

/**
 * Create an async iterator that yields rows from a query
 * execution result.
 *
 * @param {string} query - SQL query string.
 * @param {unknown[]} params - Bind parameters.
 * @param {Function} queryExecutor - Async function that
 *   accepts (query, params) and returns {rows: Array}.
 * @param {import('./cancellation-token.js').CancellationToken} cancellationToken
 *   Token for cooperative cancellation.
 * @return {AsyncIterableIterator<*>} Async iterator of rows.
 */
function createCallIterator(
  query, params, queryExecutor, cancellationToken,
) {
  let rows = null;
  let index = 0;
  let exhausted = false;

  return {
    [Symbol.asyncIterator]() {
      return this;
    },

    async next() {
      cancellationToken.throwIfCancelled();

      if (exhausted) {
        return {value: undefined, done: true};
      }

      // Lazy execution: fetch rows on first next() call
      if (rows === null) {
        const result = await queryExecutor(query, params);
        rows = result?.rows ?? [];
      }

      if (index >= rows.length) {
        exhausted = true;
        return {value: undefined, done: true};
      }

      const value = rows[index];
      index++;
      return {value, done: false};
    },

    async return() {
      exhausted = true;
      return {value: undefined, done: true};
    },

    async throw(err) {
      exhausted = true;
      throw err;
    },
  };
}

export {createCallIterator};
