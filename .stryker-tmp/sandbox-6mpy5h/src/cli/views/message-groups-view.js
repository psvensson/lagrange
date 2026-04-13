/**
 * MessageGroupsView - Displays message group distribution and health
 *
 * Columns: group_id, replica_count, nodes_covered, status
 * Supports highlighting unhealthy replicas and drill-down to replica locations.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
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
 * MessageGroupsView displays message group distribution and health
 */
export class MessageGroupsView extends BaseView {
  /**
   * Creates a new MessageGroupsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("50581")) {
      {}
    } else {
      stryCov_9fa48("50581");
      super(options);
      this.cache = stryMutAct_9fa48("50584") ? options.cache && null : stryMutAct_9fa48("50583") ? false : stryMutAct_9fa48("50582") ? true : (stryCov_9fa48("50582", "50583", "50584"), options.cache || null);
      this.viewName = stryMutAct_9fa48("50585") ? "" : (stryCov_9fa48("50585"), 'message_groups');
    }
  }

  /**
   * Get column definitions for the message groups view
   * Requirements: 6.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("50586")) {
      {}
    } else {
      stryCov_9fa48("50586");
      return stryMutAct_9fa48("50587") ? [] : (stryCov_9fa48("50587"), [stryMutAct_9fa48("50588") ? {} : (stryCov_9fa48("50588"), {
        key: stryMutAct_9fa48("50589") ? "" : (stryCov_9fa48("50589"), 'group_id'),
        label: stryMutAct_9fa48("50590") ? "" : (stryCov_9fa48("50590"), 'Group ID'),
        width: 20
      }), stryMutAct_9fa48("50591") ? {} : (stryCov_9fa48("50591"), {
        key: stryMutAct_9fa48("50592") ? "" : (stryCov_9fa48("50592"), 'replica_count'),
        label: stryMutAct_9fa48("50593") ? "" : (stryCov_9fa48("50593"), 'Replicas'),
        width: 10
      }), stryMutAct_9fa48("50594") ? {} : (stryCov_9fa48("50594"), {
        key: stryMutAct_9fa48("50595") ? "" : (stryCov_9fa48("50595"), 'nodes_covered'),
        label: stryMutAct_9fa48("50596") ? "" : (stryCov_9fa48("50596"), 'Nodes Covered'),
        width: 30
      }), stryMutAct_9fa48("50597") ? {} : (stryCov_9fa48("50597"), {
        key: stryMutAct_9fa48("50598") ? "" : (stryCov_9fa48("50598"), 'status'),
        label: stryMutAct_9fa48("50599") ? "" : (stryCov_9fa48("50599"), 'Status'),
        width: 12
      })]);
    }
  }

  /**
   * Format a message group record into a row array
   * Requirements: 6.1, 6.3
   * @param {Object} messageGroup - Message group record
   * @return {Array<string>} Row values
   */
  formatRow(messageGroup) {
    if (stryMutAct_9fa48("50600")) {
      {}
    } else {
      stryCov_9fa48("50600");
      return stryMutAct_9fa48("50601") ? [] : (stryCov_9fa48("50601"), [stryMutAct_9fa48("50604") ? messageGroup.group_id && 'N/A' : stryMutAct_9fa48("50603") ? false : stryMutAct_9fa48("50602") ? true : (stryCov_9fa48("50602", "50603", "50604"), messageGroup.group_id || (stryMutAct_9fa48("50605") ? "" : (stryCov_9fa48("50605"), 'N/A'))), this.formatReplicaCount(messageGroup.replica_count), this.formatNodesCovered(messageGroup.nodes_covered), stryMutAct_9fa48("50608") ? messageGroup.status && 'unknown' : stryMutAct_9fa48("50607") ? false : stryMutAct_9fa48("50606") ? true : (stryCov_9fa48("50606", "50607", "50608"), messageGroup.status || (stryMutAct_9fa48("50609") ? "" : (stryCov_9fa48("50609"), 'unknown')))]);
    }
  }

  /**
   * Format replica count for display
   * @param {number|null|undefined} count - Replica count
   * @return {string} Formatted count
   */
  formatReplicaCount(count) {
    if (stryMutAct_9fa48("50610")) {
      {}
    } else {
      stryCov_9fa48("50610");
      if (stryMutAct_9fa48("50613") ? count === null && count === undefined : stryMutAct_9fa48("50612") ? false : stryMutAct_9fa48("50611") ? true : (stryCov_9fa48("50611", "50612", "50613"), (stryMutAct_9fa48("50615") ? count !== null : stryMutAct_9fa48("50614") ? false : (stryCov_9fa48("50614", "50615"), count === null)) || (stryMutAct_9fa48("50617") ? count !== undefined : stryMutAct_9fa48("50616") ? false : (stryCov_9fa48("50616", "50617"), count === undefined)))) {
        if (stryMutAct_9fa48("50618")) {
          {}
        } else {
          stryCov_9fa48("50618");
          return stryMutAct_9fa48("50619") ? "" : (stryCov_9fa48("50619"), 'N/A');
        }
      }
      return String(count);
    }
  }

  /**
   * Format nodes covered for display
   * Requirements: 6.3
   * @param {Array<string>|string|null|undefined} nodes - Nodes covered
   * @return {string} Formatted nodes list
   */
  formatNodesCovered(nodes) {
    if (stryMutAct_9fa48("50620")) {
      {}
    } else {
      stryCov_9fa48("50620");
      if (stryMutAct_9fa48("50623") ? false : stryMutAct_9fa48("50622") ? true : stryMutAct_9fa48("50621") ? nodes : (stryCov_9fa48("50621", "50622", "50623"), !nodes)) {
        if (stryMutAct_9fa48("50624")) {
          {}
        } else {
          stryCov_9fa48("50624");
          return stryMutAct_9fa48("50625") ? "" : (stryCov_9fa48("50625"), 'N/A');
        }
      }
      if (stryMutAct_9fa48("50627") ? false : stryMutAct_9fa48("50626") ? true : (stryCov_9fa48("50626", "50627"), Array.isArray(nodes))) {
        if (stryMutAct_9fa48("50628")) {
          {}
        } else {
          stryCov_9fa48("50628");
          if (stryMutAct_9fa48("50631") ? nodes.length !== 0 : stryMutAct_9fa48("50630") ? false : stryMutAct_9fa48("50629") ? true : (stryCov_9fa48("50629", "50630", "50631"), nodes.length === 0)) {
            if (stryMutAct_9fa48("50632")) {
              {}
            } else {
              stryCov_9fa48("50632");
              return stryMutAct_9fa48("50633") ? "" : (stryCov_9fa48("50633"), 'None');
            }
          }
          return nodes.join(stryMutAct_9fa48("50634") ? "" : (stryCov_9fa48("50634"), ', '));
        }
      }
      return String(nodes);
    }
  }

  /**
   * Get the row status for styling
   * Requirements: 6.4
   * @param {Object} messageGroup - Message group record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(messageGroup) {
    if (stryMutAct_9fa48("50635")) {
      {}
    } else {
      stryCov_9fa48("50635");
      // Failed or error status
      if (stryMutAct_9fa48("50638") ? messageGroup.status === 'failed' && messageGroup.status === 'error' : stryMutAct_9fa48("50637") ? false : stryMutAct_9fa48("50636") ? true : (stryCov_9fa48("50636", "50637", "50638"), (stryMutAct_9fa48("50640") ? messageGroup.status !== 'failed' : stryMutAct_9fa48("50639") ? false : (stryCov_9fa48("50639", "50640"), messageGroup.status === (stryMutAct_9fa48("50641") ? "" : (stryCov_9fa48("50641"), 'failed')))) || (stryMutAct_9fa48("50643") ? messageGroup.status !== 'error' : stryMutAct_9fa48("50642") ? false : (stryCov_9fa48("50642", "50643"), messageGroup.status === (stryMutAct_9fa48("50644") ? "" : (stryCov_9fa48("50644"), 'error')))))) {
        if (stryMutAct_9fa48("50645")) {
          {}
        } else {
          stryCov_9fa48("50645");
          return ROW_STATUS.ERROR;
        }
      }

      // Check for unhealthy replicas
      if (stryMutAct_9fa48("50647") ? false : stryMutAct_9fa48("50646") ? true : (stryCov_9fa48("50646", "50647"), this.hasUnhealthyReplicas(messageGroup))) {
        if (stryMutAct_9fa48("50648")) {
          {}
        } else {
          stryCov_9fa48("50648");
          return ROW_STATUS.WARNING;
        }
      }

      // Degraded status is a warning
      if (stryMutAct_9fa48("50651") ? messageGroup.status !== 'degraded' : stryMutAct_9fa48("50650") ? false : stryMutAct_9fa48("50649") ? true : (stryCov_9fa48("50649", "50650", "50651"), messageGroup.status === (stryMutAct_9fa48("50652") ? "" : (stryCov_9fa48("50652"), 'degraded')))) {
        if (stryMutAct_9fa48("50653")) {
          {}
        } else {
          stryCov_9fa48("50653");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Check if a message group has unhealthy replicas
   * Requirements: 6.4
   * @param {Object} messageGroup - Message group record
   * @return {boolean} True if has unhealthy replicas
   */
  hasUnhealthyReplicas(messageGroup) {
    if (stryMutAct_9fa48("50654")) {
      {}
    } else {
      stryCov_9fa48("50654");
      // Check unhealthy_replica_count if available
      if (stryMutAct_9fa48("50657") ? messageGroup.unhealthy_replica_count !== undefined || messageGroup.unhealthy_replica_count !== null : stryMutAct_9fa48("50656") ? false : stryMutAct_9fa48("50655") ? true : (stryCov_9fa48("50655", "50656", "50657"), (stryMutAct_9fa48("50659") ? messageGroup.unhealthy_replica_count === undefined : stryMutAct_9fa48("50658") ? true : (stryCov_9fa48("50658", "50659"), messageGroup.unhealthy_replica_count !== undefined)) && (stryMutAct_9fa48("50661") ? messageGroup.unhealthy_replica_count === null : stryMutAct_9fa48("50660") ? true : (stryCov_9fa48("50660", "50661"), messageGroup.unhealthy_replica_count !== null)))) {
        if (stryMutAct_9fa48("50662")) {
          {}
        } else {
          stryCov_9fa48("50662");
          return stryMutAct_9fa48("50666") ? messageGroup.unhealthy_replica_count <= 0 : stryMutAct_9fa48("50665") ? messageGroup.unhealthy_replica_count >= 0 : stryMutAct_9fa48("50664") ? false : stryMutAct_9fa48("50663") ? true : (stryCov_9fa48("50663", "50664", "50665", "50666"), messageGroup.unhealthy_replica_count > 0);
        }
      }

      // Check replica_statuses array if available
      if (stryMutAct_9fa48("50668") ? false : stryMutAct_9fa48("50667") ? true : (stryCov_9fa48("50667", "50668"), Array.isArray(messageGroup.replica_statuses))) {
        if (stryMutAct_9fa48("50669")) {
          {}
        } else {
          stryCov_9fa48("50669");
          return stryMutAct_9fa48("50670") ? messageGroup.replica_statuses.every(status => status !== 'healthy' && status !== 'active') : (stryCov_9fa48("50670"), messageGroup.replica_statuses.some(stryMutAct_9fa48("50671") ? () => undefined : (stryCov_9fa48("50671"), status => stryMutAct_9fa48("50674") ? status !== 'healthy' || status !== 'active' : stryMutAct_9fa48("50673") ? false : stryMutAct_9fa48("50672") ? true : (stryCov_9fa48("50672", "50673", "50674"), (stryMutAct_9fa48("50676") ? status === 'healthy' : stryMutAct_9fa48("50675") ? true : (stryCov_9fa48("50675", "50676"), status !== (stryMutAct_9fa48("50677") ? "" : (stryCov_9fa48("50677"), 'healthy')))) && (stryMutAct_9fa48("50679") ? status === 'active' : stryMutAct_9fa48("50678") ? true : (stryCov_9fa48("50678", "50679"), status !== (stryMutAct_9fa48("50680") ? "" : (stryCov_9fa48("50680"), 'active'))))))));
        }
      }
      return stryMutAct_9fa48("50681") ? true : (stryCov_9fa48("50681"), false);
    }
  }

  /**
   * Get the unique key for a message group
   * @param {Object} messageGroup - Message group record
   * @return {string} Unique key (group_id)
   */
  getItemKey(messageGroup) {
    if (stryMutAct_9fa48("50682")) {
      {}
    } else {
      stryCov_9fa48("50682");
      return stryMutAct_9fa48("50685") ? messageGroup.group_id && '' : stryMutAct_9fa48("50684") ? false : stryMutAct_9fa48("50683") ? true : (stryCov_9fa48("50683", "50684", "50685"), messageGroup.group_id || (stryMutAct_9fa48("50686") ? "Stryker was here!" : (stryCov_9fa48("50686"), '')));
    }
  }

  /**
   * Handle drill-down action (Enter key on selected message group)
   * Requirements: 6.2, 6.5
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("50687")) {
      {}
    } else {
      stryCov_9fa48("50687");
      const selectedGroup = this.getSelectedItem();
      if (stryMutAct_9fa48("50690") ? false : stryMutAct_9fa48("50689") ? true : stryMutAct_9fa48("50688") ? selectedGroup : (stryCov_9fa48("50688", "50689", "50690"), !selectedGroup)) {
        if (stryMutAct_9fa48("50691")) {
          {}
        } else {
          stryCov_9fa48("50691");
          return null;
        }
      }
      return stryMutAct_9fa48("50692") ? {} : (stryCov_9fa48("50692"), {
        action: stryMutAct_9fa48("50693") ? "" : (stryCov_9fa48("50693"), 'drillDown'),
        view: stryMutAct_9fa48("50694") ? "" : (stryCov_9fa48("50694"), 'replicas'),
        context: stryMutAct_9fa48("50695") ? {} : (stryCov_9fa48("50695"), {
          groupId: selectedGroup.group_id,
          entityType: stryMutAct_9fa48("50696") ? "" : (stryCov_9fa48("50696"), 'message_group')
        })
      });
    }
  }

  /**
   * Navigate to a hosting node
   * Requirements: 6.5
   * @param {number} nodeIndex - Index of node in nodes_covered array
   * @return {Object|null} Navigation action or null
   */
  navigateToNode(nodeIndex = 0) {
    if (stryMutAct_9fa48("50697")) {
      {}
    } else {
      stryCov_9fa48("50697");
      const selectedGroup = this.getSelectedItem();
      if (stryMutAct_9fa48("50700") ? false : stryMutAct_9fa48("50699") ? true : stryMutAct_9fa48("50698") ? selectedGroup : (stryCov_9fa48("50698", "50699", "50700"), !selectedGroup)) {
        if (stryMutAct_9fa48("50701")) {
          {}
        } else {
          stryCov_9fa48("50701");
          return null;
        }
      }
      const nodes = selectedGroup.nodes_covered;
      if (stryMutAct_9fa48("50704") ? !Array.isArray(nodes) && nodes.length === 0 : stryMutAct_9fa48("50703") ? false : stryMutAct_9fa48("50702") ? true : (stryCov_9fa48("50702", "50703", "50704"), (stryMutAct_9fa48("50705") ? Array.isArray(nodes) : (stryCov_9fa48("50705"), !Array.isArray(nodes))) || (stryMutAct_9fa48("50707") ? nodes.length !== 0 : stryMutAct_9fa48("50706") ? false : (stryCov_9fa48("50706", "50707"), nodes.length === 0)))) {
        if (stryMutAct_9fa48("50708")) {
          {}
        } else {
          stryCov_9fa48("50708");
          return null;
        }
      }
      const targetIndex = stryMutAct_9fa48("50709") ? Math.max(nodeIndex, nodes.length - 1) : (stryCov_9fa48("50709"), Math.min(nodeIndex, stryMutAct_9fa48("50710") ? nodes.length + 1 : (stryCov_9fa48("50710"), nodes.length - 1)));
      const nodeId = nodes[targetIndex];
      return stryMutAct_9fa48("50711") ? {} : (stryCov_9fa48("50711"), {
        action: stryMutAct_9fa48("50712") ? "" : (stryCov_9fa48("50712"), 'jumpToEntity'),
        entityType: stryMutAct_9fa48("50713") ? "" : (stryCov_9fa48("50713"), 'node'),
        entityId: nodeId
      });
    }
  }

  /**
   * Handle key input for the message groups view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (stryMutAct_9fa48("50714")) {
      {}
    } else {
      stryCov_9fa48("50714");
      if (stryMutAct_9fa48("50717") ? key.name === 'enter' && key.name === 'return' : stryMutAct_9fa48("50716") ? false : stryMutAct_9fa48("50715") ? true : (stryCov_9fa48("50715", "50716", "50717"), (stryMutAct_9fa48("50719") ? key.name !== 'enter' : stryMutAct_9fa48("50718") ? false : (stryCov_9fa48("50718", "50719"), key.name === (stryMutAct_9fa48("50720") ? "" : (stryCov_9fa48("50720"), 'enter')))) || (stryMutAct_9fa48("50722") ? key.name !== 'return' : stryMutAct_9fa48("50721") ? false : (stryCov_9fa48("50721", "50722"), key.name === (stryMutAct_9fa48("50723") ? "" : (stryCov_9fa48("50723"), 'return')))))) {
        if (stryMutAct_9fa48("50724")) {
          {}
        } else {
          stryCov_9fa48("50724");
          return this.handleDrillDown();
        }
      }
      if (stryMutAct_9fa48("50727") ? key.name === 'n' && key.name === 'N' : stryMutAct_9fa48("50726") ? false : stryMutAct_9fa48("50725") ? true : (stryCov_9fa48("50725", "50726", "50727"), (stryMutAct_9fa48("50729") ? key.name !== 'n' : stryMutAct_9fa48("50728") ? false : (stryCov_9fa48("50728", "50729"), key.name === (stryMutAct_9fa48("50730") ? "" : (stryCov_9fa48("50730"), 'n')))) || (stryMutAct_9fa48("50732") ? key.name !== 'N' : stryMutAct_9fa48("50731") ? false : (stryCov_9fa48("50731", "50732"), key.name === (stryMutAct_9fa48("50733") ? "" : (stryCov_9fa48("50733"), 'N')))))) {
        if (stryMutAct_9fa48("50734")) {
          {}
        } else {
          stryCov_9fa48("50734");
          return this.navigateToNode(0);
        }
      }
      return super.handleKey(key);
    }
  }

  /**
   * Get detail information for the selected message group
   * Requirements: 6.2
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("50735")) {
      {}
    } else {
      stryCov_9fa48("50735");
      const group = this.getSelectedItem();
      if (stryMutAct_9fa48("50738") ? false : stryMutAct_9fa48("50737") ? true : stryMutAct_9fa48("50736") ? group : (stryCov_9fa48("50736", "50737", "50738"), !group)) {
        if (stryMutAct_9fa48("50739")) {
          {}
        } else {
          stryCov_9fa48("50739");
          return null;
        }
      }
      const sections = stryMutAct_9fa48("50740") ? [] : (stryCov_9fa48("50740"), [stryMutAct_9fa48("50741") ? {} : (stryCov_9fa48("50741"), {
        title: stryMutAct_9fa48("50742") ? "" : (stryCov_9fa48("50742"), 'Basic Information'),
        fields: stryMutAct_9fa48("50743") ? [] : (stryCov_9fa48("50743"), [stryMutAct_9fa48("50744") ? {} : (stryCov_9fa48("50744"), {
          label: stryMutAct_9fa48("50745") ? "" : (stryCov_9fa48("50745"), 'Group ID'),
          value: group.group_id
        }), stryMutAct_9fa48("50746") ? {} : (stryCov_9fa48("50746"), {
          label: stryMutAct_9fa48("50747") ? "" : (stryCov_9fa48("50747"), 'Status'),
          value: stryMutAct_9fa48("50750") ? group.status && 'unknown' : stryMutAct_9fa48("50749") ? false : stryMutAct_9fa48("50748") ? true : (stryCov_9fa48("50748", "50749", "50750"), group.status || (stryMutAct_9fa48("50751") ? "" : (stryCov_9fa48("50751"), 'unknown')))
        })])
      }), stryMutAct_9fa48("50752") ? {} : (stryCov_9fa48("50752"), {
        title: stryMutAct_9fa48("50753") ? "" : (stryCov_9fa48("50753"), 'Replication'),
        fields: stryMutAct_9fa48("50754") ? [] : (stryCov_9fa48("50754"), [stryMutAct_9fa48("50755") ? {} : (stryCov_9fa48("50755"), {
          label: stryMutAct_9fa48("50756") ? "" : (stryCov_9fa48("50756"), 'Replica Count'),
          value: this.formatReplicaCount(group.replica_count)
        }), stryMutAct_9fa48("50757") ? {} : (stryCov_9fa48("50757"), {
          label: stryMutAct_9fa48("50758") ? "" : (stryCov_9fa48("50758"), 'Nodes Covered'),
          value: this.formatNodesCovered(group.nodes_covered)
        }), stryMutAct_9fa48("50759") ? {} : (stryCov_9fa48("50759"), {
          label: stryMutAct_9fa48("50760") ? "" : (stryCov_9fa48("50760"), 'Has Unhealthy Replicas'),
          value: this.hasUnhealthyReplicas(group) ? stryMutAct_9fa48("50761") ? "" : (stryCov_9fa48("50761"), 'Yes') : stryMutAct_9fa48("50762") ? "" : (stryCov_9fa48("50762"), 'No')
        })])
      })]);

      // Add leader info if available
      if (stryMutAct_9fa48("50764") ? false : stryMutAct_9fa48("50763") ? true : (stryCov_9fa48("50763", "50764"), group.leader_node_id)) {
        if (stryMutAct_9fa48("50765")) {
          {}
        } else {
          stryCov_9fa48("50765");
          sections[0].fields.push(stryMutAct_9fa48("50766") ? {} : (stryCov_9fa48("50766"), {
            label: stryMutAct_9fa48("50767") ? "" : (stryCov_9fa48("50767"), 'Leader Node'),
            value: group.leader_node_id
          }));
        }
      }

      // Add Raft state if available
      if (stryMutAct_9fa48("50770") ? group.raft_term !== undefined && group.raft_index !== undefined : stryMutAct_9fa48("50769") ? false : stryMutAct_9fa48("50768") ? true : (stryCov_9fa48("50768", "50769", "50770"), (stryMutAct_9fa48("50772") ? group.raft_term === undefined : stryMutAct_9fa48("50771") ? false : (stryCov_9fa48("50771", "50772"), group.raft_term !== undefined)) || (stryMutAct_9fa48("50774") ? group.raft_index === undefined : stryMutAct_9fa48("50773") ? false : (stryCov_9fa48("50773", "50774"), group.raft_index !== undefined)))) {
        if (stryMutAct_9fa48("50775")) {
          {}
        } else {
          stryCov_9fa48("50775");
          sections.push(stryMutAct_9fa48("50776") ? {} : (stryCov_9fa48("50776"), {
            title: stryMutAct_9fa48("50777") ? "" : (stryCov_9fa48("50777"), 'Raft State'),
            fields: stryMutAct_9fa48("50778") ? [] : (stryCov_9fa48("50778"), [stryMutAct_9fa48("50779") ? {} : (stryCov_9fa48("50779"), {
              label: stryMutAct_9fa48("50780") ? "" : (stryCov_9fa48("50780"), 'Term'),
              value: String(stryMutAct_9fa48("50783") ? group.raft_term && 0 : stryMutAct_9fa48("50782") ? false : stryMutAct_9fa48("50781") ? true : (stryCov_9fa48("50781", "50782", "50783"), group.raft_term || 0))
            }), stryMutAct_9fa48("50784") ? {} : (stryCov_9fa48("50784"), {
              label: stryMutAct_9fa48("50785") ? "" : (stryCov_9fa48("50785"), 'Index'),
              value: String(stryMutAct_9fa48("50788") ? group.raft_index && 0 : stryMutAct_9fa48("50787") ? false : stryMutAct_9fa48("50786") ? true : (stryCov_9fa48("50786", "50787", "50788"), group.raft_index || 0))
            })])
          }));
        }
      }
      return stryMutAct_9fa48("50789") ? {} : (stryCov_9fa48("50789"), {
        title: stryMutAct_9fa48("50790") ? `` : (stryCov_9fa48("50790"), `Message Group: ${group.group_id}`),
        sections
      });
    }
  }
}