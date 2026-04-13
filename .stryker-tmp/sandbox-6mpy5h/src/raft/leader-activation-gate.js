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
import { NUM } from '../constants/index.js';
const DEFAULT_LEADER_ACTIVATION_HOLDOFF_MS = 250;
function normalizeHoldoffMs(value) {
  if (stryMutAct_9fa48("127082")) {
    {}
  } else {
    stryCov_9fa48("127082");
    return (stryMutAct_9fa48("127085") ? Number.isFinite(value) || value >= NUM.ZERO : stryMutAct_9fa48("127084") ? false : stryMutAct_9fa48("127083") ? true : (stryCov_9fa48("127083", "127084", "127085"), Number.isFinite(value) && (stryMutAct_9fa48("127088") ? value < NUM.ZERO : stryMutAct_9fa48("127087") ? value > NUM.ZERO : stryMutAct_9fa48("127086") ? true : (stryCov_9fa48("127086", "127087", "127088"), value >= NUM.ZERO)))) ? Math.floor(value) : DEFAULT_LEADER_ACTIVATION_HOLDOFF_MS;
  }
}
class LeaderActivationGate {
  constructor(options = {}) {
    if (stryMutAct_9fa48("127089")) {
      {}
    } else {
      stryCov_9fa48("127089");
      this.holdoffMs = normalizeHoldoffMs(options.holdoffMs);
      this.activationScheduler = stryMutAct_9fa48("127092") ? options.activationScheduler && null : stryMutAct_9fa48("127091") ? false : stryMutAct_9fa48("127090") ? true : (stryCov_9fa48("127090", "127091", "127092"), options.activationScheduler || null);
      this.activationHandle = null;
      this.pendingTerm = null;
      this.activatedTerm = null;
      this.timer = null;
      this.destroyed = stryMutAct_9fa48("127093") ? true : (stryCov_9fa48("127093"), false);
    }
  }
  schedule(term, activate, options = {}) {
    if (stryMutAct_9fa48("127094")) {
      {}
    } else {
      stryCov_9fa48("127094");
      if (stryMutAct_9fa48("127097") ? this.destroyed && typeof activate !== 'function' : stryMutAct_9fa48("127096") ? false : stryMutAct_9fa48("127095") ? true : (stryCov_9fa48("127095", "127096", "127097"), this.destroyed || (stryMutAct_9fa48("127099") ? typeof activate === 'function' : stryMutAct_9fa48("127098") ? false : (stryCov_9fa48("127098", "127099"), typeof activate !== (stryMutAct_9fa48("127100") ? "" : (stryCov_9fa48("127100"), 'function')))))) {
        if (stryMutAct_9fa48("127101")) {
          {}
        } else {
          stryCov_9fa48("127101");
          return stryMutAct_9fa48("127102") ? true : (stryCov_9fa48("127102"), false);
        }
      }
      if (stryMutAct_9fa48("127105") ? this.activatedTerm !== term : stryMutAct_9fa48("127104") ? false : stryMutAct_9fa48("127103") ? true : (stryCov_9fa48("127103", "127104", "127105"), this.activatedTerm === term)) {
        if (stryMutAct_9fa48("127106")) {
          {}
        } else {
          stryCov_9fa48("127106");
          return stryMutAct_9fa48("127107") ? true : (stryCov_9fa48("127107"), false);
        }
      }
      if (stryMutAct_9fa48("127110") ? this.pendingTerm === term || this.timer : stryMutAct_9fa48("127109") ? false : stryMutAct_9fa48("127108") ? true : (stryCov_9fa48("127108", "127109", "127110"), (stryMutAct_9fa48("127112") ? this.pendingTerm !== term : stryMutAct_9fa48("127111") ? true : (stryCov_9fa48("127111", "127112"), this.pendingTerm === term)) && this.timer)) {
        if (stryMutAct_9fa48("127113")) {
          {}
        } else {
          stryCov_9fa48("127113");
          return stryMutAct_9fa48("127114") ? true : (stryCov_9fa48("127114"), false);
        }
      }
      this.cancel(stryMutAct_9fa48("127115") ? {} : (stryCov_9fa48("127115"), {
        clearActivatedTerm: stryMutAct_9fa48("127116") ? true : (stryCov_9fa48("127116"), false)
      }));
      this.pendingTerm = term;
      const runActivation = () => {
        if (stryMutAct_9fa48("127117")) {
          {}
        } else {
          stryCov_9fa48("127117");
          this.timer = null;
          if (stryMutAct_9fa48("127120") ? this.destroyed && this.pendingTerm !== term : stryMutAct_9fa48("127119") ? false : stryMutAct_9fa48("127118") ? true : (stryCov_9fa48("127118", "127119", "127120"), this.destroyed || (stryMutAct_9fa48("127122") ? this.pendingTerm === term : stryMutAct_9fa48("127121") ? false : (stryCov_9fa48("127121", "127122"), this.pendingTerm !== term)))) {
            if (stryMutAct_9fa48("127123")) {
              {}
            } else {
              stryCov_9fa48("127123");
              return;
            }
          }
          const activateNow = () => {
            if (stryMutAct_9fa48("127124")) {
              {}
            } else {
              stryCov_9fa48("127124");
              this.activationHandle = null;
              if (stryMutAct_9fa48("127127") ? this.destroyed && this.pendingTerm !== term : stryMutAct_9fa48("127126") ? false : stryMutAct_9fa48("127125") ? true : (stryCov_9fa48("127125", "127126", "127127"), this.destroyed || (stryMutAct_9fa48("127129") ? this.pendingTerm === term : stryMutAct_9fa48("127128") ? false : (stryCov_9fa48("127128", "127129"), this.pendingTerm !== term)))) {
                if (stryMutAct_9fa48("127130")) {
                  {}
                } else {
                  stryCov_9fa48("127130");
                  return;
                }
              }
              const shouldActivate = (stryMutAct_9fa48("127133") ? typeof options.shouldActivate !== 'function' : stryMutAct_9fa48("127132") ? false : stryMutAct_9fa48("127131") ? true : (stryCov_9fa48("127131", "127132", "127133"), typeof options.shouldActivate === (stryMutAct_9fa48("127134") ? "" : (stryCov_9fa48("127134"), 'function')))) ? options.shouldActivate() : stryMutAct_9fa48("127135") ? false : (stryCov_9fa48("127135"), true);
              if (stryMutAct_9fa48("127138") ? shouldActivate === true : stryMutAct_9fa48("127137") ? false : stryMutAct_9fa48("127136") ? true : (stryCov_9fa48("127136", "127137", "127138"), shouldActivate !== (stryMutAct_9fa48("127139") ? false : (stryCov_9fa48("127139"), true)))) {
                if (stryMutAct_9fa48("127140")) {
                  {}
                } else {
                  stryCov_9fa48("127140");
                  this.pendingTerm = null;
                  return;
                }
              }
              this.pendingTerm = null;
              this.activatedTerm = term;
              activate();
            }
          };
          if (stryMutAct_9fa48("127143") ? this.activationScheduler || options.immediate !== true : stryMutAct_9fa48("127142") ? false : stryMutAct_9fa48("127141") ? true : (stryCov_9fa48("127141", "127142", "127143"), this.activationScheduler && (stryMutAct_9fa48("127145") ? options.immediate === true : stryMutAct_9fa48("127144") ? true : (stryCov_9fa48("127144", "127145"), options.immediate !== (stryMutAct_9fa48("127146") ? false : (stryCov_9fa48("127146"), true)))))) {
            if (stryMutAct_9fa48("127147")) {
              {}
            } else {
              stryCov_9fa48("127147");
              this.activationHandle = this.activationScheduler.enqueue(activateNow);
              return;
            }
          }
          activateNow();
        }
      };
      const immediate = stryMutAct_9fa48("127150") ? options.immediate === true && this.holdoffMs === NUM.ZERO : stryMutAct_9fa48("127149") ? false : stryMutAct_9fa48("127148") ? true : (stryCov_9fa48("127148", "127149", "127150"), (stryMutAct_9fa48("127152") ? options.immediate !== true : stryMutAct_9fa48("127151") ? false : (stryCov_9fa48("127151", "127152"), options.immediate === (stryMutAct_9fa48("127153") ? false : (stryCov_9fa48("127153"), true)))) || (stryMutAct_9fa48("127155") ? this.holdoffMs !== NUM.ZERO : stryMutAct_9fa48("127154") ? false : (stryCov_9fa48("127154", "127155"), this.holdoffMs === NUM.ZERO)));
      if (stryMutAct_9fa48("127157") ? false : stryMutAct_9fa48("127156") ? true : (stryCov_9fa48("127156", "127157"), immediate)) {
        if (stryMutAct_9fa48("127158")) {
          {}
        } else {
          stryCov_9fa48("127158");
          runActivation();
          return stryMutAct_9fa48("127159") ? false : (stryCov_9fa48("127159"), true);
        }
      }
      this.timer = setTimeout(runActivation, this.holdoffMs);
      if (stryMutAct_9fa48("127162") ? typeof this.timer?.unref !== 'function' : stryMutAct_9fa48("127161") ? false : stryMutAct_9fa48("127160") ? true : (stryCov_9fa48("127160", "127161", "127162"), typeof (stryMutAct_9fa48("127163") ? this.timer.unref : (stryCov_9fa48("127163"), this.timer?.unref)) === (stryMutAct_9fa48("127164") ? "" : (stryCov_9fa48("127164"), 'function')))) {
        if (stryMutAct_9fa48("127165")) {
          {}
        } else {
          stryCov_9fa48("127165");
          this.timer.unref();
        }
      }
      return stryMutAct_9fa48("127166") ? false : (stryCov_9fa48("127166"), true);
    }
  }
  cancel(options = {}) {
    if (stryMutAct_9fa48("127167")) {
      {}
    } else {
      stryCov_9fa48("127167");
      if (stryMutAct_9fa48("127169") ? false : stryMutAct_9fa48("127168") ? true : (stryCov_9fa48("127168", "127169"), this.timer)) {
        if (stryMutAct_9fa48("127170")) {
          {}
        } else {
          stryCov_9fa48("127170");
          clearTimeout(this.timer);
          this.timer = null;
        }
      }
      if (stryMutAct_9fa48("127173") ? this.activationHandle || typeof this.activationHandle.cancel === 'function' : stryMutAct_9fa48("127172") ? false : stryMutAct_9fa48("127171") ? true : (stryCov_9fa48("127171", "127172", "127173"), this.activationHandle && (stryMutAct_9fa48("127175") ? typeof this.activationHandle.cancel !== 'function' : stryMutAct_9fa48("127174") ? true : (stryCov_9fa48("127174", "127175"), typeof this.activationHandle.cancel === (stryMutAct_9fa48("127176") ? "" : (stryCov_9fa48("127176"), 'function')))))) {
        if (stryMutAct_9fa48("127177")) {
          {}
        } else {
          stryCov_9fa48("127177");
          this.activationHandle.cancel();
        }
      }
      this.activationHandle = null;
      this.pendingTerm = null;
      if (stryMutAct_9fa48("127180") ? options.clearActivatedTerm !== true : stryMutAct_9fa48("127179") ? false : stryMutAct_9fa48("127178") ? true : (stryCov_9fa48("127178", "127179", "127180"), options.clearActivatedTerm === (stryMutAct_9fa48("127181") ? false : (stryCov_9fa48("127181"), true)))) {
        if (stryMutAct_9fa48("127182")) {
          {}
        } else {
          stryCov_9fa48("127182");
          this.activatedTerm = null;
        }
      }
    }
  }
  shutdown() {
    if (stryMutAct_9fa48("127183")) {
      {}
    } else {
      stryCov_9fa48("127183");
      this.destroyed = stryMutAct_9fa48("127184") ? false : (stryCov_9fa48("127184"), true);
      this.cancel(stryMutAct_9fa48("127185") ? {} : (stryCov_9fa48("127185"), {
        clearActivatedTerm: stryMutAct_9fa48("127186") ? false : (stryCov_9fa48("127186"), true)
      }));
    }
  }
}
export { DEFAULT_LEADER_ACTIVATION_HOLDOFF_MS, LeaderActivationGate };