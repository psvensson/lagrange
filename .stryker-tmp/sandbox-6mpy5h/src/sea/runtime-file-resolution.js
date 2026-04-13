// @ts-nocheck
function stryNS_9fa48() {
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
import fs from 'fs';
import path from 'path';

/**
 * Resolve the directory of the calling module without relying on import.meta.
 * This keeps source execution working while allowing CommonJS SEA bundles.
 *
 * @param {Function} skipFn - Frame to exclude from the stack lookup.
 * @return {string} Directory containing the calling module.
 */
function resolveModuleDirectory(skipFn) {
  if (stryMutAct_9fa48("149684")) {
    {}
  } else {
    stryCov_9fa48("149684");
    const originalPrepareStackTrace = Error.prepareStackTrace;
    const originalStackTraceLimit = Error.stackTraceLimit;
    try {
      if (stryMutAct_9fa48("149685")) {
        {}
      } else {
        stryCov_9fa48("149685");
        Error.stackTraceLimit = 10;
        Error.prepareStackTrace = stryMutAct_9fa48("149686") ? () => undefined : (stryCov_9fa48("149686"), (_error, stack) => stack);
        const holder = {};
        Error.captureStackTrace(holder, stryMutAct_9fa48("149689") ? skipFn && resolveModuleDirectory : stryMutAct_9fa48("149688") ? false : stryMutAct_9fa48("149687") ? true : (stryCov_9fa48("149687", "149688", "149689"), skipFn || resolveModuleDirectory));
        const stack = Array.isArray(holder.stack) ? holder.stack : stryMutAct_9fa48("149690") ? ["Stryker was here"] : (stryCov_9fa48("149690"), []);
        for (const frame of stack) {
          if (stryMutAct_9fa48("149691")) {
            {}
          } else {
            stryCov_9fa48("149691");
            const fileName = stryMutAct_9fa48("149693") ? frame.getFileName?.() : stryMutAct_9fa48("149692") ? frame?.getFileName() : (stryCov_9fa48("149692", "149693"), frame?.getFileName?.());
            if (stryMutAct_9fa48("149696") ? typeof fileName === 'string' || fileName.length > 0 : stryMutAct_9fa48("149695") ? false : stryMutAct_9fa48("149694") ? true : (stryCov_9fa48("149694", "149695", "149696"), (stryMutAct_9fa48("149698") ? typeof fileName !== 'string' : stryMutAct_9fa48("149697") ? true : (stryCov_9fa48("149697", "149698"), typeof fileName === (stryMutAct_9fa48("149699") ? "" : (stryCov_9fa48("149699"), 'string')))) && (stryMutAct_9fa48("149702") ? fileName.length <= 0 : stryMutAct_9fa48("149701") ? fileName.length >= 0 : stryMutAct_9fa48("149700") ? true : (stryCov_9fa48("149700", "149701", "149702"), fileName.length > 0)))) {
              if (stryMutAct_9fa48("149703")) {
                {}
              } else {
                stryCov_9fa48("149703");
                return path.dirname(fileName);
              }
            }
          }
        }
      }
    } finally {
      if (stryMutAct_9fa48("149704")) {
        {}
      } else {
        stryCov_9fa48("149704");
        Error.prepareStackTrace = originalPrepareStackTrace;
        Error.stackTraceLimit = originalStackTraceLimit;
      }
    }
    return process.cwd();
  }
}

/**
 * Resolve a filesystem-backed runtime file for source, dist bundle, or SEA.
 *
 * Search order:
 *   1. Sibling of the SEA executable
 *   2. Sibling of the bundled dist file
 *   3. Source file beside the current module
 *
 * @param {Object} options
 * @param {string} options.moduleDir
 * @param {string} options.sourceFileName
 * @param {string} options.bundledFileName
 * @param {string} [options.execDir]
 * @param {Function} [options.exists]
 * @return {string}
 */
function resolvePackagedRuntimeFile(options) {
  if (stryMutAct_9fa48("149705")) {
    {}
  } else {
    stryCov_9fa48("149705");
    const exists = stryMutAct_9fa48("149708") ? options.exists && fs.existsSync : stryMutAct_9fa48("149707") ? false : stryMutAct_9fa48("149706") ? true : (stryCov_9fa48("149706", "149707", "149708"), options.exists || fs.existsSync);
    const execDir = stryMutAct_9fa48("149711") ? options.execDir && path.dirname(process.execPath) : stryMutAct_9fa48("149710") ? false : stryMutAct_9fa48("149709") ? true : (stryCov_9fa48("149709", "149710", "149711"), options.execDir || path.dirname(process.execPath));
    const moduleDir = stryMutAct_9fa48("149714") ? options.moduleDir && process.cwd() : stryMutAct_9fa48("149713") ? false : stryMutAct_9fa48("149712") ? true : (stryCov_9fa48("149712", "149713", "149714"), options.moduleDir || process.cwd());
    const candidates = stryMutAct_9fa48("149715") ? [] : (stryCov_9fa48("149715"), [path.join(execDir, options.bundledFileName), path.join(moduleDir, options.bundledFileName), path.join(moduleDir, options.sourceFileName)]);
    for (const candidate of candidates) {
      if (stryMutAct_9fa48("149716")) {
        {}
      } else {
        stryCov_9fa48("149716");
        if (stryMutAct_9fa48("149718") ? false : stryMutAct_9fa48("149717") ? true : (stryCov_9fa48("149717", "149718"), exists(candidate))) {
          if (stryMutAct_9fa48("149719")) {
            {}
          } else {
            stryCov_9fa48("149719");
            return candidate;
          }
        }
      }
    }
    return candidates[stryMutAct_9fa48("149720") ? candidates.length + 1 : (stryCov_9fa48("149720"), candidates.length - 1)];
  }
}
export { resolveModuleDirectory, resolvePackagedRuntimeFile };