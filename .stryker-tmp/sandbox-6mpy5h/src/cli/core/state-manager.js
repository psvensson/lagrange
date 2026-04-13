/**
 * StateManager - Centralized state management with immutable snapshots
 * Single source of truth for all application state
 *
 * Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
 */
// @ts-nocheck


/**
 * @typedef {Object} AppState
 * @property {string} connectionStatus - Connection status string
 * @property {Object} navigation - Navigation state
 * @property {Object} cache - Cache data
 * @property {Object} ui - UI state
 * @property {Object} config - Configuration
 */

/**
 * Valid connection statuses
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
const VALID_CONNECTION_STATUSES = stryMutAct_9fa48("44166") ? [] : (stryCov_9fa48("44166"), [stryMutAct_9fa48("44167") ? "" : (stryCov_9fa48("44167"), 'disconnected'), stryMutAct_9fa48("44168") ? "" : (stryCov_9fa48("44168"), 'connecting'), stryMutAct_9fa48("44169") ? "" : (stryCov_9fa48("44169"), 'connected'), stryMutAct_9fa48("44170") ? "" : (stryCov_9fa48("44170"), 'reconnecting'), stryMutAct_9fa48("44171") ? "" : (stryCov_9fa48("44171"), 'failed')]);

/**
 * Valid view names
 */
const VALID_VIEWS = stryMutAct_9fa48("44172") ? [] : (stryCov_9fa48("44172"), [stryMutAct_9fa48("44173") ? "" : (stryCov_9fa48("44173"), 'nodes'), stryMutAct_9fa48("44174") ? "" : (stryCov_9fa48("44174"), 'services'), stryMutAct_9fa48("44175") ? "" : (stryCov_9fa48("44175"), 'replicas'), stryMutAct_9fa48("44176") ? "" : (stryCov_9fa48("44176"), 'tables'), stryMutAct_9fa48("44177") ? "" : (stryCov_9fa48("44177"), 'partitions'), stryMutAct_9fa48("44178") ? "" : (stryCov_9fa48("44178"), 'message_groups'), stryMutAct_9fa48("44179") ? "" : (stryCov_9fa48("44179"), 'sql'), stryMutAct_9fa48("44180") ? "" : (stryCov_9fa48("44180"), 'logs'), stryMutAct_9fa48("44181") ? "" : (stryCov_9fa48("44181"), 'config'), stryMutAct_9fa48("44182") ? "" : (stryCov_9fa48("44182"), 'contexts')]);
export class StateManager {
  /**
   * @param {import('./event-bus.js').EventBus} eventBus - Event bus for notifications
   * @param {Object} options - Configuration options
   */
  constructor(eventBus, options = {}) {
    if (stryMutAct_9fa48("44183")) {
      {}
    } else {
      stryCov_9fa48("44183");
      this.eventBus = eventBus;
      this.options = options;

      /** @type {AppState} */
      this.state = this.getInitialState();

      /** @type {AppState[]} */
      this.snapshots = stryMutAct_9fa48("44184") ? ["Stryker was here"] : (stryCov_9fa48("44184"), []);
      this.maxSnapshots = stryMutAct_9fa48("44187") ? options.maxSnapshots && 10 : stryMutAct_9fa48("44186") ? false : stryMutAct_9fa48("44185") ? true : (stryCov_9fa48("44185", "44186", "44187"), options.maxSnapshots || 10);
    }
  }

  /**
   * Get initial application state
   * @returns {AppState}
   */
  getInitialState() {
    if (stryMutAct_9fa48("44188")) {
      {}
    } else {
      stryCov_9fa48("44188");
      return stryMutAct_9fa48("44189") ? {} : (stryCov_9fa48("44189"), {
        connectionStatus: stryMutAct_9fa48("44190") ? "" : (stryCov_9fa48("44190"), 'disconnected'),
        nodeAddress: null,
        navigation: stryMutAct_9fa48("44191") ? {} : (stryCov_9fa48("44191"), {
          currentView: stryMutAct_9fa48("44192") ? "" : (stryCov_9fa48("44192"), 'nodes'),
          context: null,
          stack: stryMutAct_9fa48("44193") ? ["Stryker was here"] : (stryCov_9fa48("44193"), []),
          breadcrumb: stryMutAct_9fa48("44194") ? "" : (stryCov_9fa48("44194"), 'Home')
        }),
        cache: stryMutAct_9fa48("44195") ? {} : (stryCov_9fa48("44195"), {
          nodes: stryMutAct_9fa48("44196") ? ["Stryker was here"] : (stryCov_9fa48("44196"), []),
          services: stryMutAct_9fa48("44197") ? ["Stryker was here"] : (stryCov_9fa48("44197"), []),
          tables: stryMutAct_9fa48("44198") ? ["Stryker was here"] : (stryCov_9fa48("44198"), []),
          partitions: stryMutAct_9fa48("44199") ? ["Stryker was here"] : (stryCov_9fa48("44199"), []),
          messageGroups: stryMutAct_9fa48("44200") ? ["Stryker was here"] : (stryCov_9fa48("44200"), []),
          logs: stryMutAct_9fa48("44201") ? ["Stryker was here"] : (stryCov_9fa48("44201"), []),
          config: stryMutAct_9fa48("44202") ? ["Stryker was here"] : (stryCov_9fa48("44202"), []),
          contexts: stryMutAct_9fa48("44203") ? ["Stryker was here"] : (stryCov_9fa48("44203"), []),
          lastUpdate: null,
          cdcLag: 0
        }),
        ui: stryMutAct_9fa48("44204") ? {} : (stryCov_9fa48("44204"), {
          selectedIndex: 0,
          filter: stryMutAct_9fa48("44205") ? "Stryker was here!" : (stryCov_9fa48("44205"), ''),
          sortColumn: null,
          sortDirection: stryMutAct_9fa48("44206") ? "" : (stryCov_9fa48("44206"), 'asc'),
          detailPanelVisible: stryMutAct_9fa48("44207") ? true : (stryCov_9fa48("44207"), false),
          helpVisible: stryMutAct_9fa48("44208") ? true : (stryCov_9fa48("44208"), false),
          commandMode: stryMutAct_9fa48("44209") ? true : (stryCov_9fa48("44209"), false)
        }),
        config: stryMutAct_9fa48("44210") ? {} : (stryCov_9fa48("44210"), {
          refreshInterval: 5000,
          defaultView: stryMutAct_9fa48("44211") ? "" : (stryCov_9fa48("44211"), 'nodes'),
          colorScheme: stryMutAct_9fa48("44212") ? "" : (stryCov_9fa48("44212"), 'default'),
          readOnlyMode: stryMutAct_9fa48("44213") ? true : (stryCov_9fa48("44213"), false)
        })
      });
    }
  }

  /**
   * Get current state (read-only copy)
   * @returns {AppState}
   */
  getState() {
    if (stryMutAct_9fa48("44214")) {
      {}
    } else {
      stryCov_9fa48("44214");
      return this.deepClone(this.state);
    }
  }

  /**
   * Get a specific part of the state
   * @param {string} path - Dot-separated path (e.g., 'navigation.currentView')
   * @returns {*}
   */
  get(path) {
    if (stryMutAct_9fa48("44215")) {
      {}
    } else {
      stryCov_9fa48("44215");
      const parts = path.split(stryMutAct_9fa48("44216") ? "" : (stryCov_9fa48("44216"), '.'));
      let value = this.state;
      for (const part of parts) {
        if (stryMutAct_9fa48("44217")) {
          {}
        } else {
          stryCov_9fa48("44217");
          if (stryMutAct_9fa48("44220") ? value === undefined && value === null : stryMutAct_9fa48("44219") ? false : stryMutAct_9fa48("44218") ? true : (stryCov_9fa48("44218", "44219", "44220"), (stryMutAct_9fa48("44222") ? value !== undefined : stryMutAct_9fa48("44221") ? false : (stryCov_9fa48("44221", "44222"), value === undefined)) || (stryMutAct_9fa48("44224") ? value !== null : stryMutAct_9fa48("44223") ? false : (stryCov_9fa48("44223", "44224"), value === null)))) return undefined;
          value = value[part];
        }
      }
      return this.deepClone(value);
    }
  }

  /**
   * Set state with validation
   * @param {Object} updates - Partial state updates
   * @throws {Error} If state transition is invalid
   */
  setState(updates) {
    if (stryMutAct_9fa48("44225")) {
      {}
    } else {
      stryCov_9fa48("44225");
      const newState = this.mergeState(this.state, updates);

      // Validate the new state
      const validationError = this.validateState(newState);
      if (stryMutAct_9fa48("44227") ? false : stryMutAct_9fa48("44226") ? true : (stryCov_9fa48("44226", "44227"), validationError)) {
        if (stryMutAct_9fa48("44228")) {
          {}
        } else {
          stryCov_9fa48("44228");
          throw new Error(stryMutAct_9fa48("44229") ? `` : (stryCov_9fa48("44229"), `Invalid state transition: ${validationError}`));
        }
      }
      const oldState = this.state;
      this.state = newState;

      // Emit state change event
      if (stryMutAct_9fa48("44231") ? false : stryMutAct_9fa48("44230") ? true : (stryCov_9fa48("44230", "44231"), this.eventBus)) {
        if (stryMutAct_9fa48("44232")) {
          {}
        } else {
          stryCov_9fa48("44232");
          this.eventBus.emit(stryMutAct_9fa48("44233") ? "" : (stryCov_9fa48("44233"), 'state:changed'), stryMutAct_9fa48("44234") ? {} : (stryCov_9fa48("44234"), {
            oldState: this.deepClone(oldState),
            newState: this.deepClone(newState),
            updates
          }));
        }
      }
    }
  }

  /**
   * Batch multiple state updates atomically
   * @param {Function} updater - Function that receives current state and returns updates
   */
  batchUpdate(updater) {
    if (stryMutAct_9fa48("44235")) {
      {}
    } else {
      stryCov_9fa48("44235");
      const currentState = this.getState();
      const updates = updater(currentState);
      this.setState(updates);
    }
  }

  /**
   * Validate state transitions
   * @param {AppState} state - State to validate
   * @returns {string|null} Error message or null if valid
   */
  validateState(state) {
    if (stryMutAct_9fa48("44236")) {
      {}
    } else {
      stryCov_9fa48("44236");
      // Validate connection status
      if (stryMutAct_9fa48("44239") ? false : stryMutAct_9fa48("44238") ? true : stryMutAct_9fa48("44237") ? VALID_CONNECTION_STATUSES.includes(state.connectionStatus) : (stryCov_9fa48("44237", "44238", "44239"), !VALID_CONNECTION_STATUSES.includes(state.connectionStatus))) {
        if (stryMutAct_9fa48("44240")) {
          {}
        } else {
          stryCov_9fa48("44240");
          return stryMutAct_9fa48("44241") ? `` : (stryCov_9fa48("44241"), `Invalid connection status: ${state.connectionStatus}`);
        }
      }

      // Validate navigation view
      if (stryMutAct_9fa48("44244") ? false : stryMutAct_9fa48("44243") ? true : stryMutAct_9fa48("44242") ? VALID_VIEWS.includes(state.navigation.currentView) : (stryCov_9fa48("44242", "44243", "44244"), !VALID_VIEWS.includes(state.navigation.currentView))) {
        if (stryMutAct_9fa48("44245")) {
          {}
        } else {
          stryCov_9fa48("44245");
          return stryMutAct_9fa48("44246") ? `` : (stryCov_9fa48("44246"), `Invalid view: ${state.navigation.currentView}`);
        }
      }

      // Validate UI state
      if (stryMutAct_9fa48("44249") ? typeof state.ui.selectedIndex !== 'number' && state.ui.selectedIndex < 0 : stryMutAct_9fa48("44248") ? false : stryMutAct_9fa48("44247") ? true : (stryCov_9fa48("44247", "44248", "44249"), (stryMutAct_9fa48("44251") ? typeof state.ui.selectedIndex === 'number' : stryMutAct_9fa48("44250") ? false : (stryCov_9fa48("44250", "44251"), typeof state.ui.selectedIndex !== (stryMutAct_9fa48("44252") ? "" : (stryCov_9fa48("44252"), 'number')))) || (stryMutAct_9fa48("44255") ? state.ui.selectedIndex >= 0 : stryMutAct_9fa48("44254") ? state.ui.selectedIndex <= 0 : stryMutAct_9fa48("44253") ? false : (stryCov_9fa48("44253", "44254", "44255"), state.ui.selectedIndex < 0)))) {
        if (stryMutAct_9fa48("44256")) {
          {}
        } else {
          stryCov_9fa48("44256");
          return stryMutAct_9fa48("44257") ? `` : (stryCov_9fa48("44257"), `Invalid selected index: ${state.ui.selectedIndex}`);
        }
      }

      // Validate sort direction
      if (stryMutAct_9fa48("44260") ? state.ui.sortDirection || !['asc', 'desc'].includes(state.ui.sortDirection) : stryMutAct_9fa48("44259") ? false : stryMutAct_9fa48("44258") ? true : (stryCov_9fa48("44258", "44259", "44260"), state.ui.sortDirection && (stryMutAct_9fa48("44261") ? ['asc', 'desc'].includes(state.ui.sortDirection) : (stryCov_9fa48("44261"), !(stryMutAct_9fa48("44262") ? [] : (stryCov_9fa48("44262"), [stryMutAct_9fa48("44263") ? "" : (stryCov_9fa48("44263"), 'asc'), stryMutAct_9fa48("44264") ? "" : (stryCov_9fa48("44264"), 'desc')])).includes(state.ui.sortDirection))))) {
        if (stryMutAct_9fa48("44265")) {
          {}
        } else {
          stryCov_9fa48("44265");
          return stryMutAct_9fa48("44266") ? `` : (stryCov_9fa48("44266"), `Invalid sort direction: ${state.ui.sortDirection}`);
        }
      }

      // Validate config
      if (stryMutAct_9fa48("44269") ? typeof state.config.refreshInterval !== 'number' && state.config.refreshInterval < 1000 : stryMutAct_9fa48("44268") ? false : stryMutAct_9fa48("44267") ? true : (stryCov_9fa48("44267", "44268", "44269"), (stryMutAct_9fa48("44271") ? typeof state.config.refreshInterval === 'number' : stryMutAct_9fa48("44270") ? false : (stryCov_9fa48("44270", "44271"), typeof state.config.refreshInterval !== (stryMutAct_9fa48("44272") ? "" : (stryCov_9fa48("44272"), 'number')))) || (stryMutAct_9fa48("44275") ? state.config.refreshInterval >= 1000 : stryMutAct_9fa48("44274") ? state.config.refreshInterval <= 1000 : stryMutAct_9fa48("44273") ? false : (stryCov_9fa48("44273", "44274", "44275"), state.config.refreshInterval < 1000)))) {
        if (stryMutAct_9fa48("44276")) {
          {}
        } else {
          stryCov_9fa48("44276");
          return stryMutAct_9fa48("44277") ? `` : (stryCov_9fa48("44277"), `Invalid refresh interval: ${state.config.refreshInterval}`);
        }
      }
      return null;
    }
  }

  /**
   * Create a state snapshot
   * @param {string} [name] - Optional snapshot name
   * @returns {number} Snapshot index
   */
  createSnapshot(name) {
    if (stryMutAct_9fa48("44278")) {
      {}
    } else {
      stryCov_9fa48("44278");
      const snapshot = stryMutAct_9fa48("44279") ? {} : (stryCov_9fa48("44279"), {
        name: stryMutAct_9fa48("44282") ? name && `snapshot_${Date.now()}` : stryMutAct_9fa48("44281") ? false : stryMutAct_9fa48("44280") ? true : (stryCov_9fa48("44280", "44281", "44282"), name || (stryMutAct_9fa48("44283") ? `` : (stryCov_9fa48("44283"), `snapshot_${Date.now()}`))),
        timestamp: Date.now(),
        state: this.deepClone(this.state)
      });
      this.snapshots.push(snapshot);

      // Trim old snapshots
      if (stryMutAct_9fa48("44287") ? this.snapshots.length <= this.maxSnapshots : stryMutAct_9fa48("44286") ? this.snapshots.length >= this.maxSnapshots : stryMutAct_9fa48("44285") ? false : stryMutAct_9fa48("44284") ? true : (stryCov_9fa48("44284", "44285", "44286", "44287"), this.snapshots.length > this.maxSnapshots)) {
        if (stryMutAct_9fa48("44288")) {
          {}
        } else {
          stryCov_9fa48("44288");
          this.snapshots = stryMutAct_9fa48("44289") ? this.snapshots : (stryCov_9fa48("44289"), this.snapshots.slice(stryMutAct_9fa48("44290") ? +this.maxSnapshots : (stryCov_9fa48("44290"), -this.maxSnapshots)));
        }
      }
      if (stryMutAct_9fa48("44292") ? false : stryMutAct_9fa48("44291") ? true : (stryCov_9fa48("44291", "44292"), this.eventBus)) {
        if (stryMutAct_9fa48("44293")) {
          {}
        } else {
          stryCov_9fa48("44293");
          this.eventBus.emit(stryMutAct_9fa48("44294") ? "" : (stryCov_9fa48("44294"), 'state:snapshot'), stryMutAct_9fa48("44295") ? {} : (stryCov_9fa48("44295"), {
            name: snapshot.name
          }));
        }
      }
      return stryMutAct_9fa48("44296") ? this.snapshots.length + 1 : (stryCov_9fa48("44296"), this.snapshots.length - 1);
    }
  }

  /**
   * Restore state from a snapshot
   * @param {number} index - Snapshot index
   * @throws {Error} If snapshot doesn't exist
   */
  restoreSnapshot(index) {
    if (stryMutAct_9fa48("44297")) {
      {}
    } else {
      stryCov_9fa48("44297");
      if (stryMutAct_9fa48("44300") ? index < 0 && index >= this.snapshots.length : stryMutAct_9fa48("44299") ? false : stryMutAct_9fa48("44298") ? true : (stryCov_9fa48("44298", "44299", "44300"), (stryMutAct_9fa48("44303") ? index >= 0 : stryMutAct_9fa48("44302") ? index <= 0 : stryMutAct_9fa48("44301") ? false : (stryCov_9fa48("44301", "44302", "44303"), index < 0)) || (stryMutAct_9fa48("44306") ? index < this.snapshots.length : stryMutAct_9fa48("44305") ? index > this.snapshots.length : stryMutAct_9fa48("44304") ? false : (stryCov_9fa48("44304", "44305", "44306"), index >= this.snapshots.length)))) {
        if (stryMutAct_9fa48("44307")) {
          {}
        } else {
          stryCov_9fa48("44307");
          throw new Error(stryMutAct_9fa48("44308") ? `` : (stryCov_9fa48("44308"), `Snapshot at index ${index} does not exist`));
        }
      }
      const snapshot = this.snapshots[index];
      const oldState = this.state;
      this.state = this.deepClone(snapshot.state);
      if (stryMutAct_9fa48("44310") ? false : stryMutAct_9fa48("44309") ? true : (stryCov_9fa48("44309", "44310"), this.eventBus)) {
        if (stryMutAct_9fa48("44311")) {
          {}
        } else {
          stryCov_9fa48("44311");
          this.eventBus.emit(stryMutAct_9fa48("44312") ? "" : (stryCov_9fa48("44312"), 'state:restored'), stryMutAct_9fa48("44313") ? {} : (stryCov_9fa48("44313"), {
            snapshotName: snapshot.name,
            oldState: this.deepClone(oldState),
            newState: this.deepClone(this.state)
          }));
        }
      }
    }
  }

  /**
   * Get all snapshots
   * @returns {Array<{name: string, timestamp: number}>}
   */
  getSnapshots() {
    if (stryMutAct_9fa48("44314")) {
      {}
    } else {
      stryCov_9fa48("44314");
      return this.snapshots.map(stryMutAct_9fa48("44315") ? () => undefined : (stryCov_9fa48("44315"), s => stryMutAct_9fa48("44316") ? {} : (stryCov_9fa48("44316"), {
        name: s.name,
        timestamp: s.timestamp
      })));
    }
  }

  /**
   * Deep merge state objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object with updates
   * @returns {Object} Merged object
   */
  mergeState(target, source) {
    if (stryMutAct_9fa48("44317")) {
      {}
    } else {
      stryCov_9fa48("44317");
      const result = this.deepClone(target);
      for (const key of Object.keys(source)) {
        if (stryMutAct_9fa48("44318")) {
          {}
        } else {
          stryCov_9fa48("44318");
          if (stryMutAct_9fa48("44321") ? source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] !== null && typeof target[key] === 'object' || !Array.isArray(target[key]) : stryMutAct_9fa48("44320") ? false : stryMutAct_9fa48("44319") ? true : (stryCov_9fa48("44319", "44320", "44321"), (stryMutAct_9fa48("44323") ? source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] !== null || typeof target[key] === 'object' : stryMutAct_9fa48("44322") ? true : (stryCov_9fa48("44322", "44323"), (stryMutAct_9fa48("44325") ? source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) || target[key] !== null : stryMutAct_9fa48("44324") ? true : (stryCov_9fa48("44324", "44325"), (stryMutAct_9fa48("44327") ? source[key] !== null && typeof source[key] === 'object' || !Array.isArray(source[key]) : stryMutAct_9fa48("44326") ? true : (stryCov_9fa48("44326", "44327"), (stryMutAct_9fa48("44329") ? source[key] !== null || typeof source[key] === 'object' : stryMutAct_9fa48("44328") ? true : (stryCov_9fa48("44328", "44329"), (stryMutAct_9fa48("44331") ? source[key] === null : stryMutAct_9fa48("44330") ? true : (stryCov_9fa48("44330", "44331"), source[key] !== null)) && (stryMutAct_9fa48("44333") ? typeof source[key] !== 'object' : stryMutAct_9fa48("44332") ? true : (stryCov_9fa48("44332", "44333"), typeof source[key] === (stryMutAct_9fa48("44334") ? "" : (stryCov_9fa48("44334"), 'object')))))) && (stryMutAct_9fa48("44335") ? Array.isArray(source[key]) : (stryCov_9fa48("44335"), !Array.isArray(source[key]))))) && (stryMutAct_9fa48("44337") ? target[key] === null : stryMutAct_9fa48("44336") ? true : (stryCov_9fa48("44336", "44337"), target[key] !== null)))) && (stryMutAct_9fa48("44339") ? typeof target[key] !== 'object' : stryMutAct_9fa48("44338") ? true : (stryCov_9fa48("44338", "44339"), typeof target[key] === (stryMutAct_9fa48("44340") ? "" : (stryCov_9fa48("44340"), 'object')))))) && (stryMutAct_9fa48("44341") ? Array.isArray(target[key]) : (stryCov_9fa48("44341"), !Array.isArray(target[key]))))) {
            if (stryMutAct_9fa48("44342")) {
              {}
            } else {
              stryCov_9fa48("44342");
              result[key] = this.mergeState(target[key], source[key]);
            }
          } else {
            if (stryMutAct_9fa48("44343")) {
              {}
            } else {
              stryCov_9fa48("44343");
              result[key] = this.deepClone(source[key]);
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Deep clone an object
   * @param {*} obj - Object to clone
   * @returns {*} Cloned object
   */
  deepClone(obj) {
    if (stryMutAct_9fa48("44344")) {
      {}
    } else {
      stryCov_9fa48("44344");
      if (stryMutAct_9fa48("44347") ? obj === null && typeof obj !== 'object' : stryMutAct_9fa48("44346") ? false : stryMutAct_9fa48("44345") ? true : (stryCov_9fa48("44345", "44346", "44347"), (stryMutAct_9fa48("44349") ? obj !== null : stryMutAct_9fa48("44348") ? false : (stryCov_9fa48("44348", "44349"), obj === null)) || (stryMutAct_9fa48("44351") ? typeof obj === 'object' : stryMutAct_9fa48("44350") ? false : (stryCov_9fa48("44350", "44351"), typeof obj !== (stryMutAct_9fa48("44352") ? "" : (stryCov_9fa48("44352"), 'object')))))) {
        if (stryMutAct_9fa48("44353")) {
          {}
        } else {
          stryCov_9fa48("44353");
          return obj;
        }
      }
      if (stryMutAct_9fa48("44355") ? false : stryMutAct_9fa48("44354") ? true : (stryCov_9fa48("44354", "44355"), Array.isArray(obj))) {
        if (stryMutAct_9fa48("44356")) {
          {}
        } else {
          stryCov_9fa48("44356");
          return obj.map(stryMutAct_9fa48("44357") ? () => undefined : (stryCov_9fa48("44357"), item => this.deepClone(item)));
        }
      }
      if (stryMutAct_9fa48("44359") ? false : stryMutAct_9fa48("44358") ? true : (stryCov_9fa48("44358", "44359"), obj instanceof Date)) {
        if (stryMutAct_9fa48("44360")) {
          {}
        } else {
          stryCov_9fa48("44360");
          return new Date(obj.getTime());
        }
      }
      const cloned = {};
      for (const key of Object.keys(obj)) {
        if (stryMutAct_9fa48("44361")) {
          {}
        } else {
          stryCov_9fa48("44361");
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
  }

  /**
   * Reset state to initial values
   */
  reset() {
    if (stryMutAct_9fa48("44362")) {
      {}
    } else {
      stryCov_9fa48("44362");
      const oldState = this.state;
      this.state = this.getInitialState();
      if (stryMutAct_9fa48("44364") ? false : stryMutAct_9fa48("44363") ? true : (stryCov_9fa48("44363", "44364"), this.eventBus)) {
        if (stryMutAct_9fa48("44365")) {
          {}
        } else {
          stryCov_9fa48("44365");
          this.eventBus.emit(stryMutAct_9fa48("44366") ? "" : (stryCov_9fa48("44366"), 'state:reset'), stryMutAct_9fa48("44367") ? {} : (stryCov_9fa48("44367"), {
            oldState: this.deepClone(oldState)
          }));
        }
      }
    }
  }

  /**
   * Subscribe to state changes for a specific path
   * @param {string} path - State path to watch
   * @param {Function} callback - Callback when path changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, callback) {
    if (stryMutAct_9fa48("44368")) {
      {}
    } else {
      stryCov_9fa48("44368");
      if (stryMutAct_9fa48("44371") ? false : stryMutAct_9fa48("44370") ? true : stryMutAct_9fa48("44369") ? this.eventBus : (stryCov_9fa48("44369", "44370", "44371"), !this.eventBus)) {
        if (stryMutAct_9fa48("44372")) {
          {}
        } else {
          stryCov_9fa48("44372");
          throw new Error(stryMutAct_9fa48("44373") ? "" : (stryCov_9fa48("44373"), 'EventBus required for subscriptions'));
        }
      }
      return this.eventBus.on(stryMutAct_9fa48("44374") ? "" : (stryCov_9fa48("44374"), 'state:changed'), ({
        oldState,
        newState
      }) => {
        if (stryMutAct_9fa48("44375")) {
          {}
        } else {
          stryCov_9fa48("44375");
          const oldValue = this.getValueAtPath(oldState, path);
          const newValue = this.getValueAtPath(newState, path);
          if (stryMutAct_9fa48("44378") ? false : stryMutAct_9fa48("44377") ? true : stryMutAct_9fa48("44376") ? this.deepEqual(oldValue, newValue) : (stryCov_9fa48("44376", "44377", "44378"), !this.deepEqual(oldValue, newValue))) {
            if (stryMutAct_9fa48("44379")) {
              {}
            } else {
              stryCov_9fa48("44379");
              callback(newValue, oldValue);
            }
          }
        }
      });
    }
  }

  /**
   * Get value at a dot-separated path
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-separated path
   * @returns {*}
   */
  getValueAtPath(obj, path) {
    if (stryMutAct_9fa48("44380")) {
      {}
    } else {
      stryCov_9fa48("44380");
      const parts = path.split(stryMutAct_9fa48("44381") ? "" : (stryCov_9fa48("44381"), '.'));
      let value = obj;
      for (const part of parts) {
        if (stryMutAct_9fa48("44382")) {
          {}
        } else {
          stryCov_9fa48("44382");
          if (stryMutAct_9fa48("44385") ? value === undefined && value === null : stryMutAct_9fa48("44384") ? false : stryMutAct_9fa48("44383") ? true : (stryCov_9fa48("44383", "44384", "44385"), (stryMutAct_9fa48("44387") ? value !== undefined : stryMutAct_9fa48("44386") ? false : (stryCov_9fa48("44386", "44387"), value === undefined)) || (stryMutAct_9fa48("44389") ? value !== null : stryMutAct_9fa48("44388") ? false : (stryCov_9fa48("44388", "44389"), value === null)))) return undefined;
          value = value[part];
        }
      }
      return value;
    }
  }

  /**
   * Deep equality check
   * @param {*} a - First value
   * @param {*} b - Second value
   * @returns {boolean}
   */
  deepEqual(a, b) {
    if (stryMutAct_9fa48("44390")) {
      {}
    } else {
      stryCov_9fa48("44390");
      if (stryMutAct_9fa48("44393") ? a !== b : stryMutAct_9fa48("44392") ? false : stryMutAct_9fa48("44391") ? true : (stryCov_9fa48("44391", "44392", "44393"), a === b)) return stryMutAct_9fa48("44394") ? false : (stryCov_9fa48("44394"), true);
      if (stryMutAct_9fa48("44397") ? a === null && b === null : stryMutAct_9fa48("44396") ? false : stryMutAct_9fa48("44395") ? true : (stryCov_9fa48("44395", "44396", "44397"), (stryMutAct_9fa48("44399") ? a !== null : stryMutAct_9fa48("44398") ? false : (stryCov_9fa48("44398", "44399"), a === null)) || (stryMutAct_9fa48("44401") ? b !== null : stryMutAct_9fa48("44400") ? false : (stryCov_9fa48("44400", "44401"), b === null)))) return stryMutAct_9fa48("44402") ? true : (stryCov_9fa48("44402"), false);
      if (stryMutAct_9fa48("44405") ? typeof a === typeof b : stryMutAct_9fa48("44404") ? false : stryMutAct_9fa48("44403") ? true : (stryCov_9fa48("44403", "44404", "44405"), typeof a !== typeof b)) return stryMutAct_9fa48("44406") ? true : (stryCov_9fa48("44406"), false);
      if (stryMutAct_9fa48("44409") ? typeof a === 'object' : stryMutAct_9fa48("44408") ? false : stryMutAct_9fa48("44407") ? true : (stryCov_9fa48("44407", "44408", "44409"), typeof a !== (stryMutAct_9fa48("44410") ? "" : (stryCov_9fa48("44410"), 'object')))) return stryMutAct_9fa48("44411") ? true : (stryCov_9fa48("44411"), false);
      if (stryMutAct_9fa48("44414") ? Array.isArray(a) === Array.isArray(b) : stryMutAct_9fa48("44413") ? false : stryMutAct_9fa48("44412") ? true : (stryCov_9fa48("44412", "44413", "44414"), Array.isArray(a) !== Array.isArray(b))) return stryMutAct_9fa48("44415") ? true : (stryCov_9fa48("44415"), false);
      if (stryMutAct_9fa48("44417") ? false : stryMutAct_9fa48("44416") ? true : (stryCov_9fa48("44416", "44417"), Array.isArray(a))) {
        if (stryMutAct_9fa48("44418")) {
          {}
        } else {
          stryCov_9fa48("44418");
          if (stryMutAct_9fa48("44421") ? a.length === b.length : stryMutAct_9fa48("44420") ? false : stryMutAct_9fa48("44419") ? true : (stryCov_9fa48("44419", "44420", "44421"), a.length !== b.length)) return stryMutAct_9fa48("44422") ? true : (stryCov_9fa48("44422"), false);
          return stryMutAct_9fa48("44423") ? a.some((item, i) => this.deepEqual(item, b[i])) : (stryCov_9fa48("44423"), a.every(stryMutAct_9fa48("44424") ? () => undefined : (stryCov_9fa48("44424"), (item, i) => this.deepEqual(item, b[i]))));
        }
      }
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (stryMutAct_9fa48("44427") ? keysA.length === keysB.length : stryMutAct_9fa48("44426") ? false : stryMutAct_9fa48("44425") ? true : (stryCov_9fa48("44425", "44426", "44427"), keysA.length !== keysB.length)) return stryMutAct_9fa48("44428") ? true : (stryCov_9fa48("44428"), false);
      return stryMutAct_9fa48("44429") ? keysA.some(key => this.deepEqual(a[key], b[key])) : (stryCov_9fa48("44429"), keysA.every(stryMutAct_9fa48("44430") ? () => undefined : (stryCov_9fa48("44430"), key => this.deepEqual(a[key], b[key]))));
    }
  }
}