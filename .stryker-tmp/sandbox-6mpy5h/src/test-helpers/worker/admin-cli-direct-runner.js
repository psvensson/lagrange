/**
 * Worker entry to run AdminCLI directly (without going through the bin wrapper).
 * Used by packaging tests as a "non-packaged" baseline.
 */
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
import { parentPort, workerData } from 'worker_threads';
import { AdminCLI } from '../../cli/index.js';
import { ExitError } from './exit-error.js';
function captureOutput() {
  if (stryMutAct_9fa48("152169")) {
    {}
  } else {
    stryCov_9fa48("152169");
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalExit = process.exit;
    let stdout = stryMutAct_9fa48("152170") ? "Stryker was here!" : (stryCov_9fa48("152170"), '');
    let stderr = stryMutAct_9fa48("152171") ? "Stryker was here!" : (stryCov_9fa48("152171"), '');
    process.stdout.write = (chunk, encoding, cb) => {
      if (stryMutAct_9fa48("152172")) {
        {}
      } else {
        stryCov_9fa48("152172");
        stryMutAct_9fa48("152173") ? stdout -= Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk) : (stryCov_9fa48("152173"), stdout += Buffer.isBuffer(chunk) ? chunk.toString(stryMutAct_9fa48("152174") ? "" : (stryCov_9fa48("152174"), 'utf8')) : String(chunk));
        if (stryMutAct_9fa48("152177") ? typeof cb !== 'function' : stryMutAct_9fa48("152176") ? false : stryMutAct_9fa48("152175") ? true : (stryCov_9fa48("152175", "152176", "152177"), typeof cb === (stryMutAct_9fa48("152178") ? "" : (stryCov_9fa48("152178"), 'function')))) cb();
        return stryMutAct_9fa48("152179") ? false : (stryCov_9fa48("152179"), true);
      }
    };
    process.stderr.write = (chunk, encoding, cb) => {
      if (stryMutAct_9fa48("152180")) {
        {}
      } else {
        stryCov_9fa48("152180");
        stryMutAct_9fa48("152181") ? stderr -= Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk) : (stryCov_9fa48("152181"), stderr += Buffer.isBuffer(chunk) ? chunk.toString(stryMutAct_9fa48("152182") ? "" : (stryCov_9fa48("152182"), 'utf8')) : String(chunk));
        if (stryMutAct_9fa48("152185") ? typeof cb !== 'function' : stryMutAct_9fa48("152184") ? false : stryMutAct_9fa48("152183") ? true : (stryCov_9fa48("152183", "152184", "152185"), typeof cb === (stryMutAct_9fa48("152186") ? "" : (stryCov_9fa48("152186"), 'function')))) cb();
        return stryMutAct_9fa48("152187") ? false : (stryCov_9fa48("152187"), true);
      }
    };
    console.log = (...args) => {
      if (stryMutAct_9fa48("152188")) {
        {}
      } else {
        stryCov_9fa48("152188");
        stdout += stryMutAct_9fa48("152189") ? `` : (stryCov_9fa48("152189"), `${args.join(stryMutAct_9fa48("152190") ? "" : (stryCov_9fa48("152190"), ' '))}\n`);
      }
    };
    console.error = (...args) => {
      if (stryMutAct_9fa48("152191")) {
        {}
      } else {
        stryCov_9fa48("152191");
        stderr += stryMutAct_9fa48("152192") ? `` : (stryCov_9fa48("152192"), `${args.join(stryMutAct_9fa48("152193") ? "" : (stryCov_9fa48("152193"), ' '))}\n`);
      }
    };
    process.exit = (code = 0) => {
      if (stryMutAct_9fa48("152194")) {
        {}
      } else {
        stryCov_9fa48("152194");
        throw new ExitError(code);
      }
    };
    return stryMutAct_9fa48("152195") ? {} : (stryCov_9fa48("152195"), {
      get: stryMutAct_9fa48("152196") ? () => undefined : (stryCov_9fa48("152196"), () => stryMutAct_9fa48("152197") ? {} : (stryCov_9fa48("152197"), {
        stdout,
        stderr
      })),
      restore: () => {
        if (stryMutAct_9fa48("152198")) {
          {}
        } else {
          stryCov_9fa48("152198");
          process.stdout.write = originalStdoutWrite;
          process.stderr.write = originalStderrWrite;
          console.log = originalConsoleLog;
          console.error = originalConsoleError;
          process.exit = originalExit;
        }
      }
    });
  }
}
async function run() {
  if (stryMutAct_9fa48("152199")) {
    {}
  } else {
    stryCov_9fa48("152199");
    const {
      args = stryMutAct_9fa48("152200") ? ["Stryker was here"] : (stryCov_9fa48("152200"), []),
      env = {}
    } = stryMutAct_9fa48("152203") ? workerData && {} : stryMutAct_9fa48("152202") ? false : stryMutAct_9fa48("152201") ? true : (stryCov_9fa48("152201", "152202", "152203"), workerData || {});
    const originalEnv = {};
    for (const [k, v] of Object.entries(env)) {
      if (stryMutAct_9fa48("152204")) {
        {}
      } else {
        stryCov_9fa48("152204");
        originalEnv[k] = process.env[k];
        process.env[k] = v;
      }
    }
    const cap = captureOutput();
    let exitCode = 0;
    try {
      if (stryMutAct_9fa48("152205")) {
        {}
      } else {
        stryCov_9fa48("152205");
        const cli = new AdminCLI();
        await cli.start(args);
      }
    } catch (err) {
      if (stryMutAct_9fa48("152206")) {
        {}
      } else {
        stryCov_9fa48("152206");
        if (stryMutAct_9fa48("152208") ? false : stryMutAct_9fa48("152207") ? true : (stryCov_9fa48("152207", "152208"), err instanceof ExitError)) {
          if (stryMutAct_9fa48("152209")) {
            {}
          } else {
            stryCov_9fa48("152209");
            exitCode = stryMutAct_9fa48("152210") ? err.code && 0 : (stryCov_9fa48("152210"), err.code ?? 0);
          }
        } else {
          if (stryMutAct_9fa48("152211")) {
            {}
          } else {
            stryCov_9fa48("152211");
            throw err;
          }
        }
      }
    } finally {
      if (stryMutAct_9fa48("152212")) {
        {}
      } else {
        stryCov_9fa48("152212");
        const {
          stdout,
          stderr
        } = cap.get();
        cap.restore();
        for (const [k] of Object.entries(env)) {
          if (stryMutAct_9fa48("152213")) {
            {}
          } else {
            stryCov_9fa48("152213");
            if (stryMutAct_9fa48("152216") ? originalEnv[k] !== undefined : stryMutAct_9fa48("152215") ? false : stryMutAct_9fa48("152214") ? true : (stryCov_9fa48("152214", "152215", "152216"), originalEnv[k] === undefined)) {
              if (stryMutAct_9fa48("152217")) {
                {}
              } else {
                stryCov_9fa48("152217");
                delete process.env[k];
              }
            } else {
              if (stryMutAct_9fa48("152218")) {
                {}
              } else {
                stryCov_9fa48("152218");
                process.env[k] = originalEnv[k];
              }
            }
          }
        }
        parentPort.postMessage(stryMutAct_9fa48("152219") ? {} : (stryCov_9fa48("152219"), {
          stdout,
          stderr,
          exitCode
        }));
      }
    }
  }
}
run().catch(err => {
  if (stryMutAct_9fa48("152220")) {
    {}
  } else {
    stryCov_9fa48("152220");
    parentPort.postMessage(stryMutAct_9fa48("152221") ? {} : (stryCov_9fa48("152221"), {
      stdout: stryMutAct_9fa48("152222") ? "Stryker was here!" : (stryCov_9fa48("152222"), ''),
      stderr: stryMutAct_9fa48("152225") ? err?.stack && String(err) : stryMutAct_9fa48("152224") ? false : stryMutAct_9fa48("152223") ? true : (stryCov_9fa48("152223", "152224", "152225"), (stryMutAct_9fa48("152226") ? err.stack : (stryCov_9fa48("152226"), err?.stack)) || String(err)),
      exitCode: 1,
      error: stryMutAct_9fa48("152227") ? false : (stryCov_9fa48("152227"), true)
    }));
  }
});