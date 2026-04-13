/**
 * BaseViewModel - Base class for view models separating business logic from UI
 *
 * Provides computed property caching, state change notifications, and
 * data transformation capabilities.
 *
 * Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7
 */
// @ts-nocheck


/**
 * BaseViewModel class for separating business logic from UI
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
export class BaseViewModel {
  /**
   * Creates a new BaseViewModel
   * @param {Object} options - ViewModel options
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('./state-manager.js').StateManager} [options.stateManager] - State manager
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("39675")) {
      {}
    } else {
      stryCov_9fa48("39675");
      this.eventBus = stryMutAct_9fa48("39678") ? options.eventBus && null : stryMutAct_9fa48("39677") ? false : stryMutAct_9fa48("39676") ? true : (stryCov_9fa48("39676", "39677", "39678"), options.eventBus || null);
      this.stateManager = stryMutAct_9fa48("39681") ? options.stateManager && null : stryMutAct_9fa48("39680") ? false : stryMutAct_9fa48("39679") ? true : (stryCov_9fa48("39679", "39680", "39681"), options.stateManager || null);

      // Raw data
      this.data = stryMutAct_9fa48("39682") ? ["Stryker was here"] : (stryCov_9fa48("39682"), []);

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
  }

  /**
   * Setup subscriptions to state changes
   */
  setupStateSubscriptions() {
    if (stryMutAct_9fa48("39683")) {
      {}
    } else {
      stryCov_9fa48("39683");
      if (stryMutAct_9fa48("39686") ? this.stateManager || this.eventBus : stryMutAct_9fa48("39685") ? false : stryMutAct_9fa48("39684") ? true : (stryCov_9fa48("39684", "39685", "39686"), this.stateManager && this.eventBus)) {
        if (stryMutAct_9fa48("39687")) {
          {}
        } else {
          stryCov_9fa48("39687");
          this.eventBus.on(stryMutAct_9fa48("39688") ? "" : (stryCov_9fa48("39688"), 'state:changed'), data => {
            if (stryMutAct_9fa48("39689")) {
              {}
            } else {
              stryCov_9fa48("39689");
              this.handleStateChange(data);
            }
          });
        }
      }
    }
  }

  /**
   * Handle state change event
   * @param {Object} _data - State change data
   */
  handleStateChange(_data) {
    if (stryMutAct_9fa48("39690")) {
      {}
    } else {
      stryCov_9fa48("39690");
      // Invalidate cache on state change
      this.invalidateCache();

      // Emit computed property change events
      this.emitComputedChanges();
    }
  }

  /**
   * Set the raw data
   * @param {Array} data - Raw data array
   */
  setData(data) {
    if (stryMutAct_9fa48("39691")) {
      {}
    } else {
      stryCov_9fa48("39691");
      this.data = stryMutAct_9fa48("39694") ? data && [] : stryMutAct_9fa48("39693") ? false : stryMutAct_9fa48("39692") ? true : (stryCov_9fa48("39692", "39693", "39694"), data || (stryMutAct_9fa48("39695") ? ["Stryker was here"] : (stryCov_9fa48("39695"), [])));
      this.invalidateCache();
      this.emitComputedChanges();
    }
  }

  /**
   * Get the raw data
   * @return {Array}
   */
  getData() {
    if (stryMutAct_9fa48("39696")) {
      {}
    } else {
      stryCov_9fa48("39696");
      return this.data;
    }
  }

  /**
   * Define a computed property
   * Requirements: 27.3
   * @param {string} name - Property name
   * @param {Function} compute - Computation function
   * @param {string[]} [dependencies=[]] - Property dependencies for cache invalidation
   */
  defineComputed(name, compute, dependencies = stryMutAct_9fa48("39697") ? ["Stryker was here"] : (stryCov_9fa48("39697"), [])) {
    if (stryMutAct_9fa48("39698")) {
      {}
    } else {
      stryCov_9fa48("39698");
      this.computedDefinitions.set(name, stryMutAct_9fa48("39699") ? {} : (stryCov_9fa48("39699"), {
        compute,
        dependencies
      }));

      // Clear any existing cache for this property
      this.computedCache.delete(name);
    }
  }

  /**
   * Get a computed property value (with caching)
   * Requirements: 27.6
   * @param {string} name - Property name
   * @return {*} Computed value
   */
  getComputed(name) {
    if (stryMutAct_9fa48("39700")) {
      {}
    } else {
      stryCov_9fa48("39700");
      const definition = this.computedDefinitions.get(name);
      if (stryMutAct_9fa48("39703") ? false : stryMutAct_9fa48("39702") ? true : stryMutAct_9fa48("39701") ? definition : (stryCov_9fa48("39701", "39702", "39703"), !definition)) {
        if (stryMutAct_9fa48("39704")) {
          {}
        } else {
          stryCov_9fa48("39704");
          return undefined;
        }
      }

      // Check cache
      const cached = this.computedCache.get(name);
      if (stryMutAct_9fa48("39707") ? cached || cached.version === this.cacheVersion : stryMutAct_9fa48("39706") ? false : stryMutAct_9fa48("39705") ? true : (stryCov_9fa48("39705", "39706", "39707"), cached && (stryMutAct_9fa48("39709") ? cached.version !== this.cacheVersion : stryMutAct_9fa48("39708") ? true : (stryCov_9fa48("39708", "39709"), cached.version === this.cacheVersion)))) {
        if (stryMutAct_9fa48("39710")) {
          {}
        } else {
          stryCov_9fa48("39710");
          return cached.value;
        }
      }

      // Compute value
      const value = definition.compute(this.data, this);

      // Cache result
      this.computedCache.set(name, stryMutAct_9fa48("39711") ? {} : (stryCov_9fa48("39711"), {
        value,
        dependencies: definition.dependencies,
        version: this.cacheVersion
      }));
      return value;
    }
  }

  /**
   * Check if a computed property is cached
   * @param {string} name - Property name
   * @return {boolean}
   */
  isComputedCached(name) {
    if (stryMutAct_9fa48("39712")) {
      {}
    } else {
      stryCov_9fa48("39712");
      const cached = this.computedCache.get(name);
      return stryMutAct_9fa48("39713") ? !(cached && cached.version === this.cacheVersion) : (stryCov_9fa48("39713"), !(stryMutAct_9fa48("39714") ? cached && cached.version === this.cacheVersion : (stryCov_9fa48("39714"), !(stryMutAct_9fa48("39717") ? cached || cached.version === this.cacheVersion : stryMutAct_9fa48("39716") ? false : stryMutAct_9fa48("39715") ? true : (stryCov_9fa48("39715", "39716", "39717"), cached && (stryMutAct_9fa48("39719") ? cached.version !== this.cacheVersion : stryMutAct_9fa48("39718") ? true : (stryCov_9fa48("39718", "39719"), cached.version === this.cacheVersion)))))));
    }
  }

  /**
   * Invalidate the computed property cache
   */
  invalidateCache() {
    if (stryMutAct_9fa48("39720")) {
      {}
    } else {
      stryCov_9fa48("39720");
      stryMutAct_9fa48("39721") ? this.cacheVersion-- : (stryCov_9fa48("39721"), this.cacheVersion++);
    }
  }

  /**
   * Invalidate specific computed properties
   * @param {string[]} names - Property names to invalidate
   */
  invalidateComputed(names) {
    if (stryMutAct_9fa48("39722")) {
      {}
    } else {
      stryCov_9fa48("39722");
      for (const name of names) {
        if (stryMutAct_9fa48("39723")) {
          {}
        } else {
          stryCov_9fa48("39723");
          this.computedCache.delete(name);
        }
      }
    }
  }

  /**
   * Get all computed property names
   * @return {string[]}
   */
  getComputedNames() {
    if (stryMutAct_9fa48("39724")) {
      {}
    } else {
      stryCov_9fa48("39724");
      return Array.from(this.computedDefinitions.keys());
    }
  }

  /**
   * Emit events for computed property changes
   * Requirements: 27.7
   */
  emitComputedChanges() {
    if (stryMutAct_9fa48("39725")) {
      {}
    } else {
      stryCov_9fa48("39725");
      if (stryMutAct_9fa48("39728") ? false : stryMutAct_9fa48("39727") ? true : stryMutAct_9fa48("39726") ? this.eventBus : (stryCov_9fa48("39726", "39727", "39728"), !this.eventBus)) {
        if (stryMutAct_9fa48("39729")) {
          {}
        } else {
          stryCov_9fa48("39729");
          return;
        }
      }
      for (const name of this.computedDefinitions.keys()) {
        if (stryMutAct_9fa48("39730")) {
          {}
        } else {
          stryCov_9fa48("39730");
          this.eventBus.emit(stryMutAct_9fa48("39731") ? "" : (stryCov_9fa48("39731"), 'viewModel:computedChanged'), stryMutAct_9fa48("39732") ? {} : (stryCov_9fa48("39732"), {
            property: name,
            viewModel: this
          }));
        }
      }
    }
  }

  /**
   * Transform data using a transformation function
   * Requirements: 27.2
   * @param {Function} transformer - Transformation function
   * @return {Array} Transformed data
   */
  transform(transformer) {
    if (stryMutAct_9fa48("39733")) {
      {}
    } else {
      stryCov_9fa48("39733");
      return this.data.map(transformer);
    }
  }

  /**
   * Filter data using a predicate
   * @param {Function} predicate - Filter predicate
   * @return {Array} Filtered data
   */
  filter(predicate) {
    if (stryMutAct_9fa48("39734")) {
      {}
    } else {
      stryCov_9fa48("39734");
      return stryMutAct_9fa48("39735") ? this.data : (stryCov_9fa48("39735"), this.data.filter(predicate));
    }
  }

  /**
   * Sort data using a comparator
   * @param {Function} comparator - Sort comparator
   * @return {Array} Sorted data (new array)
   */
  sort(comparator) {
    if (stryMutAct_9fa48("39736")) {
      {}
    } else {
      stryCov_9fa48("39736");
      return stryMutAct_9fa48("39737") ? [...this.data] : (stryCov_9fa48("39737"), (stryMutAct_9fa48("39738") ? [] : (stryCov_9fa48("39738"), [...this.data])).sort(comparator));
    }
  }

  /**
   * Format a value for display
   * Override in subclasses for custom formatting
   * @param {*} value - Value to format
   * @param {string} _type - Value type hint
   * @return {string} Formatted value
   */
  formatValue(value, _type) {
    if (stryMutAct_9fa48("39739")) {
      {}
    } else {
      stryCov_9fa48("39739");
      if (stryMutAct_9fa48("39742") ? value === null && value === undefined : stryMutAct_9fa48("39741") ? false : stryMutAct_9fa48("39740") ? true : (stryCov_9fa48("39740", "39741", "39742"), (stryMutAct_9fa48("39744") ? value !== null : stryMutAct_9fa48("39743") ? false : (stryCov_9fa48("39743", "39744"), value === null)) || (stryMutAct_9fa48("39746") ? value !== undefined : stryMutAct_9fa48("39745") ? false : (stryCov_9fa48("39745", "39746"), value === undefined)))) {
        if (stryMutAct_9fa48("39747")) {
          {}
        } else {
          stryCov_9fa48("39747");
          return stryMutAct_9fa48("39748") ? "" : (stryCov_9fa48("39748"), 'N/A');
        }
      }
      return String(value);
    }
  }

  /**
   * Format a size value with units
   * @param {number} bytes - Size in bytes
   * @return {string} Formatted size
   */
  formatSize(bytes) {
    if (stryMutAct_9fa48("39749")) {
      {}
    } else {
      stryCov_9fa48("39749");
      if (stryMutAct_9fa48("39752") ? bytes === null && bytes === undefined : stryMutAct_9fa48("39751") ? false : stryMutAct_9fa48("39750") ? true : (stryCov_9fa48("39750", "39751", "39752"), (stryMutAct_9fa48("39754") ? bytes !== null : stryMutAct_9fa48("39753") ? false : (stryCov_9fa48("39753", "39754"), bytes === null)) || (stryMutAct_9fa48("39756") ? bytes !== undefined : stryMutAct_9fa48("39755") ? false : (stryCov_9fa48("39755", "39756"), bytes === undefined)))) {
        if (stryMutAct_9fa48("39757")) {
          {}
        } else {
          stryCov_9fa48("39757");
          return stryMutAct_9fa48("39758") ? "" : (stryCov_9fa48("39758"), 'N/A');
        }
      }
      if (stryMutAct_9fa48("39761") ? bytes !== 0 : stryMutAct_9fa48("39760") ? false : stryMutAct_9fa48("39759") ? true : (stryCov_9fa48("39759", "39760", "39761"), bytes === 0)) {
        if (stryMutAct_9fa48("39762")) {
          {}
        } else {
          stryCov_9fa48("39762");
          return stryMutAct_9fa48("39763") ? "" : (stryCov_9fa48("39763"), '0 B');
        }
      }
      const units = stryMutAct_9fa48("39764") ? [] : (stryCov_9fa48("39764"), [stryMutAct_9fa48("39765") ? "" : (stryCov_9fa48("39765"), 'B'), stryMutAct_9fa48("39766") ? "" : (stryCov_9fa48("39766"), 'KB'), stryMutAct_9fa48("39767") ? "" : (stryCov_9fa48("39767"), 'MB'), stryMutAct_9fa48("39768") ? "" : (stryCov_9fa48("39768"), 'GB'), stryMutAct_9fa48("39769") ? "" : (stryCov_9fa48("39769"), 'TB')]);
      const i = Math.floor(stryMutAct_9fa48("39770") ? Math.log(bytes) * Math.log(1024) : (stryCov_9fa48("39770"), Math.log(bytes) / Math.log(1024)));
      const value = stryMutAct_9fa48("39771") ? bytes * Math.pow(1024, i) : (stryCov_9fa48("39771"), bytes / Math.pow(1024, i));
      return stryMutAct_9fa48("39772") ? `` : (stryCov_9fa48("39772"), `${value.toFixed(1)} ${units[i]}`);
    }
  }

  /**
   * Format a percentage value
   * @param {number} value - Percentage value
   * @param {number} [decimals=1] - Decimal places
   * @return {string} Formatted percentage
   */
  formatPercent(value, decimals = 1) {
    if (stryMutAct_9fa48("39773")) {
      {}
    } else {
      stryCov_9fa48("39773");
      if (stryMutAct_9fa48("39776") ? value === null && value === undefined : stryMutAct_9fa48("39775") ? false : stryMutAct_9fa48("39774") ? true : (stryCov_9fa48("39774", "39775", "39776"), (stryMutAct_9fa48("39778") ? value !== null : stryMutAct_9fa48("39777") ? false : (stryCov_9fa48("39777", "39778"), value === null)) || (stryMutAct_9fa48("39780") ? value !== undefined : stryMutAct_9fa48("39779") ? false : (stryCov_9fa48("39779", "39780"), value === undefined)))) {
        if (stryMutAct_9fa48("39781")) {
          {}
        } else {
          stryCov_9fa48("39781");
          return stryMutAct_9fa48("39782") ? "" : (stryCov_9fa48("39782"), 'N/A');
        }
      }
      return stryMutAct_9fa48("39783") ? `` : (stryCov_9fa48("39783"), `${value.toFixed(decimals)}%`);
    }
  }

  /**
   * Format a timestamp
   * @param {number|Date} timestamp - Timestamp
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (stryMutAct_9fa48("39784")) {
      {}
    } else {
      stryCov_9fa48("39784");
      if (stryMutAct_9fa48("39787") ? false : stryMutAct_9fa48("39786") ? true : stryMutAct_9fa48("39785") ? timestamp : (stryCov_9fa48("39785", "39786", "39787"), !timestamp)) {
        if (stryMutAct_9fa48("39788")) {
          {}
        } else {
          stryCov_9fa48("39788");
          return stryMutAct_9fa48("39789") ? "" : (stryCov_9fa48("39789"), 'N/A');
        }
      }
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      return stryMutAct_9fa48("39790") ? date.toISOString().replace('T', ' ') : (stryCov_9fa48("39790"), date.toISOString().replace(stryMutAct_9fa48("39791") ? "" : (stryCov_9fa48("39791"), 'T'), stryMutAct_9fa48("39792") ? "" : (stryCov_9fa48("39792"), ' ')).substring(0, 19));
    }
  }

  /**
   * Get a summary of the data
   * Override in subclasses for custom summaries
   * @return {Object} Summary object
   */
  getSummary() {
    if (stryMutAct_9fa48("39793")) {
      {}
    } else {
      stryCov_9fa48("39793");
      return stryMutAct_9fa48("39794") ? {} : (stryCov_9fa48("39794"), {
        count: this.data.length
      });
    }
  }

  /**
   * Validate an item
   * Override in subclasses for custom validation
   * @param {Object} _item - Item to validate
   * @return {{valid: boolean, errors: string[]}}
   */
  validate(_item) {
    if (stryMutAct_9fa48("39795")) {
      {}
    } else {
      stryCov_9fa48("39795");
      return stryMutAct_9fa48("39796") ? {} : (stryCov_9fa48("39796"), {
        valid: stryMutAct_9fa48("39797") ? false : (stryCov_9fa48("39797"), true),
        errors: stryMutAct_9fa48("39798") ? ["Stryker was here"] : (stryCov_9fa48("39798"), [])
      });
    }
  }

  /**
   * Get the count of items
   * @return {number}
   */
  getCount() {
    if (stryMutAct_9fa48("39799")) {
      {}
    } else {
      stryCov_9fa48("39799");
      return this.data.length;
    }
  }

  /**
   * Check if data is empty
   * @return {boolean}
   */
  isEmpty() {
    if (stryMutAct_9fa48("39800")) {
      {}
    } else {
      stryCov_9fa48("39800");
      return stryMutAct_9fa48("39803") ? this.data.length !== 0 : stryMutAct_9fa48("39802") ? false : stryMutAct_9fa48("39801") ? true : (stryCov_9fa48("39801", "39802", "39803"), this.data.length === 0);
    }
  }

  /**
   * Get an item by index
   * @param {number} index - Item index
   * @return {Object|undefined}
   */
  getItem(index) {
    if (stryMutAct_9fa48("39804")) {
      {}
    } else {
      stryCov_9fa48("39804");
      return this.data[index];
    }
  }

  /**
   * Find an item by predicate
   * @param {Function} predicate - Find predicate
   * @return {Object|undefined}
   */
  findItem(predicate) {
    if (stryMutAct_9fa48("39805")) {
      {}
    } else {
      stryCov_9fa48("39805");
      return this.data.find(predicate);
    }
  }

  /**
   * Clear all data and cache
   */
  clear() {
    if (stryMutAct_9fa48("39806")) {
      {}
    } else {
      stryCov_9fa48("39806");
      this.data = stryMutAct_9fa48("39807") ? ["Stryker was here"] : (stryCov_9fa48("39807"), []);
      this.invalidateCache();
    }
  }

  /**
   * Destroy the view model and cleanup
   */
  destroy() {
    if (stryMutAct_9fa48("39808")) {
      {}
    } else {
      stryCov_9fa48("39808");
      this.data = stryMutAct_9fa48("39809") ? ["Stryker was here"] : (stryCov_9fa48("39809"), []);
      this.computedCache.clear();
      this.computedDefinitions.clear();
    }
  }
}