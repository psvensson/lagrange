/**
 * Remote Cache - Maintains a local copy of system tables synchronized via CDC
 *
 * The Remote Cache stores system table data locally and keeps it synchronized
 * with the server through CDC (Change Data Capture) events. This enables fast
 * navigation without repeated API calls.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */
// @ts-nocheck


/**
 * Primary key mappings for each system table
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
const PRIMARY_KEYS = stryMutAct_9fa48("43641") ? {} : (stryCov_9fa48("43641"), {
  nodes: stryMutAct_9fa48("43642") ? "" : (stryCov_9fa48("43642"), 'node_id'),
  services: stryMutAct_9fa48("43643") ? "" : (stryCov_9fa48("43643"), 'service_id'),
  service_definitions: stryMutAct_9fa48("43644") ? "" : (stryCov_9fa48("43644"), 'service_id'),
  service_endpoints: stryMutAct_9fa48("43645") ? "" : (stryCov_9fa48("43645"), 'endpoint_id'),
  partitions: stryMutAct_9fa48("43646") ? "" : (stryCov_9fa48("43646"), 'partition_id'),
  tables: stryMutAct_9fa48("43647") ? "" : (stryCov_9fa48("43647"), 'table_id'),
  message_groups: stryMutAct_9fa48("43648") ? "" : (stryCov_9fa48("43648"), 'group_id'),
  indices: stryMutAct_9fa48("43649") ? "" : (stryCov_9fa48("43649"), 'index_id'),
  logs: stryMutAct_9fa48("43650") ? "" : (stryCov_9fa48("43650"), 'log_id'),
  config: stryMutAct_9fa48("43651") ? "" : (stryCov_9fa48("43651"), 'config_key'),
  contexts: stryMutAct_9fa48("43652") ? "" : (stryCov_9fa48("43652"), 'context_id'),
  replica_operations: stryMutAct_9fa48("43653") ? "" : (stryCov_9fa48("43653"), 'operation_id')
});
const LOGICAL_SERVICE_STATUS = Object.freeze(stryMutAct_9fa48("43654") ? {} : (stryCov_9fa48("43654"), {
  HEALTHY: stryMutAct_9fa48("43655") ? "" : (stryCov_9fa48("43655"), 'healthy'),
  PARTIAL: stryMutAct_9fa48("43656") ? "" : (stryCov_9fa48("43656"), 'partial'),
  DEGRADED: stryMutAct_9fa48("43657") ? "" : (stryCov_9fa48("43657"), 'degraded'),
  UNKNOWN: stryMutAct_9fa48("43658") ? "" : (stryCov_9fa48("43658"), 'unknown')
}));
const HEALTHY_RUNTIME_STATUS = new Set(stryMutAct_9fa48("43659") ? [] : (stryCov_9fa48("43659"), [stryMutAct_9fa48("43660") ? "" : (stryCov_9fa48("43660"), 'healthy'), stryMutAct_9fa48("43661") ? "" : (stryCov_9fa48("43661"), 'active')]));

/**
 * RemoteCache class maintains a local copy of system tables synchronized via CDC
 */
export class RemoteCache {
  /**
   * Creates a new RemoteCache instance
   */
  constructor() {
    if (stryMutAct_9fa48("43662")) {
      {}
    } else {
      stryCov_9fa48("43662");
      this.tables = stryMutAct_9fa48("43663") ? {} : (stryCov_9fa48("43663"), {
        nodes: new Map(),
        services: new Map(),
        service_definitions: new Map(),
        service_endpoints: new Map(),
        partitions: new Map(),
        tables: new Map(),
        message_groups: new Map(),
        indices: new Map(),
        logs: new Map(),
        config: new Map(),
        contexts: new Map(),
        replica_operations: new Map()
      });
      this.lastUpdate = null;
      this.cdcLag = 0;
      // Track tables affected by CDC events for selective invalidation
      this.affectedTableIds = new Set();
    }
  }

  /**
   * Gets the primary key for a record in a given table
   * @param {string} tableName - Name of the table
   * @param {Object} record - The record to get the key from
   * @return {string} The primary key value
   */
  getPrimaryKey(tableName, record) {
    if (stryMutAct_9fa48("43664")) {
      {}
    } else {
      stryCov_9fa48("43664");
      const keyField = PRIMARY_KEYS[tableName];
      if (stryMutAct_9fa48("43667") ? false : stryMutAct_9fa48("43666") ? true : stryMutAct_9fa48("43665") ? keyField : (stryCov_9fa48("43665", "43666", "43667"), !keyField)) {
        if (stryMutAct_9fa48("43668")) {
          {}
        } else {
          stryCov_9fa48("43668");
          throw new Error(stryMutAct_9fa48("43669") ? `` : (stryCov_9fa48("43669"), `Unknown table: ${tableName}`));
        }
      }
      const camelKeyField = keyField.replace(stryMutAct_9fa48("43670") ? /_([^a-z])/g : (stryCov_9fa48("43670"), /_([a-z])/g), (_match, letter) => {
        if (stryMutAct_9fa48("43671")) {
          {}
        } else {
          stryCov_9fa48("43671");
          return stryMutAct_9fa48("43672") ? letter.toLowerCase() : (stryCov_9fa48("43672"), letter.toUpperCase());
        }
      });
      return stryMutAct_9fa48("43673") ? (record[keyField] ?? record[camelKeyField]) && record.id : (stryCov_9fa48("43673"), (stryMutAct_9fa48("43674") ? record[keyField] && record[camelKeyField] : (stryCov_9fa48("43674"), record[keyField] ?? record[camelKeyField])) ?? record.id);
    }
  }

  /**
   * Initialize cache from a full dump (initial sync)
   * Requirements: 13.1
   * @param {Object} dump - Object mapping table names to arrays of records
   */
  loadFromDump(dump) {
    if (stryMutAct_9fa48("43675")) {
      {}
    } else {
      stryCov_9fa48("43675");
      for (const [tableName, records] of Object.entries(dump)) {
        if (stryMutAct_9fa48("43676")) {
          {}
        } else {
          stryCov_9fa48("43676");
          if (stryMutAct_9fa48("43679") ? false : stryMutAct_9fa48("43678") ? true : stryMutAct_9fa48("43677") ? this.tables[tableName] : (stryCov_9fa48("43677", "43678", "43679"), !this.tables[tableName])) {
            if (stryMutAct_9fa48("43680")) {
              {}
            } else {
              stryCov_9fa48("43680");
              continue; // Skip unknown tables
            }
          }
          this.tables[tableName].clear();
          if (stryMutAct_9fa48("43682") ? false : stryMutAct_9fa48("43681") ? true : (stryCov_9fa48("43681", "43682"), Array.isArray(records))) {
            if (stryMutAct_9fa48("43683")) {
              {}
            } else {
              stryCov_9fa48("43683");
              for (const record of records) {
                if (stryMutAct_9fa48("43684")) {
                  {}
                } else {
                  stryCov_9fa48("43684");
                  const key = this.getPrimaryKey(tableName, record);
                  if (stryMutAct_9fa48("43687") ? key === undefined && key === null : stryMutAct_9fa48("43686") ? false : stryMutAct_9fa48("43685") ? true : (stryCov_9fa48("43685", "43686", "43687"), (stryMutAct_9fa48("43689") ? key !== undefined : stryMutAct_9fa48("43688") ? false : (stryCov_9fa48("43688", "43689"), key === undefined)) || (stryMutAct_9fa48("43691") ? key !== null : stryMutAct_9fa48("43690") ? false : (stryCov_9fa48("43690", "43691"), key === null)))) {
                    if (stryMutAct_9fa48("43692")) {
                      {}
                    } else {
                      stryCov_9fa48("43692");
                      continue;
                    }
                  }
                  this.tables[tableName].set(key, record);
                }
              }
            }
          }
        }
      }
      this.lastUpdate = Date.now();
    }
  }

  /**
   * Apply a CDC event to update the cache
   * Requirements: 13.4, 12.10
   * @param {Object} event - CDC event with table, operation, data, key, timestamp
   * @return {Object} Change info with table, key, operation, affectedTableId
   */
  applyCDCEvent(event) {
    if (stryMutAct_9fa48("43693")) {
      {}
    } else {
      stryCov_9fa48("43693");
      const {
        table,
        operation,
        data,
        key
      } = event;
      if (stryMutAct_9fa48("43696") ? false : stryMutAct_9fa48("43695") ? true : stryMutAct_9fa48("43694") ? this.tables[table] : (stryCov_9fa48("43694", "43695", "43696"), !this.tables[table])) {
        if (stryMutAct_9fa48("43697")) {
          {}
        } else {
          stryCov_9fa48("43697");
          return stryMutAct_9fa48("43698") ? {} : (stryCov_9fa48("43698"), {
            table,
            key,
            operation,
            applied: stryMutAct_9fa48("43699") ? true : (stryCov_9fa48("43699"), false)
          });
        }
      }

      // Track affected table for selective invalidation (Requirements: 12.10, 13.8)
      let affectedTableId = null;
      switch (operation) {
        case stryMutAct_9fa48("43700") ? "" : (stryCov_9fa48("43700"), 'INSERT'):
        case stryMutAct_9fa48("43702") ? "" : (stryCov_9fa48("43702"), 'UPDATE'):
          if (stryMutAct_9fa48("43701")) {} else {
            stryCov_9fa48("43701");
            this.tables[table].set(key, data);
            // If this is a partition change, track the owning table
            if (stryMutAct_9fa48("43705") ? table === 'partitions' && data || data.table_id : stryMutAct_9fa48("43704") ? false : stryMutAct_9fa48("43703") ? true : (stryCov_9fa48("43703", "43704", "43705"), (stryMutAct_9fa48("43707") ? table === 'partitions' || data : stryMutAct_9fa48("43706") ? true : (stryCov_9fa48("43706", "43707"), (stryMutAct_9fa48("43709") ? table !== 'partitions' : stryMutAct_9fa48("43708") ? true : (stryCov_9fa48("43708", "43709"), table === (stryMutAct_9fa48("43710") ? "" : (stryCov_9fa48("43710"), 'partitions')))) && data)) && data.table_id)) {
              if (stryMutAct_9fa48("43711")) {
                {}
              } else {
                stryCov_9fa48("43711");
                affectedTableId = data.table_id;
                this.affectedTableIds.add(affectedTableId);
              }
            }
            break;
          }
        case stryMutAct_9fa48("43713") ? "" : (stryCov_9fa48("43713"), 'DELETE'):
          if (stryMutAct_9fa48("43712")) {} else {
            stryCov_9fa48("43712");
            // For partition deletes, get the table_id before deletion
            if (stryMutAct_9fa48("43716") ? table !== 'partitions' : stryMutAct_9fa48("43715") ? false : stryMutAct_9fa48("43714") ? true : (stryCov_9fa48("43714", "43715", "43716"), table === (stryMutAct_9fa48("43717") ? "" : (stryCov_9fa48("43717"), 'partitions')))) {
              if (stryMutAct_9fa48("43718")) {
                {}
              } else {
                stryCov_9fa48("43718");
                const existingPartition = this.tables[table].get(key);
                if (stryMutAct_9fa48("43721") ? existingPartition || existingPartition.table_id : stryMutAct_9fa48("43720") ? false : stryMutAct_9fa48("43719") ? true : (stryCov_9fa48("43719", "43720", "43721"), existingPartition && existingPartition.table_id)) {
                  if (stryMutAct_9fa48("43722")) {
                    {}
                  } else {
                    stryCov_9fa48("43722");
                    affectedTableId = existingPartition.table_id;
                    this.affectedTableIds.add(affectedTableId);
                  }
                }
              }
            }
            this.tables[table].delete(key);
            break;
          }
        default:
          if (stryMutAct_9fa48("43723")) {} else {
            stryCov_9fa48("43723");
            return stryMutAct_9fa48("43724") ? {} : (stryCov_9fa48("43724"), {
              table,
              key,
              operation,
              applied: stryMutAct_9fa48("43725") ? true : (stryCov_9fa48("43725"), false)
            });
          }
      }
      this.lastUpdate = Date.now();
      if (stryMutAct_9fa48("43727") ? false : stryMutAct_9fa48("43726") ? true : (stryCov_9fa48("43726", "43727"), event.timestamp)) {
        if (stryMutAct_9fa48("43728")) {
          {}
        } else {
          stryCov_9fa48("43728");
          this.cdcLag = stryMutAct_9fa48("43729") ? Date.now() + event.timestamp : (stryCov_9fa48("43729"), Date.now() - event.timestamp);
        }
      }
      return stryMutAct_9fa48("43730") ? {} : (stryCov_9fa48("43730"), {
        table,
        key,
        operation,
        applied: stryMutAct_9fa48("43731") ? false : (stryCov_9fa48("43731"), true),
        affectedTableId
      });
    }
  }

  /**
   * Get and clear the set of table IDs affected by CDC events
   * Requirements: 12.10, 13.8
   * @return {Set} Set of affected table IDs
   */
  getAndClearAffectedTables() {
    if (stryMutAct_9fa48("43732")) {
      {}
    } else {
      stryCov_9fa48("43732");
      const affected = new Set(this.affectedTableIds);
      this.affectedTableIds.clear();
      return affected;
    }
  }

  /**
   * Check if a specific table has been affected by CDC events
   * Requirements: 12.10, 13.8
   * @param {string} tableId - The table ID to check
   * @return {boolean} True if the table was affected
   */
  isTableAffected(tableId) {
    if (stryMutAct_9fa48("43733")) {
      {}
    } else {
      stryCov_9fa48("43733");
      return this.affectedTableIds.has(tableId);
    }
  }

  /**
   * Clear the affected tables tracking
   */
  clearAffectedTables() {
    if (stryMutAct_9fa48("43734")) {
      {}
    } else {
      stryCov_9fa48("43734");
      this.affectedTableIds.clear();
    }
  }

  /**
   * Get all nodes
   * Requirements: 13.2
   * @return {Array} Array of node records
   */
  getNodes() {
    if (stryMutAct_9fa48("43735")) {
      {}
    } else {
      stryCov_9fa48("43735");
      return Array.from(this.tables.nodes.values());
    }
  }

  /**
   * Get a specific node by ID
   * @param {string} nodeId - The node ID
   * @return {Object|undefined} The node record or undefined
   */
  getNode(nodeId) {
    if (stryMutAct_9fa48("43736")) {
      {}
    } else {
      stryCov_9fa48("43736");
      return this.tables.nodes.get(nodeId);
    }
  }

  /**
   * Get replica rows with optional filtering.
   * Requirements: 13.2
   * @param {Object} filter - Optional filters (nodeId, type, partitionId, groupId, serviceId)
   * @return {Array} Array of replica records
   */
  getServices(filter = {}) {
    if (stryMutAct_9fa48("43737")) {
      {}
    } else {
      stryCov_9fa48("43737");
      let services = Array.from(this.tables.services.values());
      services = services.concat(this.getRuntimeServices());
      if (stryMutAct_9fa48("43739") ? false : stryMutAct_9fa48("43738") ? true : (stryCov_9fa48("43738", "43739"), filter.nodeId)) {
        if (stryMutAct_9fa48("43740")) {
          {}
        } else {
          stryCov_9fa48("43740");
          services = stryMutAct_9fa48("43741") ? services : (stryCov_9fa48("43741"), services.filter(service => {
            if (stryMutAct_9fa48("43742")) {
              {}
            } else {
              stryCov_9fa48("43742");
              return stryMutAct_9fa48("43745") ? this.resolveNodeId(service) !== filter.nodeId : stryMutAct_9fa48("43744") ? false : stryMutAct_9fa48("43743") ? true : (stryCov_9fa48("43743", "43744", "43745"), this.resolveNodeId(service) === filter.nodeId);
            }
          }));
        }
      }
      if (stryMutAct_9fa48("43747") ? false : stryMutAct_9fa48("43746") ? true : (stryCov_9fa48("43746", "43747"), filter.type)) {
        if (stryMutAct_9fa48("43748")) {
          {}
        } else {
          stryCov_9fa48("43748");
          services = stryMutAct_9fa48("43749") ? services : (stryCov_9fa48("43749"), services.filter(service => {
            if (stryMutAct_9fa48("43750")) {
              {}
            } else {
              stryCov_9fa48("43750");
              return stryMutAct_9fa48("43753") ? this.resolveServiceType(service) !== filter.type : stryMutAct_9fa48("43752") ? false : stryMutAct_9fa48("43751") ? true : (stryCov_9fa48("43751", "43752", "43753"), this.resolveServiceType(service) === filter.type);
            }
          }));
        }
      }
      if (stryMutAct_9fa48("43755") ? false : stryMutAct_9fa48("43754") ? true : (stryCov_9fa48("43754", "43755"), filter.partitionId)) {
        if (stryMutAct_9fa48("43756")) {
          {}
        } else {
          stryCov_9fa48("43756");
          services = stryMutAct_9fa48("43757") ? services : (stryCov_9fa48("43757"), services.filter(service => {
            if (stryMutAct_9fa48("43758")) {
              {}
            } else {
              stryCov_9fa48("43758");
              return stryMutAct_9fa48("43761") ? service.partition_id !== filter.partitionId : stryMutAct_9fa48("43760") ? false : stryMutAct_9fa48("43759") ? true : (stryCov_9fa48("43759", "43760", "43761"), service.partition_id === filter.partitionId);
            }
          }));
        }
      }
      if (stryMutAct_9fa48("43763") ? false : stryMutAct_9fa48("43762") ? true : (stryCov_9fa48("43762", "43763"), filter.groupId)) {
        if (stryMutAct_9fa48("43764")) {
          {}
        } else {
          stryCov_9fa48("43764");
          services = stryMutAct_9fa48("43765") ? services : (stryCov_9fa48("43765"), services.filter(service => {
            if (stryMutAct_9fa48("43766")) {
              {}
            } else {
              stryCov_9fa48("43766");
              return stryMutAct_9fa48("43769") ? service.group_id !== filter.groupId : stryMutAct_9fa48("43768") ? false : stryMutAct_9fa48("43767") ? true : (stryCov_9fa48("43767", "43768", "43769"), service.group_id === filter.groupId);
            }
          }));
        }
      }
      if (stryMutAct_9fa48("43771") ? false : stryMutAct_9fa48("43770") ? true : (stryCov_9fa48("43770", "43771"), filter.serviceId)) {
        if (stryMutAct_9fa48("43772")) {
          {}
        } else {
          stryCov_9fa48("43772");
          services = stryMutAct_9fa48("43773") ? services : (stryCov_9fa48("43773"), services.filter(service => {
            if (stryMutAct_9fa48("43774")) {
              {}
            } else {
              stryCov_9fa48("43774");
              return stryMutAct_9fa48("43777") ? this.resolveServiceId(service) === filter.serviceId && service.logical_service_id === filter.serviceId : stryMutAct_9fa48("43776") ? false : stryMutAct_9fa48("43775") ? true : (stryCov_9fa48("43775", "43776", "43777"), (stryMutAct_9fa48("43779") ? this.resolveServiceId(service) !== filter.serviceId : stryMutAct_9fa48("43778") ? false : (stryCov_9fa48("43778", "43779"), this.resolveServiceId(service) === filter.serviceId)) || (stryMutAct_9fa48("43781") ? service.logical_service_id !== filter.serviceId : stryMutAct_9fa48("43780") ? false : (stryCov_9fa48("43780", "43781"), service.logical_service_id === filter.serviceId)));
            }
          }));
        }
      }

      // Enrich services with node_address from nodes table
      return services.map(service => {
        if (stryMutAct_9fa48("43782")) {
          {}
        } else {
          stryCov_9fa48("43782");
          if (stryMutAct_9fa48("43784") ? false : stryMutAct_9fa48("43783") ? true : (stryCov_9fa48("43783", "43784"), service.node_address)) {
            if (stryMutAct_9fa48("43785")) {
              {}
            } else {
              stryCov_9fa48("43785");
              return service;
            }
          }
          const node = this.tables.nodes.get(this.resolveNodeId(service));
          const nodeAddress = this.resolveNodeAddress(node);
          if (stryMutAct_9fa48("43787") ? false : stryMutAct_9fa48("43786") ? true : (stryCov_9fa48("43786", "43787"), nodeAddress)) {
            if (stryMutAct_9fa48("43788")) {
              {}
            } else {
              stryCov_9fa48("43788");
              return stryMutAct_9fa48("43789") ? {} : (stryCov_9fa48("43789"), {
                ...service,
                node_address: nodeAddress
              });
            }
          }
          return service;
        }
      });
    }
  }

  /**
   * Get logical service rows (service definitions joined with endpoints).
   * @param {Object} filter - Optional filters (nodeId, serviceId).
   * @return {Array<Object>}
   */
  getLogicalServices(filter = {}) {
    if (stryMutAct_9fa48("43790")) {
      {}
    } else {
      stryCov_9fa48("43790");
      const logicalServices = stryMutAct_9fa48("43791") ? ["Stryker was here"] : (stryCov_9fa48("43791"), []);
      const definitions = Array.from(this.tables.service_definitions.values());
      const endpointsByServiceId = this.getEndpointsByServiceId();
      for (const definition of definitions) {
        if (stryMutAct_9fa48("43792")) {
          {}
        } else {
          stryCov_9fa48("43792");
          const serviceId = this.resolveServiceId(definition);
          if (stryMutAct_9fa48("43795") ? false : stryMutAct_9fa48("43794") ? true : stryMutAct_9fa48("43793") ? serviceId : (stryCov_9fa48("43793", "43794", "43795"), !serviceId)) {
            if (stryMutAct_9fa48("43796")) {
              {}
            } else {
              stryCov_9fa48("43796");
              continue;
            }
          }
          const endpoints = stryMutAct_9fa48("43799") ? endpointsByServiceId.get(serviceId) && [] : stryMutAct_9fa48("43798") ? false : stryMutAct_9fa48("43797") ? true : (stryCov_9fa48("43797", "43798", "43799"), endpointsByServiceId.get(serviceId) || (stryMutAct_9fa48("43800") ? ["Stryker was here"] : (stryCov_9fa48("43800"), [])));
          const nodes = this.collectEndpointNodeIds(endpoints);
          if (stryMutAct_9fa48("43803") ? filter.nodeId || !nodes.includes(filter.nodeId) : stryMutAct_9fa48("43802") ? false : stryMutAct_9fa48("43801") ? true : (stryCov_9fa48("43801", "43802", "43803"), filter.nodeId && (stryMutAct_9fa48("43804") ? nodes.includes(filter.nodeId) : (stryCov_9fa48("43804"), !nodes.includes(filter.nodeId))))) {
            if (stryMutAct_9fa48("43805")) {
              {}
            } else {
              stryCov_9fa48("43805");
              continue;
            }
          }
          if (stryMutAct_9fa48("43808") ? filter.serviceId || serviceId !== filter.serviceId : stryMutAct_9fa48("43807") ? false : stryMutAct_9fa48("43806") ? true : (stryCov_9fa48("43806", "43807", "43808"), filter.serviceId && (stryMutAct_9fa48("43810") ? serviceId === filter.serviceId : stryMutAct_9fa48("43809") ? true : (stryCov_9fa48("43809", "43810"), serviceId !== filter.serviceId)))) {
            if (stryMutAct_9fa48("43811")) {
              {}
            } else {
              stryCov_9fa48("43811");
              continue;
            }
          }
          const desiredReplicaCount = this.resolveReplicaCount(definition);
          const observedReplicaCount = endpoints.length;
          const healthyReplicaCount = this.countHealthyEndpoints(endpoints);
          logicalServices.push(stryMutAct_9fa48("43812") ? {} : (stryCov_9fa48("43812"), {
            ...definition,
            service_id: serviceId,
            service_name: stryMutAct_9fa48("43815") ? (definition.service_name || definition.serviceName) && serviceId : stryMutAct_9fa48("43814") ? false : stryMutAct_9fa48("43813") ? true : (stryCov_9fa48("43813", "43814", "43815"), (stryMutAct_9fa48("43817") ? definition.service_name && definition.serviceName : stryMutAct_9fa48("43816") ? false : (stryCov_9fa48("43816", "43817"), definition.service_name || definition.serviceName)) || serviceId),
            service_type: stryMutAct_9fa48("43820") ? (definition.service_type || definition.serviceType) && 'runtime_service' : stryMutAct_9fa48("43819") ? false : stryMutAct_9fa48("43818") ? true : (stryCov_9fa48("43818", "43819", "43820"), (stryMutAct_9fa48("43822") ? definition.service_type && definition.serviceType : stryMutAct_9fa48("43821") ? false : (stryCov_9fa48("43821", "43822"), definition.service_type || definition.serviceType)) || (stryMutAct_9fa48("43823") ? "" : (stryCov_9fa48("43823"), 'runtime_service'))),
            runtime_kind: stryMutAct_9fa48("43826") ? (definition.runtime_kind || definition.runtimeKind) && null : stryMutAct_9fa48("43825") ? false : stryMutAct_9fa48("43824") ? true : (stryCov_9fa48("43824", "43825", "43826"), (stryMutAct_9fa48("43828") ? definition.runtime_kind && definition.runtimeKind : stryMutAct_9fa48("43827") ? false : (stryCov_9fa48("43827", "43828"), definition.runtime_kind || definition.runtimeKind)) || null),
            runtime_ref: stryMutAct_9fa48("43831") ? (definition.runtime_ref || definition.runtimeRef) && null : stryMutAct_9fa48("43830") ? false : stryMutAct_9fa48("43829") ? true : (stryCov_9fa48("43829", "43830", "43831"), (stryMutAct_9fa48("43833") ? definition.runtime_ref && definition.runtimeRef : stryMutAct_9fa48("43832") ? false : (stryCov_9fa48("43832", "43833"), definition.runtime_ref || definition.runtimeRef)) || null),
            replica_count: desiredReplicaCount,
            replica_count_observed: observedReplicaCount,
            healthy_replica_count: healthyReplicaCount,
            node_count: nodes.length,
            nodes,
            nodes_summary: (stryMutAct_9fa48("43837") ? nodes.length <= 0 : stryMutAct_9fa48("43836") ? nodes.length >= 0 : stryMutAct_9fa48("43835") ? false : stryMutAct_9fa48("43834") ? true : (stryCov_9fa48("43834", "43835", "43836", "43837"), nodes.length > 0)) ? nodes.join(stryMutAct_9fa48("43838") ? "" : (stryCov_9fa48("43838"), ', ')) : stryMutAct_9fa48("43839") ? "" : (stryCov_9fa48("43839"), 'none'),
            status: this.resolveLogicalServiceStatus(desiredReplicaCount, observedReplicaCount, healthyReplicaCount)
          }));
        }
      }
      return logicalServices;
    }
  }

  /**
   * Build runtime service rows from service definitions and endpoints.
   * @return {Array<Object>} Runtime-backed service rows.
   */
  getRuntimeServices() {
    if (stryMutAct_9fa48("43840")) {
      {}
    } else {
      stryCov_9fa48("43840");
      const runtimeServices = stryMutAct_9fa48("43841") ? ["Stryker was here"] : (stryCov_9fa48("43841"), []);
      const definitions = Array.from(this.tables.service_definitions.values());
      const endpointsByServiceId = this.getEndpointsByServiceId();
      for (const definition of definitions) {
        if (stryMutAct_9fa48("43842")) {
          {}
        } else {
          stryCov_9fa48("43842");
          const serviceId = this.resolveServiceId(definition);
          if (stryMutAct_9fa48("43845") ? false : stryMutAct_9fa48("43844") ? true : stryMutAct_9fa48("43843") ? serviceId : (stryCov_9fa48("43843", "43844", "43845"), !serviceId)) {
            if (stryMutAct_9fa48("43846")) {
              {}
            } else {
              stryCov_9fa48("43846");
              continue;
            }
          }
          const endpoints = stryMutAct_9fa48("43849") ? endpointsByServiceId.get(serviceId) && [] : stryMutAct_9fa48("43848") ? false : stryMutAct_9fa48("43847") ? true : (stryCov_9fa48("43847", "43848", "43849"), endpointsByServiceId.get(serviceId) || (stryMutAct_9fa48("43850") ? ["Stryker was here"] : (stryCov_9fa48("43850"), [])));
          for (const endpoint of endpoints) {
            if (stryMutAct_9fa48("43851")) {
              {}
            } else {
              stryCov_9fa48("43851");
              runtimeServices.push(this.createRuntimeServiceRow(definition, endpoint));
            }
          }
        }
      }
      return runtimeServices;
    }
  }

  /**
   * Create one runtime service row for service inventory views.
   * @param {Object} definition - service_definitions row.
   * @param {Object} endpoint - service_endpoints row.
   * @return {Object}
   */
  createRuntimeServiceRow(definition, endpoint) {
    if (stryMutAct_9fa48("43852")) {
      {}
    } else {
      stryCov_9fa48("43852");
      const serviceId = this.resolveServiceId(definition);
      const endpointId = this.resolveEndpointId(endpoint);
      const endpointAddress = this.formatEndpointAddress(endpoint);
      const status = this.resolveRuntimeStatus(definition, endpoint);
      const nodeId = this.resolveNodeId(endpoint);
      return stryMutAct_9fa48("43853") ? {} : (stryCov_9fa48("43853"), {
        ...definition,
        service_id: serviceId,
        logical_service_id: serviceId,
        service_type: stryMutAct_9fa48("43854") ? "" : (stryCov_9fa48("43854"), 'runtime_service'),
        status,
        node_id: nodeId,
        endpoint_id: endpointId,
        replica_id: endpointId,
        address: endpointAddress,
        row_key: stryMutAct_9fa48("43855") ? `` : (stryCov_9fa48("43855"), `runtime:${serviceId}:${endpointId}`)
      });
    }
  }

  /**
   * Format endpoint address with optional port.
   * @param {Object|null} endpoint - Endpoint record.
   * @return {string|null}
   */
  formatEndpointAddress(endpoint) {
    if (stryMutAct_9fa48("43856")) {
      {}
    } else {
      stryCov_9fa48("43856");
      const address = this.resolveNodeAddress(endpoint);
      if (stryMutAct_9fa48("43859") ? false : stryMutAct_9fa48("43858") ? true : stryMutAct_9fa48("43857") ? address : (stryCov_9fa48("43857", "43858", "43859"), !address)) {
        if (stryMutAct_9fa48("43860")) {
          {}
        } else {
          stryCov_9fa48("43860");
          return null;
        }
      }
      const port = stryMutAct_9fa48("43861") ? (endpoint.port ?? endpoint.ws_port) && endpoint.wsPort : (stryCov_9fa48("43861"), (stryMutAct_9fa48("43862") ? endpoint.port && endpoint.ws_port : (stryCov_9fa48("43862"), endpoint.port ?? endpoint.ws_port)) ?? endpoint.wsPort);
      if (stryMutAct_9fa48("43865") ? port === undefined && port === null : stryMutAct_9fa48("43864") ? false : stryMutAct_9fa48("43863") ? true : (stryCov_9fa48("43863", "43864", "43865"), (stryMutAct_9fa48("43867") ? port !== undefined : stryMutAct_9fa48("43866") ? false : (stryCov_9fa48("43866", "43867"), port === undefined)) || (stryMutAct_9fa48("43869") ? port !== null : stryMutAct_9fa48("43868") ? false : (stryCov_9fa48("43868", "43869"), port === null)))) {
        if (stryMutAct_9fa48("43870")) {
          {}
        } else {
          stryCov_9fa48("43870");
          return address;
        }
      }
      return stryMutAct_9fa48("43871") ? `` : (stryCov_9fa48("43871"), `${address}:${port}`);
    }
  }

  /**
   * Resolve a service identifier from snake_case, camelCase, or id fallback.
   * @param {Object|undefined|null} row
   * @return {string}
   */
  resolveServiceId(row) {
    if (stryMutAct_9fa48("43872")) {
      {}
    } else {
      stryCov_9fa48("43872");
      if (stryMutAct_9fa48("43875") ? false : stryMutAct_9fa48("43874") ? true : stryMutAct_9fa48("43873") ? row : (stryCov_9fa48("43873", "43874", "43875"), !row)) {
        if (stryMutAct_9fa48("43876")) {
          {}
        } else {
          stryCov_9fa48("43876");
          return stryMutAct_9fa48("43877") ? "Stryker was here!" : (stryCov_9fa48("43877"), '');
        }
      }
      return stryMutAct_9fa48("43880") ? (row.service_id || row.serviceId || row.id) && '' : stryMutAct_9fa48("43879") ? false : stryMutAct_9fa48("43878") ? true : (stryCov_9fa48("43878", "43879", "43880"), (stryMutAct_9fa48("43882") ? (row.service_id || row.serviceId) && row.id : stryMutAct_9fa48("43881") ? false : (stryCov_9fa48("43881", "43882"), (stryMutAct_9fa48("43884") ? row.service_id && row.serviceId : stryMutAct_9fa48("43883") ? false : (stryCov_9fa48("43883", "43884"), row.service_id || row.serviceId)) || row.id)) || (stryMutAct_9fa48("43885") ? "Stryker was here!" : (stryCov_9fa48("43885"), '')));
    }
  }

  /**
   * Resolve a node identifier from snake_case or camelCase fields.
   * @param {Object|undefined|null} row
   * @return {string|null}
   */
  resolveNodeId(row) {
    if (stryMutAct_9fa48("43886")) {
      {}
    } else {
      stryCov_9fa48("43886");
      if (stryMutAct_9fa48("43889") ? false : stryMutAct_9fa48("43888") ? true : stryMutAct_9fa48("43887") ? row : (stryCov_9fa48("43887", "43888", "43889"), !row)) {
        if (stryMutAct_9fa48("43890")) {
          {}
        } else {
          stryCov_9fa48("43890");
          return null;
        }
      }
      return stryMutAct_9fa48("43893") ? (row.node_id || row.nodeId) && null : stryMutAct_9fa48("43892") ? false : stryMutAct_9fa48("43891") ? true : (stryCov_9fa48("43891", "43892", "43893"), (stryMutAct_9fa48("43895") ? row.node_id && row.nodeId : stryMutAct_9fa48("43894") ? false : (stryCov_9fa48("43894", "43895"), row.node_id || row.nodeId)) || null);
    }
  }

  /**
   * Resolve a service type from snake_case or legacy aliases.
   * @param {Object|undefined|null} row
   * @return {string|null}
   */
  resolveServiceType(row) {
    if (stryMutAct_9fa48("43896")) {
      {}
    } else {
      stryCov_9fa48("43896");
      if (stryMutAct_9fa48("43899") ? false : stryMutAct_9fa48("43898") ? true : stryMutAct_9fa48("43897") ? row : (stryCov_9fa48("43897", "43898", "43899"), !row)) {
        if (stryMutAct_9fa48("43900")) {
          {}
        } else {
          stryCov_9fa48("43900");
          return null;
        }
      }
      return stryMutAct_9fa48("43903") ? (row.service_type || row.serviceType || row.type) && null : stryMutAct_9fa48("43902") ? false : stryMutAct_9fa48("43901") ? true : (stryCov_9fa48("43901", "43902", "43903"), (stryMutAct_9fa48("43905") ? (row.service_type || row.serviceType) && row.type : stryMutAct_9fa48("43904") ? false : (stryCov_9fa48("43904", "43905"), (stryMutAct_9fa48("43907") ? row.service_type && row.serviceType : stryMutAct_9fa48("43906") ? false : (stryCov_9fa48("43906", "43907"), row.service_type || row.serviceType)) || row.type)) || null);
    }
  }

  /**
   * Resolve endpoint identifier from snake_case, camelCase, or id fallback.
   * @param {Object|undefined|null} endpoint
   * @return {string|null}
   */
  resolveEndpointId(endpoint) {
    if (stryMutAct_9fa48("43908")) {
      {}
    } else {
      stryCov_9fa48("43908");
      if (stryMutAct_9fa48("43911") ? false : stryMutAct_9fa48("43910") ? true : stryMutAct_9fa48("43909") ? endpoint : (stryCov_9fa48("43909", "43910", "43911"), !endpoint)) {
        if (stryMutAct_9fa48("43912")) {
          {}
        } else {
          stryCov_9fa48("43912");
          return null;
        }
      }
      return stryMutAct_9fa48("43915") ? (endpoint.endpoint_id || endpoint.endpointId || endpoint.id) && null : stryMutAct_9fa48("43914") ? false : stryMutAct_9fa48("43913") ? true : (stryCov_9fa48("43913", "43914", "43915"), (stryMutAct_9fa48("43917") ? (endpoint.endpoint_id || endpoint.endpointId) && endpoint.id : stryMutAct_9fa48("43916") ? false : (stryCov_9fa48("43916", "43917"), (stryMutAct_9fa48("43919") ? endpoint.endpoint_id && endpoint.endpointId : stryMutAct_9fa48("43918") ? false : (stryCov_9fa48("43918", "43919"), endpoint.endpoint_id || endpoint.endpointId)) || endpoint.id)) || null);
    }
  }

  /**
   * Resolve display address from common node/endpoint field variants.
   * @param {Object|undefined|null} row
   * @return {string|null}
   */
  resolveNodeAddress(row) {
    if (stryMutAct_9fa48("43920")) {
      {}
    } else {
      stryCov_9fa48("43920");
      if (stryMutAct_9fa48("43923") ? false : stryMutAct_9fa48("43922") ? true : stryMutAct_9fa48("43921") ? row : (stryCov_9fa48("43921", "43922", "43923"), !row)) {
        if (stryMutAct_9fa48("43924")) {
          {}
        } else {
          stryCov_9fa48("43924");
          return null;
        }
      }
      return stryMutAct_9fa48("43927") ? (row.node_address || row.nodeAddress || row.address || row.host) && null : stryMutAct_9fa48("43926") ? false : stryMutAct_9fa48("43925") ? true : (stryCov_9fa48("43925", "43926", "43927"), (stryMutAct_9fa48("43929") ? (row.node_address || row.nodeAddress || row.address) && row.host : stryMutAct_9fa48("43928") ? false : (stryCov_9fa48("43928", "43929"), (stryMutAct_9fa48("43931") ? (row.node_address || row.nodeAddress) && row.address : stryMutAct_9fa48("43930") ? false : (stryCov_9fa48("43930", "43931"), (stryMutAct_9fa48("43933") ? row.node_address && row.nodeAddress : stryMutAct_9fa48("43932") ? false : (stryCov_9fa48("43932", "43933"), row.node_address || row.nodeAddress)) || row.address)) || row.host)) || null);
    }
  }

  /**
   * Resolve runtime service status from endpoint health or definition status.
   * @param {Object} definition
   * @param {Object|null|undefined} endpoint
   * @return {string}
   */
  resolveRuntimeStatus(definition, endpoint) {
    if (stryMutAct_9fa48("43934")) {
      {}
    } else {
      stryCov_9fa48("43934");
      return stryMutAct_9fa48("43937") ? (endpoint?.health_status || endpoint?.healthStatus || endpoint?.status || definition?.status || definition?.state) && 'unknown' : stryMutAct_9fa48("43936") ? false : stryMutAct_9fa48("43935") ? true : (stryCov_9fa48("43935", "43936", "43937"), (stryMutAct_9fa48("43939") ? (endpoint?.health_status || endpoint?.healthStatus || endpoint?.status || definition?.status) && definition?.state : stryMutAct_9fa48("43938") ? false : (stryCov_9fa48("43938", "43939"), (stryMutAct_9fa48("43941") ? (endpoint?.health_status || endpoint?.healthStatus || endpoint?.status) && definition?.status : stryMutAct_9fa48("43940") ? false : (stryCov_9fa48("43940", "43941"), (stryMutAct_9fa48("43943") ? (endpoint?.health_status || endpoint?.healthStatus) && endpoint?.status : stryMutAct_9fa48("43942") ? false : (stryCov_9fa48("43942", "43943"), (stryMutAct_9fa48("43945") ? endpoint?.health_status && endpoint?.healthStatus : stryMutAct_9fa48("43944") ? false : (stryCov_9fa48("43944", "43945"), (stryMutAct_9fa48("43946") ? endpoint.health_status : (stryCov_9fa48("43946"), endpoint?.health_status)) || (stryMutAct_9fa48("43947") ? endpoint.healthStatus : (stryCov_9fa48("43947"), endpoint?.healthStatus)))) || (stryMutAct_9fa48("43948") ? endpoint.status : (stryCov_9fa48("43948"), endpoint?.status)))) || (stryMutAct_9fa48("43949") ? definition.status : (stryCov_9fa48("43949"), definition?.status)))) || (stryMutAct_9fa48("43950") ? definition.state : (stryCov_9fa48("43950"), definition?.state)))) || (stryMutAct_9fa48("43951") ? "" : (stryCov_9fa48("43951"), 'unknown')));
    }
  }

  /**
   * Group endpoint rows by service_id.
   * @return {Map<string, Array<Object>>}
   */
  getEndpointsByServiceId() {
    if (stryMutAct_9fa48("43952")) {
      {}
    } else {
      stryCov_9fa48("43952");
      const endpointsByServiceId = new Map();
      for (const endpoint of this.tables.service_endpoints.values()) {
        if (stryMutAct_9fa48("43953")) {
          {}
        } else {
          stryCov_9fa48("43953");
          const serviceId = this.resolveServiceId(endpoint);
          if (stryMutAct_9fa48("43956") ? false : stryMutAct_9fa48("43955") ? true : stryMutAct_9fa48("43954") ? serviceId : (stryCov_9fa48("43954", "43955", "43956"), !serviceId)) {
            if (stryMutAct_9fa48("43957")) {
              {}
            } else {
              stryCov_9fa48("43957");
              continue;
            }
          }
          if (stryMutAct_9fa48("43960") ? false : stryMutAct_9fa48("43959") ? true : stryMutAct_9fa48("43958") ? endpointsByServiceId.has(serviceId) : (stryCov_9fa48("43958", "43959", "43960"), !endpointsByServiceId.has(serviceId))) {
            if (stryMutAct_9fa48("43961")) {
              {}
            } else {
              stryCov_9fa48("43961");
              endpointsByServiceId.set(serviceId, stryMutAct_9fa48("43962") ? ["Stryker was here"] : (stryCov_9fa48("43962"), []));
            }
          }
          endpointsByServiceId.get(serviceId).push(endpoint);
        }
      }
      return endpointsByServiceId;
    }
  }

  /**
   * Resolve desired replica count from definition fields.
   * @param {Object} definition
   * @return {number}
   */
  resolveReplicaCount(definition) {
    if (stryMutAct_9fa48("43963")) {
      {}
    } else {
      stryCov_9fa48("43963");
      const raw = stryMutAct_9fa48("43964") ? (definition?.replica_count ?? definition?.replicaCount) && 0 : (stryCov_9fa48("43964"), (stryMutAct_9fa48("43965") ? definition?.replica_count && definition?.replicaCount : (stryCov_9fa48("43965"), (stryMutAct_9fa48("43966") ? definition.replica_count : (stryCov_9fa48("43966"), definition?.replica_count)) ?? (stryMutAct_9fa48("43967") ? definition.replicaCount : (stryCov_9fa48("43967"), definition?.replicaCount)))) ?? 0);
      const parsed = Number(raw);
      if (stryMutAct_9fa48("43970") ? !Number.isFinite(parsed) && parsed < 0 : stryMutAct_9fa48("43969") ? false : stryMutAct_9fa48("43968") ? true : (stryCov_9fa48("43968", "43969", "43970"), (stryMutAct_9fa48("43971") ? Number.isFinite(parsed) : (stryCov_9fa48("43971"), !Number.isFinite(parsed))) || (stryMutAct_9fa48("43974") ? parsed >= 0 : stryMutAct_9fa48("43973") ? parsed <= 0 : stryMutAct_9fa48("43972") ? false : (stryCov_9fa48("43972", "43973", "43974"), parsed < 0)))) {
        if (stryMutAct_9fa48("43975")) {
          {}
        } else {
          stryCov_9fa48("43975");
          return 0;
        }
      }
      return Math.floor(parsed);
    }
  }

  /**
   * Collect unique node IDs from endpoint rows.
   * @param {Array<Object>} endpoints
   * @return {Array<string>}
   */
  collectEndpointNodeIds(endpoints) {
    if (stryMutAct_9fa48("43976")) {
      {}
    } else {
      stryCov_9fa48("43976");
      const uniqueNodeIds = new Set();
      for (const endpoint of endpoints) {
        if (stryMutAct_9fa48("43977")) {
          {}
        } else {
          stryCov_9fa48("43977");
          const nodeId = this.resolveNodeId(endpoint);
          if (stryMutAct_9fa48("43979") ? false : stryMutAct_9fa48("43978") ? true : (stryCov_9fa48("43978", "43979"), nodeId)) {
            if (stryMutAct_9fa48("43980")) {
              {}
            } else {
              stryCov_9fa48("43980");
              uniqueNodeIds.add(nodeId);
            }
          }
        }
      }
      return stryMutAct_9fa48("43981") ? Array.from(uniqueNodeIds.values()) : (stryCov_9fa48("43981"), Array.from(uniqueNodeIds.values()).sort());
    }
  }

  /**
   * Count endpoints in a healthy state.
   * @param {Array<Object>} endpoints
   * @return {number}
   */
  countHealthyEndpoints(endpoints) {
    if (stryMutAct_9fa48("43982")) {
      {}
    } else {
      stryCov_9fa48("43982");
      return endpoints.reduce((count, endpoint) => {
        if (stryMutAct_9fa48("43983")) {
          {}
        } else {
          stryCov_9fa48("43983");
          const status = this.resolveRuntimeStatus(null, endpoint);
          return HEALTHY_RUNTIME_STATUS.has(stryMutAct_9fa48("43984") ? String(status).toUpperCase() : (stryCov_9fa48("43984"), String(status).toLowerCase())) ? stryMutAct_9fa48("43985") ? count - 1 : (stryCov_9fa48("43985"), count + 1) : count;
        }
      }, 0);
    }
  }

  /**
   * Resolve logical-service health state from desired/observed counts.
   * @param {number} desiredReplicaCount
   * @param {number} observedReplicaCount
   * @param {number} healthyReplicaCount
   * @return {string}
   */
  resolveLogicalServiceStatus(desiredReplicaCount, observedReplicaCount, healthyReplicaCount) {
    if (stryMutAct_9fa48("43986")) {
      {}
    } else {
      stryCov_9fa48("43986");
      if (stryMutAct_9fa48("43990") ? desiredReplicaCount > 0 : stryMutAct_9fa48("43989") ? desiredReplicaCount < 0 : stryMutAct_9fa48("43988") ? false : stryMutAct_9fa48("43987") ? true : (stryCov_9fa48("43987", "43988", "43989", "43990"), desiredReplicaCount <= 0)) {
        if (stryMutAct_9fa48("43991")) {
          {}
        } else {
          stryCov_9fa48("43991");
          return (stryMutAct_9fa48("43994") ? observedReplicaCount !== 0 : stryMutAct_9fa48("43993") ? false : stryMutAct_9fa48("43992") ? true : (stryCov_9fa48("43992", "43993", "43994"), observedReplicaCount === 0)) ? LOGICAL_SERVICE_STATUS.UNKNOWN : LOGICAL_SERVICE_STATUS.HEALTHY;
        }
      }
      if (stryMutAct_9fa48("43998") ? healthyReplicaCount < desiredReplicaCount : stryMutAct_9fa48("43997") ? healthyReplicaCount > desiredReplicaCount : stryMutAct_9fa48("43996") ? false : stryMutAct_9fa48("43995") ? true : (stryCov_9fa48("43995", "43996", "43997", "43998"), healthyReplicaCount >= desiredReplicaCount)) {
        if (stryMutAct_9fa48("43999")) {
          {}
        } else {
          stryCov_9fa48("43999");
          return LOGICAL_SERVICE_STATUS.HEALTHY;
        }
      }
      if (stryMutAct_9fa48("44002") ? healthyReplicaCount !== 0 : stryMutAct_9fa48("44001") ? false : stryMutAct_9fa48("44000") ? true : (stryCov_9fa48("44000", "44001", "44002"), healthyReplicaCount === 0)) {
        if (stryMutAct_9fa48("44003")) {
          {}
        } else {
          stryCov_9fa48("44003");
          return LOGICAL_SERVICE_STATUS.DEGRADED;
        }
      }
      return LOGICAL_SERVICE_STATUS.PARTIAL;
    }
  }

  /**
   * Get a specific service by ID
   * @param {string} serviceId - The service ID
   * @return {Object|undefined} The service record or undefined
   */
  getService(serviceId) {
    if (stryMutAct_9fa48("44004")) {
      {}
    } else {
      stryCov_9fa48("44004");
      return this.tables.services.get(serviceId);
    }
  }

  /**
   * Get all tables (raw, without computed metadata)
   * Requirements: 13.2
   * @return {Array} Array of table records
   */
  getTables() {
    if (stryMutAct_9fa48("44005")) {
      {}
    } else {
      stryCov_9fa48("44005");
      return Array.from(this.tables.tables.values());
    }
  }

  /**
   * Get a specific table by ID
   * @param {string} tableId - The table ID
   * @return {Object|undefined} The table record or undefined
   */
  getTable(tableId) {
    if (stryMutAct_9fa48("44006")) {
      {}
    } else {
      stryCov_9fa48("44006");
      return this.tables.tables.get(tableId);
    }
  }

  /**
   * Get partitions with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with tableId
   * @return {Array} Array of partition records
   */
  getPartitions(filter = {}) {
    if (stryMutAct_9fa48("44007")) {
      {}
    } else {
      stryCov_9fa48("44007");
      let partitions = Array.from(this.tables.partitions.values());
      if (stryMutAct_9fa48("44009") ? false : stryMutAct_9fa48("44008") ? true : (stryCov_9fa48("44008", "44009"), filter.tableId)) {
        if (stryMutAct_9fa48("44010")) {
          {}
        } else {
          stryCov_9fa48("44010");
          partitions = stryMutAct_9fa48("44011") ? partitions : (stryCov_9fa48("44011"), partitions.filter(stryMutAct_9fa48("44012") ? () => undefined : (stryCov_9fa48("44012"), p => stryMutAct_9fa48("44015") ? p.table_id !== filter.tableId : stryMutAct_9fa48("44014") ? false : stryMutAct_9fa48("44013") ? true : (stryCov_9fa48("44013", "44014", "44015"), p.table_id === filter.tableId))));
        }
      }
      return partitions;
    }
  }

  /**
   * Get a specific partition by ID
   * @param {string} partitionId - The partition ID
   * @return {Object|undefined} The partition record or undefined
   */
  getPartition(partitionId) {
    if (stryMutAct_9fa48("44016")) {
      {}
    } else {
      stryCov_9fa48("44016");
      return this.tables.partitions.get(partitionId);
    }
  }

  /**
   * Get all message groups
   * Requirements: 13.2
   * @return {Array} Array of message group records
   */
  getMessageGroups() {
    if (stryMutAct_9fa48("44017")) {
      {}
    } else {
      stryCov_9fa48("44017");
      return Array.from(this.tables.message_groups.values());
    }
  }

  /**
   * Get a specific message group by ID
   * @param {string} groupId - The message group ID
   * @return {Object|undefined} The message group record or undefined
   */
  getMessageGroup(groupId) {
    if (stryMutAct_9fa48("44018")) {
      {}
    } else {
      stryCov_9fa48("44018");
      return this.tables.message_groups.get(groupId);
    }
  }

  /**
   * Get all indices
   * Requirements: 13.2
   * @return {Array} Array of index records
   */
  getIndices() {
    if (stryMutAct_9fa48("44019")) {
      {}
    } else {
      stryCov_9fa48("44019");
      return Array.from(this.tables.indices.values());
    }
  }

  /**
   * Get logs with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with level, nodeId, serviceId, startTime, endTime
   * @return {Array} Array of log records
   */
  getLogs(filter = {}) {
    if (stryMutAct_9fa48("44020")) {
      {}
    } else {
      stryCov_9fa48("44020");
      let logs = Array.from(this.tables.logs.values());
      if (stryMutAct_9fa48("44022") ? false : stryMutAct_9fa48("44021") ? true : (stryCov_9fa48("44021", "44022"), filter.level)) {
        if (stryMutAct_9fa48("44023")) {
          {}
        } else {
          stryCov_9fa48("44023");
          logs = stryMutAct_9fa48("44024") ? logs : (stryCov_9fa48("44024"), logs.filter(stryMutAct_9fa48("44025") ? () => undefined : (stryCov_9fa48("44025"), l => stryMutAct_9fa48("44028") ? l.level !== filter.level : stryMutAct_9fa48("44027") ? false : stryMutAct_9fa48("44026") ? true : (stryCov_9fa48("44026", "44027", "44028"), l.level === filter.level))));
        }
      }
      if (stryMutAct_9fa48("44030") ? false : stryMutAct_9fa48("44029") ? true : (stryCov_9fa48("44029", "44030"), filter.nodeId)) {
        if (stryMutAct_9fa48("44031")) {
          {}
        } else {
          stryCov_9fa48("44031");
          logs = stryMutAct_9fa48("44032") ? logs : (stryCov_9fa48("44032"), logs.filter(stryMutAct_9fa48("44033") ? () => undefined : (stryCov_9fa48("44033"), l => stryMutAct_9fa48("44036") ? l.node_id !== filter.nodeId : stryMutAct_9fa48("44035") ? false : stryMutAct_9fa48("44034") ? true : (stryCov_9fa48("44034", "44035", "44036"), l.node_id === filter.nodeId))));
        }
      }
      if (stryMutAct_9fa48("44038") ? false : stryMutAct_9fa48("44037") ? true : (stryCov_9fa48("44037", "44038"), filter.serviceId)) {
        if (stryMutAct_9fa48("44039")) {
          {}
        } else {
          stryCov_9fa48("44039");
          logs = stryMutAct_9fa48("44040") ? logs : (stryCov_9fa48("44040"), logs.filter(stryMutAct_9fa48("44041") ? () => undefined : (stryCov_9fa48("44041"), l => stryMutAct_9fa48("44044") ? l.service_id !== filter.serviceId : stryMutAct_9fa48("44043") ? false : stryMutAct_9fa48("44042") ? true : (stryCov_9fa48("44042", "44043", "44044"), l.service_id === filter.serviceId))));
        }
      }
      if (stryMutAct_9fa48("44046") ? false : stryMutAct_9fa48("44045") ? true : (stryCov_9fa48("44045", "44046"), filter.startTime)) {
        if (stryMutAct_9fa48("44047")) {
          {}
        } else {
          stryCov_9fa48("44047");
          logs = stryMutAct_9fa48("44048") ? logs : (stryCov_9fa48("44048"), logs.filter(stryMutAct_9fa48("44049") ? () => undefined : (stryCov_9fa48("44049"), l => stryMutAct_9fa48("44053") ? l.timestamp < filter.startTime : stryMutAct_9fa48("44052") ? l.timestamp > filter.startTime : stryMutAct_9fa48("44051") ? false : stryMutAct_9fa48("44050") ? true : (stryCov_9fa48("44050", "44051", "44052", "44053"), l.timestamp >= filter.startTime))));
        }
      }
      if (stryMutAct_9fa48("44055") ? false : stryMutAct_9fa48("44054") ? true : (stryCov_9fa48("44054", "44055"), filter.endTime)) {
        if (stryMutAct_9fa48("44056")) {
          {}
        } else {
          stryCov_9fa48("44056");
          logs = stryMutAct_9fa48("44057") ? logs : (stryCov_9fa48("44057"), logs.filter(stryMutAct_9fa48("44058") ? () => undefined : (stryCov_9fa48("44058"), l => stryMutAct_9fa48("44062") ? l.timestamp > filter.endTime : stryMutAct_9fa48("44061") ? l.timestamp < filter.endTime : stryMutAct_9fa48("44060") ? false : stryMutAct_9fa48("44059") ? true : (stryCov_9fa48("44059", "44060", "44061", "44062"), l.timestamp <= filter.endTime))));
        }
      }
      if (stryMutAct_9fa48("44064") ? false : stryMutAct_9fa48("44063") ? true : (stryCov_9fa48("44063", "44064"), filter.messagePattern)) {
        if (stryMutAct_9fa48("44065")) {
          {}
        } else {
          stryCov_9fa48("44065");
          const pattern = new RegExp(filter.messagePattern, stryMutAct_9fa48("44066") ? "" : (stryCov_9fa48("44066"), 'i'));
          logs = stryMutAct_9fa48("44067") ? logs : (stryCov_9fa48("44067"), logs.filter(stryMutAct_9fa48("44068") ? () => undefined : (stryCov_9fa48("44068"), l => pattern.test(stryMutAct_9fa48("44071") ? l.message && '' : stryMutAct_9fa48("44070") ? false : stryMutAct_9fa48("44069") ? true : (stryCov_9fa48("44069", "44070", "44071"), l.message || (stryMutAct_9fa48("44072") ? "Stryker was here!" : (stryCov_9fa48("44072"), '')))))));
        }
      }
      return logs;
    }
  }

  /**
   * Get all config entries
   * Requirements: 13.2
   * @return {Array} Array of config records
   */
  getConfig() {
    if (stryMutAct_9fa48("44073")) {
      {}
    } else {
      stryCov_9fa48("44073");
      return Array.from(this.tables.config.values());
    }
  }

  /**
   * Get a specific config entry by key
   * @param {string} key - The config key
   * @return {Object|undefined} The config record or undefined
   */
  getConfigEntry(key) {
    if (stryMutAct_9fa48("44074")) {
      {}
    } else {
      stryCov_9fa48("44074");
      return this.tables.config.get(key);
    }
  }

  /**
   * Get contexts with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with type and/or namePattern
   * @return {Array} Array of context records
   */
  getContexts(filter = {}) {
    if (stryMutAct_9fa48("44075")) {
      {}
    } else {
      stryCov_9fa48("44075");
      let contexts = Array.from(this.tables.contexts.values());
      if (stryMutAct_9fa48("44077") ? false : stryMutAct_9fa48("44076") ? true : (stryCov_9fa48("44076", "44077"), filter.type)) {
        if (stryMutAct_9fa48("44078")) {
          {}
        } else {
          stryCov_9fa48("44078");
          contexts = stryMutAct_9fa48("44079") ? contexts : (stryCov_9fa48("44079"), contexts.filter(stryMutAct_9fa48("44080") ? () => undefined : (stryCov_9fa48("44080"), c => stryMutAct_9fa48("44083") ? c.context_type !== filter.type : stryMutAct_9fa48("44082") ? false : stryMutAct_9fa48("44081") ? true : (stryCov_9fa48("44081", "44082", "44083"), c.context_type === filter.type))));
        }
      }
      if (stryMutAct_9fa48("44085") ? false : stryMutAct_9fa48("44084") ? true : (stryCov_9fa48("44084", "44085"), filter.namePattern)) {
        if (stryMutAct_9fa48("44086")) {
          {}
        } else {
          stryCov_9fa48("44086");
          const pattern = new RegExp(filter.namePattern, stryMutAct_9fa48("44087") ? "" : (stryCov_9fa48("44087"), 'i'));
          contexts = stryMutAct_9fa48("44088") ? contexts : (stryCov_9fa48("44088"), contexts.filter(stryMutAct_9fa48("44089") ? () => undefined : (stryCov_9fa48("44089"), c => pattern.test(stryMutAct_9fa48("44092") ? c.name && '' : stryMutAct_9fa48("44091") ? false : stryMutAct_9fa48("44090") ? true : (stryCov_9fa48("44090", "44091", "44092"), c.name || (stryMutAct_9fa48("44093") ? "Stryker was here!" : (stryCov_9fa48("44093"), '')))))));
        }
      }
      return contexts;
    }
  }

  /**
   * Get a specific context by ID
   * @param {string} contextId - The context ID
   * @return {Object|undefined} The context record or undefined
   */
  getContext(contextId) {
    if (stryMutAct_9fa48("44094")) {
      {}
    } else {
      stryCov_9fa48("44094");
      return this.tables.contexts.get(contextId);
    }
  }

  /**
   * Get replica operations with optional filtering
   * Requirements: 4.4, 9.3
   * @param {Object} filter - Optional filter with status, type, partitionId, inFlightOnly
   * @return {Array} Array of operation records
   */
  getOperations(filter = {}) {
    if (stryMutAct_9fa48("44095")) {
      {}
    } else {
      stryCov_9fa48("44095");
      let operations = Array.from(this.tables.replica_operations.values());
      if (stryMutAct_9fa48("44097") ? false : stryMutAct_9fa48("44096") ? true : (stryCov_9fa48("44096", "44097"), filter.status)) {
        if (stryMutAct_9fa48("44098")) {
          {}
        } else {
          stryCov_9fa48("44098");
          operations = stryMutAct_9fa48("44099") ? operations : (stryCov_9fa48("44099"), operations.filter(stryMutAct_9fa48("44100") ? () => undefined : (stryCov_9fa48("44100"), op => stryMutAct_9fa48("44103") ? op.status !== filter.status : stryMutAct_9fa48("44102") ? false : stryMutAct_9fa48("44101") ? true : (stryCov_9fa48("44101", "44102", "44103"), op.status === filter.status))));
        }
      }
      if (stryMutAct_9fa48("44105") ? false : stryMutAct_9fa48("44104") ? true : (stryCov_9fa48("44104", "44105"), filter.type)) {
        if (stryMutAct_9fa48("44106")) {
          {}
        } else {
          stryCov_9fa48("44106");
          operations = stryMutAct_9fa48("44107") ? operations : (stryCov_9fa48("44107"), operations.filter(stryMutAct_9fa48("44108") ? () => undefined : (stryCov_9fa48("44108"), op => stryMutAct_9fa48("44111") ? op.type !== filter.type : stryMutAct_9fa48("44110") ? false : stryMutAct_9fa48("44109") ? true : (stryCov_9fa48("44109", "44110", "44111"), op.type === filter.type))));
        }
      }
      if (stryMutAct_9fa48("44113") ? false : stryMutAct_9fa48("44112") ? true : (stryCov_9fa48("44112", "44113"), filter.partitionId)) {
        if (stryMutAct_9fa48("44114")) {
          {}
        } else {
          stryCov_9fa48("44114");
          operations = stryMutAct_9fa48("44115") ? operations : (stryCov_9fa48("44115"), operations.filter(stryMutAct_9fa48("44116") ? () => undefined : (stryCov_9fa48("44116"), op => stryMutAct_9fa48("44119") ? op.partition_id !== filter.partitionId : stryMutAct_9fa48("44118") ? false : stryMutAct_9fa48("44117") ? true : (stryCov_9fa48("44117", "44118", "44119"), op.partition_id === filter.partitionId))));
        }
      }
      if (stryMutAct_9fa48("44121") ? false : stryMutAct_9fa48("44120") ? true : (stryCov_9fa48("44120", "44121"), filter.targetNodeId)) {
        if (stryMutAct_9fa48("44122")) {
          {}
        } else {
          stryCov_9fa48("44122");
          operations = stryMutAct_9fa48("44123") ? operations : (stryCov_9fa48("44123"), operations.filter(stryMutAct_9fa48("44124") ? () => undefined : (stryCov_9fa48("44124"), op => stryMutAct_9fa48("44127") ? op.target_node_id !== filter.targetNodeId : stryMutAct_9fa48("44126") ? false : stryMutAct_9fa48("44125") ? true : (stryCov_9fa48("44125", "44126", "44127"), op.target_node_id === filter.targetNodeId))));
        }
      }
      if (stryMutAct_9fa48("44129") ? false : stryMutAct_9fa48("44128") ? true : (stryCov_9fa48("44128", "44129"), filter.inFlightOnly)) {
        if (stryMutAct_9fa48("44130")) {
          {}
        } else {
          stryCov_9fa48("44130");
          const terminalStatuses = stryMutAct_9fa48("44131") ? [] : (stryCov_9fa48("44131"), [stryMutAct_9fa48("44132") ? "" : (stryCov_9fa48("44132"), 'active'), stryMutAct_9fa48("44133") ? "" : (stryCov_9fa48("44133"), 'removed'), stryMutAct_9fa48("44134") ? "" : (stryCov_9fa48("44134"), 'failed')]);
          operations = stryMutAct_9fa48("44135") ? operations : (stryCov_9fa48("44135"), operations.filter(stryMutAct_9fa48("44136") ? () => undefined : (stryCov_9fa48("44136"), op => stryMutAct_9fa48("44137") ? terminalStatuses.includes(op.status) : (stryCov_9fa48("44137"), !terminalStatuses.includes(op.status)))));
        }
      }

      // Sort by updated_at descending (most recent first)
      stryMutAct_9fa48("44138") ? operations : (stryCov_9fa48("44138"), operations.sort(stryMutAct_9fa48("44139") ? () => undefined : (stryCov_9fa48("44139"), (a, b) => stryMutAct_9fa48("44140") ? (b.updated_at || 0) + (a.updated_at || 0) : (stryCov_9fa48("44140"), (stryMutAct_9fa48("44143") ? b.updated_at && 0 : stryMutAct_9fa48("44142") ? false : stryMutAct_9fa48("44141") ? true : (stryCov_9fa48("44141", "44142", "44143"), b.updated_at || 0)) - (stryMutAct_9fa48("44146") ? a.updated_at && 0 : stryMutAct_9fa48("44145") ? false : stryMutAct_9fa48("44144") ? true : (stryCov_9fa48("44144", "44145", "44146"), a.updated_at || 0))))));
      return operations;
    }
  }

  /**
   * Get a specific operation by ID
   * @param {string} operationId - The operation ID
   * @return {Object|undefined} The operation record or undefined
   */
  getOperation(operationId) {
    if (stryMutAct_9fa48("44147")) {
      {}
    } else {
      stryCov_9fa48("44147");
      return this.tables.replica_operations.get(operationId);
    }
  }

  /**
   * Serialize the cache to JSON for persistence
   * Requirements: 13.7
   * @return {string} JSON string representation of the cache
   */
  serialize() {
    if (stryMutAct_9fa48("44148")) {
      {}
    } else {
      stryCov_9fa48("44148");
      const data = {};
      for (const [name, map] of Object.entries(this.tables)) {
        if (stryMutAct_9fa48("44149")) {
          {}
        } else {
          stryCov_9fa48("44149");
          data[name] = Array.from(map.values());
        }
      }
      return JSON.stringify(stryMutAct_9fa48("44150") ? {} : (stryCov_9fa48("44150"), {
        data,
        lastUpdate: this.lastUpdate
      }));
    }
  }

  /**
   * Deserialize and load cache from JSON
   * Requirements: 13.7
   * @param {string} json - JSON string to deserialize
   */
  deserialize(json) {
    if (stryMutAct_9fa48("44151")) {
      {}
    } else {
      stryCov_9fa48("44151");
      const {
        data,
        lastUpdate
      } = JSON.parse(json);
      this.loadFromDump(data);
      this.lastUpdate = lastUpdate;
    }
  }

  /**
   * Clear all cached data
   */
  clear() {
    if (stryMutAct_9fa48("44152")) {
      {}
    } else {
      stryCov_9fa48("44152");
      for (const map of Object.values(this.tables)) {
        if (stryMutAct_9fa48("44153")) {
          {}
        } else {
          stryCov_9fa48("44153");
          map.clear();
        }
      }
      this.lastUpdate = null;
      this.cdcLag = 0;
      this.affectedTableIds.clear();
    }
  }

  /**
   * Get cache statistics
   * @return {Object} Statistics about the cache
   */
  getStats() {
    if (stryMutAct_9fa48("44154")) {
      {}
    } else {
      stryCov_9fa48("44154");
      const stats = stryMutAct_9fa48("44155") ? {} : (stryCov_9fa48("44155"), {
        lastUpdate: this.lastUpdate,
        cdcLag: this.cdcLag,
        tableCounts: {}
      });
      for (const [name, map] of Object.entries(this.tables)) {
        if (stryMutAct_9fa48("44156")) {
          {}
        } else {
          stryCov_9fa48("44156");
          stats.tableCounts[name] = map.size;
        }
      }
      return stats;
    }
  }

  /**
   * Check if the cache has been initialized
   * @return {boolean} True if cache has data
   */
  isInitialized() {
    if (stryMutAct_9fa48("44157")) {
      {}
    } else {
      stryCov_9fa48("44157");
      return stryMutAct_9fa48("44160") ? this.lastUpdate === null : stryMutAct_9fa48("44159") ? false : stryMutAct_9fa48("44158") ? true : (stryCov_9fa48("44158", "44159", "44160"), this.lastUpdate !== null);
    }
  }

  /**
   * Check if the cache is stale (CDC lag exceeds threshold)
   * Requirements: 13.5
   * @param {number} threshold - Staleness threshold in milliseconds
   * @return {boolean} True if cache is stale
   */
  isStale(threshold = 5000) {
    if (stryMutAct_9fa48("44161")) {
      {}
    } else {
      stryCov_9fa48("44161");
      return stryMutAct_9fa48("44165") ? this.cdcLag <= threshold : stryMutAct_9fa48("44164") ? this.cdcLag >= threshold : stryMutAct_9fa48("44163") ? false : stryMutAct_9fa48("44162") ? true : (stryCov_9fa48("44162", "44163", "44164", "44165"), this.cdcLag > threshold);
    }
  }
}