/**
 * BaseViewModel - Base class for view models separating business logic from UI
 *
 * Provides computed property caching, state change notifications, and
 * data transformation capabilities.
 *
 * Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7
 */

/**
 * BaseViewModel class for separating business logic from UI
 */
export class BaseViewModel {
  /**
   * Creates a new BaseViewModel
   * @param {Object} options - ViewModel options
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('./state-manager.js').StateManager} [options.stateManager] - State manager
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.stateManager = options.stateManager || null;

    // Raw data
    this.data = [];

    // Computed property cache
    /** @type {Map<string, {value: any, dependencies: string[], version: number}>} */
    this.computedCache = new Map();

    // Cache version for invalidation
    this.cacheVersion = 0;

    // Computed property definitions
    /** @type {Map<string, {compute: Function, dependencies: string[]}>} */
    this.computedDefinitions = new Map();

    // Setup state subscriptions
    this.setupStateSubscriptions();
  }

  /**
   * Setup subscriptions to state changes
   */
  setupStateSubscriptions() {
    if (this.stateManager && this.eventBus) {
      this.eventBus.on('state:changed', (data) => {
        this.handleStateChange(data);
      });
    }
  }

  /**
   * Handle state change event
   * @param {Object} _data - State change data
   */
  handleStateChange(_data) {
    // Invalidate cache on state change
    this.invalidateCache();

    // Emit computed property change events
    this.emitComputedChanges();
  }

  /**
   * Set the raw data
   * @param {Array} data - Raw data array
   */
  setData(data) {
    this.data = data || [];
    this.invalidateCache();
    this.emitComputedChanges();
  }

  /**
   * Get the raw data
   * @return {Array}
   */
  getData() {
    return this.data;
  }

  /**
   * Define a computed property
   * Requirements: 27.3
   * @param {string} name - Property name
   * @param {Function} compute - Computation function
   * @param {string[]} [dependencies=[]] - Property dependencies for cache invalidation
   */
  defineComputed(name, compute, dependencies = []) {
    this.computedDefinitions.set(name, {
      compute,
      dependencies,
    });

    // Clear any existing cache for this property
    this.computedCache.delete(name);
  }

  /**
   * Get a computed property value (with caching)
   * Requirements: 27.6
   * @param {string} name - Property name
   * @return {*} Computed value
   */
  getComputed(name) {
    const definition = this.computedDefinitions.get(name);
    if (!definition) {
      return undefined;
    }

    // Check cache
    const cached = this.computedCache.get(name);
    if (cached && cached.version === this.cacheVersion) {
      return cached.value;
    }

    // Compute value
    const value = definition.compute(this.data, this);

    // Cache result
    this.computedCache.set(name, {
      value,
      dependencies: definition.dependencies,
      version: this.cacheVersion,
    });

    return value;
  }

  /**
   * Check if a computed property is cached
   * @param {string} name - Property name
   * @return {boolean}
   */
  isComputedCached(name) {
    const cached = this.computedCache.get(name);
    return !!(cached && cached.version === this.cacheVersion);
  }

  /**
   * Invalidate the computed property cache
   */
  invalidateCache() {
    this.cacheVersion++;
  }

  /**
   * Invalidate specific computed properties
   * @param {string[]} names - Property names to invalidate
   */
  invalidateComputed(names) {
    for (const name of names) {
      this.computedCache.delete(name);
    }
  }

  /**
   * Get all computed property names
   * @return {string[]}
   */
  getComputedNames() {
    return Array.from(this.computedDefinitions.keys());
  }

  /**
   * Emit events for computed property changes
   * Requirements: 27.7
   */
  emitComputedChanges() {
    if (!this.eventBus) {
      return;
    }

    for (const name of this.computedDefinitions.keys()) {
      this.eventBus.emit('viewModel:computedChanged', {
        property: name,
        viewModel: this,
      });
    }
  }

  /**
   * Transform data using a transformation function
   * Requirements: 27.2
   * @param {Function} transformer - Transformation function
   * @return {Array} Transformed data
   */
  transform(transformer) {
    return this.data.map(transformer);
  }

  /**
   * Filter data using a predicate
   * @param {Function} predicate - Filter predicate
   * @return {Array} Filtered data
   */
  filter(predicate) {
    return this.data.filter(predicate);
  }

  /**
   * Sort data using a comparator
   * @param {Function} comparator - Sort comparator
   * @return {Array} Sorted data (new array)
   */
  sort(comparator) {
    return [...this.data].sort(comparator);
  }

  /**
   * Format a value for display
   * Override in subclasses for custom formatting
   * @param {*} value - Value to format
   * @param {string} _type - Value type hint
   * @return {string} Formatted value
   */
  formatValue(value, _type) {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    return String(value);
  }

  /**
   * Format a size value with units
   * @param {number} bytes - Size in bytes
   * @return {string} Formatted size
   */
  formatSize(bytes) {
    if (bytes === null || bytes === undefined) {
      return 'N/A';
    }
    if (bytes === 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);

    return `${value.toFixed(1)} ${units[i]}`;
  }

  /**
   * Format a percentage value
   * @param {number} value - Percentage value
   * @param {number} [decimals=1] - Decimal places
   * @return {string} Formatted percentage
   */
  formatPercent(value, decimals = 1) {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    return `${value.toFixed(decimals)}%`;
  }

  /**
   * Format a timestamp
   * @param {number|Date} timestamp - Timestamp
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (!timestamp) {
      return 'N/A';
    }

    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Get a summary of the data
   * Override in subclasses for custom summaries
   * @return {Object} Summary object
   */
  getSummary() {
    return {
      count: this.data.length,
    };
  }

  /**
   * Validate an item
   * Override in subclasses for custom validation
   * @param {Object} _item - Item to validate
   * @return {{valid: boolean, errors: string[]}}
   */
  validate(_item) {
    return {valid: true, errors: []};
  }

  /**
   * Get the count of items
   * @return {number}
   */
  getCount() {
    return this.data.length;
  }

  /**
   * Check if data is empty
   * @return {boolean}
   */
  isEmpty() {
    return this.data.length === 0;
  }

  /**
   * Get an item by index
   * @param {number} index - Item index
   * @return {Object|undefined}
   */
  getItem(index) {
    return this.data[index];
  }

  /**
   * Find an item by predicate
   * @param {Function} predicate - Find predicate
   * @return {Object|undefined}
   */
  findItem(predicate) {
    return this.data.find(predicate);
  }

  /**
   * Clear all data and cache
   */
  clear() {
    this.data = [];
    this.invalidateCache();
  }

  /**
   * Destroy the view model and cleanup
   */
  destroy() {
    this.data = [];
    this.computedCache.clear();
    this.computedDefinitions.clear();
  }
}
