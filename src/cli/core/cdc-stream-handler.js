const LOCAL_STR_DISCONNECTED = 'disconnected';
const LOCAL_NUM_FIVE_THOUSAND = 5000;
const LOCAL_NUM_TWO_THOUSAND = 2000;
const LOCAL_STR_CONNECTED = 'connected';
const LOCAL_STR_CDC_INITIALIZED = 'cdc:initialized';
const LOCAL_STR_CACHE_UPDATE = 'cache:update';
const LOCAL_STR_RECONNECTING = 'reconnecting';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_ERROR = 'error';
const LOCAL_NUM_ONE_THOUSAND = 1000;
const LOCAL_STR_CDC_HIGHLIGHTCLEARED = 'cdc:highlightCleared';
const LOCAL_STR_CDC_STATUS = 'cdc:status';
const LOCAL_NUM_ONE_HUNDRED = 100;
const LOCAL_STR_PAUSED = 'paused';
const LOCAL_STR_CDC_PAUSED = 'cdc:paused';
const LOCAL_STR_CDC_RESUMED = 'cdc:resumed';
const LOCAL_STR_CDC_REFRESHREQUESTED = 'cdc:refreshRequested';
const LOCAL_STR_SPACE_PIPE_SPACE = ' | ';
const LOCAL_STR_YELLOW = 'yellow';
const LOCAL_STR_CDC_DESTROYED = 'cdc:destroyed';

/**
 * CDCStreamHandler - Handles CDC stream subscription and event processing
 *
 * Manages the CDC stream connection, processes events, updates the cache,
 * and coordinates with the view manager for UI updates.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.9
 */

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
 */
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
    this.connectionManager = options.connectionManager;
    this.cache = options.cache;
    this.eventBus = options.eventBus || null;
    this.stateManager = options.stateManager || null;

    /** @type {CDCStreamStatus} */
    this.status = LOCAL_STR_DISCONNECTED;

    /** @type {boolean} */
    this.paused = false;

    /** @type {CDCStreamStats} */
    this.stats = {
      eventsReceived: 0,
      eventsPerSecond: 0,
      lastEventTime: null,
      lag: 0,
    };

    // Event rate calculation
    this.eventTimestamps = [];
    this.rateWindowMs = LOCAL_NUM_FIVE_THOUSAND; // 5 second window for rate calculation

    // Changed rows tracking for highlighting
    this.changedRows = new Map(); // key -> {timestamp, table}
    this.highlightDurationMs = LOCAL_NUM_TWO_THOUSAND;

    // Bind handlers
    this.handleCacheDump = this.handleCacheDump.bind(this);
    this.handleCDCEvent = this.handleCDCEvent.bind(this);
    this.handleStatusChange = this.handleStatusChange.bind(this);

    // Setup connection manager callbacks
    this.setupConnectionCallbacks();
  }

  /**
   * Setup callbacks on the connection manager
   */
  setupConnectionCallbacks() {
    if (!this.connectionManager) return;

    this.connectionManager.onCacheDump = this.handleCacheDump;
    this.connectionManager.onCDCEvent = this.handleCDCEvent;

    // Store original status change handler to chain
    const originalStatusChange = this.connectionManager.onStatusChange;
    this.connectionManager.onStatusChange = (status, ...args) => {
      this.handleStatusChange(status, ...args);
      if (originalStatusChange) {
        originalStatusChange(status, ...args);
      }
    };
  }

  /**
   * Handle initial cache dump from server
   * Requirements: 12.1, 13.1
   * @param {Object} dump - Full cache dump data
   */
  handleCacheDump(dump) {
    if (!this.cache) return;

    this.cache.loadFromDump(dump);
    this.status = LOCAL_STR_CONNECTED;

    // Emit cache initialized event
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_CDC_INITIALIZED, {
        timestamp: Date.now(),
        tableCount: Object.keys(dump).length,
      });
    }

    // Update state manager
    if (this.stateManager) {
      this.stateManager.setState({
        cache: {
          lastUpdate: Date.now(),
          cdcLag: 0,
        },
      });
    }

    this.emitStatusUpdate();
  }

  /**
   * Handle incoming CDC event
   * Requirements: 12.2, 12.3, 12.4
   * @param {Object} event - CDC event
   */
  handleCDCEvent(event) {
    if (!this.cache) return;

    // If paused, don't process events
    if (this.paused) {
      return;
    }

    // Apply event to cache
    const change = this.cache.applyCDCEvent(event);

    // Update stats
    this.stats.eventsReceived++;
    this.stats.lastEventTime = Date.now();
    this.stats.lag = this.cache.cdcLag;

    // Track event for rate calculation
    this.eventTimestamps.push(Date.now());
    this.updateEventRate();

    // Track changed row for highlighting
    if (change.applied) {
      this.trackChangedRow(change.key, change.table);
    }

    // Emit CDC update event
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_CACHE_UPDATE, {
        table: change.table,
        key: change.key,
        operation: change.operation,
        timestamp: Date.now(),
        affectedTableId: change.affectedTableId,
      });

      // Emit specific table event
      this.eventBus.emit(`cdc:${change.table}`, {
        key: change.key,
        operation: change.operation,
        data: event.data,
      });
    }

    // Update state manager with cache stats
    if (this.stateManager) {
      this.stateManager.setState({
        cache: {
          lastUpdate: Date.now(),
          cdcLag: this.stats.lag,
        },
      });
    }
  }

  /**
   * Handle connection status changes
   * @param {string} status - New connection status
   * @param {number} [_delay] - Reconnection delay (if reconnecting)
   */
  handleStatusChange(status, _delay) {
    switch (status) {
    case LOCAL_STR_CONNECTED:
      this.status = LOCAL_STR_CONNECTED;
      break;
    case LOCAL_STR_DISCONNECTED:
    case LOCAL_STR_RECONNECTING:
      this.status = LOCAL_STR_DISCONNECTED;
      break;
    case LOCAL_STR_FAILED:
      this.status = LOCAL_STR_ERROR;
      break;
    default:
      break;
    }

    this.emitStatusUpdate();
  }

  /**
   * Update event rate calculation
   */
  updateEventRate() {
    const now = Date.now();
    const cutoff = now - this.rateWindowMs;

    // Remove old timestamps
    this.eventTimestamps = this.eventTimestamps.filter((t) => t > cutoff);

    // Calculate rate
    if (this.eventTimestamps.length > 0) {
      this.stats.eventsPerSecond =
        (this.eventTimestamps.length / this.rateWindowMs) * LOCAL_NUM_ONE_THOUSAND;
    } else {
      this.stats.eventsPerSecond = 0;
    }
  }

  /**
   * Track a changed row for highlighting
   * Requirements: 12.4
   * @param {string} key - Row key
   * @param {string} table - Table name
   */
  trackChangedRow(key, table) {
    const timestamp = Date.now();
    this.changedRows.set(key, {timestamp, table});

    // Schedule highlight removal
    setTimeout(() => {
      this.clearChangedRow(key, timestamp);
    }, this.highlightDurationMs);
  }

  /**
   * Clear a changed row highlight
   * @param {string} key - Row key
   * @param {number} originalTimestamp - Original change timestamp
   */
  clearChangedRow(key, originalTimestamp) {
    const entry = this.changedRows.get(key);
    // Only clear if this is the same change (not a newer one)
    if (entry && entry.timestamp === originalTimestamp) {
      this.changedRows.delete(key);

      if (this.eventBus) {
        this.eventBus.emit(LOCAL_STR_CDC_HIGHLIGHTCLEARED, {
          key,
          table: entry.table,
        });
      }
    }
  }

  /**
   * Check if a row is currently highlighted as changed
   * @param {string} key - Row key
   * @return {boolean}
   */
  isRowChanged(key) {
    return this.changedRows.has(key);
  }

  /**
   * Get all currently changed rows
   * @return {Map<string, {timestamp: number, table: string}>}
   */
  getChangedRows() {
    return new Map(this.changedRows);
  }

  /**
   * Emit status update event
   * Requirements: 12.5
   */
  emitStatusUpdate() {
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_CDC_STATUS, {
        status: this.status,
        paused: this.paused,
        stats: this.getStats(),
      });
    }
  }

  /**
   * Get current CDC stream status
   * @return {CDCStreamStatus}
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get current CDC stream statistics
   * Requirements: 12.5
   * @return {CDCStreamStats}
   */
  getStats() {
    // Update rate before returning
    this.updateEventRate();

    return {
      ...this.stats,
      eventsPerSecond:
        Math.round(this.stats.eventsPerSecond * LOCAL_NUM_ONE_HUNDRED) /
        LOCAL_NUM_ONE_HUNDRED,
    };
  }

  /**
   * Check if CDC stream is paused
   * @return {boolean}
   */
  isPaused() {
    return this.paused;
  }

  /**
   * Check if CDC stream is connected
   * @return {boolean}
   */
  isConnected() {
    return this.status === LOCAL_STR_CONNECTED && !this.paused;
  }

  /**
   * Pause CDC stream processing
   * Requirements: 12.6, 12.7
   */
  pause() {
    if (!this.paused) {
      this.paused = true;
      this.status = LOCAL_STR_PAUSED;
      this.emitStatusUpdate();

      if (this.eventBus) {
        this.eventBus.emit(LOCAL_STR_CDC_PAUSED, {
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Resume CDC stream processing
   * Requirements: 12.6
   */
  resume() {
    if (this.paused) {
      this.paused = false;
      // Restore status based on connection state
      if (this.connectionManager && this.connectionManager.isConnected()) {
        this.status = LOCAL_STR_CONNECTED;
      } else {
        this.status = LOCAL_STR_DISCONNECTED;
      }
      this.emitStatusUpdate();

      if (this.eventBus) {
        this.eventBus.emit(LOCAL_STR_CDC_RESUMED, {
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Toggle pause state
   * @return {boolean} New paused state
   */
  togglePause() {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
    return this.paused;
  }

  /**
   * Request a manual refresh (full cache dump)
   * Requirements: 12.8, 13.6
   * @return {boolean} Whether request was sent
   */
  requestRefresh() {
    if (!this.connectionManager) return false;

    const sent = this.connectionManager.requestCacheDump();

    if (sent && this.eventBus) {
      this.eventBus.emit(LOCAL_STR_CDC_REFRESHREQUESTED, {
        timestamp: Date.now(),
      });
    }

    return sent;
  }

  /**
   * Get status bar display information
   * Requirements: 12.5, 12.9
   * @return {Object} Status bar info
   */
  getStatusBarInfo() {
    const stats = this.getStats();
    const baseStatusInfo = (() => {
      switch (this.status) {
      case 'connected':
        return {
          text: 'CDC: Connected',
          color: 'green',
        };
      case 'paused':
        return {
          text: 'CDC: Paused (stale)',
          color: 'yellow',
        };
      case 'disconnected':
        return {
          text: 'CDC: Disconnected',
          color: 'red',
        };
      case 'error':
        return {
          text: 'CDC: Error',
          color: 'red',
        };
      default:
        return {
          text: 'CDC: Unknown',
          color: 'gray',
        };
      }
    })();
    const statusSegments = [baseStatusInfo.text];

    // Add rate info if connected
    if (this.status === LOCAL_STR_CONNECTED) {
      statusSegments.push(`${stats.eventsPerSecond.toFixed(1)} evt/s`);
    }

    // Add lag info if significant
    if (stats.lag > LOCAL_NUM_ONE_THOUSAND) {
      statusSegments.push(`Lag: ${Math.round(stats.lag / LOCAL_NUM_ONE_THOUSAND)}s`);
    }

    // Add last update time
    if (stats.lastEventTime) {
      const secondsAgo = Math.round((Date.now() - stats.lastEventTime) / 1000);
      if (secondsAgo > 0) {
        statusSegments.push(`Last: ${secondsAgo}s ago`);
      }
    }

    return {
      text: statusSegments.join(LOCAL_STR_SPACE_PIPE_SPACE),
      color: stats.lag > LOCAL_NUM_FIVE_THOUSAND ? LOCAL_STR_YELLOW : baseStatusInfo.color,
      status: this.status,
      paused: this.paused,
      stats,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      eventsReceived: 0,
      eventsPerSecond: 0,
      lastEventTime: null,
      lag: 0,
    };
    this.eventTimestamps = [];
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.changedRows.clear();
    this.eventTimestamps = [];

    // Clear connection manager callbacks
    if (this.connectionManager) {
      this.connectionManager.onCacheDump = null;
      this.connectionManager.onCDCEvent = null;
    }

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_CDC_DESTROYED, {});
    }
  }
}
