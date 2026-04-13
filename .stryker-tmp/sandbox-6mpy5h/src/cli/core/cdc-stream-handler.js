/**
 * CDCStreamHandler - Handles CDC stream subscription and event processing
 *
 * Manages the CDC stream connection, processes events, updates the cache,
 * and coordinates with the view manager for UI updates.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.9
 */
// @ts-nocheck


/**
 * @typedef {'disconnected'|'connecting'|'connected'|'paused'|'error'} CDCStreamStatus
 */

/**
 * @typedef {Object} CDCStreamStats
 * @property {number} eventsReceived - Total events received
 * @property {number} eventsPerSecond - Current events per second rate
 * @property {number} lastEventTime - Timestamp of last event
 * @property {number} lag - Current CDC lag in milliseconds
 */

/**
 * CDCStreamHandler class for managing CDC stream subscription and events
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
export class CDCStreamHandler {
  /**
   * Creates a new CDCStreamHandler
   * @param {Object} options - Handler options
   * @param {import('./connection-manager.js').ConnectionManager} options.connectionManager -
   *   Connection manager
   * @param {import('./remote-cache.js').RemoteCache} options.cache - Remote cache
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('./state-manager.js').StateManager} [options.stateManager] - State manager
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("40020")) {
      {}
    } else {
      stryCov_9fa48("40020");
      this.connectionManager = options.connectionManager;
      this.cache = options.cache;
      this.eventBus = stryMutAct_9fa48("40023") ? options.eventBus && null : stryMutAct_9fa48("40022") ? false : stryMutAct_9fa48("40021") ? true : (stryCov_9fa48("40021", "40022", "40023"), options.eventBus || null);
      this.stateManager = stryMutAct_9fa48("40026") ? options.stateManager && null : stryMutAct_9fa48("40025") ? false : stryMutAct_9fa48("40024") ? true : (stryCov_9fa48("40024", "40025", "40026"), options.stateManager || null);

      /** @type {CDCStreamStatus} */
      this.status = stryMutAct_9fa48("40027") ? "" : (stryCov_9fa48("40027"), 'disconnected');

      /** @type {boolean} */
      this.paused = stryMutAct_9fa48("40028") ? true : (stryCov_9fa48("40028"), false);

      /** @type {CDCStreamStats} */
      this.stats = stryMutAct_9fa48("40029") ? {} : (stryCov_9fa48("40029"), {
        eventsReceived: 0,
        eventsPerSecond: 0,
        lastEventTime: null,
        lag: 0
      });

      // Event rate calculation
      this.eventTimestamps = stryMutAct_9fa48("40030") ? ["Stryker was here"] : (stryCov_9fa48("40030"), []);
      this.rateWindowMs = 5000; // 5 second window for rate calculation

      // Changed rows tracking for highlighting
      this.changedRows = new Map(); // key -> {timestamp, table}
      this.highlightDurationMs = 2000;

      // Bind handlers
      this.handleCacheDump = this.handleCacheDump.bind(this);
      this.handleCDCEvent = this.handleCDCEvent.bind(this);
      this.handleStatusChange = this.handleStatusChange.bind(this);

      // Setup connection manager callbacks
      this.setupConnectionCallbacks();
    }
  }

  /**
   * Setup callbacks on the connection manager
   */
  setupConnectionCallbacks() {
    if (stryMutAct_9fa48("40031")) {
      {}
    } else {
      stryCov_9fa48("40031");
      if (stryMutAct_9fa48("40034") ? false : stryMutAct_9fa48("40033") ? true : stryMutAct_9fa48("40032") ? this.connectionManager : (stryCov_9fa48("40032", "40033", "40034"), !this.connectionManager)) return;
      this.connectionManager.onCacheDump = this.handleCacheDump;
      this.connectionManager.onCDCEvent = this.handleCDCEvent;

      // Store original status change handler to chain
      const originalStatusChange = this.connectionManager.onStatusChange;
      this.connectionManager.onStatusChange = (status, ...args) => {
        if (stryMutAct_9fa48("40035")) {
          {}
        } else {
          stryCov_9fa48("40035");
          this.handleStatusChange(status, ...args);
          if (stryMutAct_9fa48("40037") ? false : stryMutAct_9fa48("40036") ? true : (stryCov_9fa48("40036", "40037"), originalStatusChange)) {
            if (stryMutAct_9fa48("40038")) {
              {}
            } else {
              stryCov_9fa48("40038");
              originalStatusChange(status, ...args);
            }
          }
        }
      };
    }
  }

  /**
   * Handle initial cache dump from server
   * Requirements: 12.1, 13.1
   * @param {Object} dump - Full cache dump data
   */
  handleCacheDump(dump) {
    if (stryMutAct_9fa48("40039")) {
      {}
    } else {
      stryCov_9fa48("40039");
      if (stryMutAct_9fa48("40042") ? false : stryMutAct_9fa48("40041") ? true : stryMutAct_9fa48("40040") ? this.cache : (stryCov_9fa48("40040", "40041", "40042"), !this.cache)) return;
      this.cache.loadFromDump(dump);
      this.status = stryMutAct_9fa48("40043") ? "" : (stryCov_9fa48("40043"), 'connected');

      // Emit cache initialized event
      if (stryMutAct_9fa48("40045") ? false : stryMutAct_9fa48("40044") ? true : (stryCov_9fa48("40044", "40045"), this.eventBus)) {
        if (stryMutAct_9fa48("40046")) {
          {}
        } else {
          stryCov_9fa48("40046");
          this.eventBus.emit(stryMutAct_9fa48("40047") ? "" : (stryCov_9fa48("40047"), 'cdc:initialized'), stryMutAct_9fa48("40048") ? {} : (stryCov_9fa48("40048"), {
            timestamp: Date.now(),
            tableCount: Object.keys(dump).length
          }));
        }
      }

      // Update state manager
      if (stryMutAct_9fa48("40050") ? false : stryMutAct_9fa48("40049") ? true : (stryCov_9fa48("40049", "40050"), this.stateManager)) {
        if (stryMutAct_9fa48("40051")) {
          {}
        } else {
          stryCov_9fa48("40051");
          this.stateManager.setState(stryMutAct_9fa48("40052") ? {} : (stryCov_9fa48("40052"), {
            cache: stryMutAct_9fa48("40053") ? {} : (stryCov_9fa48("40053"), {
              lastUpdate: Date.now(),
              cdcLag: 0
            })
          }));
        }
      }
      this.emitStatusUpdate();
    }
  }

  /**
   * Handle incoming CDC event
   * Requirements: 12.2, 12.3, 12.4
   * @param {Object} event - CDC event
   */
  handleCDCEvent(event) {
    if (stryMutAct_9fa48("40054")) {
      {}
    } else {
      stryCov_9fa48("40054");
      if (stryMutAct_9fa48("40057") ? false : stryMutAct_9fa48("40056") ? true : stryMutAct_9fa48("40055") ? this.cache : (stryCov_9fa48("40055", "40056", "40057"), !this.cache)) return;

      // If paused, don't process events
      if (stryMutAct_9fa48("40059") ? false : stryMutAct_9fa48("40058") ? true : (stryCov_9fa48("40058", "40059"), this.paused)) {
        if (stryMutAct_9fa48("40060")) {
          {}
        } else {
          stryCov_9fa48("40060");
          return;
        }
      }

      // Apply event to cache
      const change = this.cache.applyCDCEvent(event);

      // Update stats
      stryMutAct_9fa48("40061") ? this.stats.eventsReceived-- : (stryCov_9fa48("40061"), this.stats.eventsReceived++);
      this.stats.lastEventTime = Date.now();
      this.stats.lag = this.cache.cdcLag;

      // Track event for rate calculation
      this.eventTimestamps.push(Date.now());
      this.updateEventRate();

      // Track changed row for highlighting
      if (stryMutAct_9fa48("40063") ? false : stryMutAct_9fa48("40062") ? true : (stryCov_9fa48("40062", "40063"), change.applied)) {
        if (stryMutAct_9fa48("40064")) {
          {}
        } else {
          stryCov_9fa48("40064");
          this.trackChangedRow(change.key, change.table);
        }
      }

      // Emit CDC update event
      if (stryMutAct_9fa48("40066") ? false : stryMutAct_9fa48("40065") ? true : (stryCov_9fa48("40065", "40066"), this.eventBus)) {
        if (stryMutAct_9fa48("40067")) {
          {}
        } else {
          stryCov_9fa48("40067");
          this.eventBus.emit(stryMutAct_9fa48("40068") ? "" : (stryCov_9fa48("40068"), 'cache:update'), stryMutAct_9fa48("40069") ? {} : (stryCov_9fa48("40069"), {
            table: change.table,
            key: change.key,
            operation: change.operation,
            timestamp: Date.now(),
            affectedTableId: change.affectedTableId
          }));

          // Emit specific table event
          this.eventBus.emit(stryMutAct_9fa48("40070") ? `` : (stryCov_9fa48("40070"), `cdc:${change.table}`), stryMutAct_9fa48("40071") ? {} : (stryCov_9fa48("40071"), {
            key: change.key,
            operation: change.operation,
            data: event.data
          }));
        }
      }

      // Update state manager with cache stats
      if (stryMutAct_9fa48("40073") ? false : stryMutAct_9fa48("40072") ? true : (stryCov_9fa48("40072", "40073"), this.stateManager)) {
        if (stryMutAct_9fa48("40074")) {
          {}
        } else {
          stryCov_9fa48("40074");
          this.stateManager.setState(stryMutAct_9fa48("40075") ? {} : (stryCov_9fa48("40075"), {
            cache: stryMutAct_9fa48("40076") ? {} : (stryCov_9fa48("40076"), {
              lastUpdate: Date.now(),
              cdcLag: this.stats.lag
            })
          }));
        }
      }
    }
  }

  /**
   * Handle connection status changes
   * @param {string} status - New connection status
   * @param {number} [_delay] - Reconnection delay (if reconnecting)
   */
  handleStatusChange(status, _delay) {
    if (stryMutAct_9fa48("40077")) {
      {}
    } else {
      stryCov_9fa48("40077");
      switch (status) {
        case stryMutAct_9fa48("40079") ? "" : (stryCov_9fa48("40079"), 'connected'):
          if (stryMutAct_9fa48("40078")) {} else {
            stryCov_9fa48("40078");
            this.status = stryMutAct_9fa48("40080") ? "" : (stryCov_9fa48("40080"), 'connected');
            break;
          }
        case stryMutAct_9fa48("40081") ? "" : (stryCov_9fa48("40081"), 'disconnected'):
        case stryMutAct_9fa48("40083") ? "" : (stryCov_9fa48("40083"), 'reconnecting'):
          if (stryMutAct_9fa48("40082")) {} else {
            stryCov_9fa48("40082");
            this.status = stryMutAct_9fa48("40084") ? "" : (stryCov_9fa48("40084"), 'disconnected');
            break;
          }
        case stryMutAct_9fa48("40086") ? "" : (stryCov_9fa48("40086"), 'failed'):
          if (stryMutAct_9fa48("40085")) {} else {
            stryCov_9fa48("40085");
            this.status = stryMutAct_9fa48("40087") ? "" : (stryCov_9fa48("40087"), 'error');
            break;
          }
        default:
          if (stryMutAct_9fa48("40088")) {} else {
            stryCov_9fa48("40088");
            break;
          }
      }
      this.emitStatusUpdate();
    }
  }

  /**
   * Update event rate calculation
   */
  updateEventRate() {
    if (stryMutAct_9fa48("40089")) {
      {}
    } else {
      stryCov_9fa48("40089");
      const now = Date.now();
      const cutoff = stryMutAct_9fa48("40090") ? now + this.rateWindowMs : (stryCov_9fa48("40090"), now - this.rateWindowMs);

      // Remove old timestamps
      this.eventTimestamps = stryMutAct_9fa48("40091") ? this.eventTimestamps : (stryCov_9fa48("40091"), this.eventTimestamps.filter(stryMutAct_9fa48("40092") ? () => undefined : (stryCov_9fa48("40092"), t => stryMutAct_9fa48("40096") ? t <= cutoff : stryMutAct_9fa48("40095") ? t >= cutoff : stryMutAct_9fa48("40094") ? false : stryMutAct_9fa48("40093") ? true : (stryCov_9fa48("40093", "40094", "40095", "40096"), t > cutoff))));

      // Calculate rate
      if (stryMutAct_9fa48("40100") ? this.eventTimestamps.length <= 0 : stryMutAct_9fa48("40099") ? this.eventTimestamps.length >= 0 : stryMutAct_9fa48("40098") ? false : stryMutAct_9fa48("40097") ? true : (stryCov_9fa48("40097", "40098", "40099", "40100"), this.eventTimestamps.length > 0)) {
        if (stryMutAct_9fa48("40101")) {
          {}
        } else {
          stryCov_9fa48("40101");
          this.stats.eventsPerSecond = stryMutAct_9fa48("40102") ? this.eventTimestamps.length / this.rateWindowMs / 1000 : (stryCov_9fa48("40102"), (stryMutAct_9fa48("40103") ? this.eventTimestamps.length * this.rateWindowMs : (stryCov_9fa48("40103"), this.eventTimestamps.length / this.rateWindowMs)) * 1000);
        }
      } else {
        if (stryMutAct_9fa48("40104")) {
          {}
        } else {
          stryCov_9fa48("40104");
          this.stats.eventsPerSecond = 0;
        }
      }
    }
  }

  /**
   * Track a changed row for highlighting
   * Requirements: 12.4
   * @param {string} key - Row key
   * @param {string} table - Table name
   */
  trackChangedRow(key, table) {
    if (stryMutAct_9fa48("40105")) {
      {}
    } else {
      stryCov_9fa48("40105");
      const timestamp = Date.now();
      this.changedRows.set(key, stryMutAct_9fa48("40106") ? {} : (stryCov_9fa48("40106"), {
        timestamp,
        table
      }));

      // Schedule highlight removal
      setTimeout(() => {
        if (stryMutAct_9fa48("40107")) {
          {}
        } else {
          stryCov_9fa48("40107");
          this.clearChangedRow(key, timestamp);
        }
      }, this.highlightDurationMs);
    }
  }

  /**
   * Clear a changed row highlight
   * @param {string} key - Row key
   * @param {number} originalTimestamp - Original change timestamp
   */
  clearChangedRow(key, originalTimestamp) {
    if (stryMutAct_9fa48("40108")) {
      {}
    } else {
      stryCov_9fa48("40108");
      const entry = this.changedRows.get(key);
      // Only clear if this is the same change (not a newer one)
      if (stryMutAct_9fa48("40111") ? entry || entry.timestamp === originalTimestamp : stryMutAct_9fa48("40110") ? false : stryMutAct_9fa48("40109") ? true : (stryCov_9fa48("40109", "40110", "40111"), entry && (stryMutAct_9fa48("40113") ? entry.timestamp !== originalTimestamp : stryMutAct_9fa48("40112") ? true : (stryCov_9fa48("40112", "40113"), entry.timestamp === originalTimestamp)))) {
        if (stryMutAct_9fa48("40114")) {
          {}
        } else {
          stryCov_9fa48("40114");
          this.changedRows.delete(key);
          if (stryMutAct_9fa48("40116") ? false : stryMutAct_9fa48("40115") ? true : (stryCov_9fa48("40115", "40116"), this.eventBus)) {
            if (stryMutAct_9fa48("40117")) {
              {}
            } else {
              stryCov_9fa48("40117");
              this.eventBus.emit(stryMutAct_9fa48("40118") ? "" : (stryCov_9fa48("40118"), 'cdc:highlightCleared'), stryMutAct_9fa48("40119") ? {} : (stryCov_9fa48("40119"), {
                key,
                table: entry.table
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Check if a row is currently highlighted as changed
   * @param {string} key - Row key
   * @return {boolean}
   */
  isRowChanged(key) {
    if (stryMutAct_9fa48("40120")) {
      {}
    } else {
      stryCov_9fa48("40120");
      return this.changedRows.has(key);
    }
  }

  /**
   * Get all currently changed rows
   * @return {Map<string, {timestamp: number, table: string}>}
   */
  getChangedRows() {
    if (stryMutAct_9fa48("40121")) {
      {}
    } else {
      stryCov_9fa48("40121");
      return new Map(this.changedRows);
    }
  }

  /**
   * Emit status update event
   * Requirements: 12.5
   */
  emitStatusUpdate() {
    if (stryMutAct_9fa48("40122")) {
      {}
    } else {
      stryCov_9fa48("40122");
      if (stryMutAct_9fa48("40124") ? false : stryMutAct_9fa48("40123") ? true : (stryCov_9fa48("40123", "40124"), this.eventBus)) {
        if (stryMutAct_9fa48("40125")) {
          {}
        } else {
          stryCov_9fa48("40125");
          this.eventBus.emit(stryMutAct_9fa48("40126") ? "" : (stryCov_9fa48("40126"), 'cdc:status'), stryMutAct_9fa48("40127") ? {} : (stryCov_9fa48("40127"), {
            status: this.status,
            paused: this.paused,
            stats: this.getStats()
          }));
        }
      }
    }
  }

  /**
   * Get current CDC stream status
   * @return {CDCStreamStatus}
   */
  getStatus() {
    if (stryMutAct_9fa48("40128")) {
      {}
    } else {
      stryCov_9fa48("40128");
      return this.status;
    }
  }

  /**
   * Get current CDC stream statistics
   * Requirements: 12.5
   * @return {CDCStreamStats}
   */
  getStats() {
    if (stryMutAct_9fa48("40129")) {
      {}
    } else {
      stryCov_9fa48("40129");
      // Update rate before returning
      this.updateEventRate();
      return stryMutAct_9fa48("40130") ? {} : (stryCov_9fa48("40130"), {
        ...this.stats,
        eventsPerSecond: stryMutAct_9fa48("40131") ? Math.round(this.stats.eventsPerSecond * 100) * 100 : (stryCov_9fa48("40131"), Math.round(stryMutAct_9fa48("40132") ? this.stats.eventsPerSecond / 100 : (stryCov_9fa48("40132"), this.stats.eventsPerSecond * 100)) / 100)
      });
    }
  }

  /**
   * Check if CDC stream is paused
   * @return {boolean}
   */
  isPaused() {
    if (stryMutAct_9fa48("40133")) {
      {}
    } else {
      stryCov_9fa48("40133");
      return this.paused;
    }
  }

  /**
   * Check if CDC stream is connected
   * @return {boolean}
   */
  isConnected() {
    if (stryMutAct_9fa48("40134")) {
      {}
    } else {
      stryCov_9fa48("40134");
      return stryMutAct_9fa48("40137") ? this.status === 'connected' || !this.paused : stryMutAct_9fa48("40136") ? false : stryMutAct_9fa48("40135") ? true : (stryCov_9fa48("40135", "40136", "40137"), (stryMutAct_9fa48("40139") ? this.status !== 'connected' : stryMutAct_9fa48("40138") ? true : (stryCov_9fa48("40138", "40139"), this.status === (stryMutAct_9fa48("40140") ? "" : (stryCov_9fa48("40140"), 'connected')))) && (stryMutAct_9fa48("40141") ? this.paused : (stryCov_9fa48("40141"), !this.paused)));
    }
  }

  /**
   * Pause CDC stream processing
   * Requirements: 12.6, 12.7
   */
  pause() {
    if (stryMutAct_9fa48("40142")) {
      {}
    } else {
      stryCov_9fa48("40142");
      if (stryMutAct_9fa48("40145") ? false : stryMutAct_9fa48("40144") ? true : stryMutAct_9fa48("40143") ? this.paused : (stryCov_9fa48("40143", "40144", "40145"), !this.paused)) {
        if (stryMutAct_9fa48("40146")) {
          {}
        } else {
          stryCov_9fa48("40146");
          this.paused = stryMutAct_9fa48("40147") ? false : (stryCov_9fa48("40147"), true);
          this.status = stryMutAct_9fa48("40148") ? "" : (stryCov_9fa48("40148"), 'paused');
          this.emitStatusUpdate();
          if (stryMutAct_9fa48("40150") ? false : stryMutAct_9fa48("40149") ? true : (stryCov_9fa48("40149", "40150"), this.eventBus)) {
            if (stryMutAct_9fa48("40151")) {
              {}
            } else {
              stryCov_9fa48("40151");
              this.eventBus.emit(stryMutAct_9fa48("40152") ? "" : (stryCov_9fa48("40152"), 'cdc:paused'), stryMutAct_9fa48("40153") ? {} : (stryCov_9fa48("40153"), {
                timestamp: Date.now()
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Resume CDC stream processing
   * Requirements: 12.6
   */
  resume() {
    if (stryMutAct_9fa48("40154")) {
      {}
    } else {
      stryCov_9fa48("40154");
      if (stryMutAct_9fa48("40156") ? false : stryMutAct_9fa48("40155") ? true : (stryCov_9fa48("40155", "40156"), this.paused)) {
        if (stryMutAct_9fa48("40157")) {
          {}
        } else {
          stryCov_9fa48("40157");
          this.paused = stryMutAct_9fa48("40158") ? true : (stryCov_9fa48("40158"), false);
          // Restore status based on connection state
          if (stryMutAct_9fa48("40161") ? this.connectionManager || this.connectionManager.isConnected() : stryMutAct_9fa48("40160") ? false : stryMutAct_9fa48("40159") ? true : (stryCov_9fa48("40159", "40160", "40161"), this.connectionManager && this.connectionManager.isConnected())) {
            if (stryMutAct_9fa48("40162")) {
              {}
            } else {
              stryCov_9fa48("40162");
              this.status = stryMutAct_9fa48("40163") ? "" : (stryCov_9fa48("40163"), 'connected');
            }
          } else {
            if (stryMutAct_9fa48("40164")) {
              {}
            } else {
              stryCov_9fa48("40164");
              this.status = stryMutAct_9fa48("40165") ? "" : (stryCov_9fa48("40165"), 'disconnected');
            }
          }
          this.emitStatusUpdate();
          if (stryMutAct_9fa48("40167") ? false : stryMutAct_9fa48("40166") ? true : (stryCov_9fa48("40166", "40167"), this.eventBus)) {
            if (stryMutAct_9fa48("40168")) {
              {}
            } else {
              stryCov_9fa48("40168");
              this.eventBus.emit(stryMutAct_9fa48("40169") ? "" : (stryCov_9fa48("40169"), 'cdc:resumed'), stryMutAct_9fa48("40170") ? {} : (stryCov_9fa48("40170"), {
                timestamp: Date.now()
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Toggle pause state
   * @return {boolean} New paused state
   */
  togglePause() {
    if (stryMutAct_9fa48("40171")) {
      {}
    } else {
      stryCov_9fa48("40171");
      if (stryMutAct_9fa48("40173") ? false : stryMutAct_9fa48("40172") ? true : (stryCov_9fa48("40172", "40173"), this.paused)) {
        if (stryMutAct_9fa48("40174")) {
          {}
        } else {
          stryCov_9fa48("40174");
          this.resume();
        }
      } else {
        if (stryMutAct_9fa48("40175")) {
          {}
        } else {
          stryCov_9fa48("40175");
          this.pause();
        }
      }
      return this.paused;
    }
  }

  /**
   * Request a manual refresh (full cache dump)
   * Requirements: 12.8, 13.6
   * @return {boolean} Whether request was sent
   */
  requestRefresh() {
    if (stryMutAct_9fa48("40176")) {
      {}
    } else {
      stryCov_9fa48("40176");
      if (stryMutAct_9fa48("40179") ? false : stryMutAct_9fa48("40178") ? true : stryMutAct_9fa48("40177") ? this.connectionManager : (stryCov_9fa48("40177", "40178", "40179"), !this.connectionManager)) return stryMutAct_9fa48("40180") ? true : (stryCov_9fa48("40180"), false);
      const sent = this.connectionManager.requestCacheDump();
      if (stryMutAct_9fa48("40183") ? sent || this.eventBus : stryMutAct_9fa48("40182") ? false : stryMutAct_9fa48("40181") ? true : (stryCov_9fa48("40181", "40182", "40183"), sent && this.eventBus)) {
        if (stryMutAct_9fa48("40184")) {
          {}
        } else {
          stryCov_9fa48("40184");
          this.eventBus.emit(stryMutAct_9fa48("40185") ? "" : (stryCov_9fa48("40185"), 'cdc:refreshRequested'), stryMutAct_9fa48("40186") ? {} : (stryCov_9fa48("40186"), {
            timestamp: Date.now()
          }));
        }
      }
      return sent;
    }
  }

  /**
   * Get status bar display information
   * Requirements: 12.5, 12.9
   * @return {Object} Status bar info
   */
  getStatusBarInfo() {
    if (stryMutAct_9fa48("40187")) {
      {}
    } else {
      stryCov_9fa48("40187");
      const stats = this.getStats();
      const baseStatusInfo = (() => {
        if (stryMutAct_9fa48("40188")) {
          {}
        } else {
          stryCov_9fa48("40188");
          switch (this.status) {
            case stryMutAct_9fa48("40190") ? "" : (stryCov_9fa48("40190"), 'connected'):
              if (stryMutAct_9fa48("40189")) {} else {
                stryCov_9fa48("40189");
                return stryMutAct_9fa48("40191") ? {} : (stryCov_9fa48("40191"), {
                  text: stryMutAct_9fa48("40192") ? "" : (stryCov_9fa48("40192"), 'CDC: Connected'),
                  color: stryMutAct_9fa48("40193") ? "" : (stryCov_9fa48("40193"), 'green')
                });
              }
            case stryMutAct_9fa48("40195") ? "" : (stryCov_9fa48("40195"), 'paused'):
              if (stryMutAct_9fa48("40194")) {} else {
                stryCov_9fa48("40194");
                return stryMutAct_9fa48("40196") ? {} : (stryCov_9fa48("40196"), {
                  text: stryMutAct_9fa48("40197") ? "" : (stryCov_9fa48("40197"), 'CDC: Paused (stale)'),
                  color: stryMutAct_9fa48("40198") ? "" : (stryCov_9fa48("40198"), 'yellow')
                });
              }
            case stryMutAct_9fa48("40200") ? "" : (stryCov_9fa48("40200"), 'disconnected'):
              if (stryMutAct_9fa48("40199")) {} else {
                stryCov_9fa48("40199");
                return stryMutAct_9fa48("40201") ? {} : (stryCov_9fa48("40201"), {
                  text: stryMutAct_9fa48("40202") ? "" : (stryCov_9fa48("40202"), 'CDC: Disconnected'),
                  color: stryMutAct_9fa48("40203") ? "" : (stryCov_9fa48("40203"), 'red')
                });
              }
            case stryMutAct_9fa48("40205") ? "" : (stryCov_9fa48("40205"), 'error'):
              if (stryMutAct_9fa48("40204")) {} else {
                stryCov_9fa48("40204");
                return stryMutAct_9fa48("40206") ? {} : (stryCov_9fa48("40206"), {
                  text: stryMutAct_9fa48("40207") ? "" : (stryCov_9fa48("40207"), 'CDC: Error'),
                  color: stryMutAct_9fa48("40208") ? "" : (stryCov_9fa48("40208"), 'red')
                });
              }
            default:
              if (stryMutAct_9fa48("40209")) {} else {
                stryCov_9fa48("40209");
                return stryMutAct_9fa48("40210") ? {} : (stryCov_9fa48("40210"), {
                  text: stryMutAct_9fa48("40211") ? "" : (stryCov_9fa48("40211"), 'CDC: Unknown'),
                  color: stryMutAct_9fa48("40212") ? "" : (stryCov_9fa48("40212"), 'gray')
                });
              }
          }
        }
      })();
      const statusSegments = stryMutAct_9fa48("40213") ? [] : (stryCov_9fa48("40213"), [baseStatusInfo.text]);

      // Add rate info if connected
      if (stryMutAct_9fa48("40216") ? this.status !== 'connected' : stryMutAct_9fa48("40215") ? false : stryMutAct_9fa48("40214") ? true : (stryCov_9fa48("40214", "40215", "40216"), this.status === (stryMutAct_9fa48("40217") ? "" : (stryCov_9fa48("40217"), 'connected')))) {
        if (stryMutAct_9fa48("40218")) {
          {}
        } else {
          stryCov_9fa48("40218");
          statusSegments.push(stryMutAct_9fa48("40219") ? `` : (stryCov_9fa48("40219"), `${stats.eventsPerSecond.toFixed(1)} evt/s`));
        }
      }

      // Add lag info if significant
      if (stryMutAct_9fa48("40223") ? stats.lag <= 1000 : stryMutAct_9fa48("40222") ? stats.lag >= 1000 : stryMutAct_9fa48("40221") ? false : stryMutAct_9fa48("40220") ? true : (stryCov_9fa48("40220", "40221", "40222", "40223"), stats.lag > 1000)) {
        if (stryMutAct_9fa48("40224")) {
          {}
        } else {
          stryCov_9fa48("40224");
          statusSegments.push(stryMutAct_9fa48("40225") ? `` : (stryCov_9fa48("40225"), `Lag: ${Math.round(stryMutAct_9fa48("40226") ? stats.lag * 1000 : (stryCov_9fa48("40226"), stats.lag / 1000))}s`));
        }
      }

      // Add last update time
      if (stryMutAct_9fa48("40228") ? false : stryMutAct_9fa48("40227") ? true : (stryCov_9fa48("40227", "40228"), stats.lastEventTime)) {
        if (stryMutAct_9fa48("40229")) {
          {}
        } else {
          stryCov_9fa48("40229");
          const secondsAgo = Math.round(stryMutAct_9fa48("40230") ? (Date.now() - stats.lastEventTime) * 1000 : (stryCov_9fa48("40230"), (stryMutAct_9fa48("40231") ? Date.now() + stats.lastEventTime : (stryCov_9fa48("40231"), Date.now() - stats.lastEventTime)) / 1000));
          if (stryMutAct_9fa48("40235") ? secondsAgo <= 0 : stryMutAct_9fa48("40234") ? secondsAgo >= 0 : stryMutAct_9fa48("40233") ? false : stryMutAct_9fa48("40232") ? true : (stryCov_9fa48("40232", "40233", "40234", "40235"), secondsAgo > 0)) {
            if (stryMutAct_9fa48("40236")) {
              {}
            } else {
              stryCov_9fa48("40236");
              statusSegments.push(stryMutAct_9fa48("40237") ? `` : (stryCov_9fa48("40237"), `Last: ${secondsAgo}s ago`));
            }
          }
        }
      }
      return stryMutAct_9fa48("40238") ? {} : (stryCov_9fa48("40238"), {
        text: statusSegments.join(stryMutAct_9fa48("40239") ? "" : (stryCov_9fa48("40239"), ' | ')),
        color: (stryMutAct_9fa48("40243") ? stats.lag <= 5000 : stryMutAct_9fa48("40242") ? stats.lag >= 5000 : stryMutAct_9fa48("40241") ? false : stryMutAct_9fa48("40240") ? true : (stryCov_9fa48("40240", "40241", "40242", "40243"), stats.lag > 5000)) ? stryMutAct_9fa48("40244") ? "" : (stryCov_9fa48("40244"), 'yellow') : baseStatusInfo.color,
        status: this.status,
        paused: this.paused,
        stats
      });
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    if (stryMutAct_9fa48("40245")) {
      {}
    } else {
      stryCov_9fa48("40245");
      this.stats = stryMutAct_9fa48("40246") ? {} : (stryCov_9fa48("40246"), {
        eventsReceived: 0,
        eventsPerSecond: 0,
        lastEventTime: null,
        lag: 0
      });
      this.eventTimestamps = stryMutAct_9fa48("40247") ? ["Stryker was here"] : (stryCov_9fa48("40247"), []);
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (stryMutAct_9fa48("40248")) {
      {}
    } else {
      stryCov_9fa48("40248");
      this.changedRows.clear();
      this.eventTimestamps = stryMutAct_9fa48("40249") ? ["Stryker was here"] : (stryCov_9fa48("40249"), []);

      // Clear connection manager callbacks
      if (stryMutAct_9fa48("40251") ? false : stryMutAct_9fa48("40250") ? true : (stryCov_9fa48("40250", "40251"), this.connectionManager)) {
        if (stryMutAct_9fa48("40252")) {
          {}
        } else {
          stryCov_9fa48("40252");
          this.connectionManager.onCacheDump = null;
          this.connectionManager.onCDCEvent = null;
        }
      }
      if (stryMutAct_9fa48("40254") ? false : stryMutAct_9fa48("40253") ? true : (stryCov_9fa48("40253", "40254"), this.eventBus)) {
        if (stryMutAct_9fa48("40255")) {
          {}
        } else {
          stryCov_9fa48("40255");
          this.eventBus.emit(stryMutAct_9fa48("40256") ? "" : (stryCov_9fa48("40256"), 'cdc:destroyed'), {});
        }
      }
    }
  }
}