/**
 * BaseView - Base class for all CLI views with common functionality
 *
 * Provides filtering, sorting, rendering, and row status styling.
 *
 * Requirements: 2.5, 2.6, 17.1, 17.3
 */
// @ts-nocheck


/**
 * Row status types for styling
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
export const ROW_STATUS = stryMutAct_9fa48("39810") ? {} : (stryCov_9fa48("39810"), {
  NORMAL: stryMutAct_9fa48("39811") ? "" : (stryCov_9fa48("39811"), 'normal'),
  WARNING: stryMutAct_9fa48("39812") ? "" : (stryCov_9fa48("39812"), 'warning'),
  ERROR: stryMutAct_9fa48("39813") ? "" : (stryCov_9fa48("39813"), 'error')
});

/**
 * Color mappings for row statuses
 * Requirements: 17.1
 */
export const STATUS_COLORS = stryMutAct_9fa48("39814") ? {} : (stryCov_9fa48("39814"), {
  normal: stryMutAct_9fa48("39815") ? "" : (stryCov_9fa48("39815"), 'white'),
  warning: stryMutAct_9fa48("39816") ? "" : (stryCov_9fa48("39816"), 'yellow'),
  error: stryMutAct_9fa48("39817") ? "" : (stryCov_9fa48("39817"), 'red'),
  changed: stryMutAct_9fa48("39818") ? "" : (stryCov_9fa48("39818"), 'cyan')
});

/**
 * BaseView class providing common view functionality
 */
export class BaseView {
  /**
   * Creates a new BaseView
   * @param {Object} options - View options
   * @param {Object} [options.screen] - Blessed screen instance
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("39819")) {
      {}
    } else {
      stryCov_9fa48("39819");
      this.screen = stryMutAct_9fa48("39822") ? options.screen && null : stryMutAct_9fa48("39821") ? false : stryMutAct_9fa48("39820") ? true : (stryCov_9fa48("39820", "39821", "39822"), options.screen || null);
      this.eventBus = stryMutAct_9fa48("39825") ? options.eventBus && null : stryMutAct_9fa48("39824") ? false : stryMutAct_9fa48("39823") ? true : (stryCov_9fa48("39823", "39824", "39825"), options.eventBus || null);
      this.options = options;

      // View state
      this.selectedIndex = 0;
      this.filter = stryMutAct_9fa48("39826") ? "Stryker was here!" : (stryCov_9fa48("39826"), '');
      this.sortColumn = null;
      this.sortDirection = stryMutAct_9fa48("39827") ? "" : (stryCov_9fa48("39827"), 'asc');
      this.visible = stryMutAct_9fa48("39828") ? true : (stryCov_9fa48("39828"), false);

      // Data
      this.data = stryMutAct_9fa48("39829") ? ["Stryker was here"] : (stryCov_9fa48("39829"), []);
      this.filteredData = stryMutAct_9fa48("39830") ? ["Stryker was here"] : (stryCov_9fa48("39830"), []);
      this.changedRows = new Set();
    }
  }

  /**
   * Get column definitions for the view
   * Override in subclasses
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("39831")) {
      {}
    } else {
      stryCov_9fa48("39831");
      return stryMutAct_9fa48("39832") ? ["Stryker was here"] : (stryCov_9fa48("39832"), []);
    }
  }

  /**
   * Format a data item into a row array
   * Override in subclasses
   * @param {Object} _item - Data item
   * @return {Array<string>} Row values
   */
  formatRow(_item) {
    if (stryMutAct_9fa48("39833")) {
      {}
    } else {
      stryCov_9fa48("39833");
      return stryMutAct_9fa48("39834") ? ["Stryker was here"] : (stryCov_9fa48("39834"), []);
    }
  }

  /**
   * Get the row status for styling
   * Override in subclasses
   * @param {Object} _item - Data item
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(_item) {
    if (stryMutAct_9fa48("39835")) {
      {}
    } else {
      stryCov_9fa48("39835");
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Get the unique key for a data item
   * Override in subclasses
   * @param {Object} _item - Data item
   * @return {string} Unique key
   */
  getItemKey(_item) {
    if (stryMutAct_9fa48("39836")) {
      {}
    } else {
      stryCov_9fa48("39836");
      return stryMutAct_9fa48("39837") ? "Stryker was here!" : (stryCov_9fa48("39837"), '');
    }
  }

  /**
   * Apply filter to data
   * Requirements: 2.5
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    if (stryMutAct_9fa48("39838")) {
      {}
    } else {
      stryCov_9fa48("39838");
      if (stryMutAct_9fa48("39841") ? !this.filter && this.filter.trim() === '' : stryMutAct_9fa48("39840") ? false : stryMutAct_9fa48("39839") ? true : (stryCov_9fa48("39839", "39840", "39841"), (stryMutAct_9fa48("39842") ? this.filter : (stryCov_9fa48("39842"), !this.filter)) || (stryMutAct_9fa48("39844") ? this.filter.trim() !== '' : stryMutAct_9fa48("39843") ? false : (stryCov_9fa48("39843", "39844"), (stryMutAct_9fa48("39845") ? this.filter : (stryCov_9fa48("39845"), this.filter.trim())) === (stryMutAct_9fa48("39846") ? "Stryker was here!" : (stryCov_9fa48("39846"), '')))))) {
        if (stryMutAct_9fa48("39847")) {
          {}
        } else {
          stryCov_9fa48("39847");
          return data;
        }
      }
      const lowerFilter = stryMutAct_9fa48("39848") ? this.filter.toUpperCase() : (stryCov_9fa48("39848"), this.filter.toLowerCase());
      return stryMutAct_9fa48("39849") ? data : (stryCov_9fa48("39849"), data.filter(item => {
        if (stryMutAct_9fa48("39850")) {
          {}
        } else {
          stryCov_9fa48("39850");
          // Check if any field contains the filter string
          const values = Object.values(item);
          return stryMutAct_9fa48("39851") ? values.every(value => {
            if (value === null || value === undefined) return false;
            return String(value).toLowerCase().includes(lowerFilter);
          }) : (stryCov_9fa48("39851"), values.some(value => {
            if (stryMutAct_9fa48("39852")) {
              {}
            } else {
              stryCov_9fa48("39852");
              if (stryMutAct_9fa48("39855") ? value === null && value === undefined : stryMutAct_9fa48("39854") ? false : stryMutAct_9fa48("39853") ? true : (stryCov_9fa48("39853", "39854", "39855"), (stryMutAct_9fa48("39857") ? value !== null : stryMutAct_9fa48("39856") ? false : (stryCov_9fa48("39856", "39857"), value === null)) || (stryMutAct_9fa48("39859") ? value !== undefined : stryMutAct_9fa48("39858") ? false : (stryCov_9fa48("39858", "39859"), value === undefined)))) return stryMutAct_9fa48("39860") ? true : (stryCov_9fa48("39860"), false);
              return stryMutAct_9fa48("39861") ? String(value).toUpperCase().includes(lowerFilter) : (stryCov_9fa48("39861"), String(value).toLowerCase().includes(lowerFilter));
            }
          }));
        }
      }));
    }
  }

  /**
   * Apply sort to data
   * Requirements: 2.6
   * @param {Array} data - Data to sort
   * @return {Array} Sorted data
   */
  applySort(data) {
    if (stryMutAct_9fa48("39862")) {
      {}
    } else {
      stryCov_9fa48("39862");
      if (stryMutAct_9fa48("39865") ? false : stryMutAct_9fa48("39864") ? true : stryMutAct_9fa48("39863") ? this.sortColumn : (stryCov_9fa48("39863", "39864", "39865"), !this.sortColumn)) {
        if (stryMutAct_9fa48("39866")) {
          {}
        } else {
          stryCov_9fa48("39866");
          return data;
        }
      }
      return stryMutAct_9fa48("39867") ? [...data] : (stryCov_9fa48("39867"), (stryMutAct_9fa48("39868") ? [] : (stryCov_9fa48("39868"), [...data])).sort((a, b) => {
        if (stryMutAct_9fa48("39869")) {
          {}
        } else {
          stryCov_9fa48("39869");
          const aVal = a[this.sortColumn];
          const bVal = b[this.sortColumn];

          // Handle null/undefined
          if (stryMutAct_9fa48("39872") ? aVal === null && aVal === undefined : stryMutAct_9fa48("39871") ? false : stryMutAct_9fa48("39870") ? true : (stryCov_9fa48("39870", "39871", "39872"), (stryMutAct_9fa48("39874") ? aVal !== null : stryMutAct_9fa48("39873") ? false : (stryCov_9fa48("39873", "39874"), aVal === null)) || (stryMutAct_9fa48("39876") ? aVal !== undefined : stryMutAct_9fa48("39875") ? false : (stryCov_9fa48("39875", "39876"), aVal === undefined)))) {
            if (stryMutAct_9fa48("39877")) {
              {}
            } else {
              stryCov_9fa48("39877");
              return (stryMutAct_9fa48("39880") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("39879") ? false : stryMutAct_9fa48("39878") ? true : (stryCov_9fa48("39878", "39879", "39880"), this.sortDirection === (stryMutAct_9fa48("39881") ? "" : (stryCov_9fa48("39881"), 'asc')))) ? 1 : stryMutAct_9fa48("39882") ? +1 : (stryCov_9fa48("39882"), -1);
            }
          }
          if (stryMutAct_9fa48("39885") ? bVal === null && bVal === undefined : stryMutAct_9fa48("39884") ? false : stryMutAct_9fa48("39883") ? true : (stryCov_9fa48("39883", "39884", "39885"), (stryMutAct_9fa48("39887") ? bVal !== null : stryMutAct_9fa48("39886") ? false : (stryCov_9fa48("39886", "39887"), bVal === null)) || (stryMutAct_9fa48("39889") ? bVal !== undefined : stryMutAct_9fa48("39888") ? false : (stryCov_9fa48("39888", "39889"), bVal === undefined)))) {
            if (stryMutAct_9fa48("39890")) {
              {}
            } else {
              stryCov_9fa48("39890");
              return (stryMutAct_9fa48("39893") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("39892") ? false : stryMutAct_9fa48("39891") ? true : (stryCov_9fa48("39891", "39892", "39893"), this.sortDirection === (stryMutAct_9fa48("39894") ? "" : (stryCov_9fa48("39894"), 'asc')))) ? stryMutAct_9fa48("39895") ? +1 : (stryCov_9fa48("39895"), -1) : 1;
            }
          }

          // Compare values
          let cmp;
          if (stryMutAct_9fa48("39898") ? typeof aVal === 'number' || typeof bVal === 'number' : stryMutAct_9fa48("39897") ? false : stryMutAct_9fa48("39896") ? true : (stryCov_9fa48("39896", "39897", "39898"), (stryMutAct_9fa48("39900") ? typeof aVal !== 'number' : stryMutAct_9fa48("39899") ? true : (stryCov_9fa48("39899", "39900"), typeof aVal === (stryMutAct_9fa48("39901") ? "" : (stryCov_9fa48("39901"), 'number')))) && (stryMutAct_9fa48("39903") ? typeof bVal !== 'number' : stryMutAct_9fa48("39902") ? true : (stryCov_9fa48("39902", "39903"), typeof bVal === (stryMutAct_9fa48("39904") ? "" : (stryCov_9fa48("39904"), 'number')))))) {
            if (stryMutAct_9fa48("39905")) {
              {}
            } else {
              stryCov_9fa48("39905");
              cmp = stryMutAct_9fa48("39906") ? aVal + bVal : (stryCov_9fa48("39906"), aVal - bVal);
            }
          } else {
            if (stryMutAct_9fa48("39907")) {
              {}
            } else {
              stryCov_9fa48("39907");
              cmp = String(aVal).localeCompare(String(bVal));
            }
          }
          return (stryMutAct_9fa48("39910") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("39909") ? false : stryMutAct_9fa48("39908") ? true : (stryCov_9fa48("39908", "39909", "39910"), this.sortDirection === (stryMutAct_9fa48("39911") ? "" : (stryCov_9fa48("39911"), 'asc')))) ? cmp : stryMutAct_9fa48("39912") ? +cmp : (stryCov_9fa48("39912"), -cmp);
        }
      }));
    }
  }

  /**
   * Set the filter string
   * @param {string} filter - Filter string
   */
  setFilter(filter) {
    if (stryMutAct_9fa48("39913")) {
      {}
    } else {
      stryCov_9fa48("39913");
      this.filter = filter;
      this.selectedIndex = 0;
      this.updateFilteredData();
    }
  }

  /**
   * Clear the filter
   */
  clearFilter() {
    if (stryMutAct_9fa48("39914")) {
      {}
    } else {
      stryCov_9fa48("39914");
      this.filter = stryMutAct_9fa48("39915") ? "Stryker was here!" : (stryCov_9fa48("39915"), '');
      this.selectedIndex = 0;
      this.updateFilteredData();
    }
  }

  /**
   * Set the sort column and direction
   * @param {string} column - Column key to sort by
   * @param {string} [direction] - Sort direction ('asc' or 'desc')
   */
  setSort(column, direction) {
    if (stryMutAct_9fa48("39916")) {
      {}
    } else {
      stryCov_9fa48("39916");
      if (stryMutAct_9fa48("39919") ? this.sortColumn === column || !direction : stryMutAct_9fa48("39918") ? false : stryMutAct_9fa48("39917") ? true : (stryCov_9fa48("39917", "39918", "39919"), (stryMutAct_9fa48("39921") ? this.sortColumn !== column : stryMutAct_9fa48("39920") ? true : (stryCov_9fa48("39920", "39921"), this.sortColumn === column)) && (stryMutAct_9fa48("39922") ? direction : (stryCov_9fa48("39922"), !direction)))) {
        if (stryMutAct_9fa48("39923")) {
          {}
        } else {
          stryCov_9fa48("39923");
          // Toggle direction if same column
          this.sortDirection = (stryMutAct_9fa48("39926") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("39925") ? false : stryMutAct_9fa48("39924") ? true : (stryCov_9fa48("39924", "39925", "39926"), this.sortDirection === (stryMutAct_9fa48("39927") ? "" : (stryCov_9fa48("39927"), 'asc')))) ? stryMutAct_9fa48("39928") ? "" : (stryCov_9fa48("39928"), 'desc') : stryMutAct_9fa48("39929") ? "" : (stryCov_9fa48("39929"), 'asc');
        }
      } else {
        if (stryMutAct_9fa48("39930")) {
          {}
        } else {
          stryCov_9fa48("39930");
          this.sortColumn = column;
          this.sortDirection = stryMutAct_9fa48("39933") ? direction && 'asc' : stryMutAct_9fa48("39932") ? false : stryMutAct_9fa48("39931") ? true : (stryCov_9fa48("39931", "39932", "39933"), direction || (stryMutAct_9fa48("39934") ? "" : (stryCov_9fa48("39934"), 'asc')));
        }
      }
      this.updateFilteredData();
    }
  }

  /**
   * Clear sorting
   */
  clearSort() {
    if (stryMutAct_9fa48("39935")) {
      {}
    } else {
      stryCov_9fa48("39935");
      this.sortColumn = null;
      this.sortDirection = stryMutAct_9fa48("39936") ? "" : (stryCov_9fa48("39936"), 'asc');
      this.updateFilteredData();
    }
  }

  /**
   * Update filtered and sorted data
   */
  updateFilteredData() {
    if (stryMutAct_9fa48("39937")) {
      {}
    } else {
      stryCov_9fa48("39937");
      let result = this.applyFilter(this.data);
      result = this.applySort(result);
      this.filteredData = result;

      // Ensure selected index is valid
      if (stryMutAct_9fa48("39941") ? this.selectedIndex < this.filteredData.length : stryMutAct_9fa48("39940") ? this.selectedIndex > this.filteredData.length : stryMutAct_9fa48("39939") ? false : stryMutAct_9fa48("39938") ? true : (stryCov_9fa48("39938", "39939", "39940", "39941"), this.selectedIndex >= this.filteredData.length)) {
        if (stryMutAct_9fa48("39942")) {
          {}
        } else {
          stryCov_9fa48("39942");
          this.selectedIndex = stryMutAct_9fa48("39943") ? Math.min(0, this.filteredData.length - 1) : (stryCov_9fa48("39943"), Math.max(0, stryMutAct_9fa48("39944") ? this.filteredData.length + 1 : (stryCov_9fa48("39944"), this.filteredData.length - 1)));
        }
      }
    }
  }

  /**
   * Set the view data
   * @param {Array} data - Data items
   */
  setData(data) {
    if (stryMutAct_9fa48("39945")) {
      {}
    } else {
      stryCov_9fa48("39945");
      this.data = stryMutAct_9fa48("39948") ? data && [] : stryMutAct_9fa48("39947") ? false : stryMutAct_9fa48("39946") ? true : (stryCov_9fa48("39946", "39947", "39948"), data || (stryMutAct_9fa48("39949") ? ["Stryker was here"] : (stryCov_9fa48("39949"), [])));
      this.updateFilteredData();
    }
  }

  /**
   * Mark a row as changed (for highlighting)
   * @param {string} key - Row key
   */
  markChanged(key) {
    if (stryMutAct_9fa48("39950")) {
      {}
    } else {
      stryCov_9fa48("39950");
      this.changedRows.add(key);
    }
  }

  /**
   * Clear changed row highlighting
   * @param {string} [key] - Specific key to clear, or all if not provided
   */
  clearChanged(key) {
    if (stryMutAct_9fa48("39951")) {
      {}
    } else {
      stryCov_9fa48("39951");
      if (stryMutAct_9fa48("39953") ? false : stryMutAct_9fa48("39952") ? true : (stryCov_9fa48("39952", "39953"), key)) {
        if (stryMutAct_9fa48("39954")) {
          {}
        } else {
          stryCov_9fa48("39954");
          this.changedRows.delete(key);
        }
      } else {
        if (stryMutAct_9fa48("39955")) {
          {}
        } else {
          stryCov_9fa48("39955");
          this.changedRows.clear();
        }
      }
    }
  }

  /**
   * Check if a row is marked as changed
   * @param {string} key - Row key
   * @return {boolean}
   */
  isChanged(key) {
    if (stryMutAct_9fa48("39956")) {
      {}
    } else {
      stryCov_9fa48("39956");
      return this.changedRows.has(key);
    }
  }

  /**
   * Render the view
   * @param {Object} state - Navigation state
   * @return {Object} Render data with headers and rows
   */
  render(state = {}) {
    if (stryMutAct_9fa48("39957")) {
      {}
    } else {
      stryCov_9fa48("39957");
      const columns = this.getColumns();
      const headers = columns.map(stryMutAct_9fa48("39958") ? () => undefined : (stryCov_9fa48("39958"), c => c.label));
      const rows = this.filteredData.map((item, index) => {
        if (stryMutAct_9fa48("39959")) {
          {}
        } else {
          stryCov_9fa48("39959");
          const rowValues = this.formatRow(item);
          const status = this.getRowStatus(item);
          const key = this.getItemKey(item);
          const isChanged = this.isChanged(key);
          const isSelected = stryMutAct_9fa48("39962") ? index !== this.selectedIndex : stryMutAct_9fa48("39961") ? false : stryMutAct_9fa48("39960") ? true : (stryCov_9fa48("39960", "39961", "39962"), index === this.selectedIndex);
          return stryMutAct_9fa48("39963") ? {} : (stryCov_9fa48("39963"), {
            values: rowValues,
            status,
            isChanged,
            isSelected,
            key,
            item
          });
        }
      });
      return stryMutAct_9fa48("39964") ? {} : (stryCov_9fa48("39964"), {
        headers,
        rows,
        columns,
        filter: this.filter,
        sortColumn: this.sortColumn,
        sortDirection: this.sortDirection,
        selectedIndex: this.selectedIndex,
        totalCount: this.data.length,
        filteredCount: this.filteredData.length,
        state
      });
    }
  }

  /**
   * Style a row based on status and state
   * Requirements: 17.1, 17.3
   * @param {Array<string>} row - Row values
   * @param {string} status - Row status
   * @param {boolean} isChanged - Whether row is changed
   * @param {boolean} isSelected - Whether row is selected
   * @return {Array<string>} Styled row values
   */
  styleRow(row, status, isChanged, isSelected) {
    if (stryMutAct_9fa48("39965")) {
      {}
    } else {
      stryCov_9fa48("39965");
      let color = stryMutAct_9fa48("39968") ? STATUS_COLORS[status] && STATUS_COLORS.normal : stryMutAct_9fa48("39967") ? false : stryMutAct_9fa48("39966") ? true : (stryCov_9fa48("39966", "39967", "39968"), STATUS_COLORS[status] || STATUS_COLORS.normal);

      // Changed rows get cyan highlighting
      if (stryMutAct_9fa48("39970") ? false : stryMutAct_9fa48("39969") ? true : (stryCov_9fa48("39969", "39970"), isChanged)) {
        if (stryMutAct_9fa48("39971")) {
          {}
        } else {
          stryCov_9fa48("39971");
          color = STATUS_COLORS.changed;
        }
      }

      // Selected row gets inverse styling
      const style = isSelected ? stryMutAct_9fa48("39972") ? "" : (stryCov_9fa48("39972"), '{inverse}') : stryMutAct_9fa48("39973") ? `` : (stryCov_9fa48("39973"), `{${color}-fg}`);
      const endStyle = isSelected ? stryMutAct_9fa48("39974") ? "" : (stryCov_9fa48("39974"), '{/inverse}') : stryMutAct_9fa48("39975") ? "" : (stryCov_9fa48("39975"), '{/}');
      return row.map(stryMutAct_9fa48("39976") ? () => undefined : (stryCov_9fa48("39976"), cell => stryMutAct_9fa48("39977") ? `` : (stryCov_9fa48("39977"), `${style}${cell}${endStyle}`)));
    }
  }

  /**
   * Get the currently selected item
   * @return {Object|null} Selected item or null
   */
  getSelectedItem() {
    if (stryMutAct_9fa48("39978")) {
      {}
    } else {
      stryCov_9fa48("39978");
      if (stryMutAct_9fa48("39981") ? this.filteredData.length !== 0 : stryMutAct_9fa48("39980") ? false : stryMutAct_9fa48("39979") ? true : (stryCov_9fa48("39979", "39980", "39981"), this.filteredData.length === 0)) {
        if (stryMutAct_9fa48("39982")) {
          {}
        } else {
          stryCov_9fa48("39982");
          return null;
        }
      }
      return stryMutAct_9fa48("39985") ? this.filteredData[this.selectedIndex] && null : stryMutAct_9fa48("39984") ? false : stryMutAct_9fa48("39983") ? true : (stryCov_9fa48("39983", "39984", "39985"), this.filteredData[this.selectedIndex] || null);
    }
  }

  /**
   * Move selection up
   * @param {number} [count=1] - Number of rows to move
   */
  selectUp(count = 1) {
    if (stryMutAct_9fa48("39986")) {
      {}
    } else {
      stryCov_9fa48("39986");
      this.selectedIndex = stryMutAct_9fa48("39987") ? Math.min(0, this.selectedIndex - count) : (stryCov_9fa48("39987"), Math.max(0, stryMutAct_9fa48("39988") ? this.selectedIndex + count : (stryCov_9fa48("39988"), this.selectedIndex - count)));
    }
  }

  /**
   * Move selection down
   * @param {number} [count=1] - Number of rows to move
   */
  selectDown(count = 1) {
    if (stryMutAct_9fa48("39989")) {
      {}
    } else {
      stryCov_9fa48("39989");
      this.selectedIndex = stryMutAct_9fa48("39990") ? Math.max(this.filteredData.length - 1, this.selectedIndex + count) : (stryCov_9fa48("39990"), Math.min(stryMutAct_9fa48("39991") ? this.filteredData.length + 1 : (stryCov_9fa48("39991"), this.filteredData.length - 1), stryMutAct_9fa48("39992") ? this.selectedIndex - count : (stryCov_9fa48("39992"), this.selectedIndex + count)));
    }
  }

  /**
   * Select first row
   */
  selectFirst() {
    if (stryMutAct_9fa48("39993")) {
      {}
    } else {
      stryCov_9fa48("39993");
      this.selectedIndex = 0;
    }
  }

  /**
   * Select last row
   */
  selectLast() {
    if (stryMutAct_9fa48("39994")) {
      {}
    } else {
      stryCov_9fa48("39994");
      this.selectedIndex = stryMutAct_9fa48("39995") ? Math.min(0, this.filteredData.length - 1) : (stryCov_9fa48("39995"), Math.max(0, stryMutAct_9fa48("39996") ? this.filteredData.length + 1 : (stryCov_9fa48("39996"), this.filteredData.length - 1)));
    }
  }

  /**
   * Show the view
   */
  show() {
    if (stryMutAct_9fa48("39997")) {
      {}
    } else {
      stryCov_9fa48("39997");
      this.visible = stryMutAct_9fa48("39998") ? false : (stryCov_9fa48("39998"), true);
      if (stryMutAct_9fa48("40000") ? false : stryMutAct_9fa48("39999") ? true : (stryCov_9fa48("39999", "40000"), this.eventBus)) {
        if (stryMutAct_9fa48("40001")) {
          {}
        } else {
          stryCov_9fa48("40001");
          this.eventBus.emit(stryMutAct_9fa48("40002") ? "" : (stryCov_9fa48("40002"), 'view:show'), stryMutAct_9fa48("40003") ? {} : (stryCov_9fa48("40003"), {
            view: this
          }));
        }
      }
    }
  }

  /**
   * Hide the view
   */
  hide() {
    if (stryMutAct_9fa48("40004")) {
      {}
    } else {
      stryCov_9fa48("40004");
      this.visible = stryMutAct_9fa48("40005") ? true : (stryCov_9fa48("40005"), false);
      if (stryMutAct_9fa48("40007") ? false : stryMutAct_9fa48("40006") ? true : (stryCov_9fa48("40006", "40007"), this.eventBus)) {
        if (stryMutAct_9fa48("40008")) {
          {}
        } else {
          stryCov_9fa48("40008");
          this.eventBus.emit(stryMutAct_9fa48("40009") ? "" : (stryCov_9fa48("40009"), 'view:hide'), stryMutAct_9fa48("40010") ? {} : (stryCov_9fa48("40010"), {
            view: this
          }));
        }
      }
    }
  }

  /**
   * Check if view is visible
   * @return {boolean}
   */
  isVisible() {
    if (stryMutAct_9fa48("40011")) {
      {}
    } else {
      stryCov_9fa48("40011");
      return this.visible;
    }
  }

  /**
   * Handle key input
   * Override in subclasses for custom key handling
   * @param {Object} _key - Key event
   * @return {boolean} True if key was handled
   */
  handleKey(_key) {
    if (stryMutAct_9fa48("40012")) {
      {}
    } else {
      stryCov_9fa48("40012");
      return stryMutAct_9fa48("40013") ? true : (stryCov_9fa48("40013"), false);
    }
  }

  /**
   * Refresh the view
   */
  refresh() {
    if (stryMutAct_9fa48("40014")) {
      {}
    } else {
      stryCov_9fa48("40014");
      this.updateFilteredData();
      if (stryMutAct_9fa48("40016") ? false : stryMutAct_9fa48("40015") ? true : (stryCov_9fa48("40015", "40016"), this.eventBus)) {
        if (stryMutAct_9fa48("40017")) {
          {}
        } else {
          stryCov_9fa48("40017");
          this.eventBus.emit(stryMutAct_9fa48("40018") ? "" : (stryCov_9fa48("40018"), 'view:refresh'), stryMutAct_9fa48("40019") ? {} : (stryCov_9fa48("40019"), {
            view: this
          }));
        }
      }
    }
  }
}