/**
 * Worker helper to run an ESM entrypoint with controlled argv and captured output.
 *
 * Used by packaging tests to avoid `child_process.spawnSync()` (blocked in some
 * sandboxed CI environments). This is intentionally minimal and only supports
 * fast-exiting entrypoints (e.g. --help/--version).
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
import { pathToFileURL } from 'node:url';
import { ExitError } from './exit-error.js';
function captureOutput() {
  if (stryMutAct_9fa48("152228")) {
    {}
  } else {
    stryCov_9fa48("152228");
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalExit = process.exit;
    let stdout = stryMutAct_9fa48("152229") ? "Stryker was here!" : (stryCov_9fa48("152229"), '');
    let stderr = stryMutAct_9fa48("152230") ? "Stryker was here!" : (stryCov_9fa48("152230"), '');

    // Capture low-level writes (covers console.log in most cases too).
    process.stdout.write = (chunk, encoding, cb) => {
      if (stryMutAct_9fa48("152231")) {
        {}
      } else {
        stryCov_9fa48("152231");
        stryMutAct_9fa48("152232") ? stdout -= Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk) : (stryCov_9fa48("152232"), stdout += Buffer.isBuffer(chunk) ? chunk.toString(stryMutAct_9fa48("152233") ? "" : (stryCov_9fa48("152233"), 'utf8')) : String(chunk));
        if (stryMutAct_9fa48("152236") ? typeof cb !== 'function' : stryMutAct_9fa48("152235") ? false : stryMutAct_9fa48("152234") ? true : (stryCov_9fa48("152234", "152235", "152236"), typeof cb === (stryMutAct_9fa48("152237") ? "" : (stryCov_9fa48("152237"), 'function')))) cb();
        return stryMutAct_9fa48("152238") ? false : (stryCov_9fa48("152238"), true);
      }
    };
    process.stderr.write = (chunk, encoding, cb) => {
      if (stryMutAct_9fa48("152239")) {
        {}
      } else {
        stryCov_9fa48("152239");
        stryMutAct_9fa48("152240") ? stderr -= Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk) : (stryCov_9fa48("152240"), stderr += Buffer.isBuffer(chunk) ? chunk.toString(stryMutAct_9fa48("152241") ? "" : (stryCov_9fa48("152241"), 'utf8')) : String(chunk));
        if (stryMutAct_9fa48("152244") ? typeof cb !== 'function' : stryMutAct_9fa48("152243") ? false : stryMutAct_9fa48("152242") ? true : (stryCov_9fa48("152242", "152243", "152244"), typeof cb === (stryMutAct_9fa48("152245") ? "" : (stryCov_9fa48("152245"), 'function')))) cb();
        return stryMutAct_9fa48("152246") ? false : (stryCov_9fa48("152246"), true);
      }
    };

    // Ensure console.* also contributes even if stdout.write is patched differently.
    console.log = (...args) => {
      if (stryMutAct_9fa48("152247")) {
        {}
      } else {
        stryCov_9fa48("152247");
        stdout += stryMutAct_9fa48("152248") ? `` : (stryCov_9fa48("152248"), `${args.join(stryMutAct_9fa48("152249") ? "" : (stryCov_9fa48("152249"), ' '))}\n`);
      }
    };
    console.error = (...args) => {
      if (stryMutAct_9fa48("152250")) {
        {}
      } else {
        stryCov_9fa48("152250");
        stderr += stryMutAct_9fa48("152251") ? `` : (stryCov_9fa48("152251"), `${args.join(stryMutAct_9fa48("152252") ? "" : (stryCov_9fa48("152252"), ' '))}\n`);
      }
    };
    process.exit = (code = 0) => {
      if (stryMutAct_9fa48("152253")) {
        {}
      } else {
        stryCov_9fa48("152253");
        throw new ExitError(code);
      }
    };
    return stryMutAct_9fa48("152254") ? {} : (stryCov_9fa48("152254"), {
      getOutput: stryMutAct_9fa48("152255") ? () => undefined : (stryCov_9fa48("152255"), () => stryMutAct_9fa48("152256") ? {} : (stryCov_9fa48("152256"), {
        stdout,
        stderr
      })),
      restore: () => {
        if (stryMutAct_9fa48("152257")) {
          {}
        } else {
          stryCov_9fa48("152257");
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
  if (stryMutAct_9fa48("152258")) {
    {}
  } else {
    stryCov_9fa48("152258");
    const {
      entryPath,
      args = stryMutAct_9fa48("152259") ? ["Stryker was here"] : (stryCov_9fa48("152259"), []),
      env = {}
    } = stryMutAct_9fa48("152262") ? workerData && {} : stryMutAct_9fa48("152261") ? false : stryMutAct_9fa48("152260") ? true : (stryCov_9fa48("152260", "152261", "152262"), workerData || {});
    if (stryMutAct_9fa48("152265") ? false : stryMutAct_9fa48("152264") ? true : stryMutAct_9fa48("152263") ? entryPath : (stryCov_9fa48("152263", "152264", "152265"), !entryPath)) throw new Error(stryMutAct_9fa48("152266") ? "" : (stryCov_9fa48("152266"), 'workerData.entryPath is required'));

    // Some entrypoints call `process.exit()` in promise chains (e.g. `main().catch(...)`).
    // When we turn `process.exit()` into a thrown ExitError, that ExitError can become an
    // unhandled rejection. Swallow ExitError rejections/exceptions so the worker can
    // report the exit code instead of crashing.
    let trappedExitCode = null;
    const onUnhandledRejection = reason => {
      if (stryMutAct_9fa48("152267")) {
        {}
      } else {
        stryCov_9fa48("152267");
        if (stryMutAct_9fa48("152270") ? reason || reason.name === 'ExitError' : stryMutAct_9fa48("152269") ? false : stryMutAct_9fa48("152268") ? true : (stryCov_9fa48("152268", "152269", "152270"), reason && (stryMutAct_9fa48("152272") ? reason.name !== 'ExitError' : stryMutAct_9fa48("152271") ? true : (stryCov_9fa48("152271", "152272"), reason.name === (stryMutAct_9fa48("152273") ? "" : (stryCov_9fa48("152273"), 'ExitError')))))) {
          if (stryMutAct_9fa48("152274")) {
            {}
          } else {
            stryCov_9fa48("152274");
            if (stryMutAct_9fa48("152277") ? trappedExitCode !== null : stryMutAct_9fa48("152276") ? false : stryMutAct_9fa48("152275") ? true : (stryCov_9fa48("152275", "152276", "152277"), trappedExitCode === null)) trappedExitCode = stryMutAct_9fa48("152278") ? reason.code && 0 : (stryCov_9fa48("152278"), reason.code ?? 0);
          }
        }
      }
    };
    const onUncaughtException = err => {
      if (stryMutAct_9fa48("152279")) {
        {}
      } else {
        stryCov_9fa48("152279");
        if (stryMutAct_9fa48("152282") ? err || err.name === 'ExitError' : stryMutAct_9fa48("152281") ? false : stryMutAct_9fa48("152280") ? true : (stryCov_9fa48("152280", "152281", "152282"), err && (stryMutAct_9fa48("152284") ? err.name !== 'ExitError' : stryMutAct_9fa48("152283") ? true : (stryCov_9fa48("152283", "152284"), err.name === (stryMutAct_9fa48("152285") ? "" : (stryCov_9fa48("152285"), 'ExitError')))))) {
          if (stryMutAct_9fa48("152286")) {
            {}
          } else {
            stryCov_9fa48("152286");
            if (stryMutAct_9fa48("152289") ? trappedExitCode !== null : stryMutAct_9fa48("152288") ? false : stryMutAct_9fa48("152287") ? true : (stryCov_9fa48("152287", "152288", "152289"), trappedExitCode === null)) trappedExitCode = stryMutAct_9fa48("152290") ? err.code && 0 : (stryCov_9fa48("152290"), err.code ?? 0);
          }
        }
      }
    };
    process.on(stryMutAct_9fa48("152291") ? "" : (stryCov_9fa48("152291"), 'unhandledRejection'), onUnhandledRejection);
    process.on(stryMutAct_9fa48("152292") ? "" : (stryCov_9fa48("152292"), 'uncaughtException'), onUncaughtException);

    // Apply environment overrides for the duration of the run.
    const originalEnv = {};
    for (const [k, v] of Object.entries(env)) {
      if (stryMutAct_9fa48("152293")) {
        {}
      } else {
        stryCov_9fa48("152293");
        originalEnv[k] = process.env[k];
        process.env[k] = v;
      }
    }

    // Provide argv like a real CLI.
    process.argv = stryMutAct_9fa48("152294") ? [] : (stryCov_9fa48("152294"), [stryMutAct_9fa48("152295") ? "" : (stryCov_9fa48("152295"), 'node'), entryPath, ...args]);
    const cap = captureOutput();
    let exitCode = 0;
    try {
      if (stryMutAct_9fa48("152296")) {
        {}
      } else {
        stryCov_9fa48("152296");
        await import(pathToFileURL(entryPath).href);
        // Give any microtasks a chance to flush writes.
        await new Promise(stryMutAct_9fa48("152297") ? () => undefined : (stryCov_9fa48("152297"), r => setTimeout(r, 0)));
      }
    } catch (err) {
      if (stryMutAct_9fa48("152298")) {
        {}
      } else {
        stryCov_9fa48("152298");
        if (stryMutAct_9fa48("152301") ? err || err.name === 'ExitError' || err instanceof ExitError : stryMutAct_9fa48("152300") ? false : stryMutAct_9fa48("152299") ? true : (stryCov_9fa48("152299", "152300", "152301"), err && (stryMutAct_9fa48("152303") ? err.name === 'ExitError' && err instanceof ExitError : stryMutAct_9fa48("152302") ? true : (stryCov_9fa48("152302", "152303"), (stryMutAct_9fa48("152305") ? err.name !== 'ExitError' : stryMutAct_9fa48("152304") ? false : (stryCov_9fa48("152304", "152305"), err.name === (stryMutAct_9fa48("152306") ? "" : (stryCov_9fa48("152306"), 'ExitError')))) || err instanceof ExitError)))) {
          if (stryMutAct_9fa48("152307")) {
            {}
          } else {
            stryCov_9fa48("152307");
            exitCode = stryMutAct_9fa48("152308") ? err.code && 0 : (stryCov_9fa48("152308"), err.code ?? 0);
          }
        } else if (stryMutAct_9fa48("152311") ? err && err.code !== undefined || String(err.message || '').startsWith('process.exit(') : stryMutAct_9fa48("152310") ? false : stryMutAct_9fa48("152309") ? true : (stryCov_9fa48("152309", "152310", "152311"), (stryMutAct_9fa48("152313") ? err || err.code !== undefined : stryMutAct_9fa48("152312") ? true : (stryCov_9fa48("152312", "152313"), err && (stryMutAct_9fa48("152315") ? err.code === undefined : stryMutAct_9fa48("152314") ? true : (stryCov_9fa48("152314", "152315"), err.code !== undefined)))) && (stryMutAct_9fa48("152316") ? String(err.message || '').endsWith('process.exit(') : (stryCov_9fa48("152316"), String(stryMutAct_9fa48("152319") ? err.message && '' : stryMutAct_9fa48("152318") ? false : stryMutAct_9fa48("152317") ? true : (stryCov_9fa48("152317", "152318", "152319"), err.message || (stryMutAct_9fa48("152320") ? "Stryker was here!" : (stryCov_9fa48("152320"), '')))).startsWith(stryMutAct_9fa48("152321") ? "" : (stryCov_9fa48("152321"), 'process.exit(')))))) {
          if (stryMutAct_9fa48("152322")) {
            {}
          } else {
            stryCov_9fa48("152322");
            // Defensive: handle a serialized ExitError.
            exitCode = stryMutAct_9fa48("152323") ? err.code && 0 : (stryCov_9fa48("152323"), err.code ?? 0);
          }
        } else {
          if (stryMutAct_9fa48("152324")) {
            {}
          } else {
            stryCov_9fa48("152324");
            throw err;
          }
        }
      }
    } finally {
      if (stryMutAct_9fa48("152325")) {
        {}
      } else {
        stryCov_9fa48("152325");
        if (stryMutAct_9fa48("152328") ? trappedExitCode === null : stryMutAct_9fa48("152327") ? false : stryMutAct_9fa48("152326") ? true : (stryCov_9fa48("152326", "152327", "152328"), trappedExitCode !== null)) {
          if (stryMutAct_9fa48("152329")) {
            {}
          } else {
            stryCov_9fa48("152329");
            exitCode = trappedExitCode;
          }
        }
        const {
          stdout,
          stderr
        } = cap.getOutput();
        cap.restore();

        // Restore env.
        for (const [k] of Object.entries(env)) {
          if (stryMutAct_9fa48("152330")) {
            {}
          } else {
            stryCov_9fa48("152330");
            if (stryMutAct_9fa48("152333") ? originalEnv[k] !== undefined : stryMutAct_9fa48("152332") ? false : stryMutAct_9fa48("152331") ? true : (stryCov_9fa48("152331", "152332", "152333"), originalEnv[k] === undefined)) {
              if (stryMutAct_9fa48("152334")) {
                {}
              } else {
                stryCov_9fa48("152334");
                delete process.env[k];
              }
            } else {
              if (stryMutAct_9fa48("152335")) {
                {}
              } else {
                stryCov_9fa48("152335");
                process.env[k] = originalEnv[k];
              }
            }
          }
        }
        process.off(stryMutAct_9fa48("152336") ? "" : (stryCov_9fa48("152336"), 'unhandledRejection'), onUnhandledRejection);
        process.off(stryMutAct_9fa48("152337") ? "" : (stryCov_9fa48("152337"), 'uncaughtException'), onUncaughtException);
        parentPort.postMessage(stryMutAct_9fa48("152338") ? {} : (stryCov_9fa48("152338"), {
          stdout,
          stderr,
          exitCode
        }));
      }
    }
  }
}
run().catch(err => {
  if (stryMutAct_9fa48("152339")) {
    {}
  } else {
    stryCov_9fa48("152339");
    parentPort.postMessage(stryMutAct_9fa48("152340") ? {} : (stryCov_9fa48("152340"), {
      stdout: stryMutAct_9fa48("152341") ? "Stryker was here!" : (stryCov_9fa48("152341"), ''),
      stderr: stryMutAct_9fa48("152344") ? err?.stack && String(err) : stryMutAct_9fa48("152343") ? false : stryMutAct_9fa48("152342") ? true : (stryCov_9fa48("152342", "152343", "152344"), (stryMutAct_9fa48("152345") ? err.stack : (stryCov_9fa48("152345"), err?.stack)) || String(err)),
      exitCode: 1,
      error: stryMutAct_9fa48("152346") ? false : (stryCov_9fa48("152346"), true)
    }));
  }
});