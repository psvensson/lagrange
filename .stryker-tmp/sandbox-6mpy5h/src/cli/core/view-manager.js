/**
 * ViewManager - Coordinates view rendering and updates
 *
 * Manages view registration, switching, and CDC update notifications.
 *
 * Requirements: 12.3, 12.4
 */
// @ts-nocheck


/**
 * ViewManager class for view coordination
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
export class ViewManager {
  /**
   * Creates a new ViewManager
   * @param {Object} options - Manager options
   * @param {import('./navigation-controller.js').NavigationController} [options.navigation] -
   *   Navigation controller
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {Object} [options.screen] - Blessed screen instance
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("44664")) {
      {}
    } else {
      stryCov_9fa48("44664");
      this.navigation = stryMutAct_9fa48("44667") ? options.navigation && null : stryMutAct_9fa48("44666") ? false : stryMutAct_9fa48("44665") ? true : (stryCov_9fa48("44665", "44666", "44667"), options.navigation || null);
      this.eventBus = stryMutAct_9fa48("44670") ? options.eventBus && null : stryMutAct_9fa48("44669") ? false : stryMutAct_9fa48("44668") ? true : (stryCov_9fa48("44668", "44669", "44670"), options.eventBus || null);
      this.screen = stryMutAct_9fa48("44673") ? options.screen && null : stryMutAct_9fa48("44672") ? false : stryMutAct_9fa48("44671") ? true : (stryCov_9fa48("44671", "44672", "44673"), options.screen || null);

      /** @type {Map<string, import('./base-view.js').BaseView>} */
      this.views = new Map();
      this.currentViewName = null;
      this.currentView = null;

      // Track changed rows for highlighting
      this.changedRows = new Map(); // viewName -> Set of keys

      // Setup event listeners
      this.setupEventListeners();
    }
  }

  /**
   * Setup event listeners for CDC updates
   */
  setupEventListeners() {
    if (stryMutAct_9fa48("44674")) {
      {}
    } else {
      stryCov_9fa48("44674");
      if (stryMutAct_9fa48("44676") ? false : stryMutAct_9fa48("44675") ? true : (stryCov_9fa48("44675", "44676"), this.eventBus)) {
        if (stryMutAct_9fa48("44677")) {
          {}
        } else {
          stryCov_9fa48("44677");
          // Listen for CDC updates
          this.eventBus.on(stryMutAct_9fa48("44678") ? "" : (stryCov_9fa48("44678"), 'cache:update'), data => {
            if (stryMutAct_9fa48("44679")) {
              {}
            } else {
              stryCov_9fa48("44679");
              this.handleCDCUpdate(data);
            }
          });

          // Listen for navigation changes
          this.eventBus.on(stryMutAct_9fa48("44680") ? "" : (stryCov_9fa48("44680"), 'navigation:*'), () => {
            if (stryMutAct_9fa48("44681")) {
              {}
            } else {
              stryCov_9fa48("44681");
              this.refresh();
            }
          });
        }
      }
    }
  }

  /**
   * Register a view with the manager
   * @param {string} name - View name
   * @param {import('./base-view.js').BaseView} view - View instance
   */
  registerView(name, view) {
    if (stryMutAct_9fa48("44682")) {
      {}
    } else {
      stryCov_9fa48("44682");
      this.views.set(name, view);

      // Initialize changed rows tracking
      if (stryMutAct_9fa48("44685") ? false : stryMutAct_9fa48("44684") ? true : stryMutAct_9fa48("44683") ? this.changedRows.has(name) : (stryCov_9fa48("44683", "44684", "44685"), !this.changedRows.has(name))) {
        if (stryMutAct_9fa48("44686")) {
          {}
        } else {
          stryCov_9fa48("44686");
          this.changedRows.set(name, new Set());
        }
      }
      if (stryMutAct_9fa48("44688") ? false : stryMutAct_9fa48("44687") ? true : (stryCov_9fa48("44687", "44688"), this.eventBus)) {
        if (stryMutAct_9fa48("44689")) {
          {}
        } else {
          stryCov_9fa48("44689");
          this.eventBus.emit(stryMutAct_9fa48("44690") ? "" : (stryCov_9fa48("44690"), 'viewManager:viewRegistered'), stryMutAct_9fa48("44691") ? {} : (stryCov_9fa48("44691"), {
            name,
            view
          }));
        }
      }
    }
  }

  /**
   * Unregister a view
   * @param {string} name - View name
   */
  unregisterView(name) {
    if (stryMutAct_9fa48("44692")) {
      {}
    } else {
      stryCov_9fa48("44692");
      const view = this.views.get(name);
      if (stryMutAct_9fa48("44694") ? false : stryMutAct_9fa48("44693") ? true : (stryCov_9fa48("44693", "44694"), view)) {
        if (stryMutAct_9fa48("44695")) {
          {}
        } else {
          stryCov_9fa48("44695");
          view.hide();
          this.views.delete(name);
          this.changedRows.delete(name);
          if (stryMutAct_9fa48("44698") ? this.currentViewName !== name : stryMutAct_9fa48("44697") ? false : stryMutAct_9fa48("44696") ? true : (stryCov_9fa48("44696", "44697", "44698"), this.currentViewName === name)) {
            if (stryMutAct_9fa48("44699")) {
              {}
            } else {
              stryCov_9fa48("44699");
              this.currentViewName = null;
              this.currentView = null;
            }
          }
          if (stryMutAct_9fa48("44701") ? false : stryMutAct_9fa48("44700") ? true : (stryCov_9fa48("44700", "44701"), this.eventBus)) {
            if (stryMutAct_9fa48("44702")) {
              {}
            } else {
              stryCov_9fa48("44702");
              this.eventBus.emit(stryMutAct_9fa48("44703") ? "" : (stryCov_9fa48("44703"), 'viewManager:viewUnregistered'), stryMutAct_9fa48("44704") ? {} : (stryCov_9fa48("44704"), {
                name
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Get a registered view by name
   * @param {string} name - View name
   * @return {import('./base-view.js').BaseView|undefined}
   */
  getView(name) {
    if (stryMutAct_9fa48("44705")) {
      {}
    } else {
      stryCov_9fa48("44705");
      return this.views.get(name);
    }
  }

  /**
   * Get all registered view names
   * @return {string[]}
   */
  getViewNames() {
    if (stryMutAct_9fa48("44706")) {
      {}
    } else {
      stryCov_9fa48("44706");
      return Array.from(this.views.keys());
    }
  }

  /**
   * Switch to a different view
   * @param {string} viewName - Name of view to switch to
   * @return {boolean} True if switch was successful
   */
  switchView(viewName) {
    if (stryMutAct_9fa48("44707")) {
      {}
    } else {
      stryCov_9fa48("44707");
      const newView = this.views.get(viewName);
      if (stryMutAct_9fa48("44710") ? false : stryMutAct_9fa48("44709") ? true : stryMutAct_9fa48("44708") ? newView : (stryCov_9fa48("44708", "44709", "44710"), !newView)) {
        if (stryMutAct_9fa48("44711")) {
          {}
        } else {
          stryCov_9fa48("44711");
          return stryMutAct_9fa48("44712") ? true : (stryCov_9fa48("44712"), false);
        }
      }

      // Hide current view
      if (stryMutAct_9fa48("44714") ? false : stryMutAct_9fa48("44713") ? true : (stryCov_9fa48("44713", "44714"), this.currentView)) {
        if (stryMutAct_9fa48("44715")) {
          {}
        } else {
          stryCov_9fa48("44715");
          this.currentView.hide();
        }
      }

      // Show new view
      this.currentViewName = viewName;
      this.currentView = newView;
      this.currentView.show();

      // Refresh with current data
      this.refresh();
      if (stryMutAct_9fa48("44717") ? false : stryMutAct_9fa48("44716") ? true : (stryCov_9fa48("44716", "44717"), this.eventBus)) {
        if (stryMutAct_9fa48("44718")) {
          {}
        } else {
          stryCov_9fa48("44718");
          this.eventBus.emit(stryMutAct_9fa48("44719") ? "" : (stryCov_9fa48("44719"), 'viewManager:viewSwitched'), stryMutAct_9fa48("44720") ? {} : (stryCov_9fa48("44720"), {
            viewName,
            view: newView
          }));
        }
      }
      return stryMutAct_9fa48("44721") ? false : (stryCov_9fa48("44721"), true);
    }
  }

  /**
   * Get the current view name
   * @return {string|null}
   */
  getCurrentViewName() {
    if (stryMutAct_9fa48("44722")) {
      {}
    } else {
      stryCov_9fa48("44722");
      return this.currentViewName;
    }
  }

  /**
   * Get the current view instance
   * @return {import('./base-view.js').BaseView|null}
   */
  getCurrentView() {
    if (stryMutAct_9fa48("44723")) {
      {}
    } else {
      stryCov_9fa48("44723");
      return this.currentView;
    }
  }

  /**
   * Refresh the current view with latest data
   */
  refresh() {
    if (stryMutAct_9fa48("44724")) {
      {}
    } else {
      stryCov_9fa48("44724");
      if (stryMutAct_9fa48("44727") ? false : stryMutAct_9fa48("44726") ? true : stryMutAct_9fa48("44725") ? this.currentView : (stryCov_9fa48("44725", "44726", "44727"), !this.currentView)) {
        if (stryMutAct_9fa48("44728")) {
          {}
        } else {
          stryCov_9fa48("44728");
          return;
        }
      }

      // Get data from navigation controller if available
      let data = stryMutAct_9fa48("44729") ? ["Stryker was here"] : (stryCov_9fa48("44729"), []);
      let state = {};
      if (stryMutAct_9fa48("44731") ? false : stryMutAct_9fa48("44730") ? true : (stryCov_9fa48("44730", "44731"), this.navigation)) {
        if (stryMutAct_9fa48("44732")) {
          {}
        } else {
          stryCov_9fa48("44732");
          data = this.navigation.getViewData();
          state = this.navigation.getCurrentState();
        }
      }

      // Apply changed row highlighting
      const changedKeys = this.changedRows.get(this.currentViewName);
      if (stryMutAct_9fa48("44734") ? false : stryMutAct_9fa48("44733") ? true : (stryCov_9fa48("44733", "44734"), changedKeys)) {
        if (stryMutAct_9fa48("44735")) {
          {}
        } else {
          stryCov_9fa48("44735");
          for (const key of changedKeys) {
            if (stryMutAct_9fa48("44736")) {
              {}
            } else {
              stryCov_9fa48("44736");
              this.currentView.markChanged(key);
            }
          }
        }
      }

      // Update view data and render
      this.currentView.setData(data);
      const renderData = this.currentView.render(state);
      if (stryMutAct_9fa48("44738") ? false : stryMutAct_9fa48("44737") ? true : (stryCov_9fa48("44737", "44738"), this.eventBus)) {
        if (stryMutAct_9fa48("44739")) {
          {}
        } else {
          stryCov_9fa48("44739");
          this.eventBus.emit(stryMutAct_9fa48("44740") ? "" : (stryCov_9fa48("44740"), 'viewManager:refresh'), stryMutAct_9fa48("44741") ? {} : (stryCov_9fa48("44741"), {
            viewName: this.currentViewName,
            renderData
          }));
        }
      }

      // Render screen if available
      if (stryMutAct_9fa48("44744") ? this.screen || typeof this.screen.render === 'function' : stryMutAct_9fa48("44743") ? false : stryMutAct_9fa48("44742") ? true : (stryCov_9fa48("44742", "44743", "44744"), this.screen && (stryMutAct_9fa48("44746") ? typeof this.screen.render !== 'function' : stryMutAct_9fa48("44745") ? true : (stryCov_9fa48("44745", "44746"), typeof this.screen.render === (stryMutAct_9fa48("44747") ? "" : (stryCov_9fa48("44747"), 'function')))))) {
        if (stryMutAct_9fa48("44748")) {
          {}
        } else {
          stryCov_9fa48("44748");
          this.screen.render();
        }
      }
    }
  }

  /**
   * Handle CDC update event
   * Requirements: 12.3, 12.4
   * @param {Object} change - CDC change event
   */
  handleCDCUpdate(change) {
    if (stryMutAct_9fa48("44749")) {
      {}
    } else {
      stryCov_9fa48("44749");
      const {
        table,
        key,
        operation
      } = change;

      // Map table names to affected view names.
      const tableViewMap = stryMutAct_9fa48("44750") ? {} : (stryCov_9fa48("44750"), {
        'nodes': stryMutAct_9fa48("44751") ? [] : (stryCov_9fa48("44751"), [stryMutAct_9fa48("44752") ? "" : (stryCov_9fa48("44752"), 'nodes'), stryMutAct_9fa48("44753") ? "" : (stryCov_9fa48("44753"), 'replicas'), stryMutAct_9fa48("44754") ? "" : (stryCov_9fa48("44754"), 'services')]),
        'services': stryMutAct_9fa48("44755") ? [] : (stryCov_9fa48("44755"), [stryMutAct_9fa48("44756") ? "" : (stryCov_9fa48("44756"), 'replicas')]),
        'service_definitions': stryMutAct_9fa48("44757") ? [] : (stryCov_9fa48("44757"), [stryMutAct_9fa48("44758") ? "" : (stryCov_9fa48("44758"), 'services')]),
        'service_endpoints': stryMutAct_9fa48("44759") ? [] : (stryCov_9fa48("44759"), [stryMutAct_9fa48("44760") ? "" : (stryCov_9fa48("44760"), 'services'), stryMutAct_9fa48("44761") ? "" : (stryCov_9fa48("44761"), 'replicas')]),
        'tables': stryMutAct_9fa48("44762") ? [] : (stryCov_9fa48("44762"), [stryMutAct_9fa48("44763") ? "" : (stryCov_9fa48("44763"), 'tables')]),
        'partitions': stryMutAct_9fa48("44764") ? [] : (stryCov_9fa48("44764"), [stryMutAct_9fa48("44765") ? "" : (stryCov_9fa48("44765"), 'partitions')]),
        'message_groups': stryMutAct_9fa48("44766") ? [] : (stryCov_9fa48("44766"), [stryMutAct_9fa48("44767") ? "" : (stryCov_9fa48("44767"), 'message_groups')]),
        'logs': stryMutAct_9fa48("44768") ? [] : (stryCov_9fa48("44768"), [stryMutAct_9fa48("44769") ? "" : (stryCov_9fa48("44769"), 'logs')]),
        'config': stryMutAct_9fa48("44770") ? [] : (stryCov_9fa48("44770"), [stryMutAct_9fa48("44771") ? "" : (stryCov_9fa48("44771"), 'config')]),
        'contexts': stryMutAct_9fa48("44772") ? [] : (stryCov_9fa48("44772"), [stryMutAct_9fa48("44773") ? "" : (stryCov_9fa48("44773"), 'contexts')]),
        'replica_operations': stryMutAct_9fa48("44774") ? [] : (stryCov_9fa48("44774"), [stryMutAct_9fa48("44775") ? "" : (stryCov_9fa48("44775"), 'operations')])
      });
      const affectedViews = tableViewMap[table];
      if (stryMutAct_9fa48("44778") ? !affectedViews && affectedViews.length === 0 : stryMutAct_9fa48("44777") ? false : stryMutAct_9fa48("44776") ? true : (stryCov_9fa48("44776", "44777", "44778"), (stryMutAct_9fa48("44779") ? affectedViews : (stryCov_9fa48("44779"), !affectedViews)) || (stryMutAct_9fa48("44781") ? affectedViews.length !== 0 : stryMutAct_9fa48("44780") ? false : (stryCov_9fa48("44780", "44781"), affectedViews.length === 0)))) {
        if (stryMutAct_9fa48("44782")) {
          {}
        } else {
          stryCov_9fa48("44782");
          return;
        }
      }
      for (const viewName of affectedViews) {
        if (stryMutAct_9fa48("44783")) {
          {}
        } else {
          stryCov_9fa48("44783");
          // Track changed row for highlighting.
          if (stryMutAct_9fa48("44786") ? false : stryMutAct_9fa48("44785") ? true : stryMutAct_9fa48("44784") ? this.changedRows.has(viewName) : (stryCov_9fa48("44784", "44785", "44786"), !this.changedRows.has(viewName))) {
            if (stryMutAct_9fa48("44787")) {
              {}
            } else {
              stryCov_9fa48("44787");
              this.changedRows.set(viewName, new Set());
            }
          }
          this.changedRows.get(viewName).add(key);

          // Refresh if this affects the current view.
          if (stryMutAct_9fa48("44790") ? this.currentViewName !== viewName : stryMutAct_9fa48("44789") ? false : stryMutAct_9fa48("44788") ? true : (stryCov_9fa48("44788", "44789", "44790"), this.currentViewName === viewName)) {
            if (stryMutAct_9fa48("44791")) {
              {}
            } else {
              stryCov_9fa48("44791");
              this.refresh();

              // Clear highlight after delay.
              setTimeout(() => {
                if (stryMutAct_9fa48("44792")) {
                  {}
                } else {
                  stryCov_9fa48("44792");
                  this.clearChangedRow(viewName, key);
                }
              }, 2000);
            }
          }
        }
      }
      if (stryMutAct_9fa48("44794") ? false : stryMutAct_9fa48("44793") ? true : (stryCov_9fa48("44793", "44794"), this.eventBus)) {
        if (stryMutAct_9fa48("44795")) {
          {}
        } else {
          stryCov_9fa48("44795");
          this.eventBus.emit(stryMutAct_9fa48("44796") ? "" : (stryCov_9fa48("44796"), 'viewManager:cdcUpdate'), stryMutAct_9fa48("44797") ? {} : (stryCov_9fa48("44797"), {
            table,
            key,
            operation,
            viewNames: affectedViews,
            isCurrentView: affectedViews.includes(this.currentViewName)
          }));
        }
      }
    }
  }

  /**
   * Clear a changed row highlight
   * @param {string} viewName - View name
   * @param {string} key - Row key
   */
  clearChangedRow(viewName, key) {
    if (stryMutAct_9fa48("44798")) {
      {}
    } else {
      stryCov_9fa48("44798");
      const changedKeys = this.changedRows.get(viewName);
      if (stryMutAct_9fa48("44800") ? false : stryMutAct_9fa48("44799") ? true : (stryCov_9fa48("44799", "44800"), changedKeys)) {
        if (stryMutAct_9fa48("44801")) {
          {}
        } else {
          stryCov_9fa48("44801");
          changedKeys.delete(key);
        }
      }
      const view = this.views.get(viewName);
      if (stryMutAct_9fa48("44803") ? false : stryMutAct_9fa48("44802") ? true : (stryCov_9fa48("44802", "44803"), view)) {
        if (stryMutAct_9fa48("44804")) {
          {}
        } else {
          stryCov_9fa48("44804");
          view.clearChanged(key);
        }
      }

      // Refresh if this is the current view
      if (stryMutAct_9fa48("44807") ? this.currentViewName !== viewName : stryMutAct_9fa48("44806") ? false : stryMutAct_9fa48("44805") ? true : (stryCov_9fa48("44805", "44806", "44807"), this.currentViewName === viewName)) {
        if (stryMutAct_9fa48("44808")) {
          {}
        } else {
          stryCov_9fa48("44808");
          this.refresh();
        }
      }
    }
  }

  /**
   * Clear all changed row highlights for a view
   * @param {string} [viewName] - View name, or all views if not provided
   */
  clearAllChangedRows(viewName) {
    if (stryMutAct_9fa48("44809")) {
      {}
    } else {
      stryCov_9fa48("44809");
      if (stryMutAct_9fa48("44811") ? false : stryMutAct_9fa48("44810") ? true : (stryCov_9fa48("44810", "44811"), viewName)) {
        if (stryMutAct_9fa48("44812")) {
          {}
        } else {
          stryCov_9fa48("44812");
          const changedKeys = this.changedRows.get(viewName);
          if (stryMutAct_9fa48("44814") ? false : stryMutAct_9fa48("44813") ? true : (stryCov_9fa48("44813", "44814"), changedKeys)) {
            if (stryMutAct_9fa48("44815")) {
              {}
            } else {
              stryCov_9fa48("44815");
              changedKeys.clear();
            }
          }
          const view = this.views.get(viewName);
          if (stryMutAct_9fa48("44817") ? false : stryMutAct_9fa48("44816") ? true : (stryCov_9fa48("44816", "44817"), view)) {
            if (stryMutAct_9fa48("44818")) {
              {}
            } else {
              stryCov_9fa48("44818");
              view.clearChanged();
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("44819")) {
          {}
        } else {
          stryCov_9fa48("44819");
          for (const [name, keys] of this.changedRows) {
            if (stryMutAct_9fa48("44820")) {
              {}
            } else {
              stryCov_9fa48("44820");
              keys.clear();
              const view = this.views.get(name);
              if (stryMutAct_9fa48("44822") ? false : stryMutAct_9fa48("44821") ? true : (stryCov_9fa48("44821", "44822"), view)) {
                if (stryMutAct_9fa48("44823")) {
                  {}
                } else {
                  stryCov_9fa48("44823");
                  view.clearChanged();
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Check if a change is relevant to the current view
   * @param {Object} change - CDC change event
   * @return {boolean}
   */
  isChangeRelevant(change) {
    if (stryMutAct_9fa48("44824")) {
      {}
    } else {
      stryCov_9fa48("44824");
      const tableViewMap = stryMutAct_9fa48("44825") ? {} : (stryCov_9fa48("44825"), {
        'nodes': stryMutAct_9fa48("44826") ? [] : (stryCov_9fa48("44826"), [stryMutAct_9fa48("44827") ? "" : (stryCov_9fa48("44827"), 'nodes'), stryMutAct_9fa48("44828") ? "" : (stryCov_9fa48("44828"), 'replicas'), stryMutAct_9fa48("44829") ? "" : (stryCov_9fa48("44829"), 'services')]),
        'services': stryMutAct_9fa48("44830") ? [] : (stryCov_9fa48("44830"), [stryMutAct_9fa48("44831") ? "" : (stryCov_9fa48("44831"), 'replicas')]),
        'service_definitions': stryMutAct_9fa48("44832") ? [] : (stryCov_9fa48("44832"), [stryMutAct_9fa48("44833") ? "" : (stryCov_9fa48("44833"), 'services')]),
        'service_endpoints': stryMutAct_9fa48("44834") ? [] : (stryCov_9fa48("44834"), [stryMutAct_9fa48("44835") ? "" : (stryCov_9fa48("44835"), 'services'), stryMutAct_9fa48("44836") ? "" : (stryCov_9fa48("44836"), 'replicas')]),
        'tables': stryMutAct_9fa48("44837") ? [] : (stryCov_9fa48("44837"), [stryMutAct_9fa48("44838") ? "" : (stryCov_9fa48("44838"), 'tables')]),
        'partitions': stryMutAct_9fa48("44839") ? [] : (stryCov_9fa48("44839"), [stryMutAct_9fa48("44840") ? "" : (stryCov_9fa48("44840"), 'partitions')]),
        'message_groups': stryMutAct_9fa48("44841") ? [] : (stryCov_9fa48("44841"), [stryMutAct_9fa48("44842") ? "" : (stryCov_9fa48("44842"), 'message_groups')]),
        'logs': stryMutAct_9fa48("44843") ? [] : (stryCov_9fa48("44843"), [stryMutAct_9fa48("44844") ? "" : (stryCov_9fa48("44844"), 'logs')]),
        'config': stryMutAct_9fa48("44845") ? [] : (stryCov_9fa48("44845"), [stryMutAct_9fa48("44846") ? "" : (stryCov_9fa48("44846"), 'config')]),
        'contexts': stryMutAct_9fa48("44847") ? [] : (stryCov_9fa48("44847"), [stryMutAct_9fa48("44848") ? "" : (stryCov_9fa48("44848"), 'contexts')]),
        'replica_operations': stryMutAct_9fa48("44849") ? [] : (stryCov_9fa48("44849"), [stryMutAct_9fa48("44850") ? "" : (stryCov_9fa48("44850"), 'operations')])
      });
      const viewNames = stryMutAct_9fa48("44853") ? tableViewMap[change.table] && [] : stryMutAct_9fa48("44852") ? false : stryMutAct_9fa48("44851") ? true : (stryCov_9fa48("44851", "44852", "44853"), tableViewMap[change.table] || (stryMutAct_9fa48("44854") ? ["Stryker was here"] : (stryCov_9fa48("44854"), [])));
      return viewNames.includes(this.currentViewName);
    }
  }

  /**
   * Get the number of registered views
   * @return {number}
   */
  getViewCount() {
    if (stryMutAct_9fa48("44855")) {
      {}
    } else {
      stryCov_9fa48("44855");
      return this.views.size;
    }
  }

  /**
   * Check if a view is registered
   * @param {string} name - View name
   * @return {boolean}
   */
  hasView(name) {
    if (stryMutAct_9fa48("44856")) {
      {}
    } else {
      stryCov_9fa48("44856");
      return this.views.has(name);
    }
  }

  /**
   * Destroy the view manager and cleanup
   */
  destroy() {
    if (stryMutAct_9fa48("44857")) {
      {}
    } else {
      stryCov_9fa48("44857");
      // Hide and cleanup all views
      for (const [_name, view] of this.views) {
        if (stryMutAct_9fa48("44858")) {
          {}
        } else {
          stryCov_9fa48("44858");
          view.hide();
        }
      }
      this.views.clear();
      this.changedRows.clear();
      this.currentView = null;
      this.currentViewName = null;
      if (stryMutAct_9fa48("44860") ? false : stryMutAct_9fa48("44859") ? true : (stryCov_9fa48("44859", "44860"), this.eventBus)) {
        if (stryMutAct_9fa48("44861")) {
          {}
        } else {
          stryCov_9fa48("44861");
          this.eventBus.emit(stryMutAct_9fa48("44862") ? "" : (stryCov_9fa48("44862"), 'viewManager:destroyed'), {});
        }
      }
    }
  }
}