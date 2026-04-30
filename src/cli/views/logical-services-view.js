/**
 * LogicalServicesView - Displays logical service definitions grouped by service ID.
 *
 * Shows desired replica count vs observed runtime replicas and health state.
 * Drill-down opens the replicas view filtered to the selected logical service.
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

const LOCAL_STR_SERVICES = 'services';
const LOCAL_STR_SERVICE_NAME = 'service_name';
const LOCAL_STR_NAME = 'Name';
const LOCAL_NUM_20 = 20;
const LOCAL_STR_SERVICE_ID = 'service_id';
const LOCAL_STR_SERVICE_ID_2 = 'Service ID';
const LOCAL_NUM_24 = 24;
const LOCAL_STR_RUNTIME_KIND = 'runtime_kind';
const LOCAL_STR_RUNTIME = 'Runtime';
const LOCAL_NUM_14 = 14;
const LOCAL_STR_DESIRED = 'desired';
const LOCAL_STR_DESIRED_2 = 'Desired';
const LOCAL_NUM_EIGHT = 8;
const LOCAL_STR_REPLICAS = 'replicas';
const LOCAL_STR_REPLICAS_2 = 'Replicas';
const LOCAL_NUM_NINE = 9;
const LOCAL_STR_HEALTHY = 'healthy';
const LOCAL_STR_HEALTHY_2 = 'Healthy';
const LOCAL_STR_NODES = 'nodes';
const LOCAL_STR_NODES_2 = 'Nodes';
const LOCAL_STR_STATUS = 'status';
const LOCAL_STR_STATUS_2 = 'Status';
const LOCAL_NUM_10 = 10;
const LOCAL_STR_N_A = 'N/A';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_DRILLDOWN = 'drillDown';
const LOCAL_STR_VIEW_REPLICAS = 'View Replicas';
const LOCAL_STR_R = 'r';

const LOGICAL_SERVICE_STATE = Object.freeze({
  HEALTHY: 'healthy',
  PARTIAL: 'partial',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown',
});

/**
 * Logical services inventory view.
 */
class LogicalServicesView extends BaseView {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
    this.viewName = LOCAL_STR_SERVICES;
    this.nodeFilter = null;
    this.serviceIdFilter = null;
  }

  /**
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: LOCAL_STR_SERVICE_NAME, label: LOCAL_STR_NAME, width: LOCAL_NUM_20},
      {key: LOCAL_STR_SERVICE_ID, label: LOCAL_STR_SERVICE_ID_2, width: LOCAL_NUM_24},
      {key: LOCAL_STR_RUNTIME_KIND, label: LOCAL_STR_RUNTIME, width: LOCAL_NUM_14},
      {key: LOCAL_STR_DESIRED, label: LOCAL_STR_DESIRED_2, width: LOCAL_NUM_EIGHT},
      {key: LOCAL_STR_REPLICAS, label: LOCAL_STR_REPLICAS_2, width: LOCAL_NUM_NINE},
      {key: LOCAL_STR_HEALTHY, label: LOCAL_STR_HEALTHY_2, width: LOCAL_NUM_EIGHT},
      {key: LOCAL_STR_NODES, label: LOCAL_STR_NODES_2, width: LOCAL_NUM_24},
      {key: LOCAL_STR_STATUS, label: LOCAL_STR_STATUS_2, width: LOCAL_NUM_10},
    ];
  }

  /**
   * @param {Object} logicalService
   * @return {Array<string>}
   */
  formatRow(logicalService) {
    return [
      logicalService.service_name || logicalService.service_id || LOCAL_STR_N_A,
      logicalService.service_id || LOCAL_STR_N_A,
      logicalService.runtime_kind || LOCAL_STR_N_A,
      String(logicalService.replica_count ?? LOCAL_NUM_ZERO),
      String(logicalService.replica_count_observed ?? LOCAL_NUM_ZERO),
      String(logicalService.healthy_replica_count ?? LOCAL_NUM_ZERO),
      logicalService.nodes_summary || LOCAL_STR_N_A,
      logicalService.status || LOGICAL_SERVICE_STATE.UNKNOWN,
    ];
  }

  /**
   * @param {Object} logicalService
   * @return {string}
   */
  getItemKey(logicalService) {
    return logicalService.service_id || LOCAL_STR_EMPTY;
  }

  /**
   * @param {Object} logicalService
   * @return {string}
   */
  getRowStatus(logicalService) {
    const status = logicalService.status || LOGICAL_SERVICE_STATE.UNKNOWN;
    if (status === LOGICAL_SERVICE_STATE.DEGRADED) {
      return ROW_STATUS.ERROR;
    }
    if (status === LOGICAL_SERVICE_STATE.PARTIAL ||
      status === LOGICAL_SERVICE_STATE.UNKNOWN) {
      return ROW_STATUS.WARNING;
    }
    return ROW_STATUS.NORMAL;
  }

  /**
   * @param {string|null} nodeId
   */
  setNodeFilter(nodeId) {
    this.nodeFilter = nodeId || null;
    this.updateFilteredData();
  }

  /**
   * @param {string|null} serviceId
   */
  setServiceIdFilter(serviceId) {
    this.serviceIdFilter = serviceId || null;
    this.updateFilteredData();
  }

  /**
   * @param {Array<Object>} data
   * @return {Array<Object>}
   */
  applyFilter(data) {
    let filtered = data;

    if (this.nodeFilter) {
      filtered = filtered.filter((entry) => {
        const nodes = Array.isArray(entry.nodes) ? entry.nodes : [];
        return nodes.includes(this.nodeFilter);
      });
    }

    if (this.serviceIdFilter) {
      filtered = filtered.filter((entry) => {
        return entry.service_id === this.serviceIdFilter;
      });
    }

    return super.applyFilter(filtered);
  }

  /**
   * @return {Object|null}
   */
  handleDrillDown() {
    const logicalService = this.getSelectedItem();
    if (!logicalService || !logicalService.service_id) {
      return null;
    }

    return {
      action: LOCAL_STR_DRILLDOWN,
      view: LOCAL_STR_REPLICAS,
      context: {serviceId: logicalService.service_id},
    };
  }

  /**
   * @return {Object|null}
   */
  getSelectedDetails() {
    const logicalService = this.getSelectedItem();
    if (!logicalService) {
      return null;
    }

    const nodes = Array.isArray(logicalService.nodes) ?
      logicalService.nodes :
      [];

    const sections = [
      {
        title: 'Service Definition',
        fields: [
          {label: 'Service ID', value: logicalService.service_id || 'N/A'},
          {label: 'Service Name', value: logicalService.service_name || 'N/A'},
          {label: 'Type', value: logicalService.service_type || 'runtime_service'},
          {label: 'Runtime Kind', value: logicalService.runtime_kind || 'N/A'},
          {label: 'Runtime Ref', value: logicalService.runtime_ref || 'N/A'},
          {label: 'Desired Replicas', value: String(logicalService.replica_count ?? 0)},
        ],
      },
      {
        title: 'Replica Inventory',
        fields: [
          {label: 'Observed Replicas', value: String(logicalService.replica_count_observed ?? 0)},
          {label: 'Healthy Replicas', value: String(logicalService.healthy_replica_count ?? 0)},
          {label: 'Nodes', value: logicalService.nodes_summary || 'N/A'},
          {label: 'Node Count', value: String(logicalService.node_count ?? nodes.length)},
          {label: 'Status', value: logicalService.status || LOGICAL_SERVICE_STATE.UNKNOWN},
        ],
      },
    ];

    return {
      title: `Service: ${logicalService.service_id || LOCAL_STR_N_A}`,
      sections,
      navigationLinks: [
        {label: LOCAL_STR_VIEW_REPLICAS, target: LOCAL_STR_REPLICAS, key: LOCAL_STR_R},
      ],
    };
  }
}

export {LogicalServicesView, LOGICAL_SERVICE_STATE};
