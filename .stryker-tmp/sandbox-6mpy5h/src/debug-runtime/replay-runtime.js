/**
 * Replay runtime for deterministic snapshot debugging.
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
import { NUM, TYPEOF } from '../constants/index.js';
import { deserializeSnapshotEnvelope } from './snapshot-recorder.js';
import { REPLAY_RUNTIME_DEFAULT as DEF, REPLAY_DRIFT_REASON as DRIFT, REPLAY_RUNTIME_ERROR_MSG as ERR } from './replay-runtime-constants.js';

/**
 * Replay runtime that serves state from captured snapshot artifacts.
 */
class ReplayRuntime {
  /**
   * @param {Object} [options]
   * @param {Function} [options.now] - Timestamp provider.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("77678")) {
      {}
    } else {
      stryCov_9fa48("77678");
      this.now = stryMutAct_9fa48("77681") ? options.now && (() => Date.now()) : stryMutAct_9fa48("77680") ? false : stryMutAct_9fa48("77679") ? true : (stryCov_9fa48("77679", "77680", "77681"), options.now || (stryMutAct_9fa48("77682") ? () => undefined : (stryCov_9fa48("77682"), () => Date.now())));
      this.loaded = stryMutAct_9fa48("77683") ? true : (stryCov_9fa48("77683"), false);
      this.instanceHandle = null;
      this.manifest = null;
      this.snapshot = null;
      this.frameCursor = DEF.INITIAL_FRAME_CURSOR;
      this.hostCallCursor = DEF.INITIAL_HOST_CALL_CURSOR;
      this.consumedHostCalls = stryMutAct_9fa48("77684") ? ["Stryker was here"] : (stryCov_9fa48("77684"), []);
      this.driftDiagnostics = stryMutAct_9fa48("77685") ? ["Stryker was here"] : (stryCov_9fa48("77685"), []);
    }
  }

  /**
   * Load replay state from snapshot+manifest objects.
   *
   * @param {Object} request
   * @param {Object} request.manifest
   * @param {Object} request.snapshot
   * @return {{instanceHandle: Object, frameCount: number, hostCallCount: number}}
   */
  loadSnapshot(request) {
    if (stryMutAct_9fa48("77686")) {
      {}
    } else {
      stryCov_9fa48("77686");
      assertRequest(request);
      if (stryMutAct_9fa48("77689") ? !request.manifest && typeof request.manifest !== TYPEOF.OBJECT : stryMutAct_9fa48("77688") ? false : stryMutAct_9fa48("77687") ? true : (stryCov_9fa48("77687", "77688", "77689"), (stryMutAct_9fa48("77690") ? request.manifest : (stryCov_9fa48("77690"), !request.manifest)) || (stryMutAct_9fa48("77692") ? typeof request.manifest === TYPEOF.OBJECT : stryMutAct_9fa48("77691") ? false : (stryCov_9fa48("77691", "77692"), typeof request.manifest !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("77693")) {
          {}
        } else {
          stryCov_9fa48("77693");
          throw new Error(ERR.MANIFEST_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("77696") ? !request.snapshot && typeof request.snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("77695") ? false : stryMutAct_9fa48("77694") ? true : (stryCov_9fa48("77694", "77695", "77696"), (stryMutAct_9fa48("77697") ? request.snapshot : (stryCov_9fa48("77697"), !request.snapshot)) || (stryMutAct_9fa48("77699") ? typeof request.snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("77698") ? false : (stryCov_9fa48("77698", "77699"), typeof request.snapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("77700")) {
          {}
        } else {
          stryCov_9fa48("77700");
          throw new Error(ERR.SNAPSHOT_REQUIRED);
        }
      }
      this.manifest = deepClone(request.manifest);
      this.snapshot = normalizeSnapshot(request.snapshot);
      this.loaded = stryMutAct_9fa48("77701") ? false : (stryCov_9fa48("77701"), true);
      this.frameCursor = DEF.INITIAL_FRAME_CURSOR;
      this.hostCallCursor = DEF.INITIAL_HOST_CALL_CURSOR;
      this.consumedHostCalls = stryMutAct_9fa48("77702") ? ["Stryker was here"] : (stryCov_9fa48("77702"), []);
      this.driftDiagnostics = stryMutAct_9fa48("77703") ? ["Stryker was here"] : (stryCov_9fa48("77703"), []);
      this.instanceHandle = stryMutAct_9fa48("77704") ? {} : (stryCov_9fa48("77704"), {
        instanceId: stryMutAct_9fa48("77705") ? `` : (stryCov_9fa48("77705"), `${DEF.INSTANCE_ID_PREFIX}${this.now()}`),
        moduleRef: this.snapshot.moduleRef
      });
      return stryMutAct_9fa48("77706") ? {} : (stryCov_9fa48("77706"), {
        instanceHandle: this.instanceHandle,
        frameCount: this.snapshot.inputFrames.length,
        hostCallCount: this.snapshot.hostCallLedger.length
      });
    }
  }

  /**
   * Load replay state from serialized envelope bytes.
   *
   * @param {Object} request
   * @param {Buffer|Uint8Array} request.envelope
   * @return {{instanceHandle: Object, frameCount: number, hostCallCount: number}}
   */
  loadEnvelope(request) {
    if (stryMutAct_9fa48("77707")) {
      {}
    } else {
      stryCov_9fa48("77707");
      assertRequest(request);
      const {
        manifest,
        snapshot
      } = deserializeSnapshotEnvelope(request.envelope);
      return this.loadSnapshot(stryMutAct_9fa48("77708") ? {} : (stryCov_9fa48("77708"), {
        manifest,
        snapshot
      }));
    }
  }

  /**
   * Return runtime adapter interface for DAP managers.
   *
   * @return {{resume: Function, inspect: Function, suspend: Function}}
   */
  createRuntimeAdapter() {
    if (stryMutAct_9fa48("77709")) {
      {}
    } else {
      stryCov_9fa48("77709");
      return stryMutAct_9fa48("77710") ? {} : (stryCov_9fa48("77710"), {
        resume: stryMutAct_9fa48("77711") ? () => undefined : (stryCov_9fa48("77711"), async request => this.resume(request)),
        inspect: stryMutAct_9fa48("77712") ? () => undefined : (stryCov_9fa48("77712"), async request => this.inspect(request)),
        suspend: stryMutAct_9fa48("77713") ? () => undefined : (stryCov_9fa48("77713"), async request => this.suspend(request))
      });
    }
  }

  /**
   * Advance replay cursor.
   *
   * @param {Object} request
   * @param {Object} request.instanceHandle
   * @return {Promise<{status: string, instanceHandle: Object}>}
   */
  async resume(request) {
    if (stryMutAct_9fa48("77714")) {
      {}
    } else {
      stryCov_9fa48("77714");
      this._assertLoadedWithInstance(request);
      if (stryMutAct_9fa48("77718") ? this.frameCursor >= this.snapshot.inputFrames.length - 1 : stryMutAct_9fa48("77717") ? this.frameCursor <= this.snapshot.inputFrames.length - 1 : stryMutAct_9fa48("77716") ? false : stryMutAct_9fa48("77715") ? true : (stryCov_9fa48("77715", "77716", "77717", "77718"), this.frameCursor < (stryMutAct_9fa48("77719") ? this.snapshot.inputFrames.length + 1 : (stryCov_9fa48("77719"), this.snapshot.inputFrames.length - 1)))) {
        if (stryMutAct_9fa48("77720")) {
          {}
        } else {
          stryCov_9fa48("77720");
          stryMutAct_9fa48("77721") ? this.frameCursor -= 1 : (stryCov_9fa48("77721"), this.frameCursor += 1);
        }
      }
      return stryMutAct_9fa48("77722") ? {} : (stryCov_9fa48("77722"), {
        status: stryMutAct_9fa48("77723") ? "" : (stryCov_9fa48("77723"), 'running'),
        instanceHandle: request.instanceHandle
      });
    }
  }

  /**
   * Pause replay runtime.
   *
   * @param {Object} request
   * @param {Object} request.instanceHandle
   * @return {Promise<{status: string, instanceHandle: Object}>}
   */
  async suspend(request) {
    if (stryMutAct_9fa48("77724")) {
      {}
    } else {
      stryCov_9fa48("77724");
      this._assertLoadedWithInstance(request);
      return stryMutAct_9fa48("77725") ? {} : (stryCov_9fa48("77725"), {
        status: stryMutAct_9fa48("77726") ? "" : (stryCov_9fa48("77726"), 'paused'),
        instanceHandle: request.instanceHandle
      });
    }
  }

  /**
   * Inspect replay runtime state.
   *
   * @param {Object} request
   * @param {Object} request.instanceHandle
   * @return {Promise<Object>}
   */
  async inspect(request) {
    if (stryMutAct_9fa48("77727")) {
      {}
    } else {
      stryCov_9fa48("77727");
      this._assertLoadedWithInstance(request);
      const frame = this._currentFrame();
      const memoryBoundary = this._currentMemoryBoundary();
      const memory = memoryBoundary ? Buffer.from(memoryBoundary.bytesBase64, stryMutAct_9fa48("77728") ? "" : (stryCov_9fa48("77728"), 'base64')) : Buffer.alloc(NUM.ZERO);
      return stryMutAct_9fa48("77729") ? {} : (stryCov_9fa48("77729"), {
        state: stryMutAct_9fa48("77730") ? "" : (stryCov_9fa48("77730"), 'paused'),
        codeOffset: stryMutAct_9fa48("77733") ? frame?.codeOffset && NUM.ZERO : stryMutAct_9fa48("77732") ? false : stryMutAct_9fa48("77731") ? true : (stryCov_9fa48("77731", "77732", "77733"), (stryMutAct_9fa48("77734") ? frame.codeOffset : (stryCov_9fa48("77734"), frame?.codeOffset)) || NUM.ZERO),
        stackFrames: stryMutAct_9fa48("77735") ? [] : (stryCov_9fa48("77735"), [stryMutAct_9fa48("77736") ? {} : (stryCov_9fa48("77736"), {
          frameId: NUM.ZERO,
          codeOffset: stryMutAct_9fa48("77739") ? frame?.codeOffset && NUM.ZERO : stryMutAct_9fa48("77738") ? false : stryMutAct_9fa48("77737") ? true : (stryCov_9fa48("77737", "77738", "77739"), (stryMutAct_9fa48("77740") ? frame.codeOffset : (stryCov_9fa48("77740"), frame?.codeOffset)) || NUM.ZERO)
        })]),
        localsByFrame: stryMutAct_9fa48("77741") ? {} : (stryCov_9fa48("77741"), {
          0: Array.isArray(stryMutAct_9fa48("77742") ? frame.locals : (stryCov_9fa48("77742"), frame?.locals)) ? frame.locals : stryMutAct_9fa48("77743") ? ["Stryker was here"] : (stryCov_9fa48("77743"), [])
        }),
        memory,
        replayCursor: this.frameCursor,
        consumedHostCallCount: this.hostCallCursor
      });
    }
  }

  /**
   * Replay one host call from captured ledger.
   *
   * @param {Object} request
   * @param {string} request.namespace
   * @param {string} request.functionName
   * @param {*} [request.args]
   * @return {{ok: boolean, result?: *, error?: string}}
   */
  replayHostCall(request) {
    if (stryMutAct_9fa48("77744")) {
      {}
    } else {
      stryCov_9fa48("77744");
      assertRequest(request);
      if (stryMutAct_9fa48("77747") ? !isNonEmptyString(request.namespace) && !isNonEmptyString(request.functionName) : stryMutAct_9fa48("77746") ? false : stryMutAct_9fa48("77745") ? true : (stryCov_9fa48("77745", "77746", "77747"), (stryMutAct_9fa48("77748") ? isNonEmptyString(request.namespace) : (stryCov_9fa48("77748"), !isNonEmptyString(request.namespace))) || (stryMutAct_9fa48("77749") ? isNonEmptyString(request.functionName) : (stryCov_9fa48("77749"), !isNonEmptyString(request.functionName))))) {
        if (stryMutAct_9fa48("77750")) {
          {}
        } else {
          stryCov_9fa48("77750");
          throw new Error(ERR.HOST_CALL_REQUIRED);
        }
      }
      this._assertLoaded();
      const expected = stryMutAct_9fa48("77753") ? this.snapshot.hostCallLedger[this.hostCallCursor] && null : stryMutAct_9fa48("77752") ? false : stryMutAct_9fa48("77751") ? true : (stryCov_9fa48("77751", "77752", "77753"), this.snapshot.hostCallLedger[this.hostCallCursor] || null);
      if (stryMutAct_9fa48("77756") ? false : stryMutAct_9fa48("77755") ? true : stryMutAct_9fa48("77754") ? expected : (stryCov_9fa48("77754", "77755", "77756"), !expected)) {
        if (stryMutAct_9fa48("77757")) {
          {}
        } else {
          stryCov_9fa48("77757");
          const diagnostic = stryMutAct_9fa48("77758") ? {} : (stryCov_9fa48("77758"), {
            reason: DRIFT.LEDGER_EXHAUSTED,
            actual: stryMutAct_9fa48("77759") ? {} : (stryCov_9fa48("77759"), {
              namespace: request.namespace,
              functionName: request.functionName,
              args: request.args
            })
          });
          this.driftDiagnostics.push(diagnostic);
          return stryMutAct_9fa48("77760") ? {} : (stryCov_9fa48("77760"), {
            ok: stryMutAct_9fa48("77761") ? true : (stryCov_9fa48("77761"), false),
            error: DRIFT.LEDGER_EXHAUSTED
          });
        }
      }
      if (stryMutAct_9fa48("77764") ? expected.namespace !== request.namespace && expected.functionName !== request.functionName : stryMutAct_9fa48("77763") ? false : stryMutAct_9fa48("77762") ? true : (stryCov_9fa48("77762", "77763", "77764"), (stryMutAct_9fa48("77766") ? expected.namespace === request.namespace : stryMutAct_9fa48("77765") ? false : (stryCov_9fa48("77765", "77766"), expected.namespace !== request.namespace)) || (stryMutAct_9fa48("77768") ? expected.functionName === request.functionName : stryMutAct_9fa48("77767") ? false : (stryCov_9fa48("77767", "77768"), expected.functionName !== request.functionName)))) {
        if (stryMutAct_9fa48("77769")) {
          {}
        } else {
          stryCov_9fa48("77769");
          this.driftDiagnostics.push(stryMutAct_9fa48("77770") ? {} : (stryCov_9fa48("77770"), {
            reason: DRIFT.HOST_CALL_MISMATCH,
            expected: stryMutAct_9fa48("77771") ? {} : (stryCov_9fa48("77771"), {
              namespace: expected.namespace,
              functionName: expected.functionName
            }),
            actual: stryMutAct_9fa48("77772") ? {} : (stryCov_9fa48("77772"), {
              namespace: request.namespace,
              functionName: request.functionName
            })
          }));
          return stryMutAct_9fa48("77773") ? {} : (stryCov_9fa48("77773"), {
            ok: stryMutAct_9fa48("77774") ? true : (stryCov_9fa48("77774"), false),
            error: DRIFT.HOST_CALL_MISMATCH
          });
        }
      }
      if (stryMutAct_9fa48("77777") ? false : stryMutAct_9fa48("77776") ? true : stryMutAct_9fa48("77775") ? deepEqualJson(expected.args, request.args) : (stryCov_9fa48("77775", "77776", "77777"), !deepEqualJson(expected.args, request.args))) {
        if (stryMutAct_9fa48("77778")) {
          {}
        } else {
          stryCov_9fa48("77778");
          this.driftDiagnostics.push(stryMutAct_9fa48("77779") ? {} : (stryCov_9fa48("77779"), {
            reason: DRIFT.HOST_CALL_ARGS_MISMATCH,
            expectedArgs: expected.args,
            actualArgs: request.args
          }));
          return stryMutAct_9fa48("77780") ? {} : (stryCov_9fa48("77780"), {
            ok: stryMutAct_9fa48("77781") ? true : (stryCov_9fa48("77781"), false),
            error: DRIFT.HOST_CALL_ARGS_MISMATCH
          });
        }
      }
      stryMutAct_9fa48("77782") ? this.hostCallCursor -= 1 : (stryCov_9fa48("77782"), this.hostCallCursor += 1);
      this.consumedHostCalls.push(stryMutAct_9fa48("77783") ? {} : (stryCov_9fa48("77783"), {
        namespace: request.namespace,
        functionName: request.functionName,
        args: request.args
      }));
      if (stryMutAct_9fa48("77785") ? false : stryMutAct_9fa48("77784") ? true : (stryCov_9fa48("77784", "77785"), expected.error)) {
        if (stryMutAct_9fa48("77786")) {
          {}
        } else {
          stryCov_9fa48("77786");
          return stryMutAct_9fa48("77787") ? {} : (stryCov_9fa48("77787"), {
            ok: stryMutAct_9fa48("77788") ? true : (stryCov_9fa48("77788"), false),
            error: expected.error
          });
        }
      }
      return stryMutAct_9fa48("77789") ? {} : (stryCov_9fa48("77789"), {
        ok: stryMutAct_9fa48("77790") ? false : (stryCov_9fa48("77790"), true),
        result: expected.result
      });
    }
  }

  /**
   * Verify deterministic replay status and drift diagnostics.
   *
   * @return {Object}
   */
  verifyDeterminism() {
    if (stryMutAct_9fa48("77791")) {
      {}
    } else {
      stryCov_9fa48("77791");
      this._assertLoaded();
      const diagnostics = stryMutAct_9fa48("77792") ? [] : (stryCov_9fa48("77792"), [...this.driftDiagnostics]);
      if (stryMutAct_9fa48("77796") ? this.hostCallCursor >= this.snapshot.hostCallLedger.length : stryMutAct_9fa48("77795") ? this.hostCallCursor <= this.snapshot.hostCallLedger.length : stryMutAct_9fa48("77794") ? false : stryMutAct_9fa48("77793") ? true : (stryCov_9fa48("77793", "77794", "77795", "77796"), this.hostCallCursor < this.snapshot.hostCallLedger.length)) {
        if (stryMutAct_9fa48("77797")) {
          {}
        } else {
          stryCov_9fa48("77797");
          diagnostics.push(stryMutAct_9fa48("77798") ? {} : (stryCov_9fa48("77798"), {
            reason: DRIFT.UNCONSUMED_LEDGER_ENTRIES,
            remaining: stryMutAct_9fa48("77799") ? this.snapshot.hostCallLedger.length + this.hostCallCursor : (stryCov_9fa48("77799"), this.snapshot.hostCallLedger.length - this.hostCallCursor)
          }));
        }
      }
      return stryMutAct_9fa48("77800") ? {} : (stryCov_9fa48("77800"), {
        deterministic: stryMutAct_9fa48("77803") ? diagnostics.length !== NUM.ZERO : stryMutAct_9fa48("77802") ? false : stryMutAct_9fa48("77801") ? true : (stryCov_9fa48("77801", "77802", "77803"), diagnostics.length === NUM.ZERO),
        expectedHostCallCount: this.snapshot.hostCallLedger.length,
        consumedHostCallCount: this.hostCallCursor,
        driftDiagnostics: diagnostics
      });
    }
  }

  /**
   * @return {Object}
   */
  getReplayState() {
    if (stryMutAct_9fa48("77804")) {
      {}
    } else {
      stryCov_9fa48("77804");
      this._assertLoaded();
      return stryMutAct_9fa48("77805") ? {} : (stryCov_9fa48("77805"), {
        instanceHandle: this.instanceHandle,
        frameCursor: this.frameCursor,
        hostCallCursor: this.hostCallCursor,
        frameCount: this.snapshot.inputFrames.length,
        hostCallCount: this.snapshot.hostCallLedger.length
      });
    }
  }

  /**
   * @return {Object|null}
   * @private
   */
  _currentFrame() {
    if (stryMutAct_9fa48("77806")) {
      {}
    } else {
      stryCov_9fa48("77806");
      if (stryMutAct_9fa48("77809") ? this.snapshot.inputFrames.length !== NUM.ZERO : stryMutAct_9fa48("77808") ? false : stryMutAct_9fa48("77807") ? true : (stryCov_9fa48("77807", "77808", "77809"), this.snapshot.inputFrames.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("77810")) {
          {}
        } else {
          stryCov_9fa48("77810");
          return null;
        }
      }
      return stryMutAct_9fa48("77813") ? this.snapshot.inputFrames[this.frameCursor] && null : stryMutAct_9fa48("77812") ? false : stryMutAct_9fa48("77811") ? true : (stryCov_9fa48("77811", "77812", "77813"), this.snapshot.inputFrames[this.frameCursor] || null);
    }
  }

  /**
   * @return {Object|null}
   * @private
   */
  _currentMemoryBoundary() {
    if (stryMutAct_9fa48("77814")) {
      {}
    } else {
      stryCov_9fa48("77814");
      if (stryMutAct_9fa48("77817") ? this.snapshot.memoryBoundaries.length !== NUM.ZERO : stryMutAct_9fa48("77816") ? false : stryMutAct_9fa48("77815") ? true : (stryCov_9fa48("77815", "77816", "77817"), this.snapshot.memoryBoundaries.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("77818")) {
          {}
        } else {
          stryCov_9fa48("77818");
          return null;
        }
      }
      const index = stryMutAct_9fa48("77819") ? Math.max(this.frameCursor, this.snapshot.memoryBoundaries.length - 1) : (stryCov_9fa48("77819"), Math.min(this.frameCursor, stryMutAct_9fa48("77820") ? this.snapshot.memoryBoundaries.length + 1 : (stryCov_9fa48("77820"), this.snapshot.memoryBoundaries.length - 1)));
      return stryMutAct_9fa48("77823") ? this.snapshot.memoryBoundaries[index] && null : stryMutAct_9fa48("77822") ? false : stryMutAct_9fa48("77821") ? true : (stryCov_9fa48("77821", "77822", "77823"), this.snapshot.memoryBoundaries[index] || null);
    }
  }

  /**
   * @private
   */
  _assertLoaded() {
    if (stryMutAct_9fa48("77824")) {
      {}
    } else {
      stryCov_9fa48("77824");
      if (stryMutAct_9fa48("77827") ? (!this.loaded || !this.snapshot) && !this.instanceHandle : stryMutAct_9fa48("77826") ? false : stryMutAct_9fa48("77825") ? true : (stryCov_9fa48("77825", "77826", "77827"), (stryMutAct_9fa48("77829") ? !this.loaded && !this.snapshot : stryMutAct_9fa48("77828") ? false : (stryCov_9fa48("77828", "77829"), (stryMutAct_9fa48("77830") ? this.loaded : (stryCov_9fa48("77830"), !this.loaded)) || (stryMutAct_9fa48("77831") ? this.snapshot : (stryCov_9fa48("77831"), !this.snapshot)))) || (stryMutAct_9fa48("77832") ? this.instanceHandle : (stryCov_9fa48("77832"), !this.instanceHandle)))) {
        if (stryMutAct_9fa48("77833")) {
          {}
        } else {
          stryCov_9fa48("77833");
          throw new Error(ERR.INSTANCE_NOT_READY);
        }
      }
    }
  }

  /**
   * @param {Object} request
   * @private
   */
  _assertLoadedWithInstance(request) {
    if (stryMutAct_9fa48("77834")) {
      {}
    } else {
      stryCov_9fa48("77834");
      this._assertLoaded();
      if (stryMutAct_9fa48("77837") ? (!request || typeof request !== TYPEOF.OBJECT || !request.instanceHandle) && typeof request.instanceHandle !== TYPEOF.OBJECT : stryMutAct_9fa48("77836") ? false : stryMutAct_9fa48("77835") ? true : (stryCov_9fa48("77835", "77836", "77837"), (stryMutAct_9fa48("77839") ? (!request || typeof request !== TYPEOF.OBJECT) && !request.instanceHandle : stryMutAct_9fa48("77838") ? false : (stryCov_9fa48("77838", "77839"), (stryMutAct_9fa48("77841") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("77840") ? false : (stryCov_9fa48("77840", "77841"), (stryMutAct_9fa48("77842") ? request : (stryCov_9fa48("77842"), !request)) || (stryMutAct_9fa48("77844") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("77843") ? false : (stryCov_9fa48("77843", "77844"), typeof request !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("77845") ? request.instanceHandle : (stryCov_9fa48("77845"), !request.instanceHandle)))) || (stryMutAct_9fa48("77847") ? typeof request.instanceHandle === TYPEOF.OBJECT : stryMutAct_9fa48("77846") ? false : (stryCov_9fa48("77846", "77847"), typeof request.instanceHandle !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("77848")) {
          {}
        } else {
          stryCov_9fa48("77848");
          throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
        }
      }
    }
  }
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function normalizeSnapshot(snapshot) {
  if (stryMutAct_9fa48("77849")) {
    {}
  } else {
    stryCov_9fa48("77849");
    return stryMutAct_9fa48("77850") ? {} : (stryCov_9fa48("77850"), {
      snapshotId: stryMutAct_9fa48("77853") ? snapshot.snapshotId && null : stryMutAct_9fa48("77852") ? false : stryMutAct_9fa48("77851") ? true : (stryCov_9fa48("77851", "77852", "77853"), snapshot.snapshotId || null),
      sessionId: stryMutAct_9fa48("77856") ? snapshot.sessionId && null : stryMutAct_9fa48("77855") ? false : stryMutAct_9fa48("77854") ? true : (stryCov_9fa48("77854", "77855", "77856"), snapshot.sessionId || null),
      moduleRef: stryMutAct_9fa48("77859") ? snapshot.moduleRef && null : stryMutAct_9fa48("77858") ? false : stryMutAct_9fa48("77857") ? true : (stryCov_9fa48("77857", "77858", "77859"), snapshot.moduleRef || null),
      moduleDigest: stryMutAct_9fa48("77862") ? snapshot.moduleDigest && null : stryMutAct_9fa48("77861") ? false : stryMutAct_9fa48("77860") ? true : (stryCov_9fa48("77860", "77861", "77862"), snapshot.moduleDigest || null),
      inputFrames: Array.isArray(snapshot.inputFrames) ? deepClone(snapshot.inputFrames) : stryMutAct_9fa48("77863") ? ["Stryker was here"] : (stryCov_9fa48("77863"), []),
      hostCallLedger: Array.isArray(snapshot.hostCallLedger) ? deepClone(snapshot.hostCallLedger) : stryMutAct_9fa48("77864") ? ["Stryker was here"] : (stryCov_9fa48("77864"), []),
      memoryBoundaries: Array.isArray(snapshot.memoryBoundaries) ? deepClone(snapshot.memoryBoundaries) : stryMutAct_9fa48("77865") ? ["Stryker was here"] : (stryCov_9fa48("77865"), [])
    });
  }
}

/**
 * @param {Object} request
 */
function assertRequest(request) {
  if (stryMutAct_9fa48("77866")) {
    {}
  } else {
    stryCov_9fa48("77866");
    if (stryMutAct_9fa48("77869") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("77868") ? false : stryMutAct_9fa48("77867") ? true : (stryCov_9fa48("77867", "77868", "77869"), (stryMutAct_9fa48("77870") ? request : (stryCov_9fa48("77870"), !request)) || (stryMutAct_9fa48("77872") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("77871") ? false : (stryCov_9fa48("77871", "77872"), typeof request !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("77873")) {
        {}
      } else {
        stryCov_9fa48("77873");
        throw new Error(ERR.REQUEST_REQUIRED);
      }
    }
  }
}

/**
 * @param {*} left
 * @param {*} right
 * @return {boolean}
 */
function deepEqualJson(left, right) {
  if (stryMutAct_9fa48("77874")) {
    {}
  } else {
    stryCov_9fa48("77874");
    return stryMutAct_9fa48("77877") ? JSON.stringify(left) !== JSON.stringify(right) : stryMutAct_9fa48("77876") ? false : stryMutAct_9fa48("77875") ? true : (stryCov_9fa48("77875", "77876", "77877"), JSON.stringify(left) === JSON.stringify(right));
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  if (stryMutAct_9fa48("77878")) {
    {}
  } else {
    stryCov_9fa48("77878");
    return stryMutAct_9fa48("77881") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("77880") ? false : stryMutAct_9fa48("77879") ? true : (stryCov_9fa48("77879", "77880", "77881"), (stryMutAct_9fa48("77883") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("77882") ? true : (stryCov_9fa48("77882", "77883"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("77886") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("77885") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("77884") ? true : (stryCov_9fa48("77884", "77885", "77886"), (stryMutAct_9fa48("77887") ? value.length : (stryCov_9fa48("77887"), value.trim().length)) > NUM.ZERO)));
  }
}

/**
 * @param {*} value
 * @return {*}
 */
function deepClone(value) {
  if (stryMutAct_9fa48("77888")) {
    {}
  } else {
    stryCov_9fa48("77888");
    return JSON.parse(JSON.stringify(value));
  }
}
export { ReplayRuntime };