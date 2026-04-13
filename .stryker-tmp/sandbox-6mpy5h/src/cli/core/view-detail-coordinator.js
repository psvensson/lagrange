/**
 * ViewDetailCoordinator - Automatic coordination between views and detail panels
 *
 * Wires selection events to detail panel updates and manages detail panel
 * visibility and layout.
 *
 * Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7
 */
// @ts-nocheck


/**
 * Detail panel layout types
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
export const DETAIL_LAYOUT = stryMutAct_9fa48("44507") ? {} : (stryCov_9fa48("44507"), {
  SIDE: stryMutAct_9fa48("44508") ? "" : (stryCov_9fa48("44508"), 'side'),
  BOTTOM: stryMutAct_9fa48("44509") ? "" : (stryCov_9fa48("44509"), 'bottom'),
  OVERLAY: stryMutAct_9fa48("44510") ? "" : (stryCov_9fa48("44510"), 'overlay')
});

/**
 * ViewDetailCoordinator class for view-detail panel coordination
 */
export class ViewDetailCoordinator {
  /**
   * Creates a new ViewDetailCoordinator
   * @param {Object} options - Coordinator options
   * @param {import('./view-manager.js').ViewManager} [options.viewManager] - View manager
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("44511")) {
      {}
    } else {
      stryCov_9fa48("44511");
      this.viewManager = stryMutAct_9fa48("44514") ? options.viewManager && null : stryMutAct_9fa48("44513") ? false : stryMutAct_9fa48("44512") ? true : (stryCov_9fa48("44512", "44513", "44514"), options.viewManager || null);
      this.eventBus = stryMutAct_9fa48("44517") ? options.eventBus && null : stryMutAct_9fa48("44516") ? false : stryMutAct_9fa48("44515") ? true : (stryCov_9fa48("44515", "44516", "44517"), options.eventBus || null);

      // View configurations
      /** @type {Map<string, ViewConfig>} */
      this.viewConfigs = new Map();

      // Detail panel state
      this.detailPanelVisible = stryMutAct_9fa48("44518") ? true : (stryCov_9fa48("44518"), false);
      this.currentLayout = DETAIL_LAYOUT.SIDE;
      this.currentDetailData = null;
      this.preserveDetailOnSwitch = stryMutAct_9fa48("44519") ? true : (stryCov_9fa48("44519"), false);

      // Setup event listeners
      this.setupEventListeners();
    }
  }

  /**
   * @typedef {Object} ViewConfig
   * @property {boolean} hasDetails - Whether view has detail panel
   * @property {string} layout - Detail panel layout
   * @property {Function} [getDetailData] - Function to get detail data from item
   * @property {boolean} [preserveOnSwitch] - Preserve detail when switching views
   */

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (stryMutAct_9fa48("44520")) {
      {}
    } else {
      stryCov_9fa48("44520");
      if (stryMutAct_9fa48("44522") ? false : stryMutAct_9fa48("44521") ? true : (stryCov_9fa48("44521", "44522"), this.eventBus)) {
        if (stryMutAct_9fa48("44523")) {
          {}
        } else {
          stryCov_9fa48("44523");
          // Listen for view switches
          this.eventBus.on(stryMutAct_9fa48("44524") ? "" : (stryCov_9fa48("44524"), 'viewManager:viewSwitched'), data => {
            if (stryMutAct_9fa48("44525")) {
              {}
            } else {
              stryCov_9fa48("44525");
              this.handleViewSwitch(data);
            }
          });

          // Listen for selection changes
          this.eventBus.on(stryMutAct_9fa48("44526") ? "" : (stryCov_9fa48("44526"), 'view:selectionChanged'), data => {
            if (stryMutAct_9fa48("44527")) {
              {}
            } else {
              stryCov_9fa48("44527");
              this.handleSelectionChange(data);
            }
          });

          // Listen for view refresh
          this.eventBus.on(stryMutAct_9fa48("44528") ? "" : (stryCov_9fa48("44528"), 'viewManager:refresh'), data => {
            if (stryMutAct_9fa48("44529")) {
              {}
            } else {
              stryCov_9fa48("44529");
              this.handleViewRefresh(data);
            }
          });
        }
      }
    }
  }

  /**
   * Register a view with the coordinator
   * Requirements: 23.2
   * @param {string} viewName - View name
   * @param {ViewConfig} config - View configuration
   */
  registerView(viewName, config = {}) {
    if (stryMutAct_9fa48("44530")) {
      {}
    } else {
      stryCov_9fa48("44530");
      const defaultConfig = stryMutAct_9fa48("44531") ? {} : (stryCov_9fa48("44531"), {
        hasDetails: stryMutAct_9fa48("44532") ? false : (stryCov_9fa48("44532"), true),
        layout: DETAIL_LAYOUT.SIDE,
        getDetailData: null,
        preserveOnSwitch: stryMutAct_9fa48("44533") ? true : (stryCov_9fa48("44533"), false)
      });
      this.viewConfigs.set(viewName, stryMutAct_9fa48("44534") ? {} : (stryCov_9fa48("44534"), {
        ...defaultConfig,
        ...config
      }));
      if (stryMutAct_9fa48("44536") ? false : stryMutAct_9fa48("44535") ? true : (stryCov_9fa48("44535", "44536"), this.eventBus)) {
        if (stryMutAct_9fa48("44537")) {
          {}
        } else {
          stryCov_9fa48("44537");
          this.eventBus.emit(stryMutAct_9fa48("44538") ? "" : (stryCov_9fa48("44538"), 'detailCoordinator:viewRegistered'), stryMutAct_9fa48("44539") ? {} : (stryCov_9fa48("44539"), {
            viewName,
            config: this.viewConfigs.get(viewName)
          }));
        }
      }
    }
  }

  /**
   * Unregister a view
   * @param {string} viewName - View name
   */
  unregisterView(viewName) {
    if (stryMutAct_9fa48("44540")) {
      {}
    } else {
      stryCov_9fa48("44540");
      this.viewConfigs.delete(viewName);
      if (stryMutAct_9fa48("44542") ? false : stryMutAct_9fa48("44541") ? true : (stryCov_9fa48("44541", "44542"), this.eventBus)) {
        if (stryMutAct_9fa48("44543")) {
          {}
        } else {
          stryCov_9fa48("44543");
          this.eventBus.emit(stryMutAct_9fa48("44544") ? "" : (stryCov_9fa48("44544"), 'detailCoordinator:viewUnregistered'), stryMutAct_9fa48("44545") ? {} : (stryCov_9fa48("44545"), {
            viewName
          }));
        }
      }
    }
  }

  /**
   * Get configuration for a view
   * @param {string} viewName - View name
   * @return {ViewConfig|undefined}
   */
  getViewConfig(viewName) {
    if (stryMutAct_9fa48("44546")) {
      {}
    } else {
      stryCov_9fa48("44546");
      return this.viewConfigs.get(viewName);
    }
  }

  /**
   * Handle view switch event
   * Requirements: 23.6
   * @param {Object} data - Event data
   */
  handleViewSwitch(data) {
    if (stryMutAct_9fa48("44547")) {
      {}
    } else {
      stryCov_9fa48("44547");
      const {
        viewName
      } = data;
      const config = this.viewConfigs.get(viewName);
      if (stryMutAct_9fa48("44550") ? false : stryMutAct_9fa48("44549") ? true : stryMutAct_9fa48("44548") ? config : (stryCov_9fa48("44548", "44549", "44550"), !config)) {
        if (stryMutAct_9fa48("44551")) {
          {}
        } else {
          stryCov_9fa48("44551");
          // No config for this view, hide detail panel
          this.hideDetailPanel();
          return;
        }
      }

      // Update layout based on view config
      this.currentLayout = config.layout;

      // Handle detail preservation
      if (stryMutAct_9fa48("44554") ? !config.preserveOnSwitch || !this.preserveDetailOnSwitch : stryMutAct_9fa48("44553") ? false : stryMutAct_9fa48("44552") ? true : (stryCov_9fa48("44552", "44553", "44554"), (stryMutAct_9fa48("44555") ? config.preserveOnSwitch : (stryCov_9fa48("44555"), !config.preserveOnSwitch)) && (stryMutAct_9fa48("44556") ? this.preserveDetailOnSwitch : (stryCov_9fa48("44556"), !this.preserveDetailOnSwitch)))) {
        if (stryMutAct_9fa48("44557")) {
          {}
        } else {
          stryCov_9fa48("44557");
          this.clearDetailData();
        }
      }

      // Update detail panel visibility based on view config
      if (stryMutAct_9fa48("44560") ? false : stryMutAct_9fa48("44559") ? true : stryMutAct_9fa48("44558") ? config.hasDetails : (stryCov_9fa48("44558", "44559", "44560"), !config.hasDetails)) {
        if (stryMutAct_9fa48("44561")) {
          {}
        } else {
          stryCov_9fa48("44561");
          this.hideDetailPanel();
        }
      }
      if (stryMutAct_9fa48("44563") ? false : stryMutAct_9fa48("44562") ? true : (stryCov_9fa48("44562", "44563"), this.eventBus)) {
        if (stryMutAct_9fa48("44564")) {
          {}
        } else {
          stryCov_9fa48("44564");
          this.eventBus.emit(stryMutAct_9fa48("44565") ? "" : (stryCov_9fa48("44565"), 'detailCoordinator:viewSwitched'), stryMutAct_9fa48("44566") ? {} : (stryCov_9fa48("44566"), {
            viewName,
            layout: this.currentLayout,
            detailVisible: this.detailPanelVisible
          }));
        }
      }
    }
  }

  /**
   * Handle selection change event
   * Requirements: 23.3
   * @param {Object} data - Event data with view and selectedItem
   */
  handleSelectionChange(data) {
    if (stryMutAct_9fa48("44567")) {
      {}
    } else {
      stryCov_9fa48("44567");
      const {
        viewName,
        selectedItem
      } = data;
      const config = this.viewConfigs.get(viewName);
      if (stryMutAct_9fa48("44570") ? !config && !config.hasDetails : stryMutAct_9fa48("44569") ? false : stryMutAct_9fa48("44568") ? true : (stryCov_9fa48("44568", "44569", "44570"), (stryMutAct_9fa48("44571") ? config : (stryCov_9fa48("44571"), !config)) || (stryMutAct_9fa48("44572") ? config.hasDetails : (stryCov_9fa48("44572"), !config.hasDetails)))) {
        if (stryMutAct_9fa48("44573")) {
          {}
        } else {
          stryCov_9fa48("44573");
          return;
        }
      }

      // Handle empty selection
      if (stryMutAct_9fa48("44576") ? false : stryMutAct_9fa48("44575") ? true : stryMutAct_9fa48("44574") ? selectedItem : (stryCov_9fa48("44574", "44575", "44576"), !selectedItem)) {
        if (stryMutAct_9fa48("44577")) {
          {}
        } else {
          stryCov_9fa48("44577");
          this.clearDetailData();
          return;
        }
      }

      // Get detail data using config function or default
      let detailData;
      if (stryMutAct_9fa48("44579") ? false : stryMutAct_9fa48("44578") ? true : (stryCov_9fa48("44578", "44579"), config.getDetailData)) {
        if (stryMutAct_9fa48("44580")) {
          {}
        } else {
          stryCov_9fa48("44580");
          detailData = config.getDetailData(selectedItem);
        }
      } else {
        if (stryMutAct_9fa48("44581")) {
          {}
        } else {
          stryCov_9fa48("44581");
          detailData = this.getDefaultDetailData(selectedItem);
        }
      }
      this.updateDetailPanel(detailData);
    }
  }

  /**
   * Handle view refresh event
   * @param {Object} data - Event data
   */
  handleViewRefresh(data) {
    if (stryMutAct_9fa48("44582")) {
      {}
    } else {
      stryCov_9fa48("44582");
      const {
        viewName
      } = data;

      // If current view has a selected item, update detail panel
      if (stryMutAct_9fa48("44584") ? false : stryMutAct_9fa48("44583") ? true : (stryCov_9fa48("44583", "44584"), this.viewManager)) {
        if (stryMutAct_9fa48("44585")) {
          {}
        } else {
          stryCov_9fa48("44585");
          const view = this.viewManager.getView(viewName);
          if (stryMutAct_9fa48("44587") ? false : stryMutAct_9fa48("44586") ? true : (stryCov_9fa48("44586", "44587"), view)) {
            if (stryMutAct_9fa48("44588")) {
              {}
            } else {
              stryCov_9fa48("44588");
              const selectedItem = view.getSelectedItem();
              if (stryMutAct_9fa48("44590") ? false : stryMutAct_9fa48("44589") ? true : (stryCov_9fa48("44589", "44590"), selectedItem)) {
                if (stryMutAct_9fa48("44591")) {
                  {}
                } else {
                  stryCov_9fa48("44591");
                  this.handleSelectionChange(stryMutAct_9fa48("44592") ? {} : (stryCov_9fa48("44592"), {
                    viewName,
                    selectedItem
                  }));
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Get default detail data from an item
   * @param {Object} item - Selected item
   * @return {Object} Detail data
   */
  getDefaultDetailData(item) {
    if (stryMutAct_9fa48("44593")) {
      {}
    } else {
      stryCov_9fa48("44593");
      return stryMutAct_9fa48("44594") ? {} : (stryCov_9fa48("44594"), {
        type: stryMutAct_9fa48("44595") ? "" : (stryCov_9fa48("44595"), 'default'),
        item,
        fields: Object.entries(item).map(stryMutAct_9fa48("44596") ? () => undefined : (stryCov_9fa48("44596"), ([key, value]) => stryMutAct_9fa48("44597") ? {} : (stryCov_9fa48("44597"), {
          key,
          value,
          type: typeof value
        })))
      });
    }
  }

  /**
   * Update the detail panel with new data
   * @param {Object} detailData - Detail data to display
   */
  updateDetailPanel(detailData) {
    if (stryMutAct_9fa48("44598")) {
      {}
    } else {
      stryCov_9fa48("44598");
      this.currentDetailData = detailData;
      if (stryMutAct_9fa48("44600") ? false : stryMutAct_9fa48("44599") ? true : (stryCov_9fa48("44599", "44600"), this.eventBus)) {
        if (stryMutAct_9fa48("44601")) {
          {}
        } else {
          stryCov_9fa48("44601");
          this.eventBus.emit(stryMutAct_9fa48("44602") ? "" : (stryCov_9fa48("44602"), 'detailCoordinator:detailUpdated'), stryMutAct_9fa48("44603") ? {} : (stryCov_9fa48("44603"), {
            detailData,
            layout: this.currentLayout,
            visible: this.detailPanelVisible
          }));
        }
      }
    }
  }

  /**
   * Clear detail panel data
   * Requirements: 23.7
   */
  clearDetailData() {
    if (stryMutAct_9fa48("44604")) {
      {}
    } else {
      stryCov_9fa48("44604");
      this.currentDetailData = null;
      if (stryMutAct_9fa48("44606") ? false : stryMutAct_9fa48("44605") ? true : (stryCov_9fa48("44605", "44606"), this.eventBus)) {
        if (stryMutAct_9fa48("44607")) {
          {}
        } else {
          stryCov_9fa48("44607");
          this.eventBus.emit(stryMutAct_9fa48("44608") ? "" : (stryCov_9fa48("44608"), 'detailCoordinator:detailCleared'), {});
        }
      }
    }
  }

  /**
   * Show the detail panel
   */
  showDetailPanel() {
    if (stryMutAct_9fa48("44609")) {
      {}
    } else {
      stryCov_9fa48("44609");
      this.detailPanelVisible = stryMutAct_9fa48("44610") ? false : (stryCov_9fa48("44610"), true);
      if (stryMutAct_9fa48("44612") ? false : stryMutAct_9fa48("44611") ? true : (stryCov_9fa48("44611", "44612"), this.eventBus)) {
        if (stryMutAct_9fa48("44613")) {
          {}
        } else {
          stryCov_9fa48("44613");
          this.eventBus.emit(stryMutAct_9fa48("44614") ? "" : (stryCov_9fa48("44614"), 'detailCoordinator:panelShown'), stryMutAct_9fa48("44615") ? {} : (stryCov_9fa48("44615"), {
            layout: this.currentLayout,
            detailData: this.currentDetailData
          }));
        }
      }
    }
  }

  /**
   * Hide the detail panel
   */
  hideDetailPanel() {
    if (stryMutAct_9fa48("44616")) {
      {}
    } else {
      stryCov_9fa48("44616");
      this.detailPanelVisible = stryMutAct_9fa48("44617") ? true : (stryCov_9fa48("44617"), false);
      if (stryMutAct_9fa48("44619") ? false : stryMutAct_9fa48("44618") ? true : (stryCov_9fa48("44618", "44619"), this.eventBus)) {
        if (stryMutAct_9fa48("44620")) {
          {}
        } else {
          stryCov_9fa48("44620");
          this.eventBus.emit(stryMutAct_9fa48("44621") ? "" : (stryCov_9fa48("44621"), 'detailCoordinator:panelHidden'), {});
        }
      }
    }
  }

  /**
   * Toggle detail panel visibility
   */
  toggleDetailPanel() {
    if (stryMutAct_9fa48("44622")) {
      {}
    } else {
      stryCov_9fa48("44622");
      if (stryMutAct_9fa48("44624") ? false : stryMutAct_9fa48("44623") ? true : (stryCov_9fa48("44623", "44624"), this.detailPanelVisible)) {
        if (stryMutAct_9fa48("44625")) {
          {}
        } else {
          stryCov_9fa48("44625");
          this.hideDetailPanel();
        }
      } else {
        if (stryMutAct_9fa48("44626")) {
          {}
        } else {
          stryCov_9fa48("44626");
          this.showDetailPanel();
        }
      }
    }
  }

  /**
   * Set the detail panel layout
   * Requirements: 23.5
   * @param {string} layout - Layout type (side, bottom, overlay)
   */
  setLayout(layout) {
    if (stryMutAct_9fa48("44627")) {
      {}
    } else {
      stryCov_9fa48("44627");
      if (stryMutAct_9fa48("44630") ? false : stryMutAct_9fa48("44629") ? true : stryMutAct_9fa48("44628") ? Object.values(DETAIL_LAYOUT).includes(layout) : (stryCov_9fa48("44628", "44629", "44630"), !Object.values(DETAIL_LAYOUT).includes(layout))) {
        if (stryMutAct_9fa48("44631")) {
          {}
        } else {
          stryCov_9fa48("44631");
          throw new Error(stryMutAct_9fa48("44632") ? `` : (stryCov_9fa48("44632"), `Invalid layout: ${layout}`));
        }
      }
      this.currentLayout = layout;
      if (stryMutAct_9fa48("44634") ? false : stryMutAct_9fa48("44633") ? true : (stryCov_9fa48("44633", "44634"), this.eventBus)) {
        if (stryMutAct_9fa48("44635")) {
          {}
        } else {
          stryCov_9fa48("44635");
          this.eventBus.emit(stryMutAct_9fa48("44636") ? "" : (stryCov_9fa48("44636"), 'detailCoordinator:layoutChanged'), stryMutAct_9fa48("44637") ? {} : (stryCov_9fa48("44637"), {
            layout,
            visible: this.detailPanelVisible
          }));
        }
      }
    }
  }

  /**
   * Get the current layout
   * @return {string}
   */
  getLayout() {
    if (stryMutAct_9fa48("44638")) {
      {}
    } else {
      stryCov_9fa48("44638");
      return this.currentLayout;
    }
  }

  /**
   * Check if detail panel is visible
   * @return {boolean}
   */
  isDetailPanelVisible() {
    if (stryMutAct_9fa48("44639")) {
      {}
    } else {
      stryCov_9fa48("44639");
      return this.detailPanelVisible;
    }
  }

  /**
   * Get current detail data
   * @return {Object|null}
   */
  getDetailData() {
    if (stryMutAct_9fa48("44640")) {
      {}
    } else {
      stryCov_9fa48("44640");
      return this.currentDetailData;
    }
  }

  /**
   * Set whether to preserve detail on view switch
   * @param {boolean} preserve - Whether to preserve
   */
  setPreserveDetailOnSwitch(preserve) {
    if (stryMutAct_9fa48("44641")) {
      {}
    } else {
      stryCov_9fa48("44641");
      this.preserveDetailOnSwitch = preserve;
    }
  }

  /**
   * Manually trigger detail update for current selection
   */
  refreshDetail() {
    if (stryMutAct_9fa48("44642")) {
      {}
    } else {
      stryCov_9fa48("44642");
      if (stryMutAct_9fa48("44645") ? false : stryMutAct_9fa48("44644") ? true : stryMutAct_9fa48("44643") ? this.viewManager : (stryCov_9fa48("44643", "44644", "44645"), !this.viewManager)) {
        if (stryMutAct_9fa48("44646")) {
          {}
        } else {
          stryCov_9fa48("44646");
          return;
        }
      }
      const viewName = this.viewManager.getCurrentViewName();
      if (stryMutAct_9fa48("44649") ? false : stryMutAct_9fa48("44648") ? true : stryMutAct_9fa48("44647") ? viewName : (stryCov_9fa48("44647", "44648", "44649"), !viewName)) {
        if (stryMutAct_9fa48("44650")) {
          {}
        } else {
          stryCov_9fa48("44650");
          return;
        }
      }
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("44653") ? false : stryMutAct_9fa48("44652") ? true : stryMutAct_9fa48("44651") ? view : (stryCov_9fa48("44651", "44652", "44653"), !view)) {
        if (stryMutAct_9fa48("44654")) {
          {}
        } else {
          stryCov_9fa48("44654");
          return;
        }
      }
      const selectedItem = view.getSelectedItem();
      this.handleSelectionChange(stryMutAct_9fa48("44655") ? {} : (stryCov_9fa48("44655"), {
        viewName,
        selectedItem
      }));
    }
  }

  /**
   * Get the number of registered views
   * @return {number}
   */
  getRegisteredViewCount() {
    if (stryMutAct_9fa48("44656")) {
      {}
    } else {
      stryCov_9fa48("44656");
      return this.viewConfigs.size;
    }
  }

  /**
   * Check if a view is registered
   * @param {string} viewName - View name
   * @return {boolean}
   */
  hasView(viewName) {
    if (stryMutAct_9fa48("44657")) {
      {}
    } else {
      stryCov_9fa48("44657");
      return this.viewConfigs.has(viewName);
    }
  }

  /**
   * Destroy the coordinator and cleanup
   */
  destroy() {
    if (stryMutAct_9fa48("44658")) {
      {}
    } else {
      stryCov_9fa48("44658");
      this.viewConfigs.clear();
      this.currentDetailData = null;
      this.detailPanelVisible = stryMutAct_9fa48("44659") ? true : (stryCov_9fa48("44659"), false);
      if (stryMutAct_9fa48("44661") ? false : stryMutAct_9fa48("44660") ? true : (stryCov_9fa48("44660", "44661"), this.eventBus)) {
        if (stryMutAct_9fa48("44662")) {
          {}
        } else {
          stryCov_9fa48("44662");
          this.eventBus.emit(stryMutAct_9fa48("44663") ? "" : (stryCov_9fa48("44663"), 'detailCoordinator:destroyed'), {});
        }
      }
    }
  }
}