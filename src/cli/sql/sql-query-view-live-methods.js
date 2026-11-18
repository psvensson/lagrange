const LOCAL_STR_ACTIVE = 'active';
const LOCAL_STR_PAUSED = 'paused';
const LOCAL_STR_CANCELLED = 'cancelled';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_LIVEQUERY_RESULT = 'livequery:result';
const LOCAL_STR_LIVEQUERY_ERROR = 'livequery:error';
const LOCAL_STR_LIVEQUERY_EVENT = 'livequery:event';
const LOCAL_STR_LIVEQUERY_PAUSED = 'livequery:paused';
const LOCAL_STR_LIVEQUERY_RESUMED = 'livequery:resumed';

/**
 * Live query subscription status
 */
export const LIVE_QUERY_STATUS = Object.freeze({
  ACTIVE: LOCAL_STR_ACTIVE,
  PAUSED: LOCAL_STR_PAUSED,
  CANCELLED: LOCAL_STR_CANCELLED,
  FAILED: LOCAL_STR_FAILED,
});

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
   * Listen to the live query manager's bus events for this view.
   */
  wireLiveQueryListeners() {
    const listeners = [
      [LOCAL_STR_LIVEQUERY_RESULT, (data) => this.handleLiveQueryResult(data)],
      [LOCAL_STR_LIVEQUERY_ERROR, (data) => this.handleLiveQueryError(data)],
      [LOCAL_STR_LIVEQUERY_EVENT, (data) => this.handleLiveQueryStreamEvent(data)],
      [LOCAL_STR_LIVEQUERY_PAUSED, (data) => this.handleLiveQueryPaused(data)],
      [LOCAL_STR_LIVEQUERY_RESUMED, (data) => this.handleLiveQueryResumed(data)],
    ];
    for (const [eventName, listener] of listeners) {
      this.eventBus.on(eventName, listener);
    }
  },

  /**
   * Show a live query's whole result: a snapshot or a reset replaces the
   * shown result with its rows.
   * Requirements: 32.2, 32.14
   * @param {Object} data - {subscriptionId, eventType, rows}
   */
  handleLiveQueryResult(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }
    this.resultsPanel.displaySelectResult({
      results: data.rows,
      count: data.rows.length,
    }, 0);
  },

  /**
   * Show what failed in the live query; the subscription has ended.
   * @param {Object} data - {subscriptionId, error, errorCode}
   */
  handleLiveQueryError(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }
    this.liveQueryStatus = LIVE_QUERY_STATUS.FAILED;
    this.resultsPanel.displayError({message: data.error, code: data.errorCode});
  },

  /**
   * Handle live query stream event (a change)
   * Requirements: 32.2, 32.3
   * @param {Object} data - Event data
   */
  handleLiveQueryStreamEvent(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    this.liveStreamPanel.addEvent(data.eventType, data.data, data.timestamp);
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

    this.liveQueryStatus = LIVE_QUERY_STATUS.PAUSED;
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

    this.liveQueryStatus = LIVE_QUERY_STATUS.ACTIVE;
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
      this.liveQueryStatus = LIVE_QUERY_STATUS.CANCELLED;
    }
    return result;
  },

  /**
   * Check if there is an active live query
   * @return {boolean} True if live query is active
   */
  hasActiveLiveQuery() {
    return this.activeLiveQueryId !== null &&
           this.liveQueryStatus === LIVE_QUERY_STATUS.ACTIVE;
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
