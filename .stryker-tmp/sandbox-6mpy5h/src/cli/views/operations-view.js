/**
 * OperationsView - Displays replica operations with workflow steps
 *
 * Columns: operation_id, type, partition_id, target_node, status, workflow_step, updated_at
 * Supports filtering by status and viewing operation history.
 *
 * Requirements: 4.4, 9.3
 */
// @ts-nocheck
function stryNS_9fa48() {
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
import { BaseView, ROW_STATUS } from '../core/base-view.js';

/**
 * Operation status types for styling
 */
export const OPERATION_STATUS = stryMutAct_9fa48("51087") ? {} : (stryCov_9fa48("51087"), {
  PENDING: stryMutAct_9fa48("51088") ? "" : (stryCov_9fa48("51088"), 'pending'),
  CREATING: stryMutAct_9fa48("51089") ? "" : (stryCov_9fa48("51089"), 'creating'),
  SYNCING: stryMutAct_9fa48("51090") ? "" : (stryCov_9fa48("51090"), 'syncing'),
  ACTIVE: stryMutAct_9fa48("51091") ? "" : (stryCov_9fa48("51091"), 'active'),
  REMOVING: stryMutAct_9fa48("51092") ? "" : (stryCov_9fa48("51092"), 'removing'),
  REMOVED: stryMutAct_9fa48("51093") ? "" : (stryCov_9fa48("51093"), 'removed'),
  FAILED: stryMutAct_9fa48("51094") ? "" : (stryCov_9fa48("51094"), 'failed')
});

/**
 * Workflow steps for ADD operations
 */
export const ADD_WORKFLOW_STEPS = stryMutAct_9fa48("51095") ? [] : (stryCov_9fa48("51095"), [stryMutAct_9fa48("51096") ? "" : (stryCov_9fa48("51096"), 'PENDING'), stryMutAct_9fa48("51097") ? "" : (stryCov_9fa48("51097"), 'SENDING'), stryMutAct_9fa48("51098") ? "" : (stryCov_9fa48("51098"), 'CREATING'), stryMutAct_9fa48("51099") ? "" : (stryCov_9fa48("51099"), 'SYNCING'), stryMutAct_9fa48("51100") ? "" : (stryCov_9fa48("51100"), 'ACTIVE')]);

/**
 * Workflow steps for REMOVE operations
 */
export const REMOVE_WORKFLOW_STEPS = stryMutAct_9fa48("51101") ? [] : (stryCov_9fa48("51101"), [stryMutAct_9fa48("51102") ? "" : (stryCov_9fa48("51102"), 'PENDING'), stryMutAct_9fa48("51103") ? "" : (stryCov_9fa48("51103"), 'SENDING'), stryMutAct_9fa48("51104") ? "" : (stryCov_9fa48("51104"), 'STOPPING'), stryMutAct_9fa48("51105") ? "" : (stryCov_9fa48("51105"), 'REMOVED')]);

/**
 * OperationsView displays all replica operations with workflow steps
 */
export class OperationsView extends BaseView {
  /**
   * Creates a new OperationsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("51106")) {
      {}
    } else {
      stryCov_9fa48("51106");
      super(options);
      this.cache = stryMutAct_9fa48("51109") ? options.cache && null : stryMutAct_9fa48("51108") ? false : stryMutAct_9fa48("51107") ? true : (stryCov_9fa48("51107", "51108", "51109"), options.cache || null);
      this.viewName = stryMutAct_9fa48("51110") ? "" : (stryCov_9fa48("51110"), 'operations');
    }
  }

  /**
   * Get column definitions for the operations view
   * Requirements: 4.4
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("51111")) {
      {}
    } else {
      stryCov_9fa48("51111");
      return stryMutAct_9fa48("51112") ? [] : (stryCov_9fa48("51112"), [stryMutAct_9fa48("51113") ? {} : (stryCov_9fa48("51113"), {
        key: stryMutAct_9fa48("51114") ? "" : (stryCov_9fa48("51114"), 'operation_id'),
        label: stryMutAct_9fa48("51115") ? "" : (stryCov_9fa48("51115"), 'Operation ID'),
        width: 12
      }), stryMutAct_9fa48("51116") ? {} : (stryCov_9fa48("51116"), {
        key: stryMutAct_9fa48("51117") ? "" : (stryCov_9fa48("51117"), 'type'),
        label: stryMutAct_9fa48("51118") ? "" : (stryCov_9fa48("51118"), 'Type'),
        width: 8
      }), stryMutAct_9fa48("51119") ? {} : (stryCov_9fa48("51119"), {
        key: stryMutAct_9fa48("51120") ? "" : (stryCov_9fa48("51120"), 'partition_id'),
        label: stryMutAct_9fa48("51121") ? "" : (stryCov_9fa48("51121"), 'Partition'),
        width: 15
      }), stryMutAct_9fa48("51122") ? {} : (stryCov_9fa48("51122"), {
        key: stryMutAct_9fa48("51123") ? "" : (stryCov_9fa48("51123"), 'target_node_id'),
        label: stryMutAct_9fa48("51124") ? "" : (stryCov_9fa48("51124"), 'Target Node'),
        width: 15
      }), stryMutAct_9fa48("51125") ? {} : (stryCov_9fa48("51125"), {
        key: stryMutAct_9fa48("51126") ? "" : (stryCov_9fa48("51126"), 'status'),
        label: stryMutAct_9fa48("51127") ? "" : (stryCov_9fa48("51127"), 'Status'),
        width: 10
      }), stryMutAct_9fa48("51128") ? {} : (stryCov_9fa48("51128"), {
        key: stryMutAct_9fa48("51129") ? "" : (stryCov_9fa48("51129"), 'workflow_step'),
        label: stryMutAct_9fa48("51130") ? "" : (stryCov_9fa48("51130"), 'Step'),
        width: 10
      }), stryMutAct_9fa48("51131") ? {} : (stryCov_9fa48("51131"), {
        key: stryMutAct_9fa48("51132") ? "" : (stryCov_9fa48("51132"), 'updated_at'),
        label: stryMutAct_9fa48("51133") ? "" : (stryCov_9fa48("51133"), 'Updated'),
        width: 20
      })]);
    }
  }

  /**
   * Format an operation record into a row array
   * Requirements: 4.4
   * @param {Object} operation - Operation record
   * @return {Array<string>} Row values
   */
  formatRow(operation) {
    if (stryMutAct_9fa48("51134")) {
      {}
    } else {
      stryCov_9fa48("51134");
      return stryMutAct_9fa48("51135") ? [] : (stryCov_9fa48("51135"), [this.truncateId(operation.operation_id), stryMutAct_9fa48("51138") ? operation.type && 'N/A' : stryMutAct_9fa48("51137") ? false : stryMutAct_9fa48("51136") ? true : (stryCov_9fa48("51136", "51137", "51138"), operation.type || (stryMutAct_9fa48("51139") ? "" : (stryCov_9fa48("51139"), 'N/A'))), this.truncateId(operation.partition_id), this.truncateId(operation.target_node_id), stryMutAct_9fa48("51142") ? operation.status && 'unknown' : stryMutAct_9fa48("51141") ? false : stryMutAct_9fa48("51140") ? true : (stryCov_9fa48("51140", "51141", "51142"), operation.status || (stryMutAct_9fa48("51143") ? "" : (stryCov_9fa48("51143"), 'unknown'))), stryMutAct_9fa48("51146") ? operation.workflow_step && 'N/A' : stryMutAct_9fa48("51145") ? false : stryMutAct_9fa48("51144") ? true : (stryCov_9fa48("51144", "51145", "51146"), operation.workflow_step || (stryMutAct_9fa48("51147") ? "" : (stryCov_9fa48("51147"), 'N/A'))), this.formatTimestamp(operation.updated_at)]);
    }
  }

  /**
   * Truncate a UUID for display
   * @param {string|null|undefined} id - UUID to truncate
   * @return {string} Truncated ID
   */
  truncateId(id) {
    if (stryMutAct_9fa48("51148")) {
      {}
    } else {
      stryCov_9fa48("51148");
      if (stryMutAct_9fa48("51151") ? false : stryMutAct_9fa48("51150") ? true : stryMutAct_9fa48("51149") ? id : (stryCov_9fa48("51149", "51150", "51151"), !id)) return stryMutAct_9fa48("51152") ? "" : (stryCov_9fa48("51152"), 'N/A');
      if (stryMutAct_9fa48("51156") ? id.length > 12 : stryMutAct_9fa48("51155") ? id.length < 12 : stryMutAct_9fa48("51154") ? false : stryMutAct_9fa48("51153") ? true : (stryCov_9fa48("51153", "51154", "51155", "51156"), id.length <= 12)) return id;
      return (stryMutAct_9fa48("51157") ? id : (stryCov_9fa48("51157"), id.substring(0, 8))) + (stryMutAct_9fa48("51158") ? "" : (stryCov_9fa48("51158"), '...'));
    }
  }

  /**
   * Format a timestamp for display
   * @param {number|null|undefined} timestamp - Unix timestamp in milliseconds
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (stryMutAct_9fa48("51159")) {
      {}
    } else {
      stryCov_9fa48("51159");
      if (stryMutAct_9fa48("51162") ? false : stryMutAct_9fa48("51161") ? true : stryMutAct_9fa48("51160") ? timestamp : (stryCov_9fa48("51160", "51161", "51162"), !timestamp)) return stryMutAct_9fa48("51163") ? "" : (stryCov_9fa48("51163"), 'N/A');
      const date = new Date(timestamp);
      return stryMutAct_9fa48("51164") ? date.toISOString().replace('T', ' ') : (stryCov_9fa48("51164"), date.toISOString().replace(stryMutAct_9fa48("51165") ? "" : (stryCov_9fa48("51165"), 'T'), stryMutAct_9fa48("51166") ? "" : (stryCov_9fa48("51166"), ' ')).substring(0, 19));
    }
  }

  /**
   * Get the row status for styling based on operation state
   * Requirements: 4.4
   * @param {Object} operation - Operation record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(operation) {
    if (stryMutAct_9fa48("51167")) {
      {}
    } else {
      stryCov_9fa48("51167");
      // Failed status is an error
      if (stryMutAct_9fa48("51170") ? operation.status !== OPERATION_STATUS.FAILED : stryMutAct_9fa48("51169") ? false : stryMutAct_9fa48("51168") ? true : (stryCov_9fa48("51168", "51169", "51170"), operation.status === OPERATION_STATUS.FAILED)) {
        if (stryMutAct_9fa48("51171")) {
          {}
        } else {
          stryCov_9fa48("51171");
          return ROW_STATUS.ERROR;
        }
      }

      // In-progress operations get warning styling
      if (stryMutAct_9fa48("51173") ? false : stryMutAct_9fa48("51172") ? true : (stryCov_9fa48("51172", "51173"), this.isInProgress(operation))) {
        if (stryMutAct_9fa48("51174")) {
          {}
        } else {
          stryCov_9fa48("51174");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Check if an operation is in progress
   * @param {Object} operation - Operation record
   * @return {boolean} True if operation is in progress
   */
  isInProgress(operation) {
    if (stryMutAct_9fa48("51175")) {
      {}
    } else {
      stryCov_9fa48("51175");
      const terminalStatuses = stryMutAct_9fa48("51176") ? [] : (stryCov_9fa48("51176"), [OPERATION_STATUS.ACTIVE, OPERATION_STATUS.REMOVED, OPERATION_STATUS.FAILED]);
      return stryMutAct_9fa48("51177") ? terminalStatuses.includes(operation.status) : (stryCov_9fa48("51177"), !terminalStatuses.includes(operation.status));
    }
  }

  /**
   * Get the unique key for an operation
   * @param {Object} operation - Operation record
   * @return {string} Unique key (operation_id)
   */
  getItemKey(operation) {
    if (stryMutAct_9fa48("51178")) {
      {}
    } else {
      stryCov_9fa48("51178");
      return stryMutAct_9fa48("51181") ? operation.operation_id && '' : stryMutAct_9fa48("51180") ? false : stryMutAct_9fa48("51179") ? true : (stryCov_9fa48("51179", "51180", "51181"), operation.operation_id || (stryMutAct_9fa48("51182") ? "Stryker was here!" : (stryCov_9fa48("51182"), '')));
    }
  }

  /**
   * Handle key input for the operations view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (stryMutAct_9fa48("51183")) {
      {}
    } else {
      stryCov_9fa48("51183");
      if (stryMutAct_9fa48("51186") ? key.name === 'enter' && key.name === 'return' : stryMutAct_9fa48("51185") ? false : stryMutAct_9fa48("51184") ? true : (stryCov_9fa48("51184", "51185", "51186"), (stryMutAct_9fa48("51188") ? key.name !== 'enter' : stryMutAct_9fa48("51187") ? false : (stryCov_9fa48("51187", "51188"), key.name === (stryMutAct_9fa48("51189") ? "" : (stryCov_9fa48("51189"), 'enter')))) || (stryMutAct_9fa48("51191") ? key.name !== 'return' : stryMutAct_9fa48("51190") ? false : (stryCov_9fa48("51190", "51191"), key.name === (stryMutAct_9fa48("51192") ? "" : (stryCov_9fa48("51192"), 'return')))))) {
        if (stryMutAct_9fa48("51193")) {
          {}
        } else {
          stryCov_9fa48("51193");
          // Show operation details
          return this.handleDrillDown();
        }
      }
      return super.handleKey(key);
    }
  }

  /**
   * Handle drill-down action (Enter key on selected operation)
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("51194")) {
      {}
    } else {
      stryCov_9fa48("51194");
      const selectedOp = this.getSelectedItem();
      if (stryMutAct_9fa48("51197") ? false : stryMutAct_9fa48("51196") ? true : stryMutAct_9fa48("51195") ? selectedOp : (stryCov_9fa48("51195", "51196", "51197"), !selectedOp)) {
        if (stryMutAct_9fa48("51198")) {
          {}
        } else {
          stryCov_9fa48("51198");
          return null;
        }
      }

      // Could navigate to partition details
      return stryMutAct_9fa48("51199") ? {} : (stryCov_9fa48("51199"), {
        action: stryMutAct_9fa48("51200") ? "" : (stryCov_9fa48("51200"), 'drillDown'),
        view: stryMutAct_9fa48("51201") ? "" : (stryCov_9fa48("51201"), 'partitions'),
        context: stryMutAct_9fa48("51202") ? {} : (stryCov_9fa48("51202"), {
          partitionId: selectedOp.partition_id
        })
      });
    }
  }

  /**
   * Get detail information for the selected operation
   * Requirements: 4.4, 9.3
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("51203")) {
      {}
    } else {
      stryCov_9fa48("51203");
      const operation = this.getSelectedItem();
      if (stryMutAct_9fa48("51206") ? false : stryMutAct_9fa48("51205") ? true : stryMutAct_9fa48("51204") ? operation : (stryCov_9fa48("51204", "51205", "51206"), !operation)) {
        if (stryMutAct_9fa48("51207")) {
          {}
        } else {
          stryCov_9fa48("51207");
          return null;
        }
      }

      // Parse steps history
      let stepsHistory = stryMutAct_9fa48("51208") ? ["Stryker was here"] : (stryCov_9fa48("51208"), []);
      try {
        if (stryMutAct_9fa48("51209")) {
          {}
        } else {
          stryCov_9fa48("51209");
          if (stryMutAct_9fa48("51212") ? typeof operation.steps_history !== 'string' : stryMutAct_9fa48("51211") ? false : stryMutAct_9fa48("51210") ? true : (stryCov_9fa48("51210", "51211", "51212"), typeof operation.steps_history === (stryMutAct_9fa48("51213") ? "" : (stryCov_9fa48("51213"), 'string')))) {
            if (stryMutAct_9fa48("51214")) {
              {}
            } else {
              stryCov_9fa48("51214");
              stepsHistory = JSON.parse(operation.steps_history);
            }
          } else if (stryMutAct_9fa48("51216") ? false : stryMutAct_9fa48("51215") ? true : (stryCov_9fa48("51215", "51216"), Array.isArray(operation.steps_history))) {
            if (stryMutAct_9fa48("51217")) {
              {}
            } else {
              stryCov_9fa48("51217");
              stepsHistory = operation.steps_history;
            }
          }
        }
      } catch (_e) {
        if (stryMutAct_9fa48("51218")) {
          {}
        } else {
          stryCov_9fa48("51218");
          stepsHistory = stryMutAct_9fa48("51219") ? ["Stryker was here"] : (stryCov_9fa48("51219"), []);
        }
      }
      const sections = stryMutAct_9fa48("51220") ? [] : (stryCov_9fa48("51220"), [stryMutAct_9fa48("51221") ? {} : (stryCov_9fa48("51221"), {
        title: stryMutAct_9fa48("51222") ? "" : (stryCov_9fa48("51222"), 'Operation Information'),
        fields: stryMutAct_9fa48("51223") ? [] : (stryCov_9fa48("51223"), [stryMutAct_9fa48("51224") ? {} : (stryCov_9fa48("51224"), {
          label: stryMutAct_9fa48("51225") ? "" : (stryCov_9fa48("51225"), 'Operation ID'),
          value: operation.operation_id
        }), stryMutAct_9fa48("51226") ? {} : (stryCov_9fa48("51226"), {
          label: stryMutAct_9fa48("51227") ? "" : (stryCov_9fa48("51227"), 'Type'),
          value: operation.type
        }), stryMutAct_9fa48("51228") ? {} : (stryCov_9fa48("51228"), {
          label: stryMutAct_9fa48("51229") ? "" : (stryCov_9fa48("51229"), 'Status'),
          value: operation.status
        }), stryMutAct_9fa48("51230") ? {} : (stryCov_9fa48("51230"), {
          label: stryMutAct_9fa48("51231") ? "" : (stryCov_9fa48("51231"), 'Workflow Step'),
          value: operation.workflow_step
        })])
      }), stryMutAct_9fa48("51232") ? {} : (stryCov_9fa48("51232"), {
        title: stryMutAct_9fa48("51233") ? "" : (stryCov_9fa48("51233"), 'Target Information'),
        fields: stryMutAct_9fa48("51234") ? [] : (stryCov_9fa48("51234"), [stryMutAct_9fa48("51235") ? {} : (stryCov_9fa48("51235"), {
          label: stryMutAct_9fa48("51236") ? "" : (stryCov_9fa48("51236"), 'Partition ID'),
          value: operation.partition_id
        }), stryMutAct_9fa48("51237") ? {} : (stryCov_9fa48("51237"), {
          label: stryMutAct_9fa48("51238") ? "" : (stryCov_9fa48("51238"), 'Replica ID'),
          value: stryMutAct_9fa48("51241") ? operation.replica_id && 'N/A' : stryMutAct_9fa48("51240") ? false : stryMutAct_9fa48("51239") ? true : (stryCov_9fa48("51239", "51240", "51241"), operation.replica_id || (stryMutAct_9fa48("51242") ? "" : (stryCov_9fa48("51242"), 'N/A')))
        }), stryMutAct_9fa48("51243") ? {} : (stryCov_9fa48("51243"), {
          label: stryMutAct_9fa48("51244") ? "" : (stryCov_9fa48("51244"), 'Source Node'),
          value: operation.source_node_id
        }), stryMutAct_9fa48("51245") ? {} : (stryCov_9fa48("51245"), {
          label: stryMutAct_9fa48("51246") ? "" : (stryCov_9fa48("51246"), 'Target Node'),
          value: operation.target_node_id
        })])
      }), stryMutAct_9fa48("51247") ? {} : (stryCov_9fa48("51247"), {
        title: stryMutAct_9fa48("51248") ? "" : (stryCov_9fa48("51248"), 'Timestamps'),
        fields: stryMutAct_9fa48("51249") ? [] : (stryCov_9fa48("51249"), [stryMutAct_9fa48("51250") ? {} : (stryCov_9fa48("51250"), {
          label: stryMutAct_9fa48("51251") ? "" : (stryCov_9fa48("51251"), 'Created At'),
          value: this.formatTimestamp(operation.created_at)
        }), stryMutAct_9fa48("51252") ? {} : (stryCov_9fa48("51252"), {
          label: stryMutAct_9fa48("51253") ? "" : (stryCov_9fa48("51253"), 'Updated At'),
          value: this.formatTimestamp(operation.updated_at)
        }), stryMutAct_9fa48("51254") ? {} : (stryCov_9fa48("51254"), {
          label: stryMutAct_9fa48("51255") ? "" : (stryCov_9fa48("51255"), 'Completed At'),
          value: this.formatTimestamp(operation.completed_at)
        })])
      })]);

      // Add error section if there's an error
      if (stryMutAct_9fa48("51257") ? false : stryMutAct_9fa48("51256") ? true : (stryCov_9fa48("51256", "51257"), operation.error_message)) {
        if (stryMutAct_9fa48("51258")) {
          {}
        } else {
          stryCov_9fa48("51258");
          sections.push(stryMutAct_9fa48("51259") ? {} : (stryCov_9fa48("51259"), {
            title: stryMutAct_9fa48("51260") ? "" : (stryCov_9fa48("51260"), 'Error'),
            fields: stryMutAct_9fa48("51261") ? [] : (stryCov_9fa48("51261"), [stryMutAct_9fa48("51262") ? {} : (stryCov_9fa48("51262"), {
              label: stryMutAct_9fa48("51263") ? "" : (stryCov_9fa48("51263"), 'Error Message'),
              value: operation.error_message
            })])
          }));
        }
      }

      // Add workflow history section
      if (stryMutAct_9fa48("51267") ? stepsHistory.length <= 0 : stryMutAct_9fa48("51266") ? stepsHistory.length >= 0 : stryMutAct_9fa48("51265") ? false : stryMutAct_9fa48("51264") ? true : (stryCov_9fa48("51264", "51265", "51266", "51267"), stepsHistory.length > 0)) {
        if (stryMutAct_9fa48("51268")) {
          {}
        } else {
          stryCov_9fa48("51268");
          const historyFields = stepsHistory.map(stryMutAct_9fa48("51269") ? () => undefined : (stryCov_9fa48("51269"), (step, index) => stryMutAct_9fa48("51270") ? {} : (stryCov_9fa48("51270"), {
            label: stryMutAct_9fa48("51271") ? `` : (stryCov_9fa48("51271"), `Step ${stryMutAct_9fa48("51272") ? index - 1 : (stryCov_9fa48("51272"), index + 1)}`),
            value: stryMutAct_9fa48("51273") ? `` : (stryCov_9fa48("51273"), `${step.step} at ${this.formatTimestamp(step.timestamp)}`)
          })));
          sections.push(stryMutAct_9fa48("51274") ? {} : (stryCov_9fa48("51274"), {
            title: stryMutAct_9fa48("51275") ? "" : (stryCov_9fa48("51275"), 'Workflow History'),
            fields: historyFields
          }));
        }
      }

      // Build navigation links
      const navigationLinks = stryMutAct_9fa48("51276") ? [] : (stryCov_9fa48("51276"), [stryMutAct_9fa48("51277") ? {} : (stryCov_9fa48("51277"), {
        label: stryMutAct_9fa48("51278") ? "" : (stryCov_9fa48("51278"), 'View Partition'),
        target: stryMutAct_9fa48("51279") ? "" : (stryCov_9fa48("51279"), 'partitions'),
        key: stryMutAct_9fa48("51280") ? "" : (stryCov_9fa48("51280"), 'p')
      })]);
      return stryMutAct_9fa48("51281") ? {} : (stryCov_9fa48("51281"), {
        title: stryMutAct_9fa48("51282") ? `` : (stryCov_9fa48("51282"), `Operation: ${this.truncateId(operation.operation_id)}`),
        sections,
        relatedCounts: {},
        navigationLinks
      });
    }
  }

  /**
   * Get in-flight operations count
   * @return {number} Count of in-flight operations
   */
  getInFlightCount() {
    if (stryMutAct_9fa48("51283")) {
      {}
    } else {
      stryCov_9fa48("51283");
      return stryMutAct_9fa48("51284") ? this.data.length : (stryCov_9fa48("51284"), this.data.filter(stryMutAct_9fa48("51285") ? () => undefined : (stryCov_9fa48("51285"), op => this.isInProgress(op))).length);
    }
  }

  /**
   * Get completed operations count
   * @return {number} Count of completed operations
   */
  getCompletedCount() {
    if (stryMutAct_9fa48("51286")) {
      {}
    } else {
      stryCov_9fa48("51286");
      return stryMutAct_9fa48("51287") ? this.data.length : (stryCov_9fa48("51287"), this.data.filter(stryMutAct_9fa48("51288") ? () => undefined : (stryCov_9fa48("51288"), op => stryMutAct_9fa48("51291") ? op.status === OPERATION_STATUS.ACTIVE && op.status === OPERATION_STATUS.REMOVED : stryMutAct_9fa48("51290") ? false : stryMutAct_9fa48("51289") ? true : (stryCov_9fa48("51289", "51290", "51291"), (stryMutAct_9fa48("51293") ? op.status !== OPERATION_STATUS.ACTIVE : stryMutAct_9fa48("51292") ? false : (stryCov_9fa48("51292", "51293"), op.status === OPERATION_STATUS.ACTIVE)) || (stryMutAct_9fa48("51295") ? op.status !== OPERATION_STATUS.REMOVED : stryMutAct_9fa48("51294") ? false : (stryCov_9fa48("51294", "51295"), op.status === OPERATION_STATUS.REMOVED))))).length);
    }
  }

  /**
   * Get failed operations count
   * @return {number} Count of failed operations
   */
  getFailedCount() {
    if (stryMutAct_9fa48("51296")) {
      {}
    } else {
      stryCov_9fa48("51296");
      return stryMutAct_9fa48("51297") ? this.data.length : (stryCov_9fa48("51297"), this.data.filter(stryMutAct_9fa48("51298") ? () => undefined : (stryCov_9fa48("51298"), op => stryMutAct_9fa48("51301") ? op.status !== OPERATION_STATUS.FAILED : stryMutAct_9fa48("51300") ? false : stryMutAct_9fa48("51299") ? true : (stryCov_9fa48("51299", "51300", "51301"), op.status === OPERATION_STATUS.FAILED))).length);
    }
  }
}