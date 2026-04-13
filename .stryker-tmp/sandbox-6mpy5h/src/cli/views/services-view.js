/**
 * ReplicasView - Displays concrete replicas running on nodes.
 *
 * Columns: service_id, type, node_id, status, address
 * Supports filtering by node and service type, drill-down to partition/message_group details.
 * Includes color coding for replica states and time-in-state display.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 8.1, 8.2, 8.3
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
 * Service types for filtering
 */
export const SERVICE_TYPES = stryMutAct_9fa48("51690") ? {} : (stryCov_9fa48("51690"), {
  PARTITION: stryMutAct_9fa48("51691") ? "" : (stryCov_9fa48("51691"), 'partition'),
  MESSAGE_GROUP: stryMutAct_9fa48("51692") ? "" : (stryCov_9fa48("51692"), 'message_group'),
  NODE: stryMutAct_9fa48("51693") ? "" : (stryCov_9fa48("51693"), 'node'),
  RUNTIME_SERVICE: stryMutAct_9fa48("51694") ? "" : (stryCov_9fa48("51694"), 'runtime_service')
});

/**
 * Replica state constants for color coding
 * Requirements: 8.1
 */
export const REPLICA_STATES = stryMutAct_9fa48("51695") ? {} : (stryCov_9fa48("51695"), {
  PENDING: stryMutAct_9fa48("51696") ? "" : (stryCov_9fa48("51696"), 'pending'),
  CREATING: stryMutAct_9fa48("51697") ? "" : (stryCov_9fa48("51697"), 'creating'),
  SYNCING: stryMutAct_9fa48("51698") ? "" : (stryCov_9fa48("51698"), 'syncing'),
  ACTIVE: stryMutAct_9fa48("51699") ? "" : (stryCov_9fa48("51699"), 'active'),
  REMOVING: stryMutAct_9fa48("51700") ? "" : (stryCov_9fa48("51700"), 'removing'),
  REMOVED: stryMutAct_9fa48("51701") ? "" : (stryCov_9fa48("51701"), 'removed'),
  FAILED: stryMutAct_9fa48("51702") ? "" : (stryCov_9fa48("51702"), 'failed')
});

/**
 * Color mappings for replica states
 * Requirements: 8.1
 * - active: green
 * - syncing: yellow
 * - creating/pending: blue
 * - removing: orange (represented as yellow in terminal)
 * - failed: red
 */
export const REPLICA_STATE_COLORS = stryMutAct_9fa48("51703") ? {} : (stryCov_9fa48("51703"), {
  [REPLICA_STATES.ACTIVE]: stryMutAct_9fa48("51704") ? "" : (stryCov_9fa48("51704"), 'green'),
  [REPLICA_STATES.SYNCING]: stryMutAct_9fa48("51705") ? "" : (stryCov_9fa48("51705"), 'yellow'),
  [REPLICA_STATES.CREATING]: stryMutAct_9fa48("51706") ? "" : (stryCov_9fa48("51706"), 'blue'),
  [REPLICA_STATES.PENDING]: stryMutAct_9fa48("51707") ? "" : (stryCov_9fa48("51707"), 'blue'),
  [REPLICA_STATES.REMOVING]: stryMutAct_9fa48("51708") ? "" : (stryCov_9fa48("51708"), 'yellow'),
  // orange not available, use yellow
  [REPLICA_STATES.REMOVED]: stryMutAct_9fa48("51709") ? "" : (stryCov_9fa48("51709"), 'gray'),
  [REPLICA_STATES.FAILED]: stryMutAct_9fa48("51710") ? "" : (stryCov_9fa48("51710"), 'red')
});

/**
 * Transitional states that should show time-in-state
 * Requirements: 8.2
 */
export const TRANSITIONAL_STATES = stryMutAct_9fa48("51711") ? [] : (stryCov_9fa48("51711"), [REPLICA_STATES.PENDING, REPLICA_STATES.CREATING, REPLICA_STATES.SYNCING, REPLICA_STATES.REMOVING]);

/**
 * ReplicasView displays concrete service replicas running on nodes.
 */
class ReplicasView extends BaseView {
  /**
   * Creates a new ServicesView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("51712")) {
      {}
    } else {
      stryCov_9fa48("51712");
      super(options);
      this.cache = stryMutAct_9fa48("51715") ? options.cache && null : stryMutAct_9fa48("51714") ? false : stryMutAct_9fa48("51713") ? true : (stryCov_9fa48("51713", "51714", "51715"), options.cache || null);
      this.viewName = stryMutAct_9fa48("51716") ? "" : (stryCov_9fa48("51716"), 'replicas');
      this.nodeFilter = null;
      this.typeFilter = null;
      this.serviceIdFilter = null;
    }
  }

  /**
   * Get column definitions for the services view
   * Requirements: 3.2
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("51717")) {
      {}
    } else {
      stryCov_9fa48("51717");
      return stryMutAct_9fa48("51718") ? [] : (stryCov_9fa48("51718"), [stryMutAct_9fa48("51719") ? {} : (stryCov_9fa48("51719"), {
        key: stryMutAct_9fa48("51720") ? "" : (stryCov_9fa48("51720"), 'short_name'),
        label: stryMutAct_9fa48("51721") ? "" : (stryCov_9fa48("51721"), 'Name'),
        width: 15
      }), stryMutAct_9fa48("51722") ? {} : (stryCov_9fa48("51722"), {
        key: stryMutAct_9fa48("51723") ? "" : (stryCov_9fa48("51723"), 'unified_address'),
        label: stryMutAct_9fa48("51724") ? "" : (stryCov_9fa48("51724"), 'Unified Address'),
        width: 35
      }), stryMutAct_9fa48("51725") ? {} : (stryCov_9fa48("51725"), {
        key: stryMutAct_9fa48("51726") ? "" : (stryCov_9fa48("51726"), 'node_address'),
        label: stryMutAct_9fa48("51727") ? "" : (stryCov_9fa48("51727"), 'Node Address'),
        width: 20
      }), stryMutAct_9fa48("51728") ? {} : (stryCov_9fa48("51728"), {
        key: stryMutAct_9fa48("51729") ? "" : (stryCov_9fa48("51729"), 'status'),
        label: stryMutAct_9fa48("51730") ? "" : (stryCov_9fa48("51730"), 'State'),
        width: 12
      })]);
    }
  }

  /**
   * Format a service record into a row array
   * Requirements: 3.2
   * @param {Object} service - Service record
   * @return {Array<string>} Row values
   */
  formatRow(service) {
    if (stryMutAct_9fa48("51731")) {
      {}
    } else {
      stryCov_9fa48("51731");
      return stryMutAct_9fa48("51732") ? [] : (stryCov_9fa48("51732"), [this.formatShortName(service), this.formatUnifiedAddress(service), this.formatNodeAddress(service), this.formatStatus(service)]);
    }
  }

  /**
   * Format node address for display
   * Shows the WebSocket address and port for the node
   * @param {Object} service - Service record
   * @return {string} Node address
   */
  formatNodeAddress(service) {
    if (stryMutAct_9fa48("51733")) {
      {}
    } else {
      stryCov_9fa48("51733");
      return stryMutAct_9fa48("51736") ? (service.node_address || service.address) && 'N/A' : stryMutAct_9fa48("51735") ? false : stryMutAct_9fa48("51734") ? true : (stryCov_9fa48("51734", "51735", "51736"), (stryMutAct_9fa48("51738") ? service.node_address && service.address : stryMutAct_9fa48("51737") ? false : (stryCov_9fa48("51737", "51738"), service.node_address || service.address)) || (stryMutAct_9fa48("51739") ? "" : (stryCov_9fa48("51739"), 'N/A')));
    }
  }

  /**
   * Format short name for display
   * Extracts a concise identifier from the service_id
   * @param {Object} service - Service record
   * @return {string} Short name
   */
  formatShortName(service) {
    if (stryMutAct_9fa48("51740")) {
      {}
    } else {
      stryCov_9fa48("51740");
      const serviceId = stryMutAct_9fa48("51743") ? service.service_id && '' : stryMutAct_9fa48("51742") ? false : stryMutAct_9fa48("51741") ? true : (stryCov_9fa48("51741", "51742", "51743"), service.service_id || (stryMutAct_9fa48("51744") ? "Stryker was here!" : (stryCov_9fa48("51744"), '')));
      const serviceType = stryMutAct_9fa48("51747") ? service.service_type && '' : stryMutAct_9fa48("51746") ? false : stryMutAct_9fa48("51745") ? true : (stryCov_9fa48("51745", "51746", "51747"), service.service_type || (stryMutAct_9fa48("51748") ? "Stryker was here!" : (stryCov_9fa48("51748"), '')));
      if (stryMutAct_9fa48("51751") ? false : stryMutAct_9fa48("51750") ? true : stryMutAct_9fa48("51749") ? serviceId : (stryCov_9fa48("51749", "51750", "51751"), !serviceId)) {
        if (stryMutAct_9fa48("51752")) {
          {}
        } else {
          stryCov_9fa48("51752");
          return stryMutAct_9fa48("51753") ? "" : (stryCov_9fa48("51753"), 'N/A');
        }
      }

      // Check if service_id is a UUID (8-4-4-4-12 format)
      const uuidPattern = stryMutAct_9fa48("51765") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[^0-9a-f]{12}$/i : stryMutAct_9fa48("51764") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]$/i : stryMutAct_9fa48("51763") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[^0-9a-f]{4}-[0-9a-f]{12}$/i : stryMutAct_9fa48("51762") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]-[0-9a-f]{12}$/i : stryMutAct_9fa48("51761") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[^0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i : stryMutAct_9fa48("51760") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]-[0-9a-f]{4}-[0-9a-f]{12}$/i : stryMutAct_9fa48("51759") ? /^[0-9a-f]{8}-[^0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i : stryMutAct_9fa48("51758") ? /^[0-9a-f]{8}-[0-9a-f]-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i : stryMutAct_9fa48("51757") ? /^[^0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i : stryMutAct_9fa48("51756") ? /^[0-9a-f]-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i : stryMutAct_9fa48("51755") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i : stryMutAct_9fa48("51754") ? /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i : (stryCov_9fa48("51754", "51755", "51756", "51757", "51758", "51759", "51760", "51761", "51762", "51763", "51764", "51765"), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      if (stryMutAct_9fa48("51767") ? false : stryMutAct_9fa48("51766") ? true : (stryCov_9fa48("51766", "51767"), uuidPattern.test(serviceId))) {
        if (stryMutAct_9fa48("51768")) {
          {}
        } else {
          stryCov_9fa48("51768");
          const prefix = (stryMutAct_9fa48("51771") ? serviceType !== 'partition' : stryMutAct_9fa48("51770") ? false : stryMutAct_9fa48("51769") ? true : (stryCov_9fa48("51769", "51770", "51771"), serviceType === (stryMutAct_9fa48("51772") ? "" : (stryCov_9fa48("51772"), 'partition')))) ? stryMutAct_9fa48("51773") ? "" : (stryCov_9fa48("51773"), 'p') : (stryMutAct_9fa48("51776") ? serviceType !== 'message_group' : stryMutAct_9fa48("51775") ? false : stryMutAct_9fa48("51774") ? true : (stryCov_9fa48("51774", "51775", "51776"), serviceType === (stryMutAct_9fa48("51777") ? "" : (stryCov_9fa48("51777"), 'message_group')))) ? stryMutAct_9fa48("51778") ? "" : (stryCov_9fa48("51778"), 'mg') : stryMutAct_9fa48("51779") ? "" : (stryCov_9fa48("51779"), 's');
          return stryMutAct_9fa48("51780") ? `` : (stryCov_9fa48("51780"), `${prefix}-${stryMutAct_9fa48("51781") ? serviceId : (stryCov_9fa48("51781"), serviceId.substring(0, 8))}`);
        }
      }

      // If it's already short, use as-is
      if (stryMutAct_9fa48("51785") ? serviceId.length > 20 : stryMutAct_9fa48("51784") ? serviceId.length < 20 : stryMutAct_9fa48("51783") ? false : stryMutAct_9fa48("51782") ? true : (stryCov_9fa48("51782", "51783", "51784", "51785"), serviceId.length <= 20)) {
        if (stryMutAct_9fa48("51786")) {
          {}
        } else {
          stryCov_9fa48("51786");
          return serviceId;
        }
      }

      // Truncate long names
      return (stryMutAct_9fa48("51787") ? serviceId : (stryCov_9fa48("51787"), serviceId.substring(0, 17))) + (stryMutAct_9fa48("51788") ? "" : (stryCov_9fa48("51788"), '...'));
    }
  }

  /**
   * Format unified address for display
   * Format: ${node_id}/${service_type}/${service_id}
   * @param {Object} service - Service record
   * @return {string} Unified address
   */
  formatUnifiedAddress(service) {
    if (stryMutAct_9fa48("51789")) {
      {}
    } else {
      stryCov_9fa48("51789");
      const nodeId = stryMutAct_9fa48("51792") ? service.node_id && 'unknown' : stryMutAct_9fa48("51791") ? false : stryMutAct_9fa48("51790") ? true : (stryCov_9fa48("51790", "51791", "51792"), service.node_id || (stryMutAct_9fa48("51793") ? "" : (stryCov_9fa48("51793"), 'unknown')));
      const serviceType = stryMutAct_9fa48("51796") ? service.service_type && 'unknown' : stryMutAct_9fa48("51795") ? false : stryMutAct_9fa48("51794") ? true : (stryCov_9fa48("51794", "51795", "51796"), service.service_type || (stryMutAct_9fa48("51797") ? "" : (stryCov_9fa48("51797"), 'unknown')));
      const serviceId = stryMutAct_9fa48("51800") ? service.service_id && 'unknown' : stryMutAct_9fa48("51799") ? false : stryMutAct_9fa48("51798") ? true : (stryCov_9fa48("51798", "51799", "51800"), service.service_id || (stryMutAct_9fa48("51801") ? "" : (stryCov_9fa48("51801"), 'unknown')));

      // Map service_type to entity type for address format
      const entityType = (stryMutAct_9fa48("51804") ? serviceType !== 'message_group' : stryMutAct_9fa48("51803") ? false : stryMutAct_9fa48("51802") ? true : (stryCov_9fa48("51802", "51803", "51804"), serviceType === (stryMutAct_9fa48("51805") ? "" : (stryCov_9fa48("51805"), 'message_group')))) ? stryMutAct_9fa48("51806") ? "" : (stryCov_9fa48("51806"), 'message-group') : serviceType;
      return stryMutAct_9fa48("51807") ? `` : (stryCov_9fa48("51807"), `${nodeId}/${entityType}/${serviceId}`);
    }
  }

  /**
   * Format service type for display
   * @param {string|null|undefined} type - Service type
   * @return {string} Formatted type
   */
  formatServiceType(type) {
    if (stryMutAct_9fa48("51808")) {
      {}
    } else {
      stryCov_9fa48("51808");
      if (stryMutAct_9fa48("51811") ? false : stryMutAct_9fa48("51810") ? true : stryMutAct_9fa48("51809") ? type : (stryCov_9fa48("51809", "51810", "51811"), !type)) return stryMutAct_9fa48("51812") ? "" : (stryCov_9fa48("51812"), 'N/A');
      const typeLabels = stryMutAct_9fa48("51813") ? {} : (stryCov_9fa48("51813"), {
        'partition': stryMutAct_9fa48("51814") ? "" : (stryCov_9fa48("51814"), 'Partition'),
        'message_group': stryMutAct_9fa48("51815") ? "" : (stryCov_9fa48("51815"), 'Message Group'),
        'node': stryMutAct_9fa48("51816") ? "" : (stryCov_9fa48("51816"), 'Node'),
        'runtime_service': stryMutAct_9fa48("51817") ? "" : (stryCov_9fa48("51817"), 'Runtime Service')
      });
      return stryMutAct_9fa48("51820") ? typeLabels[type] && type : stryMutAct_9fa48("51819") ? false : stryMutAct_9fa48("51818") ? true : (stryCov_9fa48("51818", "51819", "51820"), typeLabels[type] || type);
    }
  }

  /**
   * Format service status with role indicator and time-in-state
   * Requirements: 3.5, 8.2
   * @param {Object} service - Service record
   * @return {string} Formatted status with role and time-in-state
   */
  formatStatus(service) {
    if (stryMutAct_9fa48("51821")) {
      {}
    } else {
      stryCov_9fa48("51821");
      const status = stryMutAct_9fa48("51824") ? service.status && 'unknown' : stryMutAct_9fa48("51823") ? false : stryMutAct_9fa48("51822") ? true : (stryCov_9fa48("51822", "51823", "51824"), service.status || (stryMutAct_9fa48("51825") ? "" : (stryCov_9fa48("51825"), 'unknown')));
      const role = service.role;
      let result = status;

      // Add role indicator if present
      if (stryMutAct_9fa48("51828") ? role || role === 'leader' || role === 'follower' : stryMutAct_9fa48("51827") ? false : stryMutAct_9fa48("51826") ? true : (stryCov_9fa48("51826", "51827", "51828"), role && (stryMutAct_9fa48("51830") ? role === 'leader' && role === 'follower' : stryMutAct_9fa48("51829") ? true : (stryCov_9fa48("51829", "51830"), (stryMutAct_9fa48("51832") ? role !== 'leader' : stryMutAct_9fa48("51831") ? false : (stryCov_9fa48("51831", "51832"), role === (stryMutAct_9fa48("51833") ? "" : (stryCov_9fa48("51833"), 'leader')))) || (stryMutAct_9fa48("51835") ? role !== 'follower' : stryMutAct_9fa48("51834") ? false : (stryCov_9fa48("51834", "51835"), role === (stryMutAct_9fa48("51836") ? "" : (stryCov_9fa48("51836"), 'follower')))))))) {
        if (stryMutAct_9fa48("51837")) {
          {}
        } else {
          stryCov_9fa48("51837");
          result = stryMutAct_9fa48("51838") ? `` : (stryCov_9fa48("51838"), `${status} (${role})`);
        }
      }

      // Add time-in-state for transitional states
      if (stryMutAct_9fa48("51841") ? TRANSITIONAL_STATES.includes(status) || service.state_entered_at : stryMutAct_9fa48("51840") ? false : stryMutAct_9fa48("51839") ? true : (stryCov_9fa48("51839", "51840", "51841"), TRANSITIONAL_STATES.includes(status) && service.state_entered_at)) {
        if (stryMutAct_9fa48("51842")) {
          {}
        } else {
          stryCov_9fa48("51842");
          const timeInState = this.formatTimeInState(service.state_entered_at);
          result = stryMutAct_9fa48("51843") ? `` : (stryCov_9fa48("51843"), `${result} [${timeInState}]`);
        }
      }
      return result;
    }
  }

  /**
   * Format time-in-state for display
   * Requirements: 8.2
   * @param {number} stateEnteredAt - Timestamp when state was entered
   * @return {string} Formatted duration (e.g., "5s", "2m", "1h")
   */
  formatTimeInState(stateEnteredAt) {
    if (stryMutAct_9fa48("51844")) {
      {}
    } else {
      stryCov_9fa48("51844");
      if (stryMutAct_9fa48("51847") ? false : stryMutAct_9fa48("51846") ? true : stryMutAct_9fa48("51845") ? stateEnteredAt : (stryCov_9fa48("51845", "51846", "51847"), !stateEnteredAt)) {
        if (stryMutAct_9fa48("51848")) {
          {}
        } else {
          stryCov_9fa48("51848");
          return stryMutAct_9fa48("51849") ? "" : (stryCov_9fa48("51849"), 'N/A');
        }
      }
      const now = Date.now();
      const elapsed = stryMutAct_9fa48("51850") ? now + stateEnteredAt : (stryCov_9fa48("51850"), now - stateEnteredAt);
      if (stryMutAct_9fa48("51854") ? elapsed >= 0 : stryMutAct_9fa48("51853") ? elapsed <= 0 : stryMutAct_9fa48("51852") ? false : stryMutAct_9fa48("51851") ? true : (stryCov_9fa48("51851", "51852", "51853", "51854"), elapsed < 0)) {
        if (stryMutAct_9fa48("51855")) {
          {}
        } else {
          stryCov_9fa48("51855");
          return stryMutAct_9fa48("51856") ? "" : (stryCov_9fa48("51856"), '0s');
        }
      }
      const seconds = Math.floor(stryMutAct_9fa48("51857") ? elapsed * 1000 : (stryCov_9fa48("51857"), elapsed / 1000));
      const minutes = Math.floor(stryMutAct_9fa48("51858") ? seconds * 60 : (stryCov_9fa48("51858"), seconds / 60));
      const hours = Math.floor(stryMutAct_9fa48("51859") ? minutes * 60 : (stryCov_9fa48("51859"), minutes / 60));
      if (stryMutAct_9fa48("51863") ? hours <= 0 : stryMutAct_9fa48("51862") ? hours >= 0 : stryMutAct_9fa48("51861") ? false : stryMutAct_9fa48("51860") ? true : (stryCov_9fa48("51860", "51861", "51862", "51863"), hours > 0)) {
        if (stryMutAct_9fa48("51864")) {
          {}
        } else {
          stryCov_9fa48("51864");
          return stryMutAct_9fa48("51865") ? `` : (stryCov_9fa48("51865"), `${hours}h ${stryMutAct_9fa48("51866") ? minutes * 60 : (stryCov_9fa48("51866"), minutes % 60)}m`);
        }
      } else if (stryMutAct_9fa48("51870") ? minutes <= 0 : stryMutAct_9fa48("51869") ? minutes >= 0 : stryMutAct_9fa48("51868") ? false : stryMutAct_9fa48("51867") ? true : (stryCov_9fa48("51867", "51868", "51869", "51870"), minutes > 0)) {
        if (stryMutAct_9fa48("51871")) {
          {}
        } else {
          stryCov_9fa48("51871");
          return stryMutAct_9fa48("51872") ? `` : (stryCov_9fa48("51872"), `${minutes}m ${stryMutAct_9fa48("51873") ? seconds * 60 : (stryCov_9fa48("51873"), seconds % 60)}s`);
        }
      } else {
        if (stryMutAct_9fa48("51874")) {
          {}
        } else {
          stryCov_9fa48("51874");
          return stryMutAct_9fa48("51875") ? `` : (stryCov_9fa48("51875"), `${seconds}s`);
        }
      }
    }
  }

  /**
   * Get the color for a replica state
   * Requirements: 8.1
   * @param {string} status - Service status
   * @return {string} Color name for the status
   */
  getStatusColor(status) {
    if (stryMutAct_9fa48("51876")) {
      {}
    } else {
      stryCov_9fa48("51876");
      return stryMutAct_9fa48("51879") ? REPLICA_STATE_COLORS[status] && 'white' : stryMutAct_9fa48("51878") ? false : stryMutAct_9fa48("51877") ? true : (stryCov_9fa48("51877", "51878", "51879"), REPLICA_STATE_COLORS[status] || (stryMutAct_9fa48("51880") ? "" : (stryCov_9fa48("51880"), 'white')));
    }
  }

  /**
   * Get the row status for styling based on replica state
   * Requirements: 8.1
   * @param {Object} service - Service record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(service) {
    if (stryMutAct_9fa48("51881")) {
      {}
    } else {
      stryCov_9fa48("51881");
      const status = service.status;

      // Failed state gets error styling (red)
      if (stryMutAct_9fa48("51884") ? status === 'failed' && status === 'error' : stryMutAct_9fa48("51883") ? false : stryMutAct_9fa48("51882") ? true : (stryCov_9fa48("51882", "51883", "51884"), (stryMutAct_9fa48("51886") ? status !== 'failed' : stryMutAct_9fa48("51885") ? false : (stryCov_9fa48("51885", "51886"), status === (stryMutAct_9fa48("51887") ? "" : (stryCov_9fa48("51887"), 'failed')))) || (stryMutAct_9fa48("51889") ? status !== 'error' : stryMutAct_9fa48("51888") ? false : (stryCov_9fa48("51888", "51889"), status === (stryMutAct_9fa48("51890") ? "" : (stryCov_9fa48("51890"), 'error')))))) {
        if (stryMutAct_9fa48("51891")) {
          {}
        } else {
          stryCov_9fa48("51891");
          return ROW_STATUS.ERROR;
        }
      }

      // Transitional states get warning styling (yellow/blue)
      if (stryMutAct_9fa48("51893") ? false : stryMutAct_9fa48("51892") ? true : (stryCov_9fa48("51892", "51893"), TRANSITIONAL_STATES.includes(status))) {
        if (stryMutAct_9fa48("51894")) {
          {}
        } else {
          stryCov_9fa48("51894");
          return ROW_STATUS.WARNING;
        }
      }

      // Starting/stopping also get warning
      if (stryMutAct_9fa48("51897") ? status === 'starting' && status === 'stopping' : stryMutAct_9fa48("51896") ? false : stryMutAct_9fa48("51895") ? true : (stryCov_9fa48("51895", "51896", "51897"), (stryMutAct_9fa48("51899") ? status !== 'starting' : stryMutAct_9fa48("51898") ? false : (stryCov_9fa48("51898", "51899"), status === (stryMutAct_9fa48("51900") ? "" : (stryCov_9fa48("51900"), 'starting')))) || (stryMutAct_9fa48("51902") ? status !== 'stopping' : stryMutAct_9fa48("51901") ? false : (stryCov_9fa48("51901", "51902"), status === (stryMutAct_9fa48("51903") ? "" : (stryCov_9fa48("51903"), 'stopping')))))) {
        if (stryMutAct_9fa48("51904")) {
          {}
        } else {
          stryCov_9fa48("51904");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Get the unique key for a service
   * @param {Object} service - Service record
   * @return {string} Unique key (service_id)
   */
  getItemKey(service) {
    if (stryMutAct_9fa48("51905")) {
      {}
    } else {
      stryCov_9fa48("51905");
      return stryMutAct_9fa48("51908") ? (service.row_key || service.service_id) && '' : stryMutAct_9fa48("51907") ? false : stryMutAct_9fa48("51906") ? true : (stryCov_9fa48("51906", "51907", "51908"), (stryMutAct_9fa48("51910") ? service.row_key && service.service_id : stryMutAct_9fa48("51909") ? false : (stryCov_9fa48("51909", "51910"), service.row_key || service.service_id)) || (stryMutAct_9fa48("51911") ? "Stryker was here!" : (stryCov_9fa48("51911"), '')));
    }
  }

  /**
   * Set node filter for viewing services on a specific node
   * Requirements: 3.1
   * @param {string|null} nodeId - Node ID to filter by
   */
  setNodeFilter(nodeId) {
    if (stryMutAct_9fa48("51912")) {
      {}
    } else {
      stryCov_9fa48("51912");
      this.nodeFilter = nodeId;
      this.updateFilteredData();
    }
  }

  /**
   * Set type filter for viewing services of a specific type
   * Requirements: 3.6
   * @param {string|null} type - Service type to filter by
   */
  setTypeFilter(type) {
    if (stryMutAct_9fa48("51913")) {
      {}
    } else {
      stryCov_9fa48("51913");
      this.typeFilter = type;
      this.updateFilteredData();
    }
  }

  /**
   * Clear all service-specific filters
   */
  clearServiceFilters() {
    if (stryMutAct_9fa48("51914")) {
      {}
    } else {
      stryCov_9fa48("51914");
      this.nodeFilter = null;
      this.typeFilter = null;
      this.serviceIdFilter = null;
      this.updateFilteredData();
    }
  }

  /**
   * Set service ID filter for showing replicas of one logical service.
   * @param {string|null} serviceId - Logical service ID to filter by.
   */
  setServiceIdFilter(serviceId) {
    if (stryMutAct_9fa48("51915")) {
      {}
    } else {
      stryCov_9fa48("51915");
      this.serviceIdFilter = stryMutAct_9fa48("51918") ? serviceId && null : stryMutAct_9fa48("51917") ? false : stryMutAct_9fa48("51916") ? true : (stryCov_9fa48("51916", "51917", "51918"), serviceId || null);
      this.updateFilteredData();
    }
  }

  /**
   * Override applyFilter to include node and type filters
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    if (stryMutAct_9fa48("51919")) {
      {}
    } else {
      stryCov_9fa48("51919");
      let filtered = data;

      // Apply node filter
      if (stryMutAct_9fa48("51921") ? false : stryMutAct_9fa48("51920") ? true : (stryCov_9fa48("51920", "51921"), this.nodeFilter)) {
        if (stryMutAct_9fa48("51922")) {
          {}
        } else {
          stryCov_9fa48("51922");
          filtered = stryMutAct_9fa48("51923") ? filtered : (stryCov_9fa48("51923"), filtered.filter(stryMutAct_9fa48("51924") ? () => undefined : (stryCov_9fa48("51924"), s => stryMutAct_9fa48("51927") ? s.node_id !== this.nodeFilter : stryMutAct_9fa48("51926") ? false : stryMutAct_9fa48("51925") ? true : (stryCov_9fa48("51925", "51926", "51927"), s.node_id === this.nodeFilter))));
        }
      }

      // Apply type filter
      if (stryMutAct_9fa48("51929") ? false : stryMutAct_9fa48("51928") ? true : (stryCov_9fa48("51928", "51929"), this.typeFilter)) {
        if (stryMutAct_9fa48("51930")) {
          {}
        } else {
          stryCov_9fa48("51930");
          filtered = stryMutAct_9fa48("51931") ? filtered : (stryCov_9fa48("51931"), filtered.filter(stryMutAct_9fa48("51932") ? () => undefined : (stryCov_9fa48("51932"), s => stryMutAct_9fa48("51935") ? s.service_type !== this.typeFilter : stryMutAct_9fa48("51934") ? false : stryMutAct_9fa48("51933") ? true : (stryCov_9fa48("51933", "51934", "51935"), s.service_type === this.typeFilter))));
        }
      }

      // Apply logical service filter (runtime replicas).
      if (stryMutAct_9fa48("51937") ? false : stryMutAct_9fa48("51936") ? true : (stryCov_9fa48("51936", "51937"), this.serviceIdFilter)) {
        if (stryMutAct_9fa48("51938")) {
          {}
        } else {
          stryCov_9fa48("51938");
          filtered = stryMutAct_9fa48("51939") ? filtered : (stryCov_9fa48("51939"), filtered.filter(s => {
            if (stryMutAct_9fa48("51940")) {
              {}
            } else {
              stryCov_9fa48("51940");
              return stryMutAct_9fa48("51943") ? s.service_id === this.serviceIdFilter && s.logical_service_id === this.serviceIdFilter : stryMutAct_9fa48("51942") ? false : stryMutAct_9fa48("51941") ? true : (stryCov_9fa48("51941", "51942", "51943"), (stryMutAct_9fa48("51945") ? s.service_id !== this.serviceIdFilter : stryMutAct_9fa48("51944") ? false : (stryCov_9fa48("51944", "51945"), s.service_id === this.serviceIdFilter)) || (stryMutAct_9fa48("51947") ? s.logical_service_id !== this.serviceIdFilter : stryMutAct_9fa48("51946") ? false : (stryCov_9fa48("51946", "51947"), s.logical_service_id === this.serviceIdFilter)));
            }
          }));
        }
      }

      // Apply text filter from base class
      return super.applyFilter(filtered);
    }
  }

  /**
   * Handle drill-down action (Enter key on selected service)
   * Requirements: 3.3, 3.4
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("51948")) {
      {}
    } else {
      stryCov_9fa48("51948");
      const selectedService = this.getSelectedItem();
      if (stryMutAct_9fa48("51951") ? false : stryMutAct_9fa48("51950") ? true : stryMutAct_9fa48("51949") ? selectedService : (stryCov_9fa48("51949", "51950", "51951"), !selectedService)) {
        if (stryMutAct_9fa48("51952")) {
          {}
        } else {
          stryCov_9fa48("51952");
          return null;
        }
      }
      const serviceType = selectedService.service_type;
      if (stryMutAct_9fa48("51955") ? serviceType !== SERVICE_TYPES.PARTITION : stryMutAct_9fa48("51954") ? false : stryMutAct_9fa48("51953") ? true : (stryCov_9fa48("51953", "51954", "51955"), serviceType === SERVICE_TYPES.PARTITION)) {
        if (stryMutAct_9fa48("51956")) {
          {}
        } else {
          stryCov_9fa48("51956");
          return stryMutAct_9fa48("51957") ? {} : (stryCov_9fa48("51957"), {
            action: stryMutAct_9fa48("51958") ? "" : (stryCov_9fa48("51958"), 'drillDown'),
            view: stryMutAct_9fa48("51959") ? "" : (stryCov_9fa48("51959"), 'partitions'),
            context: stryMutAct_9fa48("51960") ? {} : (stryCov_9fa48("51960"), {
              partitionId: selectedService.partition_id,
              serviceId: selectedService.service_id
            })
          });
        }
      }
      if (stryMutAct_9fa48("51963") ? serviceType !== SERVICE_TYPES.MESSAGE_GROUP : stryMutAct_9fa48("51962") ? false : stryMutAct_9fa48("51961") ? true : (stryCov_9fa48("51961", "51962", "51963"), serviceType === SERVICE_TYPES.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("51964")) {
          {}
        } else {
          stryCov_9fa48("51964");
          return stryMutAct_9fa48("51965") ? {} : (stryCov_9fa48("51965"), {
            action: stryMutAct_9fa48("51966") ? "" : (stryCov_9fa48("51966"), 'drillDown'),
            view: stryMutAct_9fa48("51967") ? "" : (stryCov_9fa48("51967"), 'message_groups'),
            context: stryMutAct_9fa48("51968") ? {} : (stryCov_9fa48("51968"), {
              groupId: selectedService.group_id,
              serviceId: selectedService.service_id
            })
          });
        }
      }

      // For node services, show node details
      if (stryMutAct_9fa48("51971") ? serviceType !== SERVICE_TYPES.NODE : stryMutAct_9fa48("51970") ? false : stryMutAct_9fa48("51969") ? true : (stryCov_9fa48("51969", "51970", "51971"), serviceType === SERVICE_TYPES.NODE)) {
        if (stryMutAct_9fa48("51972")) {
          {}
        } else {
          stryCov_9fa48("51972");
          return stryMutAct_9fa48("51973") ? {} : (stryCov_9fa48("51973"), {
            action: stryMutAct_9fa48("51974") ? "" : (stryCov_9fa48("51974"), 'drillDown'),
            view: stryMutAct_9fa48("51975") ? "" : (stryCov_9fa48("51975"), 'nodes'),
            context: stryMutAct_9fa48("51976") ? {} : (stryCov_9fa48("51976"), {
              nodeId: selectedService.node_id
            })
          });
        }
      }
      return null;
    }
  }

  /**
   * Handle key input for the services view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (stryMutAct_9fa48("51977")) {
      {}
    } else {
      stryCov_9fa48("51977");
      if (stryMutAct_9fa48("51980") ? key.name === 'enter' && key.name === 'return' : stryMutAct_9fa48("51979") ? false : stryMutAct_9fa48("51978") ? true : (stryCov_9fa48("51978", "51979", "51980"), (stryMutAct_9fa48("51982") ? key.name !== 'enter' : stryMutAct_9fa48("51981") ? false : (stryCov_9fa48("51981", "51982"), key.name === (stryMutAct_9fa48("51983") ? "" : (stryCov_9fa48("51983"), 'enter')))) || (stryMutAct_9fa48("51985") ? key.name !== 'return' : stryMutAct_9fa48("51984") ? false : (stryCov_9fa48("51984", "51985"), key.name === (stryMutAct_9fa48("51986") ? "" : (stryCov_9fa48("51986"), 'return')))))) {
        if (stryMutAct_9fa48("51987")) {
          {}
        } else {
          stryCov_9fa48("51987");
          return this.handleDrillDown();
        }
      }
      return super.handleKey(key);
    }
  }

  /**
   * Get detail information for the selected service
   * Requirements: 3.7, 3.8, 8.2, 8.3
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("51988")) {
      {}
    } else {
      stryCov_9fa48("51988");
      const service = this.getSelectedItem();
      if (stryMutAct_9fa48("51991") ? false : stryMutAct_9fa48("51990") ? true : stryMutAct_9fa48("51989") ? service : (stryCov_9fa48("51989", "51990", "51991"), !service)) {
        if (stryMutAct_9fa48("51992")) {
          {}
        } else {
          stryCov_9fa48("51992");
          return null;
        }
      }
      const unifiedAddress = this.formatUnifiedAddress(service);
      const shortName = this.formatShortName(service);
      const sections = stryMutAct_9fa48("51993") ? [] : (stryCov_9fa48("51993"), [stryMutAct_9fa48("51994") ? {} : (stryCov_9fa48("51994"), {
        title: stryMutAct_9fa48("51995") ? "" : (stryCov_9fa48("51995"), 'Basic Information'),
        fields: stryMutAct_9fa48("51996") ? [] : (stryCov_9fa48("51996"), [stryMutAct_9fa48("51997") ? {} : (stryCov_9fa48("51997"), {
          label: stryMutAct_9fa48("51998") ? "" : (stryCov_9fa48("51998"), 'Short Name'),
          value: shortName
        }), stryMutAct_9fa48("51999") ? {} : (stryCov_9fa48("51999"), {
          label: stryMutAct_9fa48("52000") ? "" : (stryCov_9fa48("52000"), 'Unified Address'),
          value: unifiedAddress
        }), stryMutAct_9fa48("52001") ? {} : (stryCov_9fa48("52001"), {
          label: stryMutAct_9fa48("52002") ? "" : (stryCov_9fa48("52002"), 'Service ID'),
          value: service.service_id
        }), stryMutAct_9fa48("52003") ? {} : (stryCov_9fa48("52003"), {
          label: stryMutAct_9fa48("52004") ? "" : (stryCov_9fa48("52004"), 'Type'),
          value: this.formatServiceType(service.service_type)
        }), stryMutAct_9fa48("52005") ? {} : (stryCov_9fa48("52005"), {
          label: stryMutAct_9fa48("52006") ? "" : (stryCov_9fa48("52006"), 'Node ID'),
          value: service.node_id
        })])
      })]);

      // Add replica state section - always show for services
      const replicaStateFields = stryMutAct_9fa48("52007") ? [] : (stryCov_9fa48("52007"), [stryMutAct_9fa48("52008") ? {} : (stryCov_9fa48("52008"), {
        label: stryMutAct_9fa48("52009") ? "" : (stryCov_9fa48("52009"), 'Current State'),
        value: stryMutAct_9fa48("52012") ? service.status && 'unknown' : stryMutAct_9fa48("52011") ? false : stryMutAct_9fa48("52010") ? true : (stryCov_9fa48("52010", "52011", "52012"), service.status || (stryMutAct_9fa48("52013") ? "" : (stryCov_9fa48("52013"), 'unknown')))
      }), stryMutAct_9fa48("52014") ? {} : (stryCov_9fa48("52014"), {
        label: stryMutAct_9fa48("52015") ? "" : (stryCov_9fa48("52015"), 'Role'),
        value: stryMutAct_9fa48("52018") ? service.role && 'N/A' : stryMutAct_9fa48("52017") ? false : stryMutAct_9fa48("52016") ? true : (stryCov_9fa48("52016", "52017", "52018"), service.role || (stryMutAct_9fa48("52019") ? "" : (stryCov_9fa48("52019"), 'N/A')))
      })]);

      // Add time-in-state for transitional states
      if (stryMutAct_9fa48("52022") ? TRANSITIONAL_STATES.includes(service.status) || service.state_entered_at : stryMutAct_9fa48("52021") ? false : stryMutAct_9fa48("52020") ? true : (stryCov_9fa48("52020", "52021", "52022"), TRANSITIONAL_STATES.includes(service.status) && service.state_entered_at)) {
        if (stryMutAct_9fa48("52023")) {
          {}
        } else {
          stryCov_9fa48("52023");
          replicaStateFields.push(stryMutAct_9fa48("52024") ? {} : (stryCov_9fa48("52024"), {
            label: stryMutAct_9fa48("52025") ? "" : (stryCov_9fa48("52025"), 'Time in State'),
            value: this.formatTimeInState(service.state_entered_at)
          }));
        }
      }

      // Add state entered timestamp
      if (stryMutAct_9fa48("52027") ? false : stryMutAct_9fa48("52026") ? true : (stryCov_9fa48("52026", "52027"), service.state_entered_at)) {
        if (stryMutAct_9fa48("52028")) {
          {}
        } else {
          stryCov_9fa48("52028");
          replicaStateFields.push(stryMutAct_9fa48("52029") ? {} : (stryCov_9fa48("52029"), {
            label: stryMutAct_9fa48("52030") ? "" : (stryCov_9fa48("52030"), 'State Since'),
            value: this.formatTimestamp(service.state_entered_at)
          }));
        }
      }

      // Add previous state if available
      if (stryMutAct_9fa48("52032") ? false : stryMutAct_9fa48("52031") ? true : (stryCov_9fa48("52031", "52032"), service.previous_state)) {
        if (stryMutAct_9fa48("52033")) {
          {}
        } else {
          stryCov_9fa48("52033");
          replicaStateFields.push(stryMutAct_9fa48("52034") ? {} : (stryCov_9fa48("52034"), {
            label: stryMutAct_9fa48("52035") ? "" : (stryCov_9fa48("52035"), 'Previous State'),
            value: service.previous_state
          }));
        }
      }

      // Add trigger reason if available
      if (stryMutAct_9fa48("52037") ? false : stryMutAct_9fa48("52036") ? true : (stryCov_9fa48("52036", "52037"), service.trigger_reason)) {
        if (stryMutAct_9fa48("52038")) {
          {}
        } else {
          stryCov_9fa48("52038");
          replicaStateFields.push(stryMutAct_9fa48("52039") ? {} : (stryCov_9fa48("52039"), {
            label: stryMutAct_9fa48("52040") ? "" : (stryCov_9fa48("52040"), 'Trigger Reason'),
            value: service.trigger_reason
          }));
        }
      }

      // Add failure reason for failed replicas (Requirement 8.3)
      if (stryMutAct_9fa48("52043") ? service.status === 'failed' || service.status === 'error' || service.error_message : stryMutAct_9fa48("52042") ? false : stryMutAct_9fa48("52041") ? true : (stryCov_9fa48("52041", "52042", "52043"), (stryMutAct_9fa48("52045") ? service.status === 'failed' && service.status === 'error' : stryMutAct_9fa48("52044") ? true : (stryCov_9fa48("52044", "52045"), (stryMutAct_9fa48("52047") ? service.status !== 'failed' : stryMutAct_9fa48("52046") ? false : (stryCov_9fa48("52046", "52047"), service.status === (stryMutAct_9fa48("52048") ? "" : (stryCov_9fa48("52048"), 'failed')))) || (stryMutAct_9fa48("52050") ? service.status !== 'error' : stryMutAct_9fa48("52049") ? false : (stryCov_9fa48("52049", "52050"), service.status === (stryMutAct_9fa48("52051") ? "" : (stryCov_9fa48("52051"), 'error')))))) && service.error_message)) {
        if (stryMutAct_9fa48("52052")) {
          {}
        } else {
          stryCov_9fa48("52052");
          replicaStateFields.push(stryMutAct_9fa48("52053") ? {} : (stryCov_9fa48("52053"), {
            label: stryMutAct_9fa48("52054") ? "" : (stryCov_9fa48("52054"), 'Failure Reason'),
            value: service.error_message
          }));
        }
      }
      sections.push(stryMutAct_9fa48("52055") ? {} : (stryCov_9fa48("52055"), {
        title: stryMutAct_9fa48("52056") ? "" : (stryCov_9fa48("52056"), 'Replica State'),
        fields: replicaStateFields
      }));

      // Add sync progress section for syncing replicas
      if (stryMutAct_9fa48("52059") ? service.status === REPLICA_STATES.SYNCING && service.sync_progress : stryMutAct_9fa48("52058") ? false : stryMutAct_9fa48("52057") ? true : (stryCov_9fa48("52057", "52058", "52059"), (stryMutAct_9fa48("52061") ? service.status !== REPLICA_STATES.SYNCING : stryMutAct_9fa48("52060") ? false : (stryCov_9fa48("52060", "52061"), service.status === REPLICA_STATES.SYNCING)) || service.sync_progress)) {
        if (stryMutAct_9fa48("52062")) {
          {}
        } else {
          stryCov_9fa48("52062");
          const syncFields = stryMutAct_9fa48("52063") ? ["Stryker was here"] : (stryCov_9fa48("52063"), []);
          if (stryMutAct_9fa48("52066") ? service.sync_progress === undefined : stryMutAct_9fa48("52065") ? false : stryMutAct_9fa48("52064") ? true : (stryCov_9fa48("52064", "52065", "52066"), service.sync_progress !== undefined)) {
            if (stryMutAct_9fa48("52067")) {
              {}
            } else {
              stryCov_9fa48("52067");
              syncFields.push(stryMutAct_9fa48("52068") ? {} : (stryCov_9fa48("52068"), {
                label: stryMutAct_9fa48("52069") ? "" : (stryCov_9fa48("52069"), 'Sync Progress'),
                value: stryMutAct_9fa48("52070") ? `` : (stryCov_9fa48("52070"), `${(stryMutAct_9fa48("52071") ? service.sync_progress / 100 : (stryCov_9fa48("52071"), service.sync_progress * 100)).toFixed(1)}%`)
              }));
            }
          }
          if (stryMutAct_9fa48("52073") ? false : stryMutAct_9fa48("52072") ? true : (stryCov_9fa48("52072", "52073"), service.sync_source_node)) {
            if (stryMutAct_9fa48("52074")) {
              {}
            } else {
              stryCov_9fa48("52074");
              syncFields.push(stryMutAct_9fa48("52075") ? {} : (stryCov_9fa48("52075"), {
                label: stryMutAct_9fa48("52076") ? "" : (stryCov_9fa48("52076"), 'Sync Source'),
                value: service.sync_source_node
              }));
            }
          }
          if (stryMutAct_9fa48("52079") ? service.bytes_synced === undefined : stryMutAct_9fa48("52078") ? false : stryMutAct_9fa48("52077") ? true : (stryCov_9fa48("52077", "52078", "52079"), service.bytes_synced !== undefined)) {
            if (stryMutAct_9fa48("52080")) {
              {}
            } else {
              stryCov_9fa48("52080");
              syncFields.push(stryMutAct_9fa48("52081") ? {} : (stryCov_9fa48("52081"), {
                label: stryMutAct_9fa48("52082") ? "" : (stryCov_9fa48("52082"), 'Bytes Synced'),
                value: this.formatBytes(service.bytes_synced)
              }));
            }
          }
          if (stryMutAct_9fa48("52085") ? service.bytes_total === undefined : stryMutAct_9fa48("52084") ? false : stryMutAct_9fa48("52083") ? true : (stryCov_9fa48("52083", "52084", "52085"), service.bytes_total !== undefined)) {
            if (stryMutAct_9fa48("52086")) {
              {}
            } else {
              stryCov_9fa48("52086");
              syncFields.push(stryMutAct_9fa48("52087") ? {} : (stryCov_9fa48("52087"), {
                label: stryMutAct_9fa48("52088") ? "" : (stryCov_9fa48("52088"), 'Total Bytes'),
                value: this.formatBytes(service.bytes_total)
              }));
            }
          }
          if (stryMutAct_9fa48("52091") ? service.sync_rate_bytes_per_sec === undefined : stryMutAct_9fa48("52090") ? false : stryMutAct_9fa48("52089") ? true : (stryCov_9fa48("52089", "52090", "52091"), service.sync_rate_bytes_per_sec !== undefined)) {
            if (stryMutAct_9fa48("52092")) {
              {}
            } else {
              stryCov_9fa48("52092");
              syncFields.push(stryMutAct_9fa48("52093") ? {} : (stryCov_9fa48("52093"), {
                label: stryMutAct_9fa48("52094") ? "" : (stryCov_9fa48("52094"), 'Sync Rate'),
                value: stryMutAct_9fa48("52095") ? `` : (stryCov_9fa48("52095"), `${this.formatBytes(service.sync_rate_bytes_per_sec)}/s`)
              }));
            }
          }
          if (stryMutAct_9fa48("52097") ? false : stryMutAct_9fa48("52096") ? true : (stryCov_9fa48("52096", "52097"), service.estimated_completion)) {
            if (stryMutAct_9fa48("52098")) {
              {}
            } else {
              stryCov_9fa48("52098");
              syncFields.push(stryMutAct_9fa48("52099") ? {} : (stryCov_9fa48("52099"), {
                label: stryMutAct_9fa48("52100") ? "" : (stryCov_9fa48("52100"), 'Est. Completion'),
                value: this.formatTimestamp(service.estimated_completion)
              }));
            }
          }
          if (stryMutAct_9fa48("52104") ? syncFields.length <= 0 : stryMutAct_9fa48("52103") ? syncFields.length >= 0 : stryMutAct_9fa48("52102") ? false : stryMutAct_9fa48("52101") ? true : (stryCov_9fa48("52101", "52102", "52103", "52104"), syncFields.length > 0)) {
            if (stryMutAct_9fa48("52105")) {
              {}
            } else {
              stryCov_9fa48("52105");
              sections.push(stryMutAct_9fa48("52106") ? {} : (stryCov_9fa48("52106"), {
                title: stryMutAct_9fa48("52107") ? "" : (stryCov_9fa48("52107"), 'Sync Progress'),
                fields: syncFields
              }));
            }
          }
        }
      }

      // Add Raft state section if available
      if (stryMutAct_9fa48("52110") ? service.raft_term !== undefined && service.raft_commit_index !== undefined : stryMutAct_9fa48("52109") ? false : stryMutAct_9fa48("52108") ? true : (stryCov_9fa48("52108", "52109", "52110"), (stryMutAct_9fa48("52112") ? service.raft_term === undefined : stryMutAct_9fa48("52111") ? false : (stryCov_9fa48("52111", "52112"), service.raft_term !== undefined)) || (stryMutAct_9fa48("52114") ? service.raft_commit_index === undefined : stryMutAct_9fa48("52113") ? false : (stryCov_9fa48("52113", "52114"), service.raft_commit_index !== undefined)))) {
        if (stryMutAct_9fa48("52115")) {
          {}
        } else {
          stryCov_9fa48("52115");
          sections.push(stryMutAct_9fa48("52116") ? {} : (stryCov_9fa48("52116"), {
            title: stryMutAct_9fa48("52117") ? "" : (stryCov_9fa48("52117"), 'Raft State'),
            fields: stryMutAct_9fa48("52118") ? [] : (stryCov_9fa48("52118"), [stryMutAct_9fa48("52119") ? {} : (stryCov_9fa48("52119"), {
              label: stryMutAct_9fa48("52120") ? "" : (stryCov_9fa48("52120"), 'Term'),
              value: String(stryMutAct_9fa48("52121") ? service.raft_term && 'N/A' : (stryCov_9fa48("52121"), service.raft_term ?? (stryMutAct_9fa48("52122") ? "" : (stryCov_9fa48("52122"), 'N/A'))))
            }), stryMutAct_9fa48("52123") ? {} : (stryCov_9fa48("52123"), {
              label: stryMutAct_9fa48("52124") ? "" : (stryCov_9fa48("52124"), 'Commit Index'),
              value: String(stryMutAct_9fa48("52125") ? service.raft_commit_index && 'N/A' : (stryCov_9fa48("52125"), service.raft_commit_index ?? (stryMutAct_9fa48("52126") ? "" : (stryCov_9fa48("52126"), 'N/A'))))
            }), stryMutAct_9fa48("52127") ? {} : (stryCov_9fa48("52127"), {
              label: stryMutAct_9fa48("52128") ? "" : (stryCov_9fa48("52128"), 'Applied Index'),
              value: String(stryMutAct_9fa48("52129") ? service.raft_applied_index && 'N/A' : (stryCov_9fa48("52129"), service.raft_applied_index ?? (stryMutAct_9fa48("52130") ? "" : (stryCov_9fa48("52130"), 'N/A'))))
            }), stryMutAct_9fa48("52131") ? {} : (stryCov_9fa48("52131"), {
              label: stryMutAct_9fa48("52132") ? "" : (stryCov_9fa48("52132"), 'Last Log Index'),
              value: String(stryMutAct_9fa48("52133") ? service.raft_last_log_index && 'N/A' : (stryCov_9fa48("52133"), service.raft_last_log_index ?? (stryMutAct_9fa48("52134") ? "" : (stryCov_9fa48("52134"), 'N/A'))))
            }), stryMutAct_9fa48("52135") ? {} : (stryCov_9fa48("52135"), {
              label: stryMutAct_9fa48("52136") ? "" : (stryCov_9fa48("52136"), 'Leader ID'),
              value: stryMutAct_9fa48("52139") ? service.raft_leader_id && 'N/A' : stryMutAct_9fa48("52138") ? false : stryMutAct_9fa48("52137") ? true : (stryCov_9fa48("52137", "52138", "52139"), service.raft_leader_id || (stryMutAct_9fa48("52140") ? "" : (stryCov_9fa48("52140"), 'N/A')))
            })])
          }));
        }
      }

      // Add storage info for partition services
      if (stryMutAct_9fa48("52143") ? service.service_type !== SERVICE_TYPES.PARTITION : stryMutAct_9fa48("52142") ? false : stryMutAct_9fa48("52141") ? true : (stryCov_9fa48("52141", "52142", "52143"), service.service_type === SERVICE_TYPES.PARTITION)) {
        if (stryMutAct_9fa48("52144")) {
          {}
        } else {
          stryCov_9fa48("52144");
          sections.push(stryMutAct_9fa48("52145") ? {} : (stryCov_9fa48("52145"), {
            title: stryMutAct_9fa48("52146") ? "" : (stryCov_9fa48("52146"), 'Partition Details'),
            fields: stryMutAct_9fa48("52147") ? [] : (stryCov_9fa48("52147"), [stryMutAct_9fa48("52148") ? {} : (stryCov_9fa48("52148"), {
              label: stryMutAct_9fa48("52149") ? "" : (stryCov_9fa48("52149"), 'Partition ID'),
              value: stryMutAct_9fa48("52152") ? service.partition_id && 'N/A' : stryMutAct_9fa48("52151") ? false : stryMutAct_9fa48("52150") ? true : (stryCov_9fa48("52150", "52151", "52152"), service.partition_id || (stryMutAct_9fa48("52153") ? "" : (stryCov_9fa48("52153"), 'N/A')))
            }), stryMutAct_9fa48("52154") ? {} : (stryCov_9fa48("52154"), {
              label: stryMutAct_9fa48("52155") ? "" : (stryCov_9fa48("52155"), 'Table ID'),
              value: stryMutAct_9fa48("52158") ? service.table_id && 'N/A' : stryMutAct_9fa48("52157") ? false : stryMutAct_9fa48("52156") ? true : (stryCov_9fa48("52156", "52157", "52158"), service.table_id || (stryMutAct_9fa48("52159") ? "" : (stryCov_9fa48("52159"), 'N/A')))
            }), stryMutAct_9fa48("52160") ? {} : (stryCov_9fa48("52160"), {
              label: stryMutAct_9fa48("52161") ? "" : (stryCov_9fa48("52161"), 'Storage'),
              value: this.formatBytes(service.storage_bytes)
            }), stryMutAct_9fa48("52162") ? {} : (stryCov_9fa48("52162"), {
              label: stryMutAct_9fa48("52163") ? "" : (stryCov_9fa48("52163"), 'Row Count'),
              value: String(stryMutAct_9fa48("52164") ? service.row_count && 'N/A' : (stryCov_9fa48("52164"), service.row_count ?? (stryMutAct_9fa48("52165") ? "" : (stryCov_9fa48("52165"), 'N/A'))))
            })])
          }));
        }
      }

      // Add storage info for message group services
      if (stryMutAct_9fa48("52168") ? service.service_type !== SERVICE_TYPES.MESSAGE_GROUP : stryMutAct_9fa48("52167") ? false : stryMutAct_9fa48("52166") ? true : (stryCov_9fa48("52166", "52167", "52168"), service.service_type === SERVICE_TYPES.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("52169")) {
          {}
        } else {
          stryCov_9fa48("52169");
          sections.push(stryMutAct_9fa48("52170") ? {} : (stryCov_9fa48("52170"), {
            title: stryMutAct_9fa48("52171") ? "" : (stryCov_9fa48("52171"), 'Message Group Details'),
            fields: stryMutAct_9fa48("52172") ? [] : (stryCov_9fa48("52172"), [stryMutAct_9fa48("52173") ? {} : (stryCov_9fa48("52173"), {
              label: stryMutAct_9fa48("52174") ? "" : (stryCov_9fa48("52174"), 'Group ID'),
              value: stryMutAct_9fa48("52177") ? service.group_id && 'N/A' : stryMutAct_9fa48("52176") ? false : stryMutAct_9fa48("52175") ? true : (stryCov_9fa48("52175", "52176", "52177"), service.group_id || (stryMutAct_9fa48("52178") ? "" : (stryCov_9fa48("52178"), 'N/A')))
            }), stryMutAct_9fa48("52179") ? {} : (stryCov_9fa48("52179"), {
              label: stryMutAct_9fa48("52180") ? "" : (stryCov_9fa48("52180"), 'Storage'),
              value: this.formatBytes(service.storage_bytes)
            }), stryMutAct_9fa48("52181") ? {} : (stryCov_9fa48("52181"), {
              label: stryMutAct_9fa48("52182") ? "" : (stryCov_9fa48("52182"), 'Message Count'),
              value: String(stryMutAct_9fa48("52183") ? service.message_count && 'N/A' : (stryCov_9fa48("52183"), service.message_count ?? (stryMutAct_9fa48("52184") ? "" : (stryCov_9fa48("52184"), 'N/A'))))
            })])
          }));
        }
      }

      // Add epoch information if available
      if (stryMutAct_9fa48("52187") ? service.epoch !== undefined && service.assignment_epoch !== undefined : stryMutAct_9fa48("52186") ? false : stryMutAct_9fa48("52185") ? true : (stryCov_9fa48("52185", "52186", "52187"), (stryMutAct_9fa48("52189") ? service.epoch === undefined : stryMutAct_9fa48("52188") ? false : (stryCov_9fa48("52188", "52189"), service.epoch !== undefined)) || (stryMutAct_9fa48("52191") ? service.assignment_epoch === undefined : stryMutAct_9fa48("52190") ? false : (stryCov_9fa48("52190", "52191"), service.assignment_epoch !== undefined)))) {
        if (stryMutAct_9fa48("52192")) {
          {}
        } else {
          stryCov_9fa48("52192");
          sections.push(stryMutAct_9fa48("52193") ? {} : (stryCov_9fa48("52193"), {
            title: stryMutAct_9fa48("52194") ? "" : (stryCov_9fa48("52194"), 'Epoch Information'),
            fields: stryMutAct_9fa48("52195") ? [] : (stryCov_9fa48("52195"), [stryMutAct_9fa48("52196") ? {} : (stryCov_9fa48("52196"), {
              label: stryMutAct_9fa48("52197") ? "" : (stryCov_9fa48("52197"), 'Current Epoch'),
              value: String(stryMutAct_9fa48("52198") ? service.epoch && 'N/A' : (stryCov_9fa48("52198"), service.epoch ?? (stryMutAct_9fa48("52199") ? "" : (stryCov_9fa48("52199"), 'N/A'))))
            }), stryMutAct_9fa48("52200") ? {} : (stryCov_9fa48("52200"), {
              label: stryMutAct_9fa48("52201") ? "" : (stryCov_9fa48("52201"), 'Assignment Epoch'),
              value: String(stryMutAct_9fa48("52202") ? service.assignment_epoch && 'N/A' : (stryCov_9fa48("52202"), service.assignment_epoch ?? (stryMutAct_9fa48("52203") ? "" : (stryCov_9fa48("52203"), 'N/A'))))
            })])
          }));
        }
      }

      // Build navigation links
      const navigationLinks = stryMutAct_9fa48("52204") ? ["Stryker was here"] : (stryCov_9fa48("52204"), []);
      if (stryMutAct_9fa48("52207") ? service.service_type === SERVICE_TYPES.PARTITION || service.partition_id : stryMutAct_9fa48("52206") ? false : stryMutAct_9fa48("52205") ? true : (stryCov_9fa48("52205", "52206", "52207"), (stryMutAct_9fa48("52209") ? service.service_type !== SERVICE_TYPES.PARTITION : stryMutAct_9fa48("52208") ? true : (stryCov_9fa48("52208", "52209"), service.service_type === SERVICE_TYPES.PARTITION)) && service.partition_id)) {
        if (stryMutAct_9fa48("52210")) {
          {}
        } else {
          stryCov_9fa48("52210");
          navigationLinks.push(stryMutAct_9fa48("52211") ? {} : (stryCov_9fa48("52211"), {
            label: stryMutAct_9fa48("52212") ? "" : (stryCov_9fa48("52212"), 'View Partition'),
            target: stryMutAct_9fa48("52213") ? "" : (stryCov_9fa48("52213"), 'partitions'),
            key: stryMutAct_9fa48("52214") ? "" : (stryCov_9fa48("52214"), 'p')
          }));
        }
      }
      if (stryMutAct_9fa48("52217") ? service.service_type === SERVICE_TYPES.MESSAGE_GROUP || service.group_id : stryMutAct_9fa48("52216") ? false : stryMutAct_9fa48("52215") ? true : (stryCov_9fa48("52215", "52216", "52217"), (stryMutAct_9fa48("52219") ? service.service_type !== SERVICE_TYPES.MESSAGE_GROUP : stryMutAct_9fa48("52218") ? true : (stryCov_9fa48("52218", "52219"), service.service_type === SERVICE_TYPES.MESSAGE_GROUP)) && service.group_id)) {
        if (stryMutAct_9fa48("52220")) {
          {}
        } else {
          stryCov_9fa48("52220");
          navigationLinks.push(stryMutAct_9fa48("52221") ? {} : (stryCov_9fa48("52221"), {
            label: stryMutAct_9fa48("52222") ? "" : (stryCov_9fa48("52222"), 'View Message Group'),
            target: stryMutAct_9fa48("52223") ? "" : (stryCov_9fa48("52223"), 'message_groups'),
            key: stryMutAct_9fa48("52224") ? "" : (stryCov_9fa48("52224"), 'm')
          }));
        }
      }
      if (stryMutAct_9fa48("52226") ? false : stryMutAct_9fa48("52225") ? true : (stryCov_9fa48("52225", "52226"), service.node_id)) {
        if (stryMutAct_9fa48("52227")) {
          {}
        } else {
          stryCov_9fa48("52227");
          navigationLinks.push(stryMutAct_9fa48("52228") ? {} : (stryCov_9fa48("52228"), {
            label: stryMutAct_9fa48("52229") ? "" : (stryCov_9fa48("52229"), 'View Node'),
            target: stryMutAct_9fa48("52230") ? "" : (stryCov_9fa48("52230"), 'nodes'),
            key: stryMutAct_9fa48("52231") ? "" : (stryCov_9fa48("52231"), 'n')
          }));
        }
      }
      return stryMutAct_9fa48("52232") ? {} : (stryCov_9fa48("52232"), {
        title: stryMutAct_9fa48("52233") ? `` : (stryCov_9fa48("52233"), `Replica: ${shortName}`),
        sections,
        navigationLinks
      });
    }
  }

  /**
   * Format timestamp for display
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (stryMutAct_9fa48("52234")) {
      {}
    } else {
      stryCov_9fa48("52234");
      if (stryMutAct_9fa48("52237") ? timestamp === null && timestamp === undefined : stryMutAct_9fa48("52236") ? false : stryMutAct_9fa48("52235") ? true : (stryCov_9fa48("52235", "52236", "52237"), (stryMutAct_9fa48("52239") ? timestamp !== null : stryMutAct_9fa48("52238") ? false : (stryCov_9fa48("52238", "52239"), timestamp === null)) || (stryMutAct_9fa48("52241") ? timestamp !== undefined : stryMutAct_9fa48("52240") ? false : (stryCov_9fa48("52240", "52241"), timestamp === undefined)))) {
        if (stryMutAct_9fa48("52242")) {
          {}
        } else {
          stryCov_9fa48("52242");
          return stryMutAct_9fa48("52243") ? "" : (stryCov_9fa48("52243"), 'N/A');
        }
      }
      try {
        if (stryMutAct_9fa48("52244")) {
          {}
        } else {
          stryCov_9fa48("52244");
          const date = new Date(timestamp);
          if (stryMutAct_9fa48("52246") ? false : stryMutAct_9fa48("52245") ? true : (stryCov_9fa48("52245", "52246"), isNaN(date.getTime()))) {
            if (stryMutAct_9fa48("52247")) {
              {}
            } else {
              stryCov_9fa48("52247");
              return stryMutAct_9fa48("52248") ? "" : (stryCov_9fa48("52248"), 'N/A');
            }
          }
          return stryMutAct_9fa48("52249") ? date.toISOString().replace('T', ' ') : (stryCov_9fa48("52249"), date.toISOString().replace(stryMutAct_9fa48("52250") ? "" : (stryCov_9fa48("52250"), 'T'), stryMutAct_9fa48("52251") ? "" : (stryCov_9fa48("52251"), ' ')).substring(0, 19));
        }
      } catch (_err) {
        if (stryMutAct_9fa48("52252")) {
          {}
        } else {
          stryCov_9fa48("52252");
          return stryMutAct_9fa48("52253") ? "" : (stryCov_9fa48("52253"), 'N/A');
        }
      }
    }
  }

  /**
   * Format bytes for display
   * @param {number|null|undefined} bytes - Byte count
   * @return {string} Formatted size
   */
  formatBytes(bytes) {
    if (stryMutAct_9fa48("52254")) {
      {}
    } else {
      stryCov_9fa48("52254");
      if (stryMutAct_9fa48("52257") ? bytes === null && bytes === undefined : stryMutAct_9fa48("52256") ? false : stryMutAct_9fa48("52255") ? true : (stryCov_9fa48("52255", "52256", "52257"), (stryMutAct_9fa48("52259") ? bytes !== null : stryMutAct_9fa48("52258") ? false : (stryCov_9fa48("52258", "52259"), bytes === null)) || (stryMutAct_9fa48("52261") ? bytes !== undefined : stryMutAct_9fa48("52260") ? false : (stryCov_9fa48("52260", "52261"), bytes === undefined)))) {
        if (stryMutAct_9fa48("52262")) {
          {}
        } else {
          stryCov_9fa48("52262");
          return stryMutAct_9fa48("52263") ? "" : (stryCov_9fa48("52263"), 'N/A');
        }
      }
      if (stryMutAct_9fa48("52266") ? bytes !== 0 : stryMutAct_9fa48("52265") ? false : stryMutAct_9fa48("52264") ? true : (stryCov_9fa48("52264", "52265", "52266"), bytes === 0)) {
        if (stryMutAct_9fa48("52267")) {
          {}
        } else {
          stryCov_9fa48("52267");
          return stryMutAct_9fa48("52268") ? "" : (stryCov_9fa48("52268"), '0 B');
        }
      }
      const units = stryMutAct_9fa48("52269") ? [] : (stryCov_9fa48("52269"), [stryMutAct_9fa48("52270") ? "" : (stryCov_9fa48("52270"), 'B'), stryMutAct_9fa48("52271") ? "" : (stryCov_9fa48("52271"), 'KB'), stryMutAct_9fa48("52272") ? "" : (stryCov_9fa48("52272"), 'MB'), stryMutAct_9fa48("52273") ? "" : (stryCov_9fa48("52273"), 'GB'), stryMutAct_9fa48("52274") ? "" : (stryCov_9fa48("52274"), 'TB')]);
      const i = Math.floor(stryMutAct_9fa48("52275") ? Math.log(bytes) * Math.log(1024) : (stryCov_9fa48("52275"), Math.log(bytes) / Math.log(1024)));
      const value = stryMutAct_9fa48("52276") ? bytes * Math.pow(1024, i) : (stryCov_9fa48("52276"), bytes / Math.pow(1024, i));
      return stryMutAct_9fa48("52277") ? `` : (stryCov_9fa48("52277"), `${value.toFixed(1)} ${units[i]}`);
    }
  }
}
export { ReplicasView };
export { ReplicasView as ServicesView };