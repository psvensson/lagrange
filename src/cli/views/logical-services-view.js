/**
 * LogicalServicesView - Displays logical service definitions grouped by service ID.
 *
 * Shows desired replica count vs observed runtime replicas and health state.
 * Drill-down opens the replicas view filtered to the selected logical service.
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

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
    this.viewName = 'services';
    this.nodeFilter = null;
    this.serviceIdFilter = null;
  }

  /**
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'service_name', label: 'Name', width: 20},
      {key: 'service_id', label: 'Service ID', width: 24},
      {key: 'runtime_kind', label: 'Runtime', width: 14},
      {key: 'desired', label: 'Desired', width: 8},
      {key: 'replicas', label: 'Replicas', width: 9},
      {key: 'healthy', label: 'Healthy', width: 8},
      {key: 'nodes', label: 'Nodes', width: 24},
      {key: 'status', label: 'Status', width: 10},
    ];
  }

  /**
   * @param {Object} logicalService
   * @return {Array<string>}
   */
  formatRow(logicalService) {
    return [
      logicalService.service_name || logicalService.service_id || 'N/A',
      logicalService.service_id || 'N/A',
      logicalService.runtime_kind || 'N/A',
      String(logicalService.replica_count ?? 0),
      String(logicalService.replica_count_observed ?? 0),
      String(logicalService.healthy_replica_count ?? 0),
      logicalService.nodes_summary || 'N/A',
      logicalService.status || LOGICAL_SERVICE_STATE.UNKNOWN,
    ];
  }

  /**
   * @param {Object} logicalService
   * @return {string}
   */
  getItemKey(logicalService) {
    return logicalService.service_id || '';
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
      action: 'drillDown',
      view: 'replicas',
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
      title: `Service: ${logicalService.service_id || 'N/A'}`,
      sections,
      navigationLinks: [
        {label: 'View Replicas', target: 'replicas', key: 'r'},
      ],
    };
  }
}

export {LogicalServicesView, LOGICAL_SERVICE_STATE};
