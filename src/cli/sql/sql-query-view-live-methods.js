const LOCAL_STR_ACTIVE = 'active';
const LOCAL_STR_PAUSED = 'paused';
const LOCAL_STR_EXPIRED = 'expired';
const LOCAL_STR_CANCELLED = 'cancelled';
const LOCAL_STR_LIVEQUERY_INITIALIZED = 'livequery:initialized';
const LOCAL_STR_LIVEQUERY_EXPIRED = 'livequery:expired';
const LOCAL_STR_LIVEQUERY_PAUSED = 'livequery:paused';
const LOCAL_STR_LIVEQUERY_RESUMED = 'livequery:resumed';

const LOCAL_LIVE_QUERY_STATUS = {
  ACTIVE: LOCAL_STR_ACTIVE,
  PAUSED: LOCAL_STR_PAUSED,
  EXPIRED: LOCAL_STR_EXPIRED,
  CANCELLED: LOCAL_STR_CANCELLED,
};

export const SQL_QUERY_VIEW_LIVE_METHODS = {
  /**
   * Handle live query event from connection manager
   * @param {Object} message - Live query event message
   */
  handleLiveQueryEvent(message) {
    if (this.liveQueryManager) {
      this.liveQueryManager.handleLiveQueryEvent(message);
    }
  },

  /**
   * Handle live query initialized event
   * Requirements: 32.2, 32.14
   * @param {Object} data - Event data
   */
  handleLiveQueryInitialized(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    // Display initial results
    if (data.data && data.data.length > 0) {
      this.resultsPanel.displaySelectResult({
        results: data.data,
        count: data.data.length,
      }, 0);
    }

    // Update status
    // Requirements: 32.6
    this.liveQueryStatus = LOCAL_LIVE_QUERY_STATUS.ACTIVE;
    this.emitEvent(LOCAL_STR_LIVEQUERY_INITIALIZED, {
      subscriptionId: data.subscriptionId,
      partitions: data.partitions,
    });
  },

  /**
   * Handle live query stream event
   * Requirements: 32.2, 32.3
   * @param {Object} data - Event data
   */
  handleLiveQueryStreamEvent(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    // Add event to live stream panel
    this.liveStreamPanel.addEvent(data.eventType, data.data, data.timestamp);
  },

  /**
   * Handle live query expired event
   * Requirements: 32.8
   * @param {Object} data - Event data
   */
  handleLiveQueryExpired(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    this.liveQueryStatus = LOCAL_LIVE_QUERY_STATUS.EXPIRED;
    this.emitEvent(LOCAL_STR_LIVEQUERY_EXPIRED, {subscriptionId: data.subscriptionId});
  },

  /**
   * Handle live query paused event
   * Requirements: 32.7
   * @param {Object} data - Event data
   */
  handleLiveQueryPaused(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    this.liveQueryStatus = LOCAL_LIVE_QUERY_STATUS.PAUSED;
    this.emitEvent(LOCAL_STR_LIVEQUERY_PAUSED, {subscriptionId: data.subscriptionId});
  },

  /**
   * Handle live query resumed event
   * Requirements: 32.7
   * @param {Object} data - Event data
   */
  handleLiveQueryResumed(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    this.liveQueryStatus = LOCAL_LIVE_QUERY_STATUS.ACTIVE;
    this.emitEvent(LOCAL_STR_LIVEQUERY_RESUMED, {subscriptionId: data.subscriptionId});
  },

  /**
   * Pause the active live query
   * Requirements: 32.7
   * @return {boolean} True if paused
   */
  pauseLiveQuery() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return false;
    }

    return this.liveQueryManager.pause(this.activeLiveQueryId);
  },

  /**
   * Resume the active live query
   * Requirements: 32.7
   * @return {boolean} True if resumed
   */
  resumeLiveQuery() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return false;
    }

    return this.liveQueryManager.resume(this.activeLiveQueryId);
  },

  /**
   * Cancel the active live query
   * Requirements: 32.9
   * @return {boolean} True if cancelled
   */
  cancelLiveQuery() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return false;
    }

    const result = this.liveQueryManager.cancel(this.activeLiveQueryId);
    if (result) {
      this.activeLiveQueryId = null;
      this.liveQueryStatus = LOCAL_LIVE_QUERY_STATUS.CANCELLED;
    }
    return result;
  },

  /**
   * Renew an expired live query
   * Requirements: 32.8
   * @return {boolean} True if renewal initiated
   */
  renewLiveQuery() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return false;
    }

    return this.liveQueryManager.renew(this.activeLiveQueryId);
  },

  /**
   * Check if there is an active live query
   * @return {boolean} True if live query is active
   */
  hasActiveLiveQuery() {
    return this.activeLiveQueryId !== null &&
           this.liveQueryStatus === LOCAL_LIVE_QUERY_STATUS.ACTIVE;
  },

  /**
   * Get the active live query subscription ID
   * @return {string|null} Subscription ID or null
   */
  getActiveLiveQueryId() {
    return this.activeLiveQueryId;
  },

  /**
   * Get the live query status
   * Requirements: 32.6
   * @return {string|null} Status or null
   */
  getLiveQueryStatus() {
    return this.liveQueryStatus;
  },

  /**
   * Get the live query event rate
   * Requirements: 32.10
   * @return {number} Events per second
   */
  getLiveQueryEventRate() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return 0;
    }

    const subscription = this.liveQueryManager.getSubscription(
      this.activeLiveQueryId,
    );
    return subscription ? subscription.eventRate : 0;
  },

  /**
   * Get the monitored partitions for the live query
   * Requirements: 32.14
   * @return {string[]} Partition IDs
   */
  getLiveQueryPartitions() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return [];
    }

    const subscription = this.liveQueryManager.getSubscription(
      this.activeLiveQueryId,
    );
    return subscription ? subscription.partitions : [];
  },

  /**
   * Get the live stream panel
   * @return {LiveStreamPanel} Live stream panel instance
   */
  getLiveStreamPanel() {
    return this.liveStreamPanel;
  },
};
