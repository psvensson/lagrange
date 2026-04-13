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
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerPath = join(__dirname, stryMutAct_9fa48("152129") ? "" : (stryCov_9fa48("152129"), 'worker'), stryMutAct_9fa48("152130") ? "" : (stryCov_9fa48("152130"), 'entry-runner.js'));

/**
 * Run a JS entrypoint in a worker thread and capture stdout/stderr.
 * Avoids `child_process.spawnSync()` which may be blocked in CI sandboxes.
 *
 * @param {string} entryPath absolute path to an entrypoint file (ESM)
 * @param {object} [opts]
 * @param {string[]} [opts.args]
 * @param {Record<string,string>} [opts.env]
 * @param {number} [opts.timeoutMs]
 * @return {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
export function runEntrypoint(entryPath, opts = {}) {
  if (stryMutAct_9fa48("152131")) {
    {}
  } else {
    stryCov_9fa48("152131");
    const {
      args = stryMutAct_9fa48("152132") ? ["Stryker was here"] : (stryCov_9fa48("152132"), []),
      env = {},
      timeoutMs = 5000
    } = opts;
    return new Promise((resolve, reject) => {
      if (stryMutAct_9fa48("152133")) {
        {}
      } else {
        stryCov_9fa48("152133");
        const worker = new Worker(workerPath, stryMutAct_9fa48("152134") ? {} : (stryCov_9fa48("152134"), {
          workerData: stryMutAct_9fa48("152135") ? {} : (stryCov_9fa48("152135"), {
            entryPath,
            args,
            env
          })
        }));
        // Don't keep the event loop alive if something goes wrong.
        worker.unref();
        const timer = setTimeout(() => {
          if (stryMutAct_9fa48("152136")) {
            {}
          } else {
            stryCov_9fa48("152136");
            // Terminate best-effort; don't wait for termination to resolve.
            worker.terminate().catch(() => {});
            reject(new Error(stryMutAct_9fa48("152137") ? `` : (stryCov_9fa48("152137"), `runEntrypoint timeout after ${timeoutMs}ms: ${entryPath}`)));
          }
        }, timeoutMs);
        worker.once(stryMutAct_9fa48("152138") ? "" : (stryCov_9fa48("152138"), 'message'), msg => {
          if (stryMutAct_9fa48("152139")) {
            {}
          } else {
            stryCov_9fa48("152139");
            clearTimeout(timer);
            worker.terminate().catch(() => {});
            if (stryMutAct_9fa48("152142") ? msg || msg.error : stryMutAct_9fa48("152141") ? false : stryMutAct_9fa48("152140") ? true : (stryCov_9fa48("152140", "152141", "152142"), msg && msg.error)) {
              if (stryMutAct_9fa48("152143")) {
                {}
              } else {
                stryCov_9fa48("152143");
                reject(new Error(stryMutAct_9fa48("152146") ? msg.stderr && 'Entrypoint failed' : stryMutAct_9fa48("152145") ? false : stryMutAct_9fa48("152144") ? true : (stryCov_9fa48("152144", "152145", "152146"), msg.stderr || (stryMutAct_9fa48("152147") ? "" : (stryCov_9fa48("152147"), 'Entrypoint failed')))));
                return;
              }
            }
            resolve(stryMutAct_9fa48("152148") ? {} : (stryCov_9fa48("152148"), {
              stdout: stryMutAct_9fa48("152151") ? msg.stdout && '' : stryMutAct_9fa48("152150") ? false : stryMutAct_9fa48("152149") ? true : (stryCov_9fa48("152149", "152150", "152151"), msg.stdout || (stryMutAct_9fa48("152152") ? "Stryker was here!" : (stryCov_9fa48("152152"), ''))),
              stderr: stryMutAct_9fa48("152155") ? msg.stderr && '' : stryMutAct_9fa48("152154") ? false : stryMutAct_9fa48("152153") ? true : (stryCov_9fa48("152153", "152154", "152155"), msg.stderr || (stryMutAct_9fa48("152156") ? "Stryker was here!" : (stryCov_9fa48("152156"), ''))),
              exitCode: stryMutAct_9fa48("152157") ? msg.exitCode && 0 : (stryCov_9fa48("152157"), msg.exitCode ?? 0)
            }));
          }
        });
        worker.once(stryMutAct_9fa48("152158") ? "" : (stryCov_9fa48("152158"), 'error'), err => {
          if (stryMutAct_9fa48("152159")) {
            {}
          } else {
            stryCov_9fa48("152159");
            clearTimeout(timer);
            worker.terminate().catch(() => {});
            reject(err);
          }
        });
      }
    });
  }
}