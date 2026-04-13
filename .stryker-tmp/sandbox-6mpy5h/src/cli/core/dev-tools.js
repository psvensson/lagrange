/**
 * DevTools - Development and debugging overlay for the Admin CLI
 *
 * Provides debugging capabilities including state inspection, event logging,
 * component registry visualization, CDC event stream, and performance metrics.
 *
 * Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8
 */
// @ts-nocheck


/**
 * @typedef {'state'|'events'|'components'|'cdc'|'performance'} DevToolsTab
 */

/**
 * @typedef {Object} PerformanceMetrics
 * @property {number[]} renderTimes - Recent render times in ms
 * @property {number[]} eventLatencies - Recent event latencies in ms
 * @property {number} maxSamples - Maximum samples to keep
 */

/**
 * @typedef {Object} CDCEventEntry
 * @property {number} timestamp - Event timestamp
 * @property {string} table - Table name
 * @property {string} operation - Operation type
 * @property {string} key - Row key
 * @property {Object} [data] - Event data
 */

/**
 * Check if running in production mode
 * @returns {boolean}
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
function isProduction() {
  if (stryMutAct_9fa48("41441")) {
    {}
  } else {
    stryCov_9fa48("41441");
    return stryMutAct_9fa48("41444") ? process.env.NODE_ENV !== 'production' : stryMutAct_9fa48("41443") ? false : stryMutAct_9fa48("41442") ? true : (stryCov_9fa48("41442", "41443", "41444"), process.env.NODE_ENV === (stryMutAct_9fa48("41445") ? "" : (stryCov_9fa48("41445"), 'production')));
  }
}

/**
 * DevTools class for development and debugging
 */
export class DevTools {
  /**
   * Creates a new DevTools instance
   * @param {Object} options - Configuration options
   * @param {import('./state-manager.js').StateManager} [options.stateManager] - State mgr
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('./component-registry.js').ComponentRegistry} [options.componentRegistry]
   * @param {boolean} [options.enabled=true] - Whether DevTools is enabled
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("41446")) {
      {}
    } else {
      stryCov_9fa48("41446");
      this.stateManager = stryMutAct_9fa48("41449") ? options.stateManager && null : stryMutAct_9fa48("41448") ? false : stryMutAct_9fa48("41447") ? true : (stryCov_9fa48("41447", "41448", "41449"), options.stateManager || null);
      this.eventBus = stryMutAct_9fa48("41452") ? options.eventBus && null : stryMutAct_9fa48("41451") ? false : stryMutAct_9fa48("41450") ? true : (stryCov_9fa48("41450", "41451", "41452"), options.eventBus || null);
      this.componentRegistry = stryMutAct_9fa48("41455") ? options.componentRegistry && null : stryMutAct_9fa48("41454") ? false : stryMutAct_9fa48("41453") ? true : (stryCov_9fa48("41453", "41454", "41455"), options.componentRegistry || null);

      // Disable in production unless explicitly enabled
      this.enabled = (stryMutAct_9fa48("41458") ? options.enabled === undefined : stryMutAct_9fa48("41457") ? false : stryMutAct_9fa48("41456") ? true : (stryCov_9fa48("41456", "41457", "41458"), options.enabled !== undefined)) ? options.enabled : stryMutAct_9fa48("41459") ? isProduction() : (stryCov_9fa48("41459"), !isProduction());

      /** @type {boolean} */
      this.visible = stryMutAct_9fa48("41460") ? true : (stryCov_9fa48("41460"), false);

      /** @type {DevToolsTab} */
      this.currentTab = stryMutAct_9fa48("41461") ? "" : (stryCov_9fa48("41461"), 'state');

      /** @type {PerformanceMetrics} */
      this.metrics = stryMutAct_9fa48("41462") ? {} : (stryCov_9fa48("41462"), {
        renderTimes: stryMutAct_9fa48("41463") ? ["Stryker was here"] : (stryCov_9fa48("41463"), []),
        eventLatencies: stryMutAct_9fa48("41464") ? ["Stryker was here"] : (stryCov_9fa48("41464"), []),
        maxSamples: 100
      });

      /** @type {CDCEventEntry[]} */
      this.cdcEvents = stryMutAct_9fa48("41465") ? ["Stryker was here"] : (stryCov_9fa48("41465"), []);
      this.maxCDCEvents = 100;

      /** @type {string} */
      this.cdcFilter = stryMutAct_9fa48("41466") ? "Stryker was here!" : (stryCov_9fa48("41466"), '');

      // Event log from event bus
      this.eventLogSubscription = null;

      // Setup event tracking if enabled
      if (stryMutAct_9fa48("41468") ? false : stryMutAct_9fa48("41467") ? true : (stryCov_9fa48("41467", "41468"), this.enabled)) {
        if (stryMutAct_9fa48("41469")) {
          {}
        } else {
          stryCov_9fa48("41469");
          this.setupEventTracking();
        }
      }
    }
  }

  /**
   * Setup event tracking for CDC events
   */
  setupEventTracking() {
    if (stryMutAct_9fa48("41470")) {
      {}
    } else {
      stryCov_9fa48("41470");
      if (stryMutAct_9fa48("41473") ? false : stryMutAct_9fa48("41472") ? true : stryMutAct_9fa48("41471") ? this.eventBus : (stryCov_9fa48("41471", "41472", "41473"), !this.eventBus)) return;

      // Track CDC events
      this.eventBus.on(stryMutAct_9fa48("41474") ? "" : (stryCov_9fa48("41474"), 'cache:update'), data => {
        if (stryMutAct_9fa48("41475")) {
          {}
        } else {
          stryCov_9fa48("41475");
          this.trackCDCEvent(stryMutAct_9fa48("41476") ? {} : (stryCov_9fa48("41476"), {
            timestamp: Date.now(),
            table: data.table,
            operation: data.operation,
            key: data.key,
            data: data
          }));
        }
      });

      // Track render times
      this.eventBus.on(stryMutAct_9fa48("41477") ? "" : (stryCov_9fa48("41477"), 'view:rendered'), data => {
        if (stryMutAct_9fa48("41478")) {
          {}
        } else {
          stryCov_9fa48("41478");
          if (stryMutAct_9fa48("41481") ? data.duration === undefined : stryMutAct_9fa48("41480") ? false : stryMutAct_9fa48("41479") ? true : (stryCov_9fa48("41479", "41480", "41481"), data.duration !== undefined)) {
            if (stryMutAct_9fa48("41482")) {
              {}
            } else {
              stryCov_9fa48("41482");
              this.trackRenderTime(data.duration);
            }
          }
        }
      });

      // Track event latencies
      this.eventBus.on(stryMutAct_9fa48("41483") ? "" : (stryCov_9fa48("41483"), '*'), (_data, eventName) => {
        if (stryMutAct_9fa48("41484")) {
          {}
        } else {
          stryCov_9fa48("41484");
          if (stryMutAct_9fa48("41487") ? this.visible || eventName : stryMutAct_9fa48("41486") ? false : stryMutAct_9fa48("41485") ? true : (stryCov_9fa48("41485", "41486", "41487"), this.visible && eventName)) {
            if (stryMutAct_9fa48("41488")) {
              {}
            } else {
              stryCov_9fa48("41488");
              const latency = stryMutAct_9fa48("41489") ? Date.now() + (this.lastEventTime || Date.now()) : (stryCov_9fa48("41489"), Date.now() - (stryMutAct_9fa48("41492") ? this.lastEventTime && Date.now() : stryMutAct_9fa48("41491") ? false : stryMutAct_9fa48("41490") ? true : (stryCov_9fa48("41490", "41491", "41492"), this.lastEventTime || Date.now())));
              this.trackEventLatency(latency);
              this.lastEventTime = Date.now();
            }
          }
        }
      });
    }
  }

  /**
   * Check if DevTools is enabled
   * @returns {boolean}
   */
  isEnabled() {
    if (stryMutAct_9fa48("41493")) {
      {}
    } else {
      stryCov_9fa48("41493");
      return this.enabled;
    }
  }

  /**
   * Check if DevTools is visible
   * @returns {boolean}
   */
  isVisible() {
    if (stryMutAct_9fa48("41494")) {
      {}
    } else {
      stryCov_9fa48("41494");
      return this.visible;
    }
  }

  /**
   * Show the DevTools overlay
   * Requirements: 26.1
   */
  show() {
    if (stryMutAct_9fa48("41495")) {
      {}
    } else {
      stryCov_9fa48("41495");
      if (stryMutAct_9fa48("41498") ? false : stryMutAct_9fa48("41497") ? true : stryMutAct_9fa48("41496") ? this.enabled : (stryCov_9fa48("41496", "41497", "41498"), !this.enabled)) return;
      this.visible = stryMutAct_9fa48("41499") ? false : (stryCov_9fa48("41499"), true);
      this.lastEventTime = Date.now();
      if (stryMutAct_9fa48("41501") ? false : stryMutAct_9fa48("41500") ? true : (stryCov_9fa48("41500", "41501"), this.eventBus)) {
        if (stryMutAct_9fa48("41502")) {
          {}
        } else {
          stryCov_9fa48("41502");
          this.eventBus.emit(stryMutAct_9fa48("41503") ? "" : (stryCov_9fa48("41503"), 'devtools:show'), stryMutAct_9fa48("41504") ? {} : (stryCov_9fa48("41504"), {
            timestamp: Date.now()
          }));
        }
      }
    }
  }

  /**
   * Hide the DevTools overlay
   */
  hide() {
    if (stryMutAct_9fa48("41505")) {
      {}
    } else {
      stryCov_9fa48("41505");
      this.visible = stryMutAct_9fa48("41506") ? true : (stryCov_9fa48("41506"), false);
      if (stryMutAct_9fa48("41508") ? false : stryMutAct_9fa48("41507") ? true : (stryCov_9fa48("41507", "41508"), this.eventBus)) {
        if (stryMutAct_9fa48("41509")) {
          {}
        } else {
          stryCov_9fa48("41509");
          this.eventBus.emit(stryMutAct_9fa48("41510") ? "" : (stryCov_9fa48("41510"), 'devtools:hide'), stryMutAct_9fa48("41511") ? {} : (stryCov_9fa48("41511"), {
            timestamp: Date.now()
          }));
        }
      }
    }
  }

  /**
   * Toggle DevTools visibility
   * Requirements: 26.1
   * @returns {boolean} New visibility state
   */
  toggle() {
    if (stryMutAct_9fa48("41512")) {
      {}
    } else {
      stryCov_9fa48("41512");
      if (stryMutAct_9fa48("41514") ? false : stryMutAct_9fa48("41513") ? true : (stryCov_9fa48("41513", "41514"), this.visible)) {
        if (stryMutAct_9fa48("41515")) {
          {}
        } else {
          stryCov_9fa48("41515");
          this.hide();
        }
      } else {
        if (stryMutAct_9fa48("41516")) {
          {}
        } else {
          stryCov_9fa48("41516");
          this.show();
        }
      }
      return this.visible;
    }
  }

  /**
   * Get current tab
   * @returns {DevToolsTab}
   */
  getCurrentTab() {
    if (stryMutAct_9fa48("41517")) {
      {}
    } else {
      stryCov_9fa48("41517");
      return this.currentTab;
    }
  }

  /**
   * Switch to a different tab
   * @param {DevToolsTab} tab - Tab to switch to
   */
  switchTab(tab) {
    if (stryMutAct_9fa48("41518")) {
      {}
    } else {
      stryCov_9fa48("41518");
      const validTabs = stryMutAct_9fa48("41519") ? [] : (stryCov_9fa48("41519"), [stryMutAct_9fa48("41520") ? "" : (stryCov_9fa48("41520"), 'state'), stryMutAct_9fa48("41521") ? "" : (stryCov_9fa48("41521"), 'events'), stryMutAct_9fa48("41522") ? "" : (stryCov_9fa48("41522"), 'components'), stryMutAct_9fa48("41523") ? "" : (stryCov_9fa48("41523"), 'cdc'), stryMutAct_9fa48("41524") ? "" : (stryCov_9fa48("41524"), 'performance')]);
      if (stryMutAct_9fa48("41526") ? false : stryMutAct_9fa48("41525") ? true : (stryCov_9fa48("41525", "41526"), validTabs.includes(tab))) {
        if (stryMutAct_9fa48("41527")) {
          {}
        } else {
          stryCov_9fa48("41527");
          this.currentTab = tab;
          if (stryMutAct_9fa48("41529") ? false : stryMutAct_9fa48("41528") ? true : (stryCov_9fa48("41528", "41529"), this.eventBus)) {
            if (stryMutAct_9fa48("41530")) {
              {}
            } else {
              stryCov_9fa48("41530");
              this.eventBus.emit(stryMutAct_9fa48("41531") ? "" : (stryCov_9fa48("41531"), 'devtools:tabChanged'), stryMutAct_9fa48("41532") ? {} : (stryCov_9fa48("41532"), {
                tab
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Get available tabs
   * @returns {Array<{id: DevToolsTab, label: string}>}
   */
  getTabs() {
    if (stryMutAct_9fa48("41533")) {
      {}
    } else {
      stryCov_9fa48("41533");
      return stryMutAct_9fa48("41534") ? [] : (stryCov_9fa48("41534"), [stryMutAct_9fa48("41535") ? {} : (stryCov_9fa48("41535"), {
        id: stryMutAct_9fa48("41536") ? "" : (stryCov_9fa48("41536"), 'state'),
        label: stryMutAct_9fa48("41537") ? "" : (stryCov_9fa48("41537"), '1: State')
      }), stryMutAct_9fa48("41538") ? {} : (stryCov_9fa48("41538"), {
        id: stryMutAct_9fa48("41539") ? "" : (stryCov_9fa48("41539"), 'events'),
        label: stryMutAct_9fa48("41540") ? "" : (stryCov_9fa48("41540"), '2: Events')
      }), stryMutAct_9fa48("41541") ? {} : (stryCov_9fa48("41541"), {
        id: stryMutAct_9fa48("41542") ? "" : (stryCov_9fa48("41542"), 'components'),
        label: stryMutAct_9fa48("41543") ? "" : (stryCov_9fa48("41543"), '3: Components')
      }), stryMutAct_9fa48("41544") ? {} : (stryCov_9fa48("41544"), {
        id: stryMutAct_9fa48("41545") ? "" : (stryCov_9fa48("41545"), 'cdc'),
        label: stryMutAct_9fa48("41546") ? "" : (stryCov_9fa48("41546"), '4: CDC Stream')
      }), stryMutAct_9fa48("41547") ? {} : (stryCov_9fa48("41547"), {
        id: stryMutAct_9fa48("41548") ? "" : (stryCov_9fa48("41548"), 'performance'),
        label: stryMutAct_9fa48("41549") ? "" : (stryCov_9fa48("41549"), '5: Performance')
      })]);
    }
  }

  /**
   * Get content for the current tab
   * @returns {Object} Tab content
   */
  getTabContent() {
    if (stryMutAct_9fa48("41550")) {
      {}
    } else {
      stryCov_9fa48("41550");
      switch (this.currentTab) {
        case stryMutAct_9fa48("41552") ? "" : (stryCov_9fa48("41552"), 'state'):
          if (stryMutAct_9fa48("41551")) {} else {
            stryCov_9fa48("41551");
            return this.getStateContent();
          }
        case stryMutAct_9fa48("41554") ? "" : (stryCov_9fa48("41554"), 'events'):
          if (stryMutAct_9fa48("41553")) {} else {
            stryCov_9fa48("41553");
            return this.getEventsContent();
          }
        case stryMutAct_9fa48("41556") ? "" : (stryCov_9fa48("41556"), 'components'):
          if (stryMutAct_9fa48("41555")) {} else {
            stryCov_9fa48("41555");
            return this.getComponentsContent();
          }
        case stryMutAct_9fa48("41558") ? "" : (stryCov_9fa48("41558"), 'cdc'):
          if (stryMutAct_9fa48("41557")) {} else {
            stryCov_9fa48("41557");
            return this.getCDCContent();
          }
        case stryMutAct_9fa48("41560") ? "" : (stryCov_9fa48("41560"), 'performance'):
          if (stryMutAct_9fa48("41559")) {} else {
            stryCov_9fa48("41559");
            return this.getPerformanceContent();
          }
        default:
          if (stryMutAct_9fa48("41561")) {} else {
            stryCov_9fa48("41561");
            return stryMutAct_9fa48("41562") ? {} : (stryCov_9fa48("41562"), {
              type: stryMutAct_9fa48("41563") ? "" : (stryCov_9fa48("41563"), 'empty'),
              content: stryMutAct_9fa48("41564") ? "" : (stryCov_9fa48("41564"), 'Unknown tab')
            });
          }
      }
    }
  }

  /**
   * Get state tab content
   * Requirements: 26.2
   * @returns {Object} State content
   */
  getStateContent() {
    if (stryMutAct_9fa48("41565")) {
      {}
    } else {
      stryCov_9fa48("41565");
      if (stryMutAct_9fa48("41568") ? false : stryMutAct_9fa48("41567") ? true : stryMutAct_9fa48("41566") ? this.stateManager : (stryCov_9fa48("41566", "41567", "41568"), !this.stateManager)) {
        if (stryMutAct_9fa48("41569")) {
          {}
        } else {
          stryCov_9fa48("41569");
          return stryMutAct_9fa48("41570") ? {} : (stryCov_9fa48("41570"), {
            type: stryMutAct_9fa48("41571") ? "" : (stryCov_9fa48("41571"), 'state'),
            state: null,
            snapshots: stryMutAct_9fa48("41572") ? ["Stryker was here"] : (stryCov_9fa48("41572"), []),
            error: stryMutAct_9fa48("41573") ? "" : (stryCov_9fa48("41573"), 'StateManager not available')
          });
        }
      }
      const state = this.stateManager.getState();
      const snapshots = this.stateManager.getSnapshots();
      return stryMutAct_9fa48("41574") ? {} : (stryCov_9fa48("41574"), {
        type: stryMutAct_9fa48("41575") ? "" : (stryCov_9fa48("41575"), 'state'),
        state,
        snapshots,
        stateTree: this.formatStateTree(state)
      });
    }
  }

  /**
   * Format state as a tree structure
   * Requirements: 26.2
   * @param {Object} obj - Object to format
   * @param {number} [indent=0] - Current indentation level
   * @returns {string} Formatted tree string
   */
  formatStateTree(obj, indent = 0) {
    if (stryMutAct_9fa48("41576")) {
      {}
    } else {
      stryCov_9fa48("41576");
      if (stryMutAct_9fa48("41579") ? obj === null && obj === undefined : stryMutAct_9fa48("41578") ? false : stryMutAct_9fa48("41577") ? true : (stryCov_9fa48("41577", "41578", "41579"), (stryMutAct_9fa48("41581") ? obj !== null : stryMutAct_9fa48("41580") ? false : (stryCov_9fa48("41580", "41581"), obj === null)) || (stryMutAct_9fa48("41583") ? obj !== undefined : stryMutAct_9fa48("41582") ? false : (stryCov_9fa48("41582", "41583"), obj === undefined)))) {
        if (stryMutAct_9fa48("41584")) {
          {}
        } else {
          stryCov_9fa48("41584");
          return stryMutAct_9fa48("41585") ? "" : (stryCov_9fa48("41585"), 'null');
        }
      }
      const spaces = (stryMutAct_9fa48("41586") ? "" : (stryCov_9fa48("41586"), '  ')).repeat(indent);
      const lines = stryMutAct_9fa48("41587") ? ["Stryker was here"] : (stryCov_9fa48("41587"), []);
      if (stryMutAct_9fa48("41590") ? typeof obj === 'object' : stryMutAct_9fa48("41589") ? false : stryMutAct_9fa48("41588") ? true : (stryCov_9fa48("41588", "41589", "41590"), typeof obj !== (stryMutAct_9fa48("41591") ? "" : (stryCov_9fa48("41591"), 'object')))) {
        if (stryMutAct_9fa48("41592")) {
          {}
        } else {
          stryCov_9fa48("41592");
          return String(obj);
        }
      }
      if (stryMutAct_9fa48("41594") ? false : stryMutAct_9fa48("41593") ? true : (stryCov_9fa48("41593", "41594"), Array.isArray(obj))) {
        if (stryMutAct_9fa48("41595")) {
          {}
        } else {
          stryCov_9fa48("41595");
          if (stryMutAct_9fa48("41598") ? obj.length !== 0 : stryMutAct_9fa48("41597") ? false : stryMutAct_9fa48("41596") ? true : (stryCov_9fa48("41596", "41597", "41598"), obj.length === 0)) {
            if (stryMutAct_9fa48("41599")) {
              {}
            } else {
              stryCov_9fa48("41599");
              return stryMutAct_9fa48("41600") ? "" : (stryCov_9fa48("41600"), '[]');
            }
          }
          lines.push(stryMutAct_9fa48("41601") ? `` : (stryCov_9fa48("41601"), `Array(${obj.length})`));
          // Show first few items
          const preview = stryMutAct_9fa48("41602") ? obj : (stryCov_9fa48("41602"), obj.slice(0, 3));
          for (let i = 0; stryMutAct_9fa48("41605") ? i >= preview.length : stryMutAct_9fa48("41604") ? i <= preview.length : stryMutAct_9fa48("41603") ? false : (stryCov_9fa48("41603", "41604", "41605"), i < preview.length); stryMutAct_9fa48("41606") ? i-- : (stryCov_9fa48("41606"), i++)) {
            if (stryMutAct_9fa48("41607")) {
              {}
            } else {
              stryCov_9fa48("41607");
              const value = this.formatValue(preview[i]);
              lines.push(stryMutAct_9fa48("41608") ? `` : (stryCov_9fa48("41608"), `${spaces}  [${i}]: ${value}`));
            }
          }
          if (stryMutAct_9fa48("41612") ? obj.length <= 3 : stryMutAct_9fa48("41611") ? obj.length >= 3 : stryMutAct_9fa48("41610") ? false : stryMutAct_9fa48("41609") ? true : (stryCov_9fa48("41609", "41610", "41611", "41612"), obj.length > 3)) {
            if (stryMutAct_9fa48("41613")) {
              {}
            } else {
              stryCov_9fa48("41613");
              lines.push(stryMutAct_9fa48("41614") ? `` : (stryCov_9fa48("41614"), `${spaces}  ... ${stryMutAct_9fa48("41615") ? obj.length + 3 : (stryCov_9fa48("41615"), obj.length - 3)} more items`));
            }
          }
          return lines.join(stryMutAct_9fa48("41616") ? "" : (stryCov_9fa48("41616"), '\n'));
        }
      }
      const entries = Object.entries(obj);
      for (const [key, value] of entries) {
        if (stryMutAct_9fa48("41617")) {
          {}
        } else {
          stryCov_9fa48("41617");
          if (stryMutAct_9fa48("41620") ? value && typeof value === 'object' || !Array.isArray(value) : stryMutAct_9fa48("41619") ? false : stryMutAct_9fa48("41618") ? true : (stryCov_9fa48("41618", "41619", "41620"), (stryMutAct_9fa48("41622") ? value || typeof value === 'object' : stryMutAct_9fa48("41621") ? true : (stryCov_9fa48("41621", "41622"), value && (stryMutAct_9fa48("41624") ? typeof value !== 'object' : stryMutAct_9fa48("41623") ? true : (stryCov_9fa48("41623", "41624"), typeof value === (stryMutAct_9fa48("41625") ? "" : (stryCov_9fa48("41625"), 'object')))))) && (stryMutAct_9fa48("41626") ? Array.isArray(value) : (stryCov_9fa48("41626"), !Array.isArray(value))))) {
            if (stryMutAct_9fa48("41627")) {
              {}
            } else {
              stryCov_9fa48("41627");
              lines.push(stryMutAct_9fa48("41628") ? `` : (stryCov_9fa48("41628"), `${spaces}${key}:`));
              lines.push(this.formatStateTree(value, stryMutAct_9fa48("41629") ? indent - 1 : (stryCov_9fa48("41629"), indent + 1)));
            }
          } else {
            if (stryMutAct_9fa48("41630")) {
              {}
            } else {
              stryCov_9fa48("41630");
              const formattedValue = this.formatValue(value);
              lines.push(stryMutAct_9fa48("41631") ? `` : (stryCov_9fa48("41631"), `${spaces}${key}: ${formattedValue}`));
            }
          }
        }
      }
      return lines.join(stryMutAct_9fa48("41632") ? "" : (stryCov_9fa48("41632"), '\n'));
    }
  }

  /**
   * Format a single value for display
   * @param {*} value - Value to format
   * @returns {string} Formatted value
   */
  formatValue(value) {
    if (stryMutAct_9fa48("41633")) {
      {}
    } else {
      stryCov_9fa48("41633");
      if (stryMutAct_9fa48("41636") ? value !== null : stryMutAct_9fa48("41635") ? false : stryMutAct_9fa48("41634") ? true : (stryCov_9fa48("41634", "41635", "41636"), value === null)) return stryMutAct_9fa48("41637") ? "" : (stryCov_9fa48("41637"), 'null');
      if (stryMutAct_9fa48("41640") ? value !== undefined : stryMutAct_9fa48("41639") ? false : stryMutAct_9fa48("41638") ? true : (stryCov_9fa48("41638", "41639", "41640"), value === undefined)) return stryMutAct_9fa48("41641") ? "" : (stryCov_9fa48("41641"), 'undefined');
      if (stryMutAct_9fa48("41644") ? typeof value !== 'string' : stryMutAct_9fa48("41643") ? false : stryMutAct_9fa48("41642") ? true : (stryCov_9fa48("41642", "41643", "41644"), typeof value === (stryMutAct_9fa48("41645") ? "" : (stryCov_9fa48("41645"), 'string')))) {
        if (stryMutAct_9fa48("41646")) {
          {}
        } else {
          stryCov_9fa48("41646");
          return (stryMutAct_9fa48("41650") ? value.length <= 50 : stryMutAct_9fa48("41649") ? value.length >= 50 : stryMutAct_9fa48("41648") ? false : stryMutAct_9fa48("41647") ? true : (stryCov_9fa48("41647", "41648", "41649", "41650"), value.length > 50)) ? stryMutAct_9fa48("41651") ? `` : (stryCov_9fa48("41651"), `"${stryMutAct_9fa48("41652") ? value : (stryCov_9fa48("41652"), value.substring(0, 47))}..."`) : stryMutAct_9fa48("41653") ? `` : (stryCov_9fa48("41653"), `"${value}"`);
        }
      }
      if (stryMutAct_9fa48("41656") ? typeof value === 'number' && typeof value === 'boolean' : stryMutAct_9fa48("41655") ? false : stryMutAct_9fa48("41654") ? true : (stryCov_9fa48("41654", "41655", "41656"), (stryMutAct_9fa48("41658") ? typeof value !== 'number' : stryMutAct_9fa48("41657") ? false : (stryCov_9fa48("41657", "41658"), typeof value === (stryMutAct_9fa48("41659") ? "" : (stryCov_9fa48("41659"), 'number')))) || (stryMutAct_9fa48("41661") ? typeof value !== 'boolean' : stryMutAct_9fa48("41660") ? false : (stryCov_9fa48("41660", "41661"), typeof value === (stryMutAct_9fa48("41662") ? "" : (stryCov_9fa48("41662"), 'boolean')))))) {
        if (stryMutAct_9fa48("41663")) {
          {}
        } else {
          stryCov_9fa48("41663");
          return String(value);
        }
      }
      if (stryMutAct_9fa48("41665") ? false : stryMutAct_9fa48("41664") ? true : (stryCov_9fa48("41664", "41665"), Array.isArray(value))) {
        if (stryMutAct_9fa48("41666")) {
          {}
        } else {
          stryCov_9fa48("41666");
          return stryMutAct_9fa48("41667") ? `` : (stryCov_9fa48("41667"), `Array(${value.length})`);
        }
      }
      if (stryMutAct_9fa48("41670") ? typeof value !== 'object' : stryMutAct_9fa48("41669") ? false : stryMutAct_9fa48("41668") ? true : (stryCov_9fa48("41668", "41669", "41670"), typeof value === (stryMutAct_9fa48("41671") ? "" : (stryCov_9fa48("41671"), 'object')))) {
        if (stryMutAct_9fa48("41672")) {
          {}
        } else {
          stryCov_9fa48("41672");
          return stryMutAct_9fa48("41673") ? `` : (stryCov_9fa48("41673"), `Object(${Object.keys(value).length} keys)`);
        }
      }
      return String(value);
    }
  }

  /**
   * Get events tab content
   * Requirements: 26.3
   * @returns {Object} Events content
   */
  getEventsContent() {
    if (stryMutAct_9fa48("41674")) {
      {}
    } else {
      stryCov_9fa48("41674");
      if (stryMutAct_9fa48("41677") ? false : stryMutAct_9fa48("41676") ? true : stryMutAct_9fa48("41675") ? this.eventBus : (stryCov_9fa48("41675", "41676", "41677"), !this.eventBus)) {
        if (stryMutAct_9fa48("41678")) {
          {}
        } else {
          stryCov_9fa48("41678");
          return stryMutAct_9fa48("41679") ? {} : (stryCov_9fa48("41679"), {
            type: stryMutAct_9fa48("41680") ? "" : (stryCov_9fa48("41680"), 'events'),
            events: stryMutAct_9fa48("41681") ? ["Stryker was here"] : (stryCov_9fa48("41681"), []),
            error: stryMutAct_9fa48("41682") ? "" : (stryCov_9fa48("41682"), 'EventBus not available')
          });
        }
      }
      const eventLog = this.eventBus.getEventLog();
      const recentEvents = stryMutAct_9fa48("41684") ? eventLog.reverse() : stryMutAct_9fa48("41683") ? eventLog.slice(-50) : (stryCov_9fa48("41683", "41684"), eventLog.slice(stryMutAct_9fa48("41685") ? +50 : (stryCov_9fa48("41685"), -50)).reverse());
      return stryMutAct_9fa48("41686") ? {} : (stryCov_9fa48("41686"), {
        type: stryMutAct_9fa48("41687") ? "" : (stryCov_9fa48("41687"), 'events'),
        events: recentEvents.map(stryMutAct_9fa48("41688") ? () => undefined : (stryCov_9fa48("41688"), event => stryMutAct_9fa48("41689") ? {} : (stryCov_9fa48("41689"), {
          timestamp: event.timestamp,
          time: this.formatTimestamp(event.timestamp),
          type: event.type,
          event: stryMutAct_9fa48("41692") ? event.event && event.type : stryMutAct_9fa48("41691") ? false : stryMutAct_9fa48("41690") ? true : (stryCov_9fa48("41690", "41691", "41692"), event.event || event.type),
          data: event.data,
          dataPreview: this.formatDataPreview(event.data)
        }))),
        totalCount: eventLog.length
      });
    }
  }

  /**
   * Format timestamp for display
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Formatted time
   */
  formatTimestamp(timestamp) {
    if (stryMutAct_9fa48("41693")) {
      {}
    } else {
      stryCov_9fa48("41693");
      const date = new Date(timestamp);
      return stryMutAct_9fa48("41694") ? date.toISOString() : (stryCov_9fa48("41694"), date.toISOString().substring(11, 23)); // HH:mm:ss.SSS
    }
  }

  /**
   * Format data preview for display
   * @param {*} data - Data to preview
   * @returns {string} Preview string
   */
  formatDataPreview(data) {
    if (stryMutAct_9fa48("41695")) {
      {}
    } else {
      stryCov_9fa48("41695");
      if (stryMutAct_9fa48("41698") ? data === undefined && data === null : stryMutAct_9fa48("41697") ? false : stryMutAct_9fa48("41696") ? true : (stryCov_9fa48("41696", "41697", "41698"), (stryMutAct_9fa48("41700") ? data !== undefined : stryMutAct_9fa48("41699") ? false : (stryCov_9fa48("41699", "41700"), data === undefined)) || (stryMutAct_9fa48("41702") ? data !== null : stryMutAct_9fa48("41701") ? false : (stryCov_9fa48("41701", "41702"), data === null)))) {
        if (stryMutAct_9fa48("41703")) {
          {}
        } else {
          stryCov_9fa48("41703");
          return stryMutAct_9fa48("41704") ? "Stryker was here!" : (stryCov_9fa48("41704"), '');
        }
      }
      const str = JSON.stringify(data);
      return (stryMutAct_9fa48("41708") ? str.length <= 80 : stryMutAct_9fa48("41707") ? str.length >= 80 : stryMutAct_9fa48("41706") ? false : stryMutAct_9fa48("41705") ? true : (stryCov_9fa48("41705", "41706", "41707", "41708"), str.length > 80)) ? (stryMutAct_9fa48("41709") ? str : (stryCov_9fa48("41709"), str.substring(0, 77))) + (stryMutAct_9fa48("41710") ? "" : (stryCov_9fa48("41710"), '...')) : str;
    }
  }

  /**
   * Get components tab content
   * Requirements: 26.4
   * @returns {Object} Components content
   */
  getComponentsContent() {
    if (stryMutAct_9fa48("41711")) {
      {}
    } else {
      stryCov_9fa48("41711");
      if (stryMutAct_9fa48("41714") ? false : stryMutAct_9fa48("41713") ? true : stryMutAct_9fa48("41712") ? this.componentRegistry : (stryCov_9fa48("41712", "41713", "41714"), !this.componentRegistry)) {
        if (stryMutAct_9fa48("41715")) {
          {}
        } else {
          stryCov_9fa48("41715");
          return stryMutAct_9fa48("41716") ? {} : (stryCov_9fa48("41716"), {
            type: stryMutAct_9fa48("41717") ? "" : (stryCov_9fa48("41717"), 'components'),
            components: stryMutAct_9fa48("41718") ? ["Stryker was here"] : (stryCov_9fa48("41718"), []),
            dependencyGraph: {},
            initOrder: stryMutAct_9fa48("41719") ? ["Stryker was here"] : (stryCov_9fa48("41719"), []),
            error: stryMutAct_9fa48("41720") ? "" : (stryCov_9fa48("41720"), 'ComponentRegistry not available')
          });
        }
      }
      const componentNames = this.componentRegistry.getComponentNames();
      const dependencyGraph = this.componentRegistry.getDependencyGraph();
      const initOrder = this.componentRegistry.getInitializationOrder();
      return stryMutAct_9fa48("41721") ? {} : (stryCov_9fa48("41721"), {
        type: stryMutAct_9fa48("41722") ? "" : (stryCov_9fa48("41722"), 'components'),
        components: componentNames,
        dependencyGraph,
        initOrder,
        componentCount: componentNames.length
      });
    }
  }

  /**
   * Get CDC stream tab content
   * Requirements: 26.5
   * @returns {Object} CDC content
   */
  getCDCContent() {
    if (stryMutAct_9fa48("41723")) {
      {}
    } else {
      stryCov_9fa48("41723");
      let filteredEvents = this.cdcEvents;

      // Apply filter if set
      if (stryMutAct_9fa48("41725") ? false : stryMutAct_9fa48("41724") ? true : (stryCov_9fa48("41724", "41725"), this.cdcFilter)) {
        if (stryMutAct_9fa48("41726")) {
          {}
        } else {
          stryCov_9fa48("41726");
          const filter = stryMutAct_9fa48("41727") ? this.cdcFilter.toUpperCase() : (stryCov_9fa48("41727"), this.cdcFilter.toLowerCase());
          filteredEvents = stryMutAct_9fa48("41728") ? this.cdcEvents : (stryCov_9fa48("41728"), this.cdcEvents.filter(stryMutAct_9fa48("41729") ? () => undefined : (stryCov_9fa48("41729"), event => stryMutAct_9fa48("41732") ? (event.table.toLowerCase().includes(filter) || event.operation.toLowerCase().includes(filter)) && event.key.toLowerCase().includes(filter) : stryMutAct_9fa48("41731") ? false : stryMutAct_9fa48("41730") ? true : (stryCov_9fa48("41730", "41731", "41732"), (stryMutAct_9fa48("41734") ? event.table.toLowerCase().includes(filter) && event.operation.toLowerCase().includes(filter) : stryMutAct_9fa48("41733") ? false : (stryCov_9fa48("41733", "41734"), (stryMutAct_9fa48("41735") ? event.table.toUpperCase().includes(filter) : (stryCov_9fa48("41735"), event.table.toLowerCase().includes(filter))) || (stryMutAct_9fa48("41736") ? event.operation.toUpperCase().includes(filter) : (stryCov_9fa48("41736"), event.operation.toLowerCase().includes(filter))))) || (stryMutAct_9fa48("41737") ? event.key.toUpperCase().includes(filter) : (stryCov_9fa48("41737"), event.key.toLowerCase().includes(filter)))))));
        }
      }
      return stryMutAct_9fa48("41738") ? {} : (stryCov_9fa48("41738"), {
        type: stryMutAct_9fa48("41739") ? "" : (stryCov_9fa48("41739"), 'cdc'),
        events: stryMutAct_9fa48("41741") ? filteredEvents.reverse() : stryMutAct_9fa48("41740") ? filteredEvents.slice(-50) : (stryCov_9fa48("41740", "41741"), filteredEvents.slice(stryMutAct_9fa48("41742") ? +50 : (stryCov_9fa48("41742"), -50)).reverse()),
        totalCount: this.cdcEvents.length,
        filteredCount: filteredEvents.length,
        filter: this.cdcFilter
      });
    }
  }

  /**
   * Set CDC event filter
   * Requirements: 26.5
   * @param {string} filter - Filter string
   */
  setCDCFilter(filter) {
    if (stryMutAct_9fa48("41743")) {
      {}
    } else {
      stryCov_9fa48("41743");
      this.cdcFilter = filter;
    }
  }

  /**
   * Track a CDC event
   * @param {CDCEventEntry} event - CDC event to track
   */
  trackCDCEvent(event) {
    if (stryMutAct_9fa48("41744")) {
      {}
    } else {
      stryCov_9fa48("41744");
      this.cdcEvents.push(event);

      // Trim old events
      if (stryMutAct_9fa48("41748") ? this.cdcEvents.length <= this.maxCDCEvents : stryMutAct_9fa48("41747") ? this.cdcEvents.length >= this.maxCDCEvents : stryMutAct_9fa48("41746") ? false : stryMutAct_9fa48("41745") ? true : (stryCov_9fa48("41745", "41746", "41747", "41748"), this.cdcEvents.length > this.maxCDCEvents)) {
        if (stryMutAct_9fa48("41749")) {
          {}
        } else {
          stryCov_9fa48("41749");
          this.cdcEvents = stryMutAct_9fa48("41750") ? this.cdcEvents : (stryCov_9fa48("41750"), this.cdcEvents.slice(stryMutAct_9fa48("41751") ? +this.maxCDCEvents : (stryCov_9fa48("41751"), -this.maxCDCEvents)));
        }
      }
    }
  }

  /**
   * Get performance tab content
   * Requirements: 26.8
   * @returns {Object} Performance content
   */
  getPerformanceContent() {
    if (stryMutAct_9fa48("41752")) {
      {}
    } else {
      stryCov_9fa48("41752");
      const renderStats = this.calculateStats(this.metrics.renderTimes);
      const latencyStats = this.calculateStats(this.metrics.eventLatencies);
      return stryMutAct_9fa48("41753") ? {} : (stryCov_9fa48("41753"), {
        type: stryMutAct_9fa48("41754") ? "" : (stryCov_9fa48("41754"), 'performance'),
        render: stryMutAct_9fa48("41755") ? {} : (stryCov_9fa48("41755"), {
          samples: this.metrics.renderTimes.length,
          avg: renderStats.avg,
          min: renderStats.min,
          max: renderStats.max,
          recent: stryMutAct_9fa48("41756") ? this.metrics.renderTimes : (stryCov_9fa48("41756"), this.metrics.renderTimes.slice(stryMutAct_9fa48("41757") ? +10 : (stryCov_9fa48("41757"), -10)))
        }),
        eventLatency: stryMutAct_9fa48("41758") ? {} : (stryCov_9fa48("41758"), {
          samples: this.metrics.eventLatencies.length,
          avg: latencyStats.avg,
          min: latencyStats.min,
          max: latencyStats.max,
          recent: stryMutAct_9fa48("41759") ? this.metrics.eventLatencies : (stryCov_9fa48("41759"), this.metrics.eventLatencies.slice(stryMutAct_9fa48("41760") ? +10 : (stryCov_9fa48("41760"), -10)))
        })
      });
    }
  }

  /**
   * Calculate statistics for an array of numbers
   * @param {number[]} values - Values to analyze
   * @returns {Object} Statistics
   */
  calculateStats(values) {
    if (stryMutAct_9fa48("41761")) {
      {}
    } else {
      stryCov_9fa48("41761");
      if (stryMutAct_9fa48("41764") ? values.length !== 0 : stryMutAct_9fa48("41763") ? false : stryMutAct_9fa48("41762") ? true : (stryCov_9fa48("41762", "41763", "41764"), values.length === 0)) {
        if (stryMutAct_9fa48("41765")) {
          {}
        } else {
          stryCov_9fa48("41765");
          return stryMutAct_9fa48("41766") ? {} : (stryCov_9fa48("41766"), {
            avg: 0,
            min: 0,
            max: 0
          });
        }
      }
      const sum = values.reduce(stryMutAct_9fa48("41767") ? () => undefined : (stryCov_9fa48("41767"), (a, b) => stryMutAct_9fa48("41768") ? a - b : (stryCov_9fa48("41768"), a + b)), 0);
      return stryMutAct_9fa48("41769") ? {} : (stryCov_9fa48("41769"), {
        avg: stryMutAct_9fa48("41770") ? Math.round(sum / values.length * 100) * 100 : (stryCov_9fa48("41770"), Math.round(stryMutAct_9fa48("41771") ? sum / values.length / 100 : (stryCov_9fa48("41771"), (stryMutAct_9fa48("41772") ? sum * values.length : (stryCov_9fa48("41772"), sum / values.length)) * 100)) / 100),
        min: stryMutAct_9fa48("41773") ? Math.max(...values) : (stryCov_9fa48("41773"), Math.min(...values)),
        max: stryMutAct_9fa48("41774") ? Math.min(...values) : (stryCov_9fa48("41774"), Math.max(...values))
      });
    }
  }

  /**
   * Track render time
   * Requirements: 26.8
   * @param {number} duration - Render duration in ms
   */
  trackRenderTime(duration) {
    if (stryMutAct_9fa48("41775")) {
      {}
    } else {
      stryCov_9fa48("41775");
      this.metrics.renderTimes.push(duration);
      if (stryMutAct_9fa48("41779") ? this.metrics.renderTimes.length <= this.metrics.maxSamples : stryMutAct_9fa48("41778") ? this.metrics.renderTimes.length >= this.metrics.maxSamples : stryMutAct_9fa48("41777") ? false : stryMutAct_9fa48("41776") ? true : (stryCov_9fa48("41776", "41777", "41778", "41779"), this.metrics.renderTimes.length > this.metrics.maxSamples)) {
        if (stryMutAct_9fa48("41780")) {
          {}
        } else {
          stryCov_9fa48("41780");
          this.metrics.renderTimes.shift();
        }
      }
    }
  }

  /**
   * Track event latency
   * Requirements: 26.8
   * @param {number} latency - Event latency in ms
   */
  trackEventLatency(latency) {
    if (stryMutAct_9fa48("41781")) {
      {}
    } else {
      stryCov_9fa48("41781");
      // Only track reasonable latencies (filter out initial/invalid values)
      if (stryMutAct_9fa48("41784") ? latency >= 0 || latency < 10000 : stryMutAct_9fa48("41783") ? false : stryMutAct_9fa48("41782") ? true : (stryCov_9fa48("41782", "41783", "41784"), (stryMutAct_9fa48("41787") ? latency < 0 : stryMutAct_9fa48("41786") ? latency > 0 : stryMutAct_9fa48("41785") ? true : (stryCov_9fa48("41785", "41786", "41787"), latency >= 0)) && (stryMutAct_9fa48("41790") ? latency >= 10000 : stryMutAct_9fa48("41789") ? latency <= 10000 : stryMutAct_9fa48("41788") ? true : (stryCov_9fa48("41788", "41789", "41790"), latency < 10000)))) {
        if (stryMutAct_9fa48("41791")) {
          {}
        } else {
          stryCov_9fa48("41791");
          this.metrics.eventLatencies.push(latency);
          if (stryMutAct_9fa48("41795") ? this.metrics.eventLatencies.length <= this.metrics.maxSamples : stryMutAct_9fa48("41794") ? this.metrics.eventLatencies.length >= this.metrics.maxSamples : stryMutAct_9fa48("41793") ? false : stryMutAct_9fa48("41792") ? true : (stryCov_9fa48("41792", "41793", "41794", "41795"), this.metrics.eventLatencies.length > this.metrics.maxSamples)) {
            if (stryMutAct_9fa48("41796")) {
              {}
            } else {
              stryCov_9fa48("41796");
              this.metrics.eventLatencies.shift();
            }
          }
        }
      }
    }
  }

  /**
   * Create a state snapshot
   * Requirements: 26.6
   * @param {string} [name] - Optional snapshot name
   * @returns {number|null} Snapshot index or null if failed
   */
  createSnapshot(name) {
    if (stryMutAct_9fa48("41797")) {
      {}
    } else {
      stryCov_9fa48("41797");
      if (stryMutAct_9fa48("41800") ? false : stryMutAct_9fa48("41799") ? true : stryMutAct_9fa48("41798") ? this.stateManager : (stryCov_9fa48("41798", "41799", "41800"), !this.stateManager)) return null;
      const index = this.stateManager.createSnapshot(name);
      if (stryMutAct_9fa48("41802") ? false : stryMutAct_9fa48("41801") ? true : (stryCov_9fa48("41801", "41802"), this.eventBus)) {
        if (stryMutAct_9fa48("41803")) {
          {}
        } else {
          stryCov_9fa48("41803");
          this.eventBus.emit(stryMutAct_9fa48("41804") ? "" : (stryCov_9fa48("41804"), 'devtools:snapshotCreated'), stryMutAct_9fa48("41805") ? {} : (stryCov_9fa48("41805"), {
            index,
            name: stryMutAct_9fa48("41808") ? name && `snapshot_${index}` : stryMutAct_9fa48("41807") ? false : stryMutAct_9fa48("41806") ? true : (stryCov_9fa48("41806", "41807", "41808"), name || (stryMutAct_9fa48("41809") ? `` : (stryCov_9fa48("41809"), `snapshot_${index}`)))
          }));
        }
      }
      return index;
    }
  }

  /**
   * Restore a state snapshot
   * Requirements: 26.6
   * @param {number} index - Snapshot index
   * @returns {boolean} Whether restoration succeeded
   */
  restoreSnapshot(index) {
    if (stryMutAct_9fa48("41810")) {
      {}
    } else {
      stryCov_9fa48("41810");
      if (stryMutAct_9fa48("41813") ? false : stryMutAct_9fa48("41812") ? true : stryMutAct_9fa48("41811") ? this.stateManager : (stryCov_9fa48("41811", "41812", "41813"), !this.stateManager)) return stryMutAct_9fa48("41814") ? true : (stryCov_9fa48("41814"), false);
      try {
        if (stryMutAct_9fa48("41815")) {
          {}
        } else {
          stryCov_9fa48("41815");
          this.stateManager.restoreSnapshot(index);
          if (stryMutAct_9fa48("41817") ? false : stryMutAct_9fa48("41816") ? true : (stryCov_9fa48("41816", "41817"), this.eventBus)) {
            if (stryMutAct_9fa48("41818")) {
              {}
            } else {
              stryCov_9fa48("41818");
              this.eventBus.emit(stryMutAct_9fa48("41819") ? "" : (stryCov_9fa48("41819"), 'devtools:snapshotRestored'), stryMutAct_9fa48("41820") ? {} : (stryCov_9fa48("41820"), {
                index
              }));
            }
          }
          return stryMutAct_9fa48("41821") ? false : (stryCov_9fa48("41821"), true);
        }
      } catch {
        if (stryMutAct_9fa48("41822")) {
          {}
        } else {
          stryCov_9fa48("41822");
          return stryMutAct_9fa48("41823") ? true : (stryCov_9fa48("41823"), false);
        }
      }
    }
  }

  /**
   * Get all snapshots
   * Requirements: 26.6
   * @returns {Array<{name: string, timestamp: number}>}
   */
  getSnapshots() {
    if (stryMutAct_9fa48("41824")) {
      {}
    } else {
      stryCov_9fa48("41824");
      if (stryMutAct_9fa48("41827") ? false : stryMutAct_9fa48("41826") ? true : stryMutAct_9fa48("41825") ? this.stateManager : (stryCov_9fa48("41825", "41826", "41827"), !this.stateManager)) return stryMutAct_9fa48("41828") ? ["Stryker was here"] : (stryCov_9fa48("41828"), []);
      return this.stateManager.getSnapshots();
    }
  }

  /**
   * Get performance metrics
   * @returns {PerformanceMetrics}
   */
  getMetrics() {
    if (stryMutAct_9fa48("41829")) {
      {}
    } else {
      stryCov_9fa48("41829");
      return stryMutAct_9fa48("41830") ? {} : (stryCov_9fa48("41830"), {
        ...this.metrics,
        renderTimes: stryMutAct_9fa48("41831") ? [] : (stryCov_9fa48("41831"), [...this.metrics.renderTimes]),
        eventLatencies: stryMutAct_9fa48("41832") ? [] : (stryCov_9fa48("41832"), [...this.metrics.eventLatencies])
      });
    }
  }

  /**
   * Reset performance metrics
   */
  resetMetrics() {
    if (stryMutAct_9fa48("41833")) {
      {}
    } else {
      stryCov_9fa48("41833");
      this.metrics.renderTimes = stryMutAct_9fa48("41834") ? ["Stryker was here"] : (stryCov_9fa48("41834"), []);
      this.metrics.eventLatencies = stryMutAct_9fa48("41835") ? ["Stryker was here"] : (stryCov_9fa48("41835"), []);
    }
  }

  /**
   * Clear CDC event history
   */
  clearCDCEvents() {
    if (stryMutAct_9fa48("41836")) {
      {}
    } else {
      stryCov_9fa48("41836");
      this.cdcEvents = stryMutAct_9fa48("41837") ? ["Stryker was here"] : (stryCov_9fa48("41837"), []);
    }
  }

  /**
   * Handle keyboard input
   * @param {Object} key - Key event
   * @returns {boolean} Whether key was handled
   */
  handleKey(key) {
    if (stryMutAct_9fa48("41838")) {
      {}
    } else {
      stryCov_9fa48("41838");
      if (stryMutAct_9fa48("41841") ? false : stryMutAct_9fa48("41840") ? true : stryMutAct_9fa48("41839") ? this.visible : (stryCov_9fa48("41839", "41840", "41841"), !this.visible)) return stryMutAct_9fa48("41842") ? true : (stryCov_9fa48("41842"), false);

      // Tab switching with number keys
      if (stryMutAct_9fa48("41845") ? key.name === '1' && key.ch === '1' : stryMutAct_9fa48("41844") ? false : stryMutAct_9fa48("41843") ? true : (stryCov_9fa48("41843", "41844", "41845"), (stryMutAct_9fa48("41847") ? key.name !== '1' : stryMutAct_9fa48("41846") ? false : (stryCov_9fa48("41846", "41847"), key.name === (stryMutAct_9fa48("41848") ? "" : (stryCov_9fa48("41848"), '1')))) || (stryMutAct_9fa48("41850") ? key.ch !== '1' : stryMutAct_9fa48("41849") ? false : (stryCov_9fa48("41849", "41850"), key.ch === (stryMutAct_9fa48("41851") ? "" : (stryCov_9fa48("41851"), '1')))))) {
        if (stryMutAct_9fa48("41852")) {
          {}
        } else {
          stryCov_9fa48("41852");
          this.switchTab(stryMutAct_9fa48("41853") ? "" : (stryCov_9fa48("41853"), 'state'));
          return stryMutAct_9fa48("41854") ? false : (stryCov_9fa48("41854"), true);
        }
      }
      if (stryMutAct_9fa48("41857") ? key.name === '2' && key.ch === '2' : stryMutAct_9fa48("41856") ? false : stryMutAct_9fa48("41855") ? true : (stryCov_9fa48("41855", "41856", "41857"), (stryMutAct_9fa48("41859") ? key.name !== '2' : stryMutAct_9fa48("41858") ? false : (stryCov_9fa48("41858", "41859"), key.name === (stryMutAct_9fa48("41860") ? "" : (stryCov_9fa48("41860"), '2')))) || (stryMutAct_9fa48("41862") ? key.ch !== '2' : stryMutAct_9fa48("41861") ? false : (stryCov_9fa48("41861", "41862"), key.ch === (stryMutAct_9fa48("41863") ? "" : (stryCov_9fa48("41863"), '2')))))) {
        if (stryMutAct_9fa48("41864")) {
          {}
        } else {
          stryCov_9fa48("41864");
          this.switchTab(stryMutAct_9fa48("41865") ? "" : (stryCov_9fa48("41865"), 'events'));
          return stryMutAct_9fa48("41866") ? false : (stryCov_9fa48("41866"), true);
        }
      }
      if (stryMutAct_9fa48("41869") ? key.name === '3' && key.ch === '3' : stryMutAct_9fa48("41868") ? false : stryMutAct_9fa48("41867") ? true : (stryCov_9fa48("41867", "41868", "41869"), (stryMutAct_9fa48("41871") ? key.name !== '3' : stryMutAct_9fa48("41870") ? false : (stryCov_9fa48("41870", "41871"), key.name === (stryMutAct_9fa48("41872") ? "" : (stryCov_9fa48("41872"), '3')))) || (stryMutAct_9fa48("41874") ? key.ch !== '3' : stryMutAct_9fa48("41873") ? false : (stryCov_9fa48("41873", "41874"), key.ch === (stryMutAct_9fa48("41875") ? "" : (stryCov_9fa48("41875"), '3')))))) {
        if (stryMutAct_9fa48("41876")) {
          {}
        } else {
          stryCov_9fa48("41876");
          this.switchTab(stryMutAct_9fa48("41877") ? "" : (stryCov_9fa48("41877"), 'components'));
          return stryMutAct_9fa48("41878") ? false : (stryCov_9fa48("41878"), true);
        }
      }
      if (stryMutAct_9fa48("41881") ? key.name === '4' && key.ch === '4' : stryMutAct_9fa48("41880") ? false : stryMutAct_9fa48("41879") ? true : (stryCov_9fa48("41879", "41880", "41881"), (stryMutAct_9fa48("41883") ? key.name !== '4' : stryMutAct_9fa48("41882") ? false : (stryCov_9fa48("41882", "41883"), key.name === (stryMutAct_9fa48("41884") ? "" : (stryCov_9fa48("41884"), '4')))) || (stryMutAct_9fa48("41886") ? key.ch !== '4' : stryMutAct_9fa48("41885") ? false : (stryCov_9fa48("41885", "41886"), key.ch === (stryMutAct_9fa48("41887") ? "" : (stryCov_9fa48("41887"), '4')))))) {
        if (stryMutAct_9fa48("41888")) {
          {}
        } else {
          stryCov_9fa48("41888");
          this.switchTab(stryMutAct_9fa48("41889") ? "" : (stryCov_9fa48("41889"), 'cdc'));
          return stryMutAct_9fa48("41890") ? false : (stryCov_9fa48("41890"), true);
        }
      }
      if (stryMutAct_9fa48("41893") ? key.name === '5' && key.ch === '5' : stryMutAct_9fa48("41892") ? false : stryMutAct_9fa48("41891") ? true : (stryCov_9fa48("41891", "41892", "41893"), (stryMutAct_9fa48("41895") ? key.name !== '5' : stryMutAct_9fa48("41894") ? false : (stryCov_9fa48("41894", "41895"), key.name === (stryMutAct_9fa48("41896") ? "" : (stryCov_9fa48("41896"), '5')))) || (stryMutAct_9fa48("41898") ? key.ch !== '5' : stryMutAct_9fa48("41897") ? false : (stryCov_9fa48("41897", "41898"), key.ch === (stryMutAct_9fa48("41899") ? "" : (stryCov_9fa48("41899"), '5')))))) {
        if (stryMutAct_9fa48("41900")) {
          {}
        } else {
          stryCov_9fa48("41900");
          this.switchTab(stryMutAct_9fa48("41901") ? "" : (stryCov_9fa48("41901"), 'performance'));
          return stryMutAct_9fa48("41902") ? false : (stryCov_9fa48("41902"), true);
        }
      }

      // Close with escape or q
      if (stryMutAct_9fa48("41905") ? (key.name === 'escape' || key.name === 'q') && key.ch === 'q' : stryMutAct_9fa48("41904") ? false : stryMutAct_9fa48("41903") ? true : (stryCov_9fa48("41903", "41904", "41905"), (stryMutAct_9fa48("41907") ? key.name === 'escape' && key.name === 'q' : stryMutAct_9fa48("41906") ? false : (stryCov_9fa48("41906", "41907"), (stryMutAct_9fa48("41909") ? key.name !== 'escape' : stryMutAct_9fa48("41908") ? false : (stryCov_9fa48("41908", "41909"), key.name === (stryMutAct_9fa48("41910") ? "" : (stryCov_9fa48("41910"), 'escape')))) || (stryMutAct_9fa48("41912") ? key.name !== 'q' : stryMutAct_9fa48("41911") ? false : (stryCov_9fa48("41911", "41912"), key.name === (stryMutAct_9fa48("41913") ? "" : (stryCov_9fa48("41913"), 'q')))))) || (stryMutAct_9fa48("41915") ? key.ch !== 'q' : stryMutAct_9fa48("41914") ? false : (stryCov_9fa48("41914", "41915"), key.ch === (stryMutAct_9fa48("41916") ? "" : (stryCov_9fa48("41916"), 'q')))))) {
        if (stryMutAct_9fa48("41917")) {
          {}
        } else {
          stryCov_9fa48("41917");
          this.hide();
          return stryMutAct_9fa48("41918") ? false : (stryCov_9fa48("41918"), true);
        }
      }

      // Create snapshot with 's'
      if (stryMutAct_9fa48("41921") ? key.name === 's' && key.ch === 's' : stryMutAct_9fa48("41920") ? false : stryMutAct_9fa48("41919") ? true : (stryCov_9fa48("41919", "41920", "41921"), (stryMutAct_9fa48("41923") ? key.name !== 's' : stryMutAct_9fa48("41922") ? false : (stryCov_9fa48("41922", "41923"), key.name === (stryMutAct_9fa48("41924") ? "" : (stryCov_9fa48("41924"), 's')))) || (stryMutAct_9fa48("41926") ? key.ch !== 's' : stryMutAct_9fa48("41925") ? false : (stryCov_9fa48("41925", "41926"), key.ch === (stryMutAct_9fa48("41927") ? "" : (stryCov_9fa48("41927"), 's')))))) {
        if (stryMutAct_9fa48("41928")) {
          {}
        } else {
          stryCov_9fa48("41928");
          this.createSnapshot();
          return stryMutAct_9fa48("41929") ? false : (stryCov_9fa48("41929"), true);
        }
      }

      // Clear metrics/events with 'c'
      if (stryMutAct_9fa48("41932") ? key.name === 'c' && key.ch === 'c' : stryMutAct_9fa48("41931") ? false : stryMutAct_9fa48("41930") ? true : (stryCov_9fa48("41930", "41931", "41932"), (stryMutAct_9fa48("41934") ? key.name !== 'c' : stryMutAct_9fa48("41933") ? false : (stryCov_9fa48("41933", "41934"), key.name === (stryMutAct_9fa48("41935") ? "" : (stryCov_9fa48("41935"), 'c')))) || (stryMutAct_9fa48("41937") ? key.ch !== 'c' : stryMutAct_9fa48("41936") ? false : (stryCov_9fa48("41936", "41937"), key.ch === (stryMutAct_9fa48("41938") ? "" : (stryCov_9fa48("41938"), 'c')))))) {
        if (stryMutAct_9fa48("41939")) {
          {}
        } else {
          stryCov_9fa48("41939");
          if (stryMutAct_9fa48("41942") ? this.currentTab !== 'performance' : stryMutAct_9fa48("41941") ? false : stryMutAct_9fa48("41940") ? true : (stryCov_9fa48("41940", "41941", "41942"), this.currentTab === (stryMutAct_9fa48("41943") ? "" : (stryCov_9fa48("41943"), 'performance')))) {
            if (stryMutAct_9fa48("41944")) {
              {}
            } else {
              stryCov_9fa48("41944");
              this.resetMetrics();
            }
          } else if (stryMutAct_9fa48("41947") ? this.currentTab !== 'cdc' : stryMutAct_9fa48("41946") ? false : stryMutAct_9fa48("41945") ? true : (stryCov_9fa48("41945", "41946", "41947"), this.currentTab === (stryMutAct_9fa48("41948") ? "" : (stryCov_9fa48("41948"), 'cdc')))) {
            if (stryMutAct_9fa48("41949")) {
              {}
            } else {
              stryCov_9fa48("41949");
              this.clearCDCEvents();
            }
          }
          return stryMutAct_9fa48("41950") ? false : (stryCov_9fa48("41950"), true);
        }
      }
      return stryMutAct_9fa48("41951") ? true : (stryCov_9fa48("41951"), false);
    }
  }

  /**
   * Format content for text display
   * @returns {string} Formatted text content
   */
  formatTextContent() {
    if (stryMutAct_9fa48("41952")) {
      {}
    } else {
      stryCov_9fa48("41952");
      const lines = stryMutAct_9fa48("41953") ? ["Stryker was here"] : (stryCov_9fa48("41953"), []);
      const content = this.getTabContent();

      // Header
      lines.push(stryMutAct_9fa48("41954") ? "" : (stryCov_9fa48("41954"), '╔════════════════════════════════════════════════════════════╗'));
      lines.push(stryMutAct_9fa48("41955") ? "" : (stryCov_9fa48("41955"), '║                        DEV TOOLS                           ║'));
      lines.push(stryMutAct_9fa48("41956") ? "" : (stryCov_9fa48("41956"), '╚════════════════════════════════════════════════════════════╝'));
      lines.push(stryMutAct_9fa48("41957") ? "Stryker was here!" : (stryCov_9fa48("41957"), ''));

      // Tab bar
      const tabs = this.getTabs();
      const tabLine = tabs.map(stryMutAct_9fa48("41958") ? () => undefined : (stryCov_9fa48("41958"), t => (stryMutAct_9fa48("41961") ? t.id !== this.currentTab : stryMutAct_9fa48("41960") ? false : stryMutAct_9fa48("41959") ? true : (stryCov_9fa48("41959", "41960", "41961"), t.id === this.currentTab)) ? stryMutAct_9fa48("41962") ? `` : (stryCov_9fa48("41962"), `[${t.label}]`) : stryMutAct_9fa48("41963") ? `` : (stryCov_9fa48("41963"), ` ${t.label} `))).join(stryMutAct_9fa48("41964") ? "" : (stryCov_9fa48("41964"), ' '));
      lines.push(tabLine);
      lines.push((stryMutAct_9fa48("41965") ? "" : (stryCov_9fa48("41965"), '─')).repeat(60));
      lines.push(stryMutAct_9fa48("41966") ? "Stryker was here!" : (stryCov_9fa48("41966"), ''));

      // Content based on tab
      switch (content.type) {
        case stryMutAct_9fa48("41968") ? "" : (stryCov_9fa48("41968"), 'state'):
          if (stryMutAct_9fa48("41967")) {} else {
            stryCov_9fa48("41967");
            lines.push(stryMutAct_9fa48("41969") ? "" : (stryCov_9fa48("41969"), 'Current State:'));
            lines.push(stryMutAct_9fa48("41970") ? "Stryker was here!" : (stryCov_9fa48("41970"), ''));
            if (stryMutAct_9fa48("41972") ? false : stryMutAct_9fa48("41971") ? true : (stryCov_9fa48("41971", "41972"), content.stateTree)) {
              if (stryMutAct_9fa48("41973")) {
                {}
              } else {
                stryCov_9fa48("41973");
                lines.push(content.stateTree);
              }
            } else if (stryMutAct_9fa48("41975") ? false : stryMutAct_9fa48("41974") ? true : (stryCov_9fa48("41974", "41975"), content.error)) {
              if (stryMutAct_9fa48("41976")) {
                {}
              } else {
                stryCov_9fa48("41976");
                lines.push(stryMutAct_9fa48("41977") ? `` : (stryCov_9fa48("41977"), `Error: ${content.error}`));
              }
            }
            lines.push(stryMutAct_9fa48("41978") ? "Stryker was here!" : (stryCov_9fa48("41978"), ''));
            lines.push(stryMutAct_9fa48("41979") ? `` : (stryCov_9fa48("41979"), `Snapshots: ${stryMutAct_9fa48("41982") ? content.snapshots?.length && 0 : stryMutAct_9fa48("41981") ? false : stryMutAct_9fa48("41980") ? true : (stryCov_9fa48("41980", "41981", "41982"), (stryMutAct_9fa48("41983") ? content.snapshots.length : (stryCov_9fa48("41983"), content.snapshots?.length)) || 0)}`));
            break;
          }
        case stryMutAct_9fa48("41985") ? "" : (stryCov_9fa48("41985"), 'events'):
          if (stryMutAct_9fa48("41984")) {} else {
            stryCov_9fa48("41984");
            lines.push(stryMutAct_9fa48("41986") ? `` : (stryCov_9fa48("41986"), `Recent Events (${content.totalCount} total):`));
            lines.push(stryMutAct_9fa48("41987") ? "Stryker was here!" : (stryCov_9fa48("41987"), ''));
            for (const event of stryMutAct_9fa48("41988") ? content.events : (stryCov_9fa48("41988"), content.events.slice(0, 20))) {
              if (stryMutAct_9fa48("41989")) {
                {}
              } else {
                stryCov_9fa48("41989");
                lines.push(stryMutAct_9fa48("41990") ? `` : (stryCov_9fa48("41990"), `${event.time} ${stryMutAct_9fa48("41993") ? event.type && event.event : stryMutAct_9fa48("41992") ? false : stryMutAct_9fa48("41991") ? true : (stryCov_9fa48("41991", "41992", "41993"), event.type || event.event)}`));
                if (stryMutAct_9fa48("41995") ? false : stryMutAct_9fa48("41994") ? true : (stryCov_9fa48("41994", "41995"), event.dataPreview)) {
                  if (stryMutAct_9fa48("41996")) {
                    {}
                  } else {
                    stryCov_9fa48("41996");
                    lines.push(stryMutAct_9fa48("41997") ? `` : (stryCov_9fa48("41997"), `  ${event.dataPreview}`));
                  }
                }
              }
            }
            break;
          }
        case stryMutAct_9fa48("41999") ? "" : (stryCov_9fa48("41999"), 'components'):
          if (stryMutAct_9fa48("41998")) {} else {
            stryCov_9fa48("41998");
            lines.push(stryMutAct_9fa48("42000") ? `` : (stryCov_9fa48("42000"), `Components (${content.componentCount}):`));
            lines.push(stryMutAct_9fa48("42001") ? "Stryker was here!" : (stryCov_9fa48("42001"), ''));
            lines.push(stryMutAct_9fa48("42002") ? "" : (stryCov_9fa48("42002"), 'Initialization Order:'));
            for (const name of stryMutAct_9fa48("42005") ? content.initOrder && [] : stryMutAct_9fa48("42004") ? false : stryMutAct_9fa48("42003") ? true : (stryCov_9fa48("42003", "42004", "42005"), content.initOrder || (stryMutAct_9fa48("42006") ? ["Stryker was here"] : (stryCov_9fa48("42006"), [])))) {
              if (stryMutAct_9fa48("42007")) {
                {}
              } else {
                stryCov_9fa48("42007");
                const info = stryMutAct_9fa48("42008") ? content.dependencyGraph[name] : (stryCov_9fa48("42008"), content.dependencyGraph?.[name]);
                const deps = (stryMutAct_9fa48("42010") ? info.dependencies?.length : stryMutAct_9fa48("42009") ? info?.dependencies.length : (stryCov_9fa48("42009", "42010"), info?.dependencies?.length)) ? stryMutAct_9fa48("42011") ? `` : (stryCov_9fa48("42011"), ` → [${info.dependencies.join(stryMutAct_9fa48("42012") ? "" : (stryCov_9fa48("42012"), ', '))}]`) : stryMutAct_9fa48("42013") ? "Stryker was here!" : (stryCov_9fa48("42013"), '');
                lines.push(stryMutAct_9fa48("42014") ? `` : (stryCov_9fa48("42014"), `  ${name}${deps}`));
              }
            }
            break;
          }
        case stryMutAct_9fa48("42016") ? "" : (stryCov_9fa48("42016"), 'cdc'):
          if (stryMutAct_9fa48("42015")) {} else {
            stryCov_9fa48("42015");
            lines.push(stryMutAct_9fa48("42017") ? `` : (stryCov_9fa48("42017"), `CDC Events (${content.filteredCount}/${content.totalCount}):`));
            if (stryMutAct_9fa48("42019") ? false : stryMutAct_9fa48("42018") ? true : (stryCov_9fa48("42018", "42019"), content.filter)) {
              if (stryMutAct_9fa48("42020")) {
                {}
              } else {
                stryCov_9fa48("42020");
                lines.push(stryMutAct_9fa48("42021") ? `` : (stryCov_9fa48("42021"), `Filter: "${content.filter}"`));
              }
            }
            lines.push(stryMutAct_9fa48("42022") ? "Stryker was here!" : (stryCov_9fa48("42022"), ''));
            for (const event of stryMutAct_9fa48("42023") ? content.events : (stryCov_9fa48("42023"), content.events.slice(0, 20))) {
              if (stryMutAct_9fa48("42024")) {
                {}
              } else {
                stryCov_9fa48("42024");
                const time = this.formatTimestamp(event.timestamp);
                lines.push(stryMutAct_9fa48("42025") ? `` : (stryCov_9fa48("42025"), `${time} ${event.operation} ${event.table}:${event.key}`));
              }
            }
            break;
          }
        case stryMutAct_9fa48("42027") ? "" : (stryCov_9fa48("42027"), 'performance'):
          if (stryMutAct_9fa48("42026")) {} else {
            stryCov_9fa48("42026");
            lines.push(stryMutAct_9fa48("42028") ? "" : (stryCov_9fa48("42028"), 'Performance Metrics:'));
            lines.push(stryMutAct_9fa48("42029") ? "Stryker was here!" : (stryCov_9fa48("42029"), ''));
            lines.push(stryMutAct_9fa48("42030") ? "" : (stryCov_9fa48("42030"), 'Render Times:'));
            lines.push(stryMutAct_9fa48("42031") ? `` : (stryCov_9fa48("42031"), `  Samples: ${content.render.samples}`));
            lines.push(stryMutAct_9fa48("42032") ? `` : (stryCov_9fa48("42032"), `  Average: ${content.render.avg}ms`));
            lines.push(stryMutAct_9fa48("42033") ? `` : (stryCov_9fa48("42033"), `  Min: ${content.render.min}ms`));
            lines.push(stryMutAct_9fa48("42034") ? `` : (stryCov_9fa48("42034"), `  Max: ${content.render.max}ms`));
            lines.push(stryMutAct_9fa48("42035") ? "Stryker was here!" : (stryCov_9fa48("42035"), ''));
            lines.push(stryMutAct_9fa48("42036") ? "" : (stryCov_9fa48("42036"), 'Event Latency:'));
            lines.push(stryMutAct_9fa48("42037") ? `` : (stryCov_9fa48("42037"), `  Samples: ${content.eventLatency.samples}`));
            lines.push(stryMutAct_9fa48("42038") ? `` : (stryCov_9fa48("42038"), `  Average: ${content.eventLatency.avg}ms`));
            lines.push(stryMutAct_9fa48("42039") ? `` : (stryCov_9fa48("42039"), `  Min: ${content.eventLatency.min}ms`));
            lines.push(stryMutAct_9fa48("42040") ? `` : (stryCov_9fa48("42040"), `  Max: ${content.eventLatency.max}ms`));
            break;
          }
        default:
          if (stryMutAct_9fa48("42041")) {} else {
            stryCov_9fa48("42041");
            lines.push(stryMutAct_9fa48("42044") ? content.content && 'No content' : stryMutAct_9fa48("42043") ? false : stryMutAct_9fa48("42042") ? true : (stryCov_9fa48("42042", "42043", "42044"), content.content || (stryMutAct_9fa48("42045") ? "" : (stryCov_9fa48("42045"), 'No content'))));
          }
      }
      lines.push(stryMutAct_9fa48("42046") ? "Stryker was here!" : (stryCov_9fa48("42046"), ''));
      lines.push((stryMutAct_9fa48("42047") ? "" : (stryCov_9fa48("42047"), '─')).repeat(60));
      lines.push(stryMutAct_9fa48("42048") ? "" : (stryCov_9fa48("42048"), 'Keys: 1-5:Tabs | s:Snapshot | c:Clear | q/Esc:Close'));
      return lines.join(stryMutAct_9fa48("42049") ? "" : (stryCov_9fa48("42049"), '\n'));
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (stryMutAct_9fa48("42050")) {
      {}
    } else {
      stryCov_9fa48("42050");
      this.visible = stryMutAct_9fa48("42051") ? true : (stryCov_9fa48("42051"), false);
      this.cdcEvents = stryMutAct_9fa48("42052") ? ["Stryker was here"] : (stryCov_9fa48("42052"), []);
      this.metrics.renderTimes = stryMutAct_9fa48("42053") ? ["Stryker was here"] : (stryCov_9fa48("42053"), []);
      this.metrics.eventLatencies = stryMutAct_9fa48("42054") ? ["Stryker was here"] : (stryCov_9fa48("42054"), []);
      if (stryMutAct_9fa48("42056") ? false : stryMutAct_9fa48("42055") ? true : (stryCov_9fa48("42055", "42056"), this.eventBus)) {
        if (stryMutAct_9fa48("42057")) {
          {}
        } else {
          stryCov_9fa48("42057");
          this.eventBus.emit(stryMutAct_9fa48("42058") ? "" : (stryCov_9fa48("42058"), 'devtools:destroyed'), {});
        }
      }
    }
  }
}