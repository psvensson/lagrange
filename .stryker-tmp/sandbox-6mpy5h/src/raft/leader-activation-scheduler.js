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
const DEFAULT_LEADER_ACTIVATION_NODE_SPACING_MS = 25;
const SHARED_LEADER_ACTIVATION_SCHEDULERS = new Map();
function normalizeSpacingMs(value) {
  if (stryMutAct_9fa48("127187")) {
    {}
  } else {
    stryCov_9fa48("127187");
    return (stryMutAct_9fa48("127190") ? Number.isFinite(value) || value >= NUM.ZERO : stryMutAct_9fa48("127189") ? false : stryMutAct_9fa48("127188") ? true : (stryCov_9fa48("127188", "127189", "127190"), Number.isFinite(value) && (stryMutAct_9fa48("127193") ? value < NUM.ZERO : stryMutAct_9fa48("127192") ? value > NUM.ZERO : stryMutAct_9fa48("127191") ? true : (stryCov_9fa48("127191", "127192", "127193"), value >= NUM.ZERO)))) ? Math.floor(value) : DEFAULT_LEADER_ACTIVATION_NODE_SPACING_MS;
  }
}
class LeaderActivationScheduler {
  static getShared(options = {}) {
    if (stryMutAct_9fa48("127194")) {
      {}
    } else {
      stryCov_9fa48("127194");
      const nodeId = (stryMutAct_9fa48("127197") ? typeof options.nodeId === 'string' || options.nodeId.length > 0 : stryMutAct_9fa48("127196") ? false : stryMutAct_9fa48("127195") ? true : (stryCov_9fa48("127195", "127196", "127197"), (stryMutAct_9fa48("127199") ? typeof options.nodeId !== 'string' : stryMutAct_9fa48("127198") ? true : (stryCov_9fa48("127198", "127199"), typeof options.nodeId === (stryMutAct_9fa48("127200") ? "" : (stryCov_9fa48("127200"), 'string')))) && (stryMutAct_9fa48("127203") ? options.nodeId.length <= 0 : stryMutAct_9fa48("127202") ? options.nodeId.length >= 0 : stryMutAct_9fa48("127201") ? true : (stryCov_9fa48("127201", "127202", "127203"), options.nodeId.length > 0)))) ? options.nodeId : stryMutAct_9fa48("127204") ? "" : (stryCov_9fa48("127204"), 'shared-node');
      const existing = SHARED_LEADER_ACTIVATION_SCHEDULERS.get(nodeId);
      if (stryMutAct_9fa48("127206") ? false : stryMutAct_9fa48("127205") ? true : (stryCov_9fa48("127205", "127206"), existing)) {
        if (stryMutAct_9fa48("127207")) {
          {}
        } else {
          stryCov_9fa48("127207");
          existing.configure(options);
          return existing;
        }
      }
      const scheduler = new LeaderActivationScheduler(options);
      SHARED_LEADER_ACTIVATION_SCHEDULERS.set(nodeId, scheduler);
      return scheduler;
    }
  }
  static resetSharedForTests() {
    if (stryMutAct_9fa48("127208")) {
      {}
    } else {
      stryCov_9fa48("127208");
      for (const scheduler of SHARED_LEADER_ACTIVATION_SCHEDULERS.values()) {
        if (stryMutAct_9fa48("127209")) {
          {}
        } else {
          stryCov_9fa48("127209");
          scheduler.shutdown();
        }
      }
      SHARED_LEADER_ACTIVATION_SCHEDULERS.clear();
    }
  }
  constructor(options = {}) {
    if (stryMutAct_9fa48("127210")) {
      {}
    } else {
      stryCov_9fa48("127210");
      this.nodeId = (stryMutAct_9fa48("127213") ? typeof options.nodeId === 'string' || options.nodeId.length > 0 : stryMutAct_9fa48("127212") ? false : stryMutAct_9fa48("127211") ? true : (stryCov_9fa48("127211", "127212", "127213"), (stryMutAct_9fa48("127215") ? typeof options.nodeId !== 'string' : stryMutAct_9fa48("127214") ? true : (stryCov_9fa48("127214", "127215"), typeof options.nodeId === (stryMutAct_9fa48("127216") ? "" : (stryCov_9fa48("127216"), 'string')))) && (stryMutAct_9fa48("127219") ? options.nodeId.length <= 0 : stryMutAct_9fa48("127218") ? options.nodeId.length >= 0 : stryMutAct_9fa48("127217") ? true : (stryCov_9fa48("127217", "127218", "127219"), options.nodeId.length > 0)))) ? options.nodeId : stryMutAct_9fa48("127220") ? "" : (stryCov_9fa48("127220"), 'shared-node');
      this.spacingMs = normalizeSpacingMs(options.spacingMs);
      this.queue = stryMutAct_9fa48("127221") ? ["Stryker was here"] : (stryCov_9fa48("127221"), []);
      this.nextEntryId = NUM.ONE;
      this.dispatchTimer = null;
      this.lastDispatchAt = NUM.ZERO;
      this.destroyed = stryMutAct_9fa48("127222") ? true : (stryCov_9fa48("127222"), false);
    }
  }
  configure(options = {}) {
    if (stryMutAct_9fa48("127223")) {
      {}
    } else {
      stryCov_9fa48("127223");
      this.spacingMs = normalizeSpacingMs(stryMutAct_9fa48("127224") ? options.spacingMs && this.spacingMs : (stryCov_9fa48("127224"), options.spacingMs ?? this.spacingMs));
      this.scheduleDrain();
    }
  }
  enqueue(run) {
    if (stryMutAct_9fa48("127225")) {
      {}
    } else {
      stryCov_9fa48("127225");
      if (stryMutAct_9fa48("127228") ? this.destroyed && typeof run !== 'function' : stryMutAct_9fa48("127227") ? false : stryMutAct_9fa48("127226") ? true : (stryCov_9fa48("127226", "127227", "127228"), this.destroyed || (stryMutAct_9fa48("127230") ? typeof run === 'function' : stryMutAct_9fa48("127229") ? false : (stryCov_9fa48("127229", "127230"), typeof run !== (stryMutAct_9fa48("127231") ? "" : (stryCov_9fa48("127231"), 'function')))))) {
        if (stryMutAct_9fa48("127232")) {
          {}
        } else {
          stryCov_9fa48("127232");
          return stryMutAct_9fa48("127233") ? {} : (stryCov_9fa48("127233"), {
            cancel: () => {}
          });
        }
      }
      const entry = stryMutAct_9fa48("127234") ? {} : (stryCov_9fa48("127234"), {
        id: this.nextEntryId,
        run,
        canceled: stryMutAct_9fa48("127235") ? true : (stryCov_9fa48("127235"), false)
      });
      stryMutAct_9fa48("127236") ? this.nextEntryId -= NUM.ONE : (stryCov_9fa48("127236"), this.nextEntryId += NUM.ONE);
      this.queue.push(entry);
      this.scheduleDrain();
      return stryMutAct_9fa48("127237") ? {} : (stryCov_9fa48("127237"), {
        cancel: () => {
          if (stryMutAct_9fa48("127238")) {
            {}
          } else {
            stryCov_9fa48("127238");
            entry.canceled = stryMutAct_9fa48("127239") ? false : (stryCov_9fa48("127239"), true);
          }
        }
      });
    }
  }
  scheduleDrain() {
    if (stryMutAct_9fa48("127240")) {
      {}
    } else {
      stryCov_9fa48("127240");
      if (stryMutAct_9fa48("127243") ? (this.destroyed || this.dispatchTimer) && this.queue.length === NUM.ZERO : stryMutAct_9fa48("127242") ? false : stryMutAct_9fa48("127241") ? true : (stryCov_9fa48("127241", "127242", "127243"), (stryMutAct_9fa48("127245") ? this.destroyed && this.dispatchTimer : stryMutAct_9fa48("127244") ? false : (stryCov_9fa48("127244", "127245"), this.destroyed || this.dispatchTimer)) || (stryMutAct_9fa48("127247") ? this.queue.length !== NUM.ZERO : stryMutAct_9fa48("127246") ? false : (stryCov_9fa48("127246", "127247"), this.queue.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("127248")) {
          {}
        } else {
          stryCov_9fa48("127248");
          return;
        }
      }
      const delayMs = stryMutAct_9fa48("127249") ? Math.min(NUM.ZERO, this.lastDispatchAt + this.spacingMs - Date.now()) : (stryCov_9fa48("127249"), Math.max(NUM.ZERO, stryMutAct_9fa48("127250") ? this.lastDispatchAt + this.spacingMs + Date.now() : (stryCov_9fa48("127250"), (stryMutAct_9fa48("127251") ? this.lastDispatchAt - this.spacingMs : (stryCov_9fa48("127251"), this.lastDispatchAt + this.spacingMs)) - Date.now())));
      this.dispatchTimer = setTimeout(() => {
        if (stryMutAct_9fa48("127252")) {
          {}
        } else {
          stryCov_9fa48("127252");
          this.dispatchTimer = null;
          this.dispatchNext();
        }
      }, delayMs);
      if (stryMutAct_9fa48("127255") ? typeof this.dispatchTimer?.unref !== 'function' : stryMutAct_9fa48("127254") ? false : stryMutAct_9fa48("127253") ? true : (stryCov_9fa48("127253", "127254", "127255"), typeof (stryMutAct_9fa48("127256") ? this.dispatchTimer.unref : (stryCov_9fa48("127256"), this.dispatchTimer?.unref)) === (stryMutAct_9fa48("127257") ? "" : (stryCov_9fa48("127257"), 'function')))) {
        if (stryMutAct_9fa48("127258")) {
          {}
        } else {
          stryCov_9fa48("127258");
          this.dispatchTimer.unref();
        }
      }
    }
  }
  dispatchNext() {
    if (stryMutAct_9fa48("127259")) {
      {}
    } else {
      stryCov_9fa48("127259");
      if (stryMutAct_9fa48("127261") ? false : stryMutAct_9fa48("127260") ? true : (stryCov_9fa48("127260", "127261"), this.destroyed)) {
        if (stryMutAct_9fa48("127262")) {
          {}
        } else {
          stryCov_9fa48("127262");
          return;
        }
      }
      while (stryMutAct_9fa48("127265") ? this.queue.length <= NUM.ZERO : stryMutAct_9fa48("127264") ? this.queue.length >= NUM.ZERO : stryMutAct_9fa48("127263") ? false : (stryCov_9fa48("127263", "127264", "127265"), this.queue.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("127266")) {
          {}
        } else {
          stryCov_9fa48("127266");
          const entry = this.queue.shift();
          if (stryMutAct_9fa48("127269") ? !entry && entry.canceled : stryMutAct_9fa48("127268") ? false : stryMutAct_9fa48("127267") ? true : (stryCov_9fa48("127267", "127268", "127269"), (stryMutAct_9fa48("127270") ? entry : (stryCov_9fa48("127270"), !entry)) || entry.canceled)) {
            if (stryMutAct_9fa48("127271")) {
              {}
            } else {
              stryCov_9fa48("127271");
              continue;
            }
          }
          this.lastDispatchAt = Date.now();
          try {
            if (stryMutAct_9fa48("127272")) {
              {}
            } else {
              stryCov_9fa48("127272");
              const result = entry.run();
              if (stryMutAct_9fa48("127275") ? result || typeof result.catch === 'function' : stryMutAct_9fa48("127274") ? false : stryMutAct_9fa48("127273") ? true : (stryCov_9fa48("127273", "127274", "127275"), result && (stryMutAct_9fa48("127277") ? typeof result.catch !== 'function' : stryMutAct_9fa48("127276") ? true : (stryCov_9fa48("127276", "127277"), typeof result.catch === (stryMutAct_9fa48("127278") ? "" : (stryCov_9fa48("127278"), 'function')))))) {
                if (stryMutAct_9fa48("127279")) {
                  {}
                } else {
                  stryCov_9fa48("127279");
                  result.catch(() => {});
                }
              }
            }
          } finally {
            if (stryMutAct_9fa48("127280")) {
              {}
            } else {
              stryCov_9fa48("127280");
              this.scheduleDrain();
            }
          }
          return;
        }
      }
    }
  }
  shutdown() {
    if (stryMutAct_9fa48("127281")) {
      {}
    } else {
      stryCov_9fa48("127281");
      this.destroyed = stryMutAct_9fa48("127282") ? false : (stryCov_9fa48("127282"), true);
      this.queue.length = NUM.ZERO;
      if (stryMutAct_9fa48("127284") ? false : stryMutAct_9fa48("127283") ? true : (stryCov_9fa48("127283", "127284"), this.dispatchTimer)) {
        if (stryMutAct_9fa48("127285")) {
          {}
        } else {
          stryCov_9fa48("127285");
          clearTimeout(this.dispatchTimer);
          this.dispatchTimer = null;
        }
      }
    }
  }
}
export { DEFAULT_LEADER_ACTIVATION_NODE_SPACING_MS, LeaderActivationScheduler };