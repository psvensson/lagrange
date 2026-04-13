/**
 * LogicalServicesView - Displays logical service definitions grouped by service ID.
 *
 * Shows desired replica count vs observed runtime replicas and health state.
 * Drill-down opens the replicas view filtered to the selected logical service.
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
const LOGICAL_SERVICE_STATE = Object.freeze(stryMutAct_9fa48("49345") ? {} : (stryCov_9fa48("49345"), {
  HEALTHY: stryMutAct_9fa48("49346") ? "" : (stryCov_9fa48("49346"), 'healthy'),
  PARTIAL: stryMutAct_9fa48("49347") ? "" : (stryCov_9fa48("49347"), 'partial'),
  DEGRADED: stryMutAct_9fa48("49348") ? "" : (stryCov_9fa48("49348"), 'degraded'),
  UNKNOWN: stryMutAct_9fa48("49349") ? "" : (stryCov_9fa48("49349"), 'unknown')
}));

/**
 * Logical services inventory view.
 */
class LogicalServicesView extends BaseView {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("49350")) {
      {}
    } else {
      stryCov_9fa48("49350");
      super(options);
      this.cache = stryMutAct_9fa48("49353") ? options.cache && null : stryMutAct_9fa48("49352") ? false : stryMutAct_9fa48("49351") ? true : (stryCov_9fa48("49351", "49352", "49353"), options.cache || null);
      this.viewName = stryMutAct_9fa48("49354") ? "" : (stryCov_9fa48("49354"), 'services');
      this.nodeFilter = null;
      this.serviceIdFilter = null;
    }
  }

  /**
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("49355")) {
      {}
    } else {
      stryCov_9fa48("49355");
      return stryMutAct_9fa48("49356") ? [] : (stryCov_9fa48("49356"), [stryMutAct_9fa48("49357") ? {} : (stryCov_9fa48("49357"), {
        key: stryMutAct_9fa48("49358") ? "" : (stryCov_9fa48("49358"), 'service_name'),
        label: stryMutAct_9fa48("49359") ? "" : (stryCov_9fa48("49359"), 'Name'),
        width: 20
      }), stryMutAct_9fa48("49360") ? {} : (stryCov_9fa48("49360"), {
        key: stryMutAct_9fa48("49361") ? "" : (stryCov_9fa48("49361"), 'service_id'),
        label: stryMutAct_9fa48("49362") ? "" : (stryCov_9fa48("49362"), 'Service ID'),
        width: 24
      }), stryMutAct_9fa48("49363") ? {} : (stryCov_9fa48("49363"), {
        key: stryMutAct_9fa48("49364") ? "" : (stryCov_9fa48("49364"), 'runtime_kind'),
        label: stryMutAct_9fa48("49365") ? "" : (stryCov_9fa48("49365"), 'Runtime'),
        width: 14
      }), stryMutAct_9fa48("49366") ? {} : (stryCov_9fa48("49366"), {
        key: stryMutAct_9fa48("49367") ? "" : (stryCov_9fa48("49367"), 'desired'),
        label: stryMutAct_9fa48("49368") ? "" : (stryCov_9fa48("49368"), 'Desired'),
        width: 8
      }), stryMutAct_9fa48("49369") ? {} : (stryCov_9fa48("49369"), {
        key: stryMutAct_9fa48("49370") ? "" : (stryCov_9fa48("49370"), 'replicas'),
        label: stryMutAct_9fa48("49371") ? "" : (stryCov_9fa48("49371"), 'Replicas'),
        width: 9
      }), stryMutAct_9fa48("49372") ? {} : (stryCov_9fa48("49372"), {
        key: stryMutAct_9fa48("49373") ? "" : (stryCov_9fa48("49373"), 'healthy'),
        label: stryMutAct_9fa48("49374") ? "" : (stryCov_9fa48("49374"), 'Healthy'),
        width: 8
      }), stryMutAct_9fa48("49375") ? {} : (stryCov_9fa48("49375"), {
        key: stryMutAct_9fa48("49376") ? "" : (stryCov_9fa48("49376"), 'nodes'),
        label: stryMutAct_9fa48("49377") ? "" : (stryCov_9fa48("49377"), 'Nodes'),
        width: 24
      }), stryMutAct_9fa48("49378") ? {} : (stryCov_9fa48("49378"), {
        key: stryMutAct_9fa48("49379") ? "" : (stryCov_9fa48("49379"), 'status'),
        label: stryMutAct_9fa48("49380") ? "" : (stryCov_9fa48("49380"), 'Status'),
        width: 10
      })]);
    }
  }

  /**
   * @param {Object} logicalService
   * @return {Array<string>}
   */
  formatRow(logicalService) {
    if (stryMutAct_9fa48("49381")) {
      {}
    } else {
      stryCov_9fa48("49381");
      return stryMutAct_9fa48("49382") ? [] : (stryCov_9fa48("49382"), [stryMutAct_9fa48("49385") ? (logicalService.service_name || logicalService.service_id) && 'N/A' : stryMutAct_9fa48("49384") ? false : stryMutAct_9fa48("49383") ? true : (stryCov_9fa48("49383", "49384", "49385"), (stryMutAct_9fa48("49387") ? logicalService.service_name && logicalService.service_id : stryMutAct_9fa48("49386") ? false : (stryCov_9fa48("49386", "49387"), logicalService.service_name || logicalService.service_id)) || (stryMutAct_9fa48("49388") ? "" : (stryCov_9fa48("49388"), 'N/A'))), stryMutAct_9fa48("49391") ? logicalService.service_id && 'N/A' : stryMutAct_9fa48("49390") ? false : stryMutAct_9fa48("49389") ? true : (stryCov_9fa48("49389", "49390", "49391"), logicalService.service_id || (stryMutAct_9fa48("49392") ? "" : (stryCov_9fa48("49392"), 'N/A'))), stryMutAct_9fa48("49395") ? logicalService.runtime_kind && 'N/A' : stryMutAct_9fa48("49394") ? false : stryMutAct_9fa48("49393") ? true : (stryCov_9fa48("49393", "49394", "49395"), logicalService.runtime_kind || (stryMutAct_9fa48("49396") ? "" : (stryCov_9fa48("49396"), 'N/A'))), String(stryMutAct_9fa48("49397") ? logicalService.replica_count && 0 : (stryCov_9fa48("49397"), logicalService.replica_count ?? 0)), String(stryMutAct_9fa48("49398") ? logicalService.replica_count_observed && 0 : (stryCov_9fa48("49398"), logicalService.replica_count_observed ?? 0)), String(stryMutAct_9fa48("49399") ? logicalService.healthy_replica_count && 0 : (stryCov_9fa48("49399"), logicalService.healthy_replica_count ?? 0)), stryMutAct_9fa48("49402") ? logicalService.nodes_summary && 'N/A' : stryMutAct_9fa48("49401") ? false : stryMutAct_9fa48("49400") ? true : (stryCov_9fa48("49400", "49401", "49402"), logicalService.nodes_summary || (stryMutAct_9fa48("49403") ? "" : (stryCov_9fa48("49403"), 'N/A'))), stryMutAct_9fa48("49406") ? logicalService.status && LOGICAL_SERVICE_STATE.UNKNOWN : stryMutAct_9fa48("49405") ? false : stryMutAct_9fa48("49404") ? true : (stryCov_9fa48("49404", "49405", "49406"), logicalService.status || LOGICAL_SERVICE_STATE.UNKNOWN)]);
    }
  }

  /**
   * @param {Object} logicalService
   * @return {string}
   */
  getItemKey(logicalService) {
    if (stryMutAct_9fa48("49407")) {
      {}
    } else {
      stryCov_9fa48("49407");
      return stryMutAct_9fa48("49410") ? logicalService.service_id && '' : stryMutAct_9fa48("49409") ? false : stryMutAct_9fa48("49408") ? true : (stryCov_9fa48("49408", "49409", "49410"), logicalService.service_id || (stryMutAct_9fa48("49411") ? "Stryker was here!" : (stryCov_9fa48("49411"), '')));
    }
  }

  /**
   * @param {Object} logicalService
   * @return {string}
   */
  getRowStatus(logicalService) {
    if (stryMutAct_9fa48("49412")) {
      {}
    } else {
      stryCov_9fa48("49412");
      const status = stryMutAct_9fa48("49415") ? logicalService.status && LOGICAL_SERVICE_STATE.UNKNOWN : stryMutAct_9fa48("49414") ? false : stryMutAct_9fa48("49413") ? true : (stryCov_9fa48("49413", "49414", "49415"), logicalService.status || LOGICAL_SERVICE_STATE.UNKNOWN);
      if (stryMutAct_9fa48("49418") ? status !== LOGICAL_SERVICE_STATE.DEGRADED : stryMutAct_9fa48("49417") ? false : stryMutAct_9fa48("49416") ? true : (stryCov_9fa48("49416", "49417", "49418"), status === LOGICAL_SERVICE_STATE.DEGRADED)) {
        if (stryMutAct_9fa48("49419")) {
          {}
        } else {
          stryCov_9fa48("49419");
          return ROW_STATUS.ERROR;
        }
      }
      if (stryMutAct_9fa48("49422") ? status === LOGICAL_SERVICE_STATE.PARTIAL && status === LOGICAL_SERVICE_STATE.UNKNOWN : stryMutAct_9fa48("49421") ? false : stryMutAct_9fa48("49420") ? true : (stryCov_9fa48("49420", "49421", "49422"), (stryMutAct_9fa48("49424") ? status !== LOGICAL_SERVICE_STATE.PARTIAL : stryMutAct_9fa48("49423") ? false : (stryCov_9fa48("49423", "49424"), status === LOGICAL_SERVICE_STATE.PARTIAL)) || (stryMutAct_9fa48("49426") ? status !== LOGICAL_SERVICE_STATE.UNKNOWN : stryMutAct_9fa48("49425") ? false : (stryCov_9fa48("49425", "49426"), status === LOGICAL_SERVICE_STATE.UNKNOWN)))) {
        if (stryMutAct_9fa48("49427")) {
          {}
        } else {
          stryCov_9fa48("49427");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * @param {string|null} nodeId
   */
  setNodeFilter(nodeId) {
    if (stryMutAct_9fa48("49428")) {
      {}
    } else {
      stryCov_9fa48("49428");
      this.nodeFilter = stryMutAct_9fa48("49431") ? nodeId && null : stryMutAct_9fa48("49430") ? false : stryMutAct_9fa48("49429") ? true : (stryCov_9fa48("49429", "49430", "49431"), nodeId || null);
      this.updateFilteredData();
    }
  }

  /**
   * @param {string|null} serviceId
   */
  setServiceIdFilter(serviceId) {
    if (stryMutAct_9fa48("49432")) {
      {}
    } else {
      stryCov_9fa48("49432");
      this.serviceIdFilter = stryMutAct_9fa48("49435") ? serviceId && null : stryMutAct_9fa48("49434") ? false : stryMutAct_9fa48("49433") ? true : (stryCov_9fa48("49433", "49434", "49435"), serviceId || null);
      this.updateFilteredData();
    }
  }

  /**
   * @param {Array<Object>} data
   * @return {Array<Object>}
   */
  applyFilter(data) {
    if (stryMutAct_9fa48("49436")) {
      {}
    } else {
      stryCov_9fa48("49436");
      let filtered = data;
      if (stryMutAct_9fa48("49438") ? false : stryMutAct_9fa48("49437") ? true : (stryCov_9fa48("49437", "49438"), this.nodeFilter)) {
        if (stryMutAct_9fa48("49439")) {
          {}
        } else {
          stryCov_9fa48("49439");
          filtered = stryMutAct_9fa48("49440") ? filtered : (stryCov_9fa48("49440"), filtered.filter(entry => {
            if (stryMutAct_9fa48("49441")) {
              {}
            } else {
              stryCov_9fa48("49441");
              const nodes = Array.isArray(entry.nodes) ? entry.nodes : stryMutAct_9fa48("49442") ? ["Stryker was here"] : (stryCov_9fa48("49442"), []);
              return nodes.includes(this.nodeFilter);
            }
          }));
        }
      }
      if (stryMutAct_9fa48("49444") ? false : stryMutAct_9fa48("49443") ? true : (stryCov_9fa48("49443", "49444"), this.serviceIdFilter)) {
        if (stryMutAct_9fa48("49445")) {
          {}
        } else {
          stryCov_9fa48("49445");
          filtered = stryMutAct_9fa48("49446") ? filtered : (stryCov_9fa48("49446"), filtered.filter(entry => {
            if (stryMutAct_9fa48("49447")) {
              {}
            } else {
              stryCov_9fa48("49447");
              return stryMutAct_9fa48("49450") ? entry.service_id !== this.serviceIdFilter : stryMutAct_9fa48("49449") ? false : stryMutAct_9fa48("49448") ? true : (stryCov_9fa48("49448", "49449", "49450"), entry.service_id === this.serviceIdFilter);
            }
          }));
        }
      }
      return super.applyFilter(filtered);
    }
  }

  /**
   * @return {Object|null}
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("49451")) {
      {}
    } else {
      stryCov_9fa48("49451");
      const logicalService = this.getSelectedItem();
      if (stryMutAct_9fa48("49454") ? !logicalService && !logicalService.service_id : stryMutAct_9fa48("49453") ? false : stryMutAct_9fa48("49452") ? true : (stryCov_9fa48("49452", "49453", "49454"), (stryMutAct_9fa48("49455") ? logicalService : (stryCov_9fa48("49455"), !logicalService)) || (stryMutAct_9fa48("49456") ? logicalService.service_id : (stryCov_9fa48("49456"), !logicalService.service_id)))) {
        if (stryMutAct_9fa48("49457")) {
          {}
        } else {
          stryCov_9fa48("49457");
          return null;
        }
      }
      return stryMutAct_9fa48("49458") ? {} : (stryCov_9fa48("49458"), {
        action: stryMutAct_9fa48("49459") ? "" : (stryCov_9fa48("49459"), 'drillDown'),
        view: stryMutAct_9fa48("49460") ? "" : (stryCov_9fa48("49460"), 'replicas'),
        context: stryMutAct_9fa48("49461") ? {} : (stryCov_9fa48("49461"), {
          serviceId: logicalService.service_id
        })
      });
    }
  }

  /**
   * @return {Object|null}
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("49462")) {
      {}
    } else {
      stryCov_9fa48("49462");
      const logicalService = this.getSelectedItem();
      if (stryMutAct_9fa48("49465") ? false : stryMutAct_9fa48("49464") ? true : stryMutAct_9fa48("49463") ? logicalService : (stryCov_9fa48("49463", "49464", "49465"), !logicalService)) {
        if (stryMutAct_9fa48("49466")) {
          {}
        } else {
          stryCov_9fa48("49466");
          return null;
        }
      }
      const nodes = Array.isArray(logicalService.nodes) ? logicalService.nodes : stryMutAct_9fa48("49467") ? ["Stryker was here"] : (stryCov_9fa48("49467"), []);
      const sections = stryMutAct_9fa48("49468") ? [] : (stryCov_9fa48("49468"), [stryMutAct_9fa48("49469") ? {} : (stryCov_9fa48("49469"), {
        title: stryMutAct_9fa48("49470") ? "" : (stryCov_9fa48("49470"), 'Service Definition'),
        fields: stryMutAct_9fa48("49471") ? [] : (stryCov_9fa48("49471"), [stryMutAct_9fa48("49472") ? {} : (stryCov_9fa48("49472"), {
          label: stryMutAct_9fa48("49473") ? "" : (stryCov_9fa48("49473"), 'Service ID'),
          value: stryMutAct_9fa48("49476") ? logicalService.service_id && 'N/A' : stryMutAct_9fa48("49475") ? false : stryMutAct_9fa48("49474") ? true : (stryCov_9fa48("49474", "49475", "49476"), logicalService.service_id || (stryMutAct_9fa48("49477") ? "" : (stryCov_9fa48("49477"), 'N/A')))
        }), stryMutAct_9fa48("49478") ? {} : (stryCov_9fa48("49478"), {
          label: stryMutAct_9fa48("49479") ? "" : (stryCov_9fa48("49479"), 'Service Name'),
          value: stryMutAct_9fa48("49482") ? logicalService.service_name && 'N/A' : stryMutAct_9fa48("49481") ? false : stryMutAct_9fa48("49480") ? true : (stryCov_9fa48("49480", "49481", "49482"), logicalService.service_name || (stryMutAct_9fa48("49483") ? "" : (stryCov_9fa48("49483"), 'N/A')))
        }), stryMutAct_9fa48("49484") ? {} : (stryCov_9fa48("49484"), {
          label: stryMutAct_9fa48("49485") ? "" : (stryCov_9fa48("49485"), 'Type'),
          value: stryMutAct_9fa48("49488") ? logicalService.service_type && 'runtime_service' : stryMutAct_9fa48("49487") ? false : stryMutAct_9fa48("49486") ? true : (stryCov_9fa48("49486", "49487", "49488"), logicalService.service_type || (stryMutAct_9fa48("49489") ? "" : (stryCov_9fa48("49489"), 'runtime_service')))
        }), stryMutAct_9fa48("49490") ? {} : (stryCov_9fa48("49490"), {
          label: stryMutAct_9fa48("49491") ? "" : (stryCov_9fa48("49491"), 'Runtime Kind'),
          value: stryMutAct_9fa48("49494") ? logicalService.runtime_kind && 'N/A' : stryMutAct_9fa48("49493") ? false : stryMutAct_9fa48("49492") ? true : (stryCov_9fa48("49492", "49493", "49494"), logicalService.runtime_kind || (stryMutAct_9fa48("49495") ? "" : (stryCov_9fa48("49495"), 'N/A')))
        }), stryMutAct_9fa48("49496") ? {} : (stryCov_9fa48("49496"), {
          label: stryMutAct_9fa48("49497") ? "" : (stryCov_9fa48("49497"), 'Runtime Ref'),
          value: stryMutAct_9fa48("49500") ? logicalService.runtime_ref && 'N/A' : stryMutAct_9fa48("49499") ? false : stryMutAct_9fa48("49498") ? true : (stryCov_9fa48("49498", "49499", "49500"), logicalService.runtime_ref || (stryMutAct_9fa48("49501") ? "" : (stryCov_9fa48("49501"), 'N/A')))
        }), stryMutAct_9fa48("49502") ? {} : (stryCov_9fa48("49502"), {
          label: stryMutAct_9fa48("49503") ? "" : (stryCov_9fa48("49503"), 'Desired Replicas'),
          value: String(stryMutAct_9fa48("49504") ? logicalService.replica_count && 0 : (stryCov_9fa48("49504"), logicalService.replica_count ?? 0))
        })])
      }), stryMutAct_9fa48("49505") ? {} : (stryCov_9fa48("49505"), {
        title: stryMutAct_9fa48("49506") ? "" : (stryCov_9fa48("49506"), 'Replica Inventory'),
        fields: stryMutAct_9fa48("49507") ? [] : (stryCov_9fa48("49507"), [stryMutAct_9fa48("49508") ? {} : (stryCov_9fa48("49508"), {
          label: stryMutAct_9fa48("49509") ? "" : (stryCov_9fa48("49509"), 'Observed Replicas'),
          value: String(stryMutAct_9fa48("49510") ? logicalService.replica_count_observed && 0 : (stryCov_9fa48("49510"), logicalService.replica_count_observed ?? 0))
        }), stryMutAct_9fa48("49511") ? {} : (stryCov_9fa48("49511"), {
          label: stryMutAct_9fa48("49512") ? "" : (stryCov_9fa48("49512"), 'Healthy Replicas'),
          value: String(stryMutAct_9fa48("49513") ? logicalService.healthy_replica_count && 0 : (stryCov_9fa48("49513"), logicalService.healthy_replica_count ?? 0))
        }), stryMutAct_9fa48("49514") ? {} : (stryCov_9fa48("49514"), {
          label: stryMutAct_9fa48("49515") ? "" : (stryCov_9fa48("49515"), 'Nodes'),
          value: stryMutAct_9fa48("49518") ? logicalService.nodes_summary && 'N/A' : stryMutAct_9fa48("49517") ? false : stryMutAct_9fa48("49516") ? true : (stryCov_9fa48("49516", "49517", "49518"), logicalService.nodes_summary || (stryMutAct_9fa48("49519") ? "" : (stryCov_9fa48("49519"), 'N/A')))
        }), stryMutAct_9fa48("49520") ? {} : (stryCov_9fa48("49520"), {
          label: stryMutAct_9fa48("49521") ? "" : (stryCov_9fa48("49521"), 'Node Count'),
          value: String(stryMutAct_9fa48("49522") ? logicalService.node_count && nodes.length : (stryCov_9fa48("49522"), logicalService.node_count ?? nodes.length))
        }), stryMutAct_9fa48("49523") ? {} : (stryCov_9fa48("49523"), {
          label: stryMutAct_9fa48("49524") ? "" : (stryCov_9fa48("49524"), 'Status'),
          value: stryMutAct_9fa48("49527") ? logicalService.status && LOGICAL_SERVICE_STATE.UNKNOWN : stryMutAct_9fa48("49526") ? false : stryMutAct_9fa48("49525") ? true : (stryCov_9fa48("49525", "49526", "49527"), logicalService.status || LOGICAL_SERVICE_STATE.UNKNOWN)
        })])
      })]);
      return stryMutAct_9fa48("49528") ? {} : (stryCov_9fa48("49528"), {
        title: stryMutAct_9fa48("49529") ? `` : (stryCov_9fa48("49529"), `Service: ${stryMutAct_9fa48("49532") ? logicalService.service_id && 'N/A' : stryMutAct_9fa48("49531") ? false : stryMutAct_9fa48("49530") ? true : (stryCov_9fa48("49530", "49531", "49532"), logicalService.service_id || (stryMutAct_9fa48("49533") ? "" : (stryCov_9fa48("49533"), 'N/A')))}`),
        sections,
        navigationLinks: stryMutAct_9fa48("49534") ? [] : (stryCov_9fa48("49534"), [stryMutAct_9fa48("49535") ? {} : (stryCov_9fa48("49535"), {
          label: stryMutAct_9fa48("49536") ? "" : (stryCov_9fa48("49536"), 'View Replicas'),
          target: stryMutAct_9fa48("49537") ? "" : (stryCov_9fa48("49537"), 'replicas'),
          key: stryMutAct_9fa48("49538") ? "" : (stryCov_9fa48("49538"), 'r')
        })])
      });
    }
  }
}
export { LogicalServicesView, LOGICAL_SERVICE_STATE };