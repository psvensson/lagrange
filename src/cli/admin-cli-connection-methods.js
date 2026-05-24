import {debugLog} from './admin-cli-debug-log.js';
import {
  LOCAL_STR_YELLOW,
  LOCAL_STR_GREEN,
  LOCAL_STR_NODES,
  LOCAL_STR_CACHE_UPDATE,
  LOCAL_STR_CONNECTED,
  LOCAL_STR_1KRB7,
  LOCAL_STR_RECONNECTING,
  LOCAL_STR_FAILED,
  LOCAL_STR_CONNECTION_FAILED,
  LOCAL_STR_RED,
  LOCAL_STR_DISCONNECTED,
  LOCAL_STR_DISCONNECTED_2,
  LOCAL_STR_128KJ,
  LOCAL_STR_SGZMJ,
  LOCAL_STR_1L5NX,
  LOCAL_STR_QUERY_RESULT,
  LOCAL_STR_1ABO2,
  LOCAL_STR_462KR,
  LOCAL_STR_REFRESHING,
  LOCAL_STR_CDC_UPDATES_PAUSED,
  LOCAL_STR_1V74X,
} from './admin-cli-local-constants.js';

const ADMIN_CLI_CONNECTION_METHODS = {
  /**
   * Connect to the server
   * @param {string} nodeAddress - Node address to connect to
   */
  async connect(nodeAddress) {
    debugLog(`connect() called with address: ${nodeAddress}`);

    this.connectionManager.onStatusChange = (status, delay) => {
      debugLog(`onStatusChange: ${status}, delay: ${delay}`);
      if (status === LOCAL_STR_CONNECTED) {
        this.updateStatus(LOCAL_STR_1KRB7, LOCAL_STR_GREEN);
      } else if (status === LOCAL_STR_RECONNECTING) {
        this.updateStatus(`Reconnecting in ${delay}ms...`, LOCAL_STR_YELLOW);
      } else if (status === LOCAL_STR_FAILED) {
        this.updateStatus(LOCAL_STR_CONNECTION_FAILED, LOCAL_STR_RED);
      } else if (status === LOCAL_STR_DISCONNECTED) {
        this.updateStatus(LOCAL_STR_DISCONNECTED_2, LOCAL_STR_RED);
      }
      this.screen.render();
    };

    this.connectionManager.onCacheDump = (data) => {
      debugLog(`onCacheDump called, data keys: ${Object.keys(data || {}).join(LOCAL_STR_128KJ)}`);

      // Load data into cache
      this.cache.loadFromDump(data);

      // Get stats to verify data was loaded
      const stats = this.cache.getStats();
      const nodeCount = stats.tableCounts.nodes || 0;
      const replicaCount = stats.tableCounts.services || 0;
      const tableCount = stats.tableCounts.tables || 0;

      debugLog(
        `Cache loaded: ${nodeCount} nodes, ${replicaCount} replicas, ` +
        `${tableCount} tables`,
      );

      // Update status with counts
      this.updateStatus(
        `Connected (${nodeCount} nodes, ${replicaCount} replicas, ${tableCount} tables)`,
        LOCAL_STR_GREEN,
      );

      // Only switch to nodes view on initial connection, not on refresh
      if (!this.initialCacheLoaded) {
        this.initialCacheLoaded = true;
        this.switchView(LOCAL_STR_NODES);
        debugLog(LOCAL_STR_SGZMJ);
      } else {
        // Just refresh the current view
        this.refreshCurrentView();
        debugLog(LOCAL_STR_1L5NX);
      }
    };

    this.connectionManager.onCDCEvent = (event) => {
      debugLog(`onCDCEvent: ${event.operation} on ${event.table}`);
      if (!this.cdcPaused) {
        const change = this.cache.applyCDCEvent(event);
        this.eventBus.emit(LOCAL_STR_CACHE_UPDATE, change);
      }
    };

    this.connectionManager.onQueryResult = (result) => {
      debugLog(`onQueryResult: queryId=${result.queryId}`);
      this.eventBus.emit(LOCAL_STR_QUERY_RESULT, result);
    };

    this.connectionManager.onLiveQueryEvent = (message) => {
      debugLog(`onLiveQueryEvent: subscriptionId=${message.subscriptionId}`);
      if (this.liveQueryManager) {
        this.liveQueryManager.handleLiveQueryEvent(message);
      }
    };

    this.connectionManager.onError = (err) => {
      debugLog(`onError: ${err.message}`);
      this.showError(err.message);
    };

    debugLog(LOCAL_STR_1ABO2);
    await this.connectionManager.connect(nodeAddress);
    debugLog(LOCAL_STR_462KR);
  },

  /**
   * Reconnect to a different node
   * @param {string} address - New node address
   */
  async reconnect(address) {
    this.updateStatus(`Reconnecting to ${address}...`, LOCAL_STR_YELLOW);
    this.connectionManager.disconnect();
    try {
      await this.connect(address);
    } catch (err) {
      this.showError(`Failed to reconnect: ${err.message}`);
    }
  },

  /**
   * Force refresh cache from server
   */
  forceRefresh() {
    this.updateStatus(LOCAL_STR_REFRESHING, LOCAL_STR_YELLOW);
    this.connectionManager.requestCacheDump?.();
  },

  /**
   * Toggle CDC pause state
   */
  toggleCDCPause() {
    this.cdcPaused = !this.cdcPaused;
    this.updateHeader();
    this.updateStatus(
      this.cdcPaused ? LOCAL_STR_CDC_UPDATES_PAUSED : LOCAL_STR_1V74X,
      this.cdcPaused ? LOCAL_STR_YELLOW : LOCAL_STR_GREEN,
    );
  },
};

export {ADMIN_CLI_CONNECTION_METHODS};
