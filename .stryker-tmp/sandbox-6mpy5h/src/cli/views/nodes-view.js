/**
 * NodesView - Displays cluster nodes with health metrics
 *
 * Columns: node_id, address, status, CPU%, memory%, disk%, services_count
 * Supports drill-down to replicas and warning highlighting.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
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
 * Warning thresholds for resource usage
 */
export const WARNING_THRESHOLDS = stryMutAct_9fa48("50791") ? {} : (stryCov_9fa48("50791"), {
  CPU_PERCENT: 80,
  MEMORY_PERCENT: 85,
  DISK_PERCENT: 80
});

/**
 * NodesView displays all nodes in the cluster with health metrics
 */
export class NodesView extends BaseView {
  /**
   * Creates a new NodesView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("50792")) {
      {}
    } else {
      stryCov_9fa48("50792");
      super(options);
      this.cache = stryMutAct_9fa48("50795") ? options.cache && null : stryMutAct_9fa48("50794") ? false : stryMutAct_9fa48("50793") ? true : (stryCov_9fa48("50793", "50794", "50795"), options.cache || null);
      this.viewName = stryMutAct_9fa48("50796") ? "" : (stryCov_9fa48("50796"), 'nodes');
    }
  }

  /**
   * Get column definitions for the nodes view
   * Requirements: 2.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("50797")) {
      {}
    } else {
      stryCov_9fa48("50797");
      return stryMutAct_9fa48("50798") ? [] : (stryCov_9fa48("50798"), [stryMutAct_9fa48("50799") ? {} : (stryCov_9fa48("50799"), {
        key: stryMutAct_9fa48("50800") ? "" : (stryCov_9fa48("50800"), 'node_id'),
        label: stryMutAct_9fa48("50801") ? "" : (stryCov_9fa48("50801"), 'Node ID'),
        width: 20
      }), stryMutAct_9fa48("50802") ? {} : (stryCov_9fa48("50802"), {
        key: stryMutAct_9fa48("50803") ? "" : (stryCov_9fa48("50803"), 'node_address'),
        label: stryMutAct_9fa48("50804") ? "" : (stryCov_9fa48("50804"), 'Address'),
        width: 20
      }), stryMutAct_9fa48("50805") ? {} : (stryCov_9fa48("50805"), {
        key: stryMutAct_9fa48("50806") ? "" : (stryCov_9fa48("50806"), 'status'),
        label: stryMutAct_9fa48("50807") ? "" : (stryCov_9fa48("50807"), 'Status'),
        width: 10
      }), stryMutAct_9fa48("50808") ? {} : (stryCov_9fa48("50808"), {
        key: stryMutAct_9fa48("50809") ? "" : (stryCov_9fa48("50809"), 'cpu_usage_percent'),
        label: stryMutAct_9fa48("50810") ? "" : (stryCov_9fa48("50810"), 'CPU%'),
        width: 8
      }), stryMutAct_9fa48("50811") ? {} : (stryCov_9fa48("50811"), {
        key: stryMutAct_9fa48("50812") ? "" : (stryCov_9fa48("50812"), 'memory_usage_percent'),
        label: stryMutAct_9fa48("50813") ? "" : (stryCov_9fa48("50813"), 'Mem%'),
        width: 8
      }), stryMutAct_9fa48("50814") ? {} : (stryCov_9fa48("50814"), {
        key: stryMutAct_9fa48("50815") ? "" : (stryCov_9fa48("50815"), 'disk_usage_percent'),
        label: stryMutAct_9fa48("50816") ? "" : (stryCov_9fa48("50816"), 'Disk%'),
        width: 8
      }), stryMutAct_9fa48("50817") ? {} : (stryCov_9fa48("50817"), {
        key: stryMutAct_9fa48("50818") ? "" : (stryCov_9fa48("50818"), 'services_count'),
        label: stryMutAct_9fa48("50819") ? "" : (stryCov_9fa48("50819"), 'Replicas'),
        width: 10
      })]);
    }
  }

  /**
   * Format a node record into a row array
   * Requirements: 2.1
   * @param {Object} node - Node record
   * @return {Array<string>} Row values
   */
  formatRow(node) {
    if (stryMutAct_9fa48("50820")) {
      {}
    } else {
      stryCov_9fa48("50820");
      return stryMutAct_9fa48("50821") ? [] : (stryCov_9fa48("50821"), [stryMutAct_9fa48("50824") ? node.node_id && 'N/A' : stryMutAct_9fa48("50823") ? false : stryMutAct_9fa48("50822") ? true : (stryCov_9fa48("50822", "50823", "50824"), node.node_id || (stryMutAct_9fa48("50825") ? "" : (stryCov_9fa48("50825"), 'N/A'))), stryMutAct_9fa48("50828") ? node.node_address && 'N/A' : stryMutAct_9fa48("50827") ? false : stryMutAct_9fa48("50826") ? true : (stryCov_9fa48("50826", "50827", "50828"), node.node_address || (stryMutAct_9fa48("50829") ? "" : (stryCov_9fa48("50829"), 'N/A'))), stryMutAct_9fa48("50832") ? node.status && 'unknown' : stryMutAct_9fa48("50831") ? false : stryMutAct_9fa48("50830") ? true : (stryCov_9fa48("50830", "50831", "50832"), node.status || (stryMutAct_9fa48("50833") ? "" : (stryCov_9fa48("50833"), 'unknown'))), this.formatPercent(node.cpu_usage_percent), this.formatPercent(node.memory_usage_percent), this.formatPercent(node.disk_usage_percent), String(stryMutAct_9fa48("50834") ? node.services_count && 0 : (stryCov_9fa48("50834"), node.services_count ?? 0))]);
    }
  }

  /**
   * Format a percentage value for display
   * @param {number|null|undefined} value - Percentage value
   * @return {string} Formatted percentage
   */
  formatPercent(value) {
    if (stryMutAct_9fa48("50835")) {
      {}
    } else {
      stryCov_9fa48("50835");
      if (stryMutAct_9fa48("50838") ? value === null && value === undefined : stryMutAct_9fa48("50837") ? false : stryMutAct_9fa48("50836") ? true : (stryCov_9fa48("50836", "50837", "50838"), (stryMutAct_9fa48("50840") ? value !== null : stryMutAct_9fa48("50839") ? false : (stryCov_9fa48("50839", "50840"), value === null)) || (stryMutAct_9fa48("50842") ? value !== undefined : stryMutAct_9fa48("50841") ? false : (stryCov_9fa48("50841", "50842"), value === undefined)))) {
        if (stryMutAct_9fa48("50843")) {
          {}
        } else {
          stryCov_9fa48("50843");
          return stryMutAct_9fa48("50844") ? "" : (stryCov_9fa48("50844"), 'N/A');
        }
      }
      return stryMutAct_9fa48("50845") ? `` : (stryCov_9fa48("50845"), `${Number(value).toFixed(1)}%`);
    }
  }

  /**
   * Get the row status for styling based on node health
   * Requirements: 2.4
   * @param {Object} node - Node record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(node) {
    if (stryMutAct_9fa48("50846")) {
      {}
    } else {
      stryCov_9fa48("50846");
      // Failed status is an error
      if (stryMutAct_9fa48("50849") ? node.status === 'failed' && node.status === 'error' : stryMutAct_9fa48("50848") ? false : stryMutAct_9fa48("50847") ? true : (stryCov_9fa48("50847", "50848", "50849"), (stryMutAct_9fa48("50851") ? node.status !== 'failed' : stryMutAct_9fa48("50850") ? false : (stryCov_9fa48("50850", "50851"), node.status === (stryMutAct_9fa48("50852") ? "" : (stryCov_9fa48("50852"), 'failed')))) || (stryMutAct_9fa48("50854") ? node.status !== 'error' : stryMutAct_9fa48("50853") ? false : (stryCov_9fa48("50853", "50854"), node.status === (stryMutAct_9fa48("50855") ? "" : (stryCov_9fa48("50855"), 'error')))))) {
        if (stryMutAct_9fa48("50856")) {
          {}
        } else {
          stryCov_9fa48("50856");
          return ROW_STATUS.ERROR;
        }
      }

      // Check for warning conditions (high resource usage)
      if (stryMutAct_9fa48("50858") ? false : stryMutAct_9fa48("50857") ? true : (stryCov_9fa48("50857", "50858"), this.hasWarningCondition(node))) {
        if (stryMutAct_9fa48("50859")) {
          {}
        } else {
          stryCov_9fa48("50859");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Check if a node has any warning conditions
   * @param {Object} node - Node record
   * @return {boolean} True if node has warning conditions
   */
  hasWarningCondition(node) {
    if (stryMutAct_9fa48("50860")) {
      {}
    } else {
      stryCov_9fa48("50860");
      const cpuUsage = node.cpu_usage_percent;
      const memUsage = node.memory_usage_percent;
      const diskUsage = node.disk_usage_percent;
      if (stryMutAct_9fa48("50863") ? cpuUsage !== null && cpuUsage !== undefined || cpuUsage > WARNING_THRESHOLDS.CPU_PERCENT : stryMutAct_9fa48("50862") ? false : stryMutAct_9fa48("50861") ? true : (stryCov_9fa48("50861", "50862", "50863"), (stryMutAct_9fa48("50865") ? cpuUsage !== null || cpuUsage !== undefined : stryMutAct_9fa48("50864") ? true : (stryCov_9fa48("50864", "50865"), (stryMutAct_9fa48("50867") ? cpuUsage === null : stryMutAct_9fa48("50866") ? true : (stryCov_9fa48("50866", "50867"), cpuUsage !== null)) && (stryMutAct_9fa48("50869") ? cpuUsage === undefined : stryMutAct_9fa48("50868") ? true : (stryCov_9fa48("50868", "50869"), cpuUsage !== undefined)))) && (stryMutAct_9fa48("50872") ? cpuUsage <= WARNING_THRESHOLDS.CPU_PERCENT : stryMutAct_9fa48("50871") ? cpuUsage >= WARNING_THRESHOLDS.CPU_PERCENT : stryMutAct_9fa48("50870") ? true : (stryCov_9fa48("50870", "50871", "50872"), cpuUsage > WARNING_THRESHOLDS.CPU_PERCENT)))) {
        if (stryMutAct_9fa48("50873")) {
          {}
        } else {
          stryCov_9fa48("50873");
          return stryMutAct_9fa48("50874") ? false : (stryCov_9fa48("50874"), true);
        }
      }
      if (stryMutAct_9fa48("50877") ? memUsage !== null && memUsage !== undefined || memUsage > WARNING_THRESHOLDS.MEMORY_PERCENT : stryMutAct_9fa48("50876") ? false : stryMutAct_9fa48("50875") ? true : (stryCov_9fa48("50875", "50876", "50877"), (stryMutAct_9fa48("50879") ? memUsage !== null || memUsage !== undefined : stryMutAct_9fa48("50878") ? true : (stryCov_9fa48("50878", "50879"), (stryMutAct_9fa48("50881") ? memUsage === null : stryMutAct_9fa48("50880") ? true : (stryCov_9fa48("50880", "50881"), memUsage !== null)) && (stryMutAct_9fa48("50883") ? memUsage === undefined : stryMutAct_9fa48("50882") ? true : (stryCov_9fa48("50882", "50883"), memUsage !== undefined)))) && (stryMutAct_9fa48("50886") ? memUsage <= WARNING_THRESHOLDS.MEMORY_PERCENT : stryMutAct_9fa48("50885") ? memUsage >= WARNING_THRESHOLDS.MEMORY_PERCENT : stryMutAct_9fa48("50884") ? true : (stryCov_9fa48("50884", "50885", "50886"), memUsage > WARNING_THRESHOLDS.MEMORY_PERCENT)))) {
        if (stryMutAct_9fa48("50887")) {
          {}
        } else {
          stryCov_9fa48("50887");
          return stryMutAct_9fa48("50888") ? false : (stryCov_9fa48("50888"), true);
        }
      }
      if (stryMutAct_9fa48("50891") ? diskUsage !== null && diskUsage !== undefined || diskUsage > WARNING_THRESHOLDS.DISK_PERCENT : stryMutAct_9fa48("50890") ? false : stryMutAct_9fa48("50889") ? true : (stryCov_9fa48("50889", "50890", "50891"), (stryMutAct_9fa48("50893") ? diskUsage !== null || diskUsage !== undefined : stryMutAct_9fa48("50892") ? true : (stryCov_9fa48("50892", "50893"), (stryMutAct_9fa48("50895") ? diskUsage === null : stryMutAct_9fa48("50894") ? true : (stryCov_9fa48("50894", "50895"), diskUsage !== null)) && (stryMutAct_9fa48("50897") ? diskUsage === undefined : stryMutAct_9fa48("50896") ? true : (stryCov_9fa48("50896", "50897"), diskUsage !== undefined)))) && (stryMutAct_9fa48("50900") ? diskUsage <= WARNING_THRESHOLDS.DISK_PERCENT : stryMutAct_9fa48("50899") ? diskUsage >= WARNING_THRESHOLDS.DISK_PERCENT : stryMutAct_9fa48("50898") ? true : (stryCov_9fa48("50898", "50899", "50900"), diskUsage > WARNING_THRESHOLDS.DISK_PERCENT)))) {
        if (stryMutAct_9fa48("50901")) {
          {}
        } else {
          stryCov_9fa48("50901");
          return stryMutAct_9fa48("50902") ? false : (stryCov_9fa48("50902"), true);
        }
      }
      return stryMutAct_9fa48("50903") ? true : (stryCov_9fa48("50903"), false);
    }
  }

  /**
   * Get the unique key for a node
   * @param {Object} node - Node record
   * @return {string} Unique key (node_id)
   */
  getItemKey(node) {
    if (stryMutAct_9fa48("50904")) {
      {}
    } else {
      stryCov_9fa48("50904");
      return stryMutAct_9fa48("50907") ? node.node_id && '' : stryMutAct_9fa48("50906") ? false : stryMutAct_9fa48("50905") ? true : (stryCov_9fa48("50905", "50906", "50907"), node.node_id || (stryMutAct_9fa48("50908") ? "Stryker was here!" : (stryCov_9fa48("50908"), '')));
    }
  }

  /**
   * Handle drill-down action (Enter key on selected node)
   * Requirements: 2.3
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("50909")) {
      {}
    } else {
      stryCov_9fa48("50909");
      const selectedNode = this.getSelectedItem();
      if (stryMutAct_9fa48("50912") ? false : stryMutAct_9fa48("50911") ? true : stryMutAct_9fa48("50910") ? selectedNode : (stryCov_9fa48("50910", "50911", "50912"), !selectedNode)) {
        if (stryMutAct_9fa48("50913")) {
          {}
        } else {
          stryCov_9fa48("50913");
          return null;
        }
      }
      return stryMutAct_9fa48("50914") ? {} : (stryCov_9fa48("50914"), {
        action: stryMutAct_9fa48("50915") ? "" : (stryCov_9fa48("50915"), 'drillDown'),
        view: stryMutAct_9fa48("50916") ? "" : (stryCov_9fa48("50916"), 'replicas'),
        context: stryMutAct_9fa48("50917") ? {} : (stryCov_9fa48("50917"), {
          nodeId: selectedNode.node_id
        })
      });
    }
  }

  /**
   * Handle key input for the nodes view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (stryMutAct_9fa48("50918")) {
      {}
    } else {
      stryCov_9fa48("50918");
      if (stryMutAct_9fa48("50921") ? key.name === 'enter' && key.name === 'return' : stryMutAct_9fa48("50920") ? false : stryMutAct_9fa48("50919") ? true : (stryCov_9fa48("50919", "50920", "50921"), (stryMutAct_9fa48("50923") ? key.name !== 'enter' : stryMutAct_9fa48("50922") ? false : (stryCov_9fa48("50922", "50923"), key.name === (stryMutAct_9fa48("50924") ? "" : (stryCov_9fa48("50924"), 'enter')))) || (stryMutAct_9fa48("50926") ? key.name !== 'return' : stryMutAct_9fa48("50925") ? false : (stryCov_9fa48("50925", "50926"), key.name === (stryMutAct_9fa48("50927") ? "" : (stryCov_9fa48("50927"), 'return')))))) {
        if (stryMutAct_9fa48("50928")) {
          {}
        } else {
          stryCov_9fa48("50928");
          return this.handleDrillDown();
        }
      }
      return super.handleKey(key);
    }
  }

  /**
   * Get detail information for the selected node
   * Requirements: 16.5
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("50929")) {
      {}
    } else {
      stryCov_9fa48("50929");
      const node = this.getSelectedItem();
      if (stryMutAct_9fa48("50932") ? false : stryMutAct_9fa48("50931") ? true : stryMutAct_9fa48("50930") ? node : (stryCov_9fa48("50930", "50931", "50932"), !node)) {
        if (stryMutAct_9fa48("50933")) {
          {}
        } else {
          stryCov_9fa48("50933");
          return null;
        }
      }
      const sections = stryMutAct_9fa48("50934") ? [] : (stryCov_9fa48("50934"), [stryMutAct_9fa48("50935") ? {} : (stryCov_9fa48("50935"), {
        title: stryMutAct_9fa48("50936") ? "" : (stryCov_9fa48("50936"), 'Basic Information'),
        fields: stryMutAct_9fa48("50937") ? [] : (stryCov_9fa48("50937"), [stryMutAct_9fa48("50938") ? {} : (stryCov_9fa48("50938"), {
          label: stryMutAct_9fa48("50939") ? "" : (stryCov_9fa48("50939"), 'Node ID'),
          value: node.node_id
        }), stryMutAct_9fa48("50940") ? {} : (stryCov_9fa48("50940"), {
          label: stryMutAct_9fa48("50941") ? "" : (stryCov_9fa48("50941"), 'Address'),
          value: node.node_address
        }), stryMutAct_9fa48("50942") ? {} : (stryCov_9fa48("50942"), {
          label: stryMutAct_9fa48("50943") ? "" : (stryCov_9fa48("50943"), 'Status'),
          value: node.status
        }), stryMutAct_9fa48("50944") ? {} : (stryCov_9fa48("50944"), {
          label: stryMutAct_9fa48("50945") ? "" : (stryCov_9fa48("50945"), 'Version'),
          value: stryMutAct_9fa48("50948") ? node.version && 'N/A' : stryMutAct_9fa48("50947") ? false : stryMutAct_9fa48("50946") ? true : (stryCov_9fa48("50946", "50947", "50948"), node.version || (stryMutAct_9fa48("50949") ? "" : (stryCov_9fa48("50949"), 'N/A')))
        }), stryMutAct_9fa48("50950") ? {} : (stryCov_9fa48("50950"), {
          label: stryMutAct_9fa48("50951") ? "" : (stryCov_9fa48("50951"), 'Uptime'),
          value: this.formatUptime(node.uptime_seconds)
        })])
      }), stryMutAct_9fa48("50952") ? {} : (stryCov_9fa48("50952"), {
        title: stryMutAct_9fa48("50953") ? "" : (stryCov_9fa48("50953"), 'Resource Statistics'),
        fields: stryMutAct_9fa48("50954") ? [] : (stryCov_9fa48("50954"), [stryMutAct_9fa48("50955") ? {} : (stryCov_9fa48("50955"), {
          label: stryMutAct_9fa48("50956") ? "" : (stryCov_9fa48("50956"), 'CPU Usage'),
          value: this.formatPercent(node.cpu_usage_percent)
        }), stryMutAct_9fa48("50957") ? {} : (stryCov_9fa48("50957"), {
          label: stryMutAct_9fa48("50958") ? "" : (stryCov_9fa48("50958"), 'Memory Usage'),
          value: this.formatPercent(node.memory_usage_percent)
        }), stryMutAct_9fa48("50959") ? {} : (stryCov_9fa48("50959"), {
          label: stryMutAct_9fa48("50960") ? "" : (stryCov_9fa48("50960"), 'Memory Total'),
          value: this.formatBytes(node.memory_total_bytes)
        }), stryMutAct_9fa48("50961") ? {} : (stryCov_9fa48("50961"), {
          label: stryMutAct_9fa48("50962") ? "" : (stryCov_9fa48("50962"), 'Memory Used'),
          value: this.formatBytes(node.memory_used_bytes)
        }), stryMutAct_9fa48("50963") ? {} : (stryCov_9fa48("50963"), {
          label: stryMutAct_9fa48("50964") ? "" : (stryCov_9fa48("50964"), 'Disk Usage'),
          value: this.formatPercent(node.disk_usage_percent)
        }), stryMutAct_9fa48("50965") ? {} : (stryCov_9fa48("50965"), {
          label: stryMutAct_9fa48("50966") ? "" : (stryCov_9fa48("50966"), 'Disk Total'),
          value: this.formatBytes(node.disk_total_bytes)
        }), stryMutAct_9fa48("50967") ? {} : (stryCov_9fa48("50967"), {
          label: stryMutAct_9fa48("50968") ? "" : (stryCov_9fa48("50968"), 'Disk Used'),
          value: this.formatBytes(node.disk_used_bytes)
        })])
      }), stryMutAct_9fa48("50969") ? {} : (stryCov_9fa48("50969"), {
        title: stryMutAct_9fa48("50970") ? "" : (stryCov_9fa48("50970"), 'Replicas'),
        fields: stryMutAct_9fa48("50971") ? [] : (stryCov_9fa48("50971"), [stryMutAct_9fa48("50972") ? {} : (stryCov_9fa48("50972"), {
          label: stryMutAct_9fa48("50973") ? "" : (stryCov_9fa48("50973"), 'Total Replicas'),
          value: String(stryMutAct_9fa48("50974") ? node.services_count && 0 : (stryCov_9fa48("50974"), node.services_count ?? 0))
        }), stryMutAct_9fa48("50975") ? {} : (stryCov_9fa48("50975"), {
          label: stryMutAct_9fa48("50976") ? "" : (stryCov_9fa48("50976"), 'Partition Replicas'),
          value: String(stryMutAct_9fa48("50977") ? node.partition_services_count && 'N/A' : (stryCov_9fa48("50977"), node.partition_services_count ?? (stryMutAct_9fa48("50978") ? "" : (stryCov_9fa48("50978"), 'N/A'))))
        }), stryMutAct_9fa48("50979") ? {} : (stryCov_9fa48("50979"), {
          label: stryMutAct_9fa48("50980") ? "" : (stryCov_9fa48("50980"), 'Message Group Replicas'),
          value: String(stryMutAct_9fa48("50981") ? node.mg_services_count && 'N/A' : (stryCov_9fa48("50981"), node.mg_services_count ?? (stryMutAct_9fa48("50982") ? "" : (stryCov_9fa48("50982"), 'N/A'))))
        })])
      })]);

      // Add configuration section if available
      if (stryMutAct_9fa48("50985") ? node.config || typeof node.config === 'object' : stryMutAct_9fa48("50984") ? false : stryMutAct_9fa48("50983") ? true : (stryCov_9fa48("50983", "50984", "50985"), node.config && (stryMutAct_9fa48("50987") ? typeof node.config !== 'object' : stryMutAct_9fa48("50986") ? true : (stryCov_9fa48("50986", "50987"), typeof node.config === (stryMutAct_9fa48("50988") ? "" : (stryCov_9fa48("50988"), 'object')))))) {
        if (stryMutAct_9fa48("50989")) {
          {}
        } else {
          stryCov_9fa48("50989");
          const configFields = stryMutAct_9fa48("50990") ? Object.entries(node.config).map(([k, v]) => ({
            label: k,
            value: typeof v === 'object' ? JSON.stringify(v) : String(v)
          })) : (stryCov_9fa48("50990"), Object.entries(node.config).slice(0, 10).map(stryMutAct_9fa48("50991") ? () => undefined : (stryCov_9fa48("50991"), ([k, v]) => stryMutAct_9fa48("50992") ? {} : (stryCov_9fa48("50992"), {
            label: k,
            value: (stryMutAct_9fa48("50995") ? typeof v !== 'object' : stryMutAct_9fa48("50994") ? false : stryMutAct_9fa48("50993") ? true : (stryCov_9fa48("50993", "50994", "50995"), typeof v === (stryMutAct_9fa48("50996") ? "" : (stryCov_9fa48("50996"), 'object')))) ? JSON.stringify(v) : String(v)
          }))));
          if (stryMutAct_9fa48("51000") ? configFields.length <= 0 : stryMutAct_9fa48("50999") ? configFields.length >= 0 : stryMutAct_9fa48("50998") ? false : stryMutAct_9fa48("50997") ? true : (stryCov_9fa48("50997", "50998", "50999", "51000"), configFields.length > 0)) {
            if (stryMutAct_9fa48("51001")) {
              {}
            } else {
              stryCov_9fa48("51001");
              sections.push(stryMutAct_9fa48("51002") ? {} : (stryCov_9fa48("51002"), {
                title: stryMutAct_9fa48("51003") ? "" : (stryCov_9fa48("51003"), 'Configuration'),
                fields: configFields
              }));
            }
          }
        }
      }

      // Add network info if available
      if (stryMutAct_9fa48("51005") ? false : stryMutAct_9fa48("51004") ? true : (stryCov_9fa48("51004", "51005"), node.network_info)) {
        if (stryMutAct_9fa48("51006")) {
          {}
        } else {
          stryCov_9fa48("51006");
          sections.push(stryMutAct_9fa48("51007") ? {} : (stryCov_9fa48("51007"), {
            title: stryMutAct_9fa48("51008") ? "" : (stryCov_9fa48("51008"), 'Network'),
            fields: stryMutAct_9fa48("51009") ? [] : (stryCov_9fa48("51009"), [stryMutAct_9fa48("51010") ? {} : (stryCov_9fa48("51010"), {
              label: stryMutAct_9fa48("51011") ? "" : (stryCov_9fa48("51011"), 'Connections'),
              value: String(stryMutAct_9fa48("51012") ? node.network_info.connections && 'N/A' : (stryCov_9fa48("51012"), node.network_info.connections ?? (stryMutAct_9fa48("51013") ? "" : (stryCov_9fa48("51013"), 'N/A'))))
            }), stryMutAct_9fa48("51014") ? {} : (stryCov_9fa48("51014"), {
              label: stryMutAct_9fa48("51015") ? "" : (stryCov_9fa48("51015"), 'Bytes In'),
              value: this.formatBytes(node.network_info.bytes_in)
            }), stryMutAct_9fa48("51016") ? {} : (stryCov_9fa48("51016"), {
              label: stryMutAct_9fa48("51017") ? "" : (stryCov_9fa48("51017"), 'Bytes Out'),
              value: this.formatBytes(node.network_info.bytes_out)
            })])
          }));
        }
      }

      // Build related counts
      const relatedCounts = stryMutAct_9fa48("51018") ? {} : (stryCov_9fa48("51018"), {
        Replicas: stryMutAct_9fa48("51019") ? node.services_count && 0 : (stryCov_9fa48("51019"), node.services_count ?? 0)
      });

      // Build navigation links
      const navigationLinks = stryMutAct_9fa48("51020") ? [] : (stryCov_9fa48("51020"), [stryMutAct_9fa48("51021") ? {} : (stryCov_9fa48("51021"), {
        label: stryMutAct_9fa48("51022") ? "" : (stryCov_9fa48("51022"), 'View Replicas'),
        target: stryMutAct_9fa48("51023") ? "" : (stryCov_9fa48("51023"), 'replicas'),
        key: stryMutAct_9fa48("51024") ? "" : (stryCov_9fa48("51024"), 'r')
      })]);
      return stryMutAct_9fa48("51025") ? {} : (stryCov_9fa48("51025"), {
        title: stryMutAct_9fa48("51026") ? `` : (stryCov_9fa48("51026"), `Node: ${node.node_id}`),
        sections,
        relatedCounts,
        navigationLinks
      });
    }
  }

  /**
   * Format uptime in human-readable format
   * @param {number|null|undefined} seconds - Uptime in seconds
   * @return {string} Formatted uptime
   */
  formatUptime(seconds) {
    if (stryMutAct_9fa48("51027")) {
      {}
    } else {
      stryCov_9fa48("51027");
      if (stryMutAct_9fa48("51030") ? seconds === null && seconds === undefined : stryMutAct_9fa48("51029") ? false : stryMutAct_9fa48("51028") ? true : (stryCov_9fa48("51028", "51029", "51030"), (stryMutAct_9fa48("51032") ? seconds !== null : stryMutAct_9fa48("51031") ? false : (stryCov_9fa48("51031", "51032"), seconds === null)) || (stryMutAct_9fa48("51034") ? seconds !== undefined : stryMutAct_9fa48("51033") ? false : (stryCov_9fa48("51033", "51034"), seconds === undefined)))) {
        if (stryMutAct_9fa48("51035")) {
          {}
        } else {
          stryCov_9fa48("51035");
          return stryMutAct_9fa48("51036") ? "" : (stryCov_9fa48("51036"), 'N/A');
        }
      }
      const days = Math.floor(stryMutAct_9fa48("51037") ? seconds * 86400 : (stryCov_9fa48("51037"), seconds / 86400));
      const hours = Math.floor(stryMutAct_9fa48("51038") ? seconds % 86400 * 3600 : (stryCov_9fa48("51038"), (stryMutAct_9fa48("51039") ? seconds * 86400 : (stryCov_9fa48("51039"), seconds % 86400)) / 3600));
      const minutes = Math.floor(stryMutAct_9fa48("51040") ? seconds % 3600 * 60 : (stryCov_9fa48("51040"), (stryMutAct_9fa48("51041") ? seconds * 3600 : (stryCov_9fa48("51041"), seconds % 3600)) / 60));
      const parts = stryMutAct_9fa48("51042") ? ["Stryker was here"] : (stryCov_9fa48("51042"), []);
      if (stryMutAct_9fa48("51046") ? days <= 0 : stryMutAct_9fa48("51045") ? days >= 0 : stryMutAct_9fa48("51044") ? false : stryMutAct_9fa48("51043") ? true : (stryCov_9fa48("51043", "51044", "51045", "51046"), days > 0)) parts.push(stryMutAct_9fa48("51047") ? `` : (stryCov_9fa48("51047"), `${days}d`));
      if (stryMutAct_9fa48("51051") ? hours <= 0 : stryMutAct_9fa48("51050") ? hours >= 0 : stryMutAct_9fa48("51049") ? false : stryMutAct_9fa48("51048") ? true : (stryCov_9fa48("51048", "51049", "51050", "51051"), hours > 0)) parts.push(stryMutAct_9fa48("51052") ? `` : (stryCov_9fa48("51052"), `${hours}h`));
      if (stryMutAct_9fa48("51055") ? minutes > 0 && parts.length === 0 : stryMutAct_9fa48("51054") ? false : stryMutAct_9fa48("51053") ? true : (stryCov_9fa48("51053", "51054", "51055"), (stryMutAct_9fa48("51058") ? minutes <= 0 : stryMutAct_9fa48("51057") ? minutes >= 0 : stryMutAct_9fa48("51056") ? false : (stryCov_9fa48("51056", "51057", "51058"), minutes > 0)) || (stryMutAct_9fa48("51060") ? parts.length !== 0 : stryMutAct_9fa48("51059") ? false : (stryCov_9fa48("51059", "51060"), parts.length === 0)))) parts.push(stryMutAct_9fa48("51061") ? `` : (stryCov_9fa48("51061"), `${minutes}m`));
      return parts.join(stryMutAct_9fa48("51062") ? "" : (stryCov_9fa48("51062"), ' '));
    }
  }

  /**
   * Format bytes in human-readable format
   * @param {number|null|undefined} bytes - Bytes value
   * @return {string} Formatted bytes
   */
  formatBytes(bytes) {
    if (stryMutAct_9fa48("51063")) {
      {}
    } else {
      stryCov_9fa48("51063");
      if (stryMutAct_9fa48("51066") ? bytes === null && bytes === undefined : stryMutAct_9fa48("51065") ? false : stryMutAct_9fa48("51064") ? true : (stryCov_9fa48("51064", "51065", "51066"), (stryMutAct_9fa48("51068") ? bytes !== null : stryMutAct_9fa48("51067") ? false : (stryCov_9fa48("51067", "51068"), bytes === null)) || (stryMutAct_9fa48("51070") ? bytes !== undefined : stryMutAct_9fa48("51069") ? false : (stryCov_9fa48("51069", "51070"), bytes === undefined)))) {
        if (stryMutAct_9fa48("51071")) {
          {}
        } else {
          stryCov_9fa48("51071");
          return stryMutAct_9fa48("51072") ? "" : (stryCov_9fa48("51072"), 'N/A');
        }
      }
      if (stryMutAct_9fa48("51075") ? bytes !== 0 : stryMutAct_9fa48("51074") ? false : stryMutAct_9fa48("51073") ? true : (stryCov_9fa48("51073", "51074", "51075"), bytes === 0)) {
        if (stryMutAct_9fa48("51076")) {
          {}
        } else {
          stryCov_9fa48("51076");
          return stryMutAct_9fa48("51077") ? "" : (stryCov_9fa48("51077"), '0 B');
        }
      }
      const units = stryMutAct_9fa48("51078") ? [] : (stryCov_9fa48("51078"), [stryMutAct_9fa48("51079") ? "" : (stryCov_9fa48("51079"), 'B'), stryMutAct_9fa48("51080") ? "" : (stryCov_9fa48("51080"), 'KB'), stryMutAct_9fa48("51081") ? "" : (stryCov_9fa48("51081"), 'MB'), stryMutAct_9fa48("51082") ? "" : (stryCov_9fa48("51082"), 'GB'), stryMutAct_9fa48("51083") ? "" : (stryCov_9fa48("51083"), 'TB')]);
      const i = Math.floor(stryMutAct_9fa48("51084") ? Math.log(bytes) * Math.log(1024) : (stryCov_9fa48("51084"), Math.log(bytes) / Math.log(1024)));
      const value = stryMutAct_9fa48("51085") ? bytes * Math.pow(1024, i) : (stryCov_9fa48("51085"), bytes / Math.pow(1024, i));
      return stryMutAct_9fa48("51086") ? `` : (stryCov_9fa48("51086"), `${value.toFixed(1)} ${units[i]}`);
    }
  }
}