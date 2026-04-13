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
// @ts-nocheck


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
function createCallIterator(query, params, queryExecutor, cancellationToken) {
  if (stryMutAct_9fa48("109002")) {
    {}
  } else {
    stryCov_9fa48("109002");
    let rows = null;
    let index = 0;
    let exhausted = stryMutAct_9fa48("109003") ? true : (stryCov_9fa48("109003"), false);
    return stryMutAct_9fa48("109004") ? {} : (stryCov_9fa48("109004"), {
      [Symbol.asyncIterator]() {
        if (stryMutAct_9fa48("109005")) {
          {}
        } else {
          stryCov_9fa48("109005");
          return this;
        }
      },
      async next() {
        if (stryMutAct_9fa48("109006")) {
          {}
        } else {
          stryCov_9fa48("109006");
          cancellationToken.throwIfCancelled();
          if (stryMutAct_9fa48("109008") ? false : stryMutAct_9fa48("109007") ? true : (stryCov_9fa48("109007", "109008"), exhausted)) {
            if (stryMutAct_9fa48("109009")) {
              {}
            } else {
              stryCov_9fa48("109009");
              return stryMutAct_9fa48("109010") ? {} : (stryCov_9fa48("109010"), {
                value: undefined,
                done: stryMutAct_9fa48("109011") ? false : (stryCov_9fa48("109011"), true)
              });
            }
          }

          // Lazy execution: fetch rows on first next() call
          if (stryMutAct_9fa48("109014") ? rows !== null : stryMutAct_9fa48("109013") ? false : stryMutAct_9fa48("109012") ? true : (stryCov_9fa48("109012", "109013", "109014"), rows === null)) {
            if (stryMutAct_9fa48("109015")) {
              {}
            } else {
              stryCov_9fa48("109015");
              const result = await queryExecutor(query, params);
              rows = stryMutAct_9fa48("109016") ? result?.rows && [] : (stryCov_9fa48("109016"), (stryMutAct_9fa48("109017") ? result.rows : (stryCov_9fa48("109017"), result?.rows)) ?? (stryMutAct_9fa48("109018") ? ["Stryker was here"] : (stryCov_9fa48("109018"), [])));
            }
          }
          if (stryMutAct_9fa48("109022") ? index < rows.length : stryMutAct_9fa48("109021") ? index > rows.length : stryMutAct_9fa48("109020") ? false : stryMutAct_9fa48("109019") ? true : (stryCov_9fa48("109019", "109020", "109021", "109022"), index >= rows.length)) {
            if (stryMutAct_9fa48("109023")) {
              {}
            } else {
              stryCov_9fa48("109023");
              exhausted = stryMutAct_9fa48("109024") ? false : (stryCov_9fa48("109024"), true);
              return stryMutAct_9fa48("109025") ? {} : (stryCov_9fa48("109025"), {
                value: undefined,
                done: stryMutAct_9fa48("109026") ? false : (stryCov_9fa48("109026"), true)
              });
            }
          }
          const value = rows[index];
          stryMutAct_9fa48("109027") ? index-- : (stryCov_9fa48("109027"), index++);
          return stryMutAct_9fa48("109028") ? {} : (stryCov_9fa48("109028"), {
            value,
            done: stryMutAct_9fa48("109029") ? true : (stryCov_9fa48("109029"), false)
          });
        }
      },
      async return() {
        if (stryMutAct_9fa48("109030")) {
          {}
        } else {
          stryCov_9fa48("109030");
          exhausted = stryMutAct_9fa48("109031") ? false : (stryCov_9fa48("109031"), true);
          return stryMutAct_9fa48("109032") ? {} : (stryCov_9fa48("109032"), {
            value: undefined,
            done: stryMutAct_9fa48("109033") ? false : (stryCov_9fa48("109033"), true)
          });
        }
      },
      async throw(err) {
        if (stryMutAct_9fa48("109034")) {
          {}
        } else {
          stryCov_9fa48("109034");
          exhausted = stryMutAct_9fa48("109035") ? false : (stryCov_9fa48("109035"), true);
          throw err;
        }
      }
    });
  }
}
export { createCallIterator };