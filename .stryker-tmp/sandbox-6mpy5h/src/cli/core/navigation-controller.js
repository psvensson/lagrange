/**
 * NavigationController - Manages hierarchical navigation state and breadcrumbs
 *
 * Supports navigation paths:
 * - nodes → replicas → partition/message_group details
 * - services → replicas
 * - tables → partitions → replicas → nodes
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
// @ts-nocheck


/**
 * Valid view names for navigation
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
const VALID_VIEWS = stryMutAct_9fa48("43386") ? [] : (stryCov_9fa48("43386"), [stryMutAct_9fa48("43387") ? "" : (stryCov_9fa48("43387"), 'nodes'), stryMutAct_9fa48("43388") ? "" : (stryCov_9fa48("43388"), 'services'), stryMutAct_9fa48("43389") ? "" : (stryCov_9fa48("43389"), 'tables'), stryMutAct_9fa48("43390") ? "" : (stryCov_9fa48("43390"), 'partitions'), stryMutAct_9fa48("43391") ? "" : (stryCov_9fa48("43391"), 'message_groups'), stryMutAct_9fa48("43392") ? "" : (stryCov_9fa48("43392"), 'sql'), stryMutAct_9fa48("43393") ? "" : (stryCov_9fa48("43393"), 'logs'), stryMutAct_9fa48("43394") ? "" : (stryCov_9fa48("43394"), 'config'), stryMutAct_9fa48("43395") ? "" : (stryCov_9fa48("43395"), 'contexts'), stryMutAct_9fa48("43396") ? "" : (stryCov_9fa48("43396"), 'replicas'), stryMutAct_9fa48("43397") ? "" : (stryCov_9fa48("43397"), 'operations')]);

/**
 * NavigationController class for hierarchical navigation
 */
export class NavigationController {
  /**
   * Creates a new NavigationController
   * @param {import('./remote-cache.js').RemoteCache} cache - Remote cache instance
   * @param {import('./event-bus.js').EventBus} [eventBus] - Optional event bus
   */
  constructor(cache, eventBus = null) {
    if (stryMutAct_9fa48("43398")) {
      {}
    } else {
      stryCov_9fa48("43398");
      this.cache = cache;
      this.eventBus = eventBus;
      this.stack = stryMutAct_9fa48("43399") ? ["Stryker was here"] : (stryCov_9fa48("43399"), []);
      this.currentView = stryMutAct_9fa48("43400") ? "" : (stryCov_9fa48("43400"), 'nodes');
      this.currentContext = null;
    }
  }

  /**
   * Get the current navigation state
   * @return {Object} Current state with view, context, and breadcrumb
   */
  getCurrentState() {
    if (stryMutAct_9fa48("43401")) {
      {}
    } else {
      stryCov_9fa48("43401");
      return stryMutAct_9fa48("43402") ? {} : (stryCov_9fa48("43402"), {
        view: this.currentView,
        context: this.currentContext,
        breadcrumb: this.getBreadcrumb(),
        stackDepth: this.stack.length
      });
    }
  }

  /**
   * Generate breadcrumb string from navigation stack
   * Requirements: 11.3
   * @return {string} Breadcrumb path string
   */
  getBreadcrumb() {
    if (stryMutAct_9fa48("43403")) {
      {}
    } else {
      stryCov_9fa48("43403");
      const parts = stryMutAct_9fa48("43404") ? [] : (stryCov_9fa48("43404"), [stryMutAct_9fa48("43405") ? "" : (stryCov_9fa48("43405"), 'Home')]);
      for (const item of this.stack) {
        if (stryMutAct_9fa48("43406")) {
          {}
        } else {
          stryCov_9fa48("43406");
          parts.push(this.formatBreadcrumbItem(item));
        }
      }

      // Add current view if not at home
      if (stryMutAct_9fa48("43409") ? this.currentView !== 'nodes' && this.currentContext : stryMutAct_9fa48("43408") ? false : stryMutAct_9fa48("43407") ? true : (stryCov_9fa48("43407", "43408", "43409"), (stryMutAct_9fa48("43411") ? this.currentView === 'nodes' : stryMutAct_9fa48("43410") ? false : (stryCov_9fa48("43410", "43411"), this.currentView !== (stryMutAct_9fa48("43412") ? "" : (stryCov_9fa48("43412"), 'nodes')))) || this.currentContext)) {
        if (stryMutAct_9fa48("43413")) {
          {}
        } else {
          stryCov_9fa48("43413");
          parts.push(this.formatBreadcrumbItem(stryMutAct_9fa48("43414") ? {} : (stryCov_9fa48("43414"), {
            view: this.currentView,
            context: this.currentContext
          })));
        }
      }
      return parts.join(stryMutAct_9fa48("43415") ? "" : (stryCov_9fa48("43415"), ' > '));
    }
  }

  /**
   * Format a single breadcrumb item
   * @param {Object} item - Navigation item with view and context
   * @return {string} Formatted breadcrumb string
   */
  formatBreadcrumbItem(item) {
    if (stryMutAct_9fa48("43416")) {
      {}
    } else {
      stryCov_9fa48("43416");
      const {
        view,
        context
      } = item;
      if (stryMutAct_9fa48("43419") ? false : stryMutAct_9fa48("43418") ? true : stryMutAct_9fa48("43417") ? context : (stryCov_9fa48("43417", "43418", "43419"), !context)) {
        if (stryMutAct_9fa48("43420")) {
          {}
        } else {
          stryCov_9fa48("43420");
          return this.formatViewName(view);
        }
      }
      switch (view) {
        case stryMutAct_9fa48("43422") ? "" : (stryCov_9fa48("43422"), 'nodes'):
          if (stryMutAct_9fa48("43421")) {} else {
            stryCov_9fa48("43421");
            return context.nodeId ? stryMutAct_9fa48("43423") ? `` : (stryCov_9fa48("43423"), `Node: ${context.nodeId}`) : stryMutAct_9fa48("43424") ? "" : (stryCov_9fa48("43424"), 'Nodes');
          }
        case stryMutAct_9fa48("43426") ? "" : (stryCov_9fa48("43426"), 'services'):
          if (stryMutAct_9fa48("43425")) {} else {
            stryCov_9fa48("43425");
            if (stryMutAct_9fa48("43428") ? false : stryMutAct_9fa48("43427") ? true : (stryCov_9fa48("43427", "43428"), context.nodeId)) {
              if (stryMutAct_9fa48("43429")) {
                {}
              } else {
                stryCov_9fa48("43429");
                return stryMutAct_9fa48("43430") ? `` : (stryCov_9fa48("43430"), `Services (${context.nodeId})`);
              }
            }
            if (stryMutAct_9fa48("43432") ? false : stryMutAct_9fa48("43431") ? true : (stryCov_9fa48("43431", "43432"), context.serviceId)) {
              if (stryMutAct_9fa48("43433")) {
                {}
              } else {
                stryCov_9fa48("43433");
                return stryMutAct_9fa48("43434") ? `` : (stryCov_9fa48("43434"), `Service: ${context.serviceId}`);
              }
            }
            return stryMutAct_9fa48("43435") ? "" : (stryCov_9fa48("43435"), 'Services');
          }
        case stryMutAct_9fa48("43437") ? "" : (stryCov_9fa48("43437"), 'tables'):
          if (stryMutAct_9fa48("43436")) {} else {
            stryCov_9fa48("43436");
            return context.tableName ? stryMutAct_9fa48("43438") ? `` : (stryCov_9fa48("43438"), `Table: ${context.tableName}`) : context.tableId ? stryMutAct_9fa48("43439") ? `` : (stryCov_9fa48("43439"), `Table: ${context.tableId}`) : stryMutAct_9fa48("43440") ? "" : (stryCov_9fa48("43440"), 'Tables');
          }
        case stryMutAct_9fa48("43442") ? "" : (stryCov_9fa48("43442"), 'partitions'):
          if (stryMutAct_9fa48("43441")) {} else {
            stryCov_9fa48("43441");
            if (stryMutAct_9fa48("43444") ? false : stryMutAct_9fa48("43443") ? true : (stryCov_9fa48("43443", "43444"), context.partitionId)) {
              if (stryMutAct_9fa48("43445")) {
                {}
              } else {
                stryCov_9fa48("43445");
                return stryMutAct_9fa48("43446") ? `` : (stryCov_9fa48("43446"), `Partition: ${context.partitionId}`);
              }
            }
            if (stryMutAct_9fa48("43449") ? context.tableId && context.tableName : stryMutAct_9fa48("43448") ? false : stryMutAct_9fa48("43447") ? true : (stryCov_9fa48("43447", "43448", "43449"), context.tableId || context.tableName)) {
              if (stryMutAct_9fa48("43450")) {
                {}
              } else {
                stryCov_9fa48("43450");
                return stryMutAct_9fa48("43451") ? `` : (stryCov_9fa48("43451"), `Partitions (${stryMutAct_9fa48("43454") ? context.tableName && context.tableId : stryMutAct_9fa48("43453") ? false : stryMutAct_9fa48("43452") ? true : (stryCov_9fa48("43452", "43453", "43454"), context.tableName || context.tableId)})`);
              }
            }
            return stryMutAct_9fa48("43455") ? "" : (stryCov_9fa48("43455"), 'Partitions');
          }
        case stryMutAct_9fa48("43457") ? "" : (stryCov_9fa48("43457"), 'message_groups'):
          if (stryMutAct_9fa48("43456")) {} else {
            stryCov_9fa48("43456");
            return context.groupId ? stryMutAct_9fa48("43458") ? `` : (stryCov_9fa48("43458"), `MG: ${context.groupId}`) : stryMutAct_9fa48("43459") ? "" : (stryCov_9fa48("43459"), 'Message Groups');
          }
        case stryMutAct_9fa48("43461") ? "" : (stryCov_9fa48("43461"), 'replicas'):
          if (stryMutAct_9fa48("43460")) {} else {
            stryCov_9fa48("43460");
            if (stryMutAct_9fa48("43463") ? false : stryMutAct_9fa48("43462") ? true : (stryCov_9fa48("43462", "43463"), context.serviceId)) {
              if (stryMutAct_9fa48("43464")) {
                {}
              } else {
                stryCov_9fa48("43464");
                return stryMutAct_9fa48("43465") ? `` : (stryCov_9fa48("43465"), `Replicas (${context.serviceId})`);
              }
            }
            if (stryMutAct_9fa48("43467") ? false : stryMutAct_9fa48("43466") ? true : (stryCov_9fa48("43466", "43467"), context.nodeId)) {
              if (stryMutAct_9fa48("43468")) {
                {}
              } else {
                stryCov_9fa48("43468");
                return stryMutAct_9fa48("43469") ? `` : (stryCov_9fa48("43469"), `Replicas (${context.nodeId})`);
              }
            }
            if (stryMutAct_9fa48("43471") ? false : stryMutAct_9fa48("43470") ? true : (stryCov_9fa48("43470", "43471"), context.groupId)) {
              if (stryMutAct_9fa48("43472")) {
                {}
              } else {
                stryCov_9fa48("43472");
                return stryMutAct_9fa48("43473") ? `` : (stryCov_9fa48("43473"), `Replicas (${context.groupId})`);
              }
            }
            return context.partitionId ? stryMutAct_9fa48("43474") ? `` : (stryCov_9fa48("43474"), `Replicas (${context.partitionId})`) : stryMutAct_9fa48("43475") ? "" : (stryCov_9fa48("43475"), 'Replicas');
          }
        case stryMutAct_9fa48("43477") ? "" : (stryCov_9fa48("43477"), 'operations'):
          if (stryMutAct_9fa48("43476")) {} else {
            stryCov_9fa48("43476");
            return context.operationId ? stryMutAct_9fa48("43478") ? `` : (stryCov_9fa48("43478"), `Operation: ${stryMutAct_9fa48("43479") ? context.operationId : (stryCov_9fa48("43479"), context.operationId.substring(0, 8))}...`) : stryMutAct_9fa48("43480") ? "" : (stryCov_9fa48("43480"), 'Operations');
          }
        case stryMutAct_9fa48("43482") ? "" : (stryCov_9fa48("43482"), 'sql'):
          if (stryMutAct_9fa48("43481")) {} else {
            stryCov_9fa48("43481");
            return stryMutAct_9fa48("43483") ? "" : (stryCov_9fa48("43483"), 'SQL Query');
          }
        case stryMutAct_9fa48("43485") ? "" : (stryCov_9fa48("43485"), 'logs'):
          if (stryMutAct_9fa48("43484")) {} else {
            stryCov_9fa48("43484");
            return stryMutAct_9fa48("43486") ? "" : (stryCov_9fa48("43486"), 'Logs');
          }
        case stryMutAct_9fa48("43488") ? "" : (stryCov_9fa48("43488"), 'config'):
          if (stryMutAct_9fa48("43487")) {} else {
            stryCov_9fa48("43487");
            return stryMutAct_9fa48("43489") ? "" : (stryCov_9fa48("43489"), 'Config');
          }
        case stryMutAct_9fa48("43491") ? "" : (stryCov_9fa48("43491"), 'contexts'):
          if (stryMutAct_9fa48("43490")) {} else {
            stryCov_9fa48("43490");
            return stryMutAct_9fa48("43492") ? "" : (stryCov_9fa48("43492"), 'Contexts');
          }
        default:
          if (stryMutAct_9fa48("43493")) {} else {
            stryCov_9fa48("43493");
            return this.formatViewName(view);
          }
      }
    }
  }

  /**
   * Format view name for display
   * @param {string} view - View name
   * @return {string} Formatted view name
   */
  formatViewName(view) {
    if (stryMutAct_9fa48("43494")) {
      {}
    } else {
      stryCov_9fa48("43494");
      const names = stryMutAct_9fa48("43495") ? {} : (stryCov_9fa48("43495"), {
        'nodes': stryMutAct_9fa48("43496") ? "" : (stryCov_9fa48("43496"), 'Nodes'),
        'services': stryMutAct_9fa48("43497") ? "" : (stryCov_9fa48("43497"), 'Services'),
        'tables': stryMutAct_9fa48("43498") ? "" : (stryCov_9fa48("43498"), 'Tables'),
        'partitions': stryMutAct_9fa48("43499") ? "" : (stryCov_9fa48("43499"), 'Partitions'),
        'message_groups': stryMutAct_9fa48("43500") ? "" : (stryCov_9fa48("43500"), 'Message Groups'),
        'sql': stryMutAct_9fa48("43501") ? "" : (stryCov_9fa48("43501"), 'SQL Query'),
        'logs': stryMutAct_9fa48("43502") ? "" : (stryCov_9fa48("43502"), 'Logs'),
        'config': stryMutAct_9fa48("43503") ? "" : (stryCov_9fa48("43503"), 'Config'),
        'contexts': stryMutAct_9fa48("43504") ? "" : (stryCov_9fa48("43504"), 'Contexts'),
        'replicas': stryMutAct_9fa48("43505") ? "" : (stryCov_9fa48("43505"), 'Replicas'),
        'operations': stryMutAct_9fa48("43506") ? "" : (stryCov_9fa48("43506"), 'Operations')
      });
      return stryMutAct_9fa48("43509") ? names[view] && view : stryMutAct_9fa48("43508") ? false : stryMutAct_9fa48("43507") ? true : (stryCov_9fa48("43507", "43508", "43509"), names[view] || view);
    }
  }

  /**
   * Drill down to a child view with context
   * Requirements: 11.1, 11.2
   * @param {string} view - Target view name
   * @param {Object} context - Navigation context
   */
  drillDown(view, context) {
    if (stryMutAct_9fa48("43510")) {
      {}
    } else {
      stryCov_9fa48("43510");
      if (stryMutAct_9fa48("43513") ? false : stryMutAct_9fa48("43512") ? true : stryMutAct_9fa48("43511") ? VALID_VIEWS.includes(view) : (stryCov_9fa48("43511", "43512", "43513"), !VALID_VIEWS.includes(view))) {
        if (stryMutAct_9fa48("43514")) {
          {}
        } else {
          stryCov_9fa48("43514");
          throw new Error(stryMutAct_9fa48("43515") ? `` : (stryCov_9fa48("43515"), `Invalid view: ${view}`));
        }
      }

      // Push current state to stack
      this.stack.push(stryMutAct_9fa48("43516") ? {} : (stryCov_9fa48("43516"), {
        view: this.currentView,
        context: this.currentContext
      }));
      this.currentView = view;
      this.currentContext = context;
      this.emitNavigationEvent(stryMutAct_9fa48("43517") ? "" : (stryCov_9fa48("43517"), 'drillDown'), stryMutAct_9fa48("43518") ? {} : (stryCov_9fa48("43518"), {
        view,
        context
      }));
    }
  }

  /**
   * Navigate back one level in the hierarchy
   * Requirements: 11.4
   * @return {boolean} True if navigation occurred, false if at root
   */
  goBack() {
    if (stryMutAct_9fa48("43519")) {
      {}
    } else {
      stryCov_9fa48("43519");
      if (stryMutAct_9fa48("43522") ? this.stack.length !== 0 : stryMutAct_9fa48("43521") ? false : stryMutAct_9fa48("43520") ? true : (stryCov_9fa48("43520", "43521", "43522"), this.stack.length === 0)) {
        if (stryMutAct_9fa48("43523")) {
          {}
        } else {
          stryCov_9fa48("43523");
          return stryMutAct_9fa48("43524") ? true : (stryCov_9fa48("43524"), false);
        }
      }
      const prev = this.stack.pop();
      const oldView = this.currentView;
      const oldContext = this.currentContext;
      this.currentView = prev.view;
      this.currentContext = prev.context;
      this.emitNavigationEvent(stryMutAct_9fa48("43525") ? "" : (stryCov_9fa48("43525"), 'goBack'), stryMutAct_9fa48("43526") ? {} : (stryCov_9fa48("43526"), {
        from: stryMutAct_9fa48("43527") ? {} : (stryCov_9fa48("43527"), {
          view: oldView,
          context: oldContext
        }),
        to: stryMutAct_9fa48("43528") ? {} : (stryCov_9fa48("43528"), {
          view: this.currentView,
          context: this.currentContext
        })
      }));
      return stryMutAct_9fa48("43529") ? false : (stryCov_9fa48("43529"), true);
    }
  }

  /**
   * Navigate directly to a view, clearing the stack
   * @param {string} view - Target view name
   */
  goToView(view) {
    if (stryMutAct_9fa48("43530")) {
      {}
    } else {
      stryCov_9fa48("43530");
      if (stryMutAct_9fa48("43533") ? false : stryMutAct_9fa48("43532") ? true : stryMutAct_9fa48("43531") ? VALID_VIEWS.includes(view) : (stryCov_9fa48("43531", "43532", "43533"), !VALID_VIEWS.includes(view))) {
        if (stryMutAct_9fa48("43534")) {
          {}
        } else {
          stryCov_9fa48("43534");
          throw new Error(stryMutAct_9fa48("43535") ? `` : (stryCov_9fa48("43535"), `Invalid view: ${view}`));
        }
      }
      const oldView = this.currentView;
      const oldContext = this.currentContext;
      this.stack = stryMutAct_9fa48("43536") ? ["Stryker was here"] : (stryCov_9fa48("43536"), []);
      this.currentView = view;
      this.currentContext = null;
      this.emitNavigationEvent(stryMutAct_9fa48("43537") ? "" : (stryCov_9fa48("43537"), 'goToView'), stryMutAct_9fa48("43538") ? {} : (stryCov_9fa48("43538"), {
        from: stryMutAct_9fa48("43539") ? {} : (stryCov_9fa48("43539"), {
          view: oldView,
          context: oldContext
        }),
        to: stryMutAct_9fa48("43540") ? {} : (stryCov_9fa48("43540"), {
          view,
          context: null
        })
      }));
    }
  }

  /**
   * Jump directly to a specific entity
   * Requirements: 11.5
   * @param {string} entityType - Entity type (node, table, partition, etc.)
   * @param {string} entityId - Entity ID
   */
  jumpToEntity(entityType, entityId) {
    if (stryMutAct_9fa48("43541")) {
      {}
    } else {
      stryCov_9fa48("43541");
      const viewMap = stryMutAct_9fa48("43542") ? {} : (stryCov_9fa48("43542"), {
        'node': stryMutAct_9fa48("43543") ? "" : (stryCov_9fa48("43543"), 'nodes'),
        'service': stryMutAct_9fa48("43544") ? "" : (stryCov_9fa48("43544"), 'services'),
        'table': stryMutAct_9fa48("43545") ? "" : (stryCov_9fa48("43545"), 'tables'),
        'partition': stryMutAct_9fa48("43546") ? "" : (stryCov_9fa48("43546"), 'partitions'),
        'message_group': stryMutAct_9fa48("43547") ? "" : (stryCov_9fa48("43547"), 'message_groups'),
        'replica': stryMutAct_9fa48("43548") ? "" : (stryCov_9fa48("43548"), 'replicas')
      });
      const view = viewMap[entityType];
      if (stryMutAct_9fa48("43551") ? false : stryMutAct_9fa48("43550") ? true : stryMutAct_9fa48("43549") ? view : (stryCov_9fa48("43549", "43550", "43551"), !view)) {
        if (stryMutAct_9fa48("43552")) {
          {}
        } else {
          stryCov_9fa48("43552");
          throw new Error(stryMutAct_9fa48("43553") ? `` : (stryCov_9fa48("43553"), `Unknown entity type: ${entityType}`));
        }
      }
      const contextKey = stryMutAct_9fa48("43554") ? `` : (stryCov_9fa48("43554"), `${entityType}Id`);
      const context = stryMutAct_9fa48("43555") ? {} : (stryCov_9fa48("43555"), {
        [contextKey]: entityId
      });

      // Clear stack and navigate directly
      this.stack = stryMutAct_9fa48("43556") ? ["Stryker was here"] : (stryCov_9fa48("43556"), []);
      this.currentView = view;
      this.currentContext = context;
      this.emitNavigationEvent(stryMutAct_9fa48("43557") ? "" : (stryCov_9fa48("43557"), 'jumpToEntity'), stryMutAct_9fa48("43558") ? {} : (stryCov_9fa48("43558"), {
        entityType,
        entityId,
        view,
        context
      }));
    }
  }

  /**
   * Get data for the current view from cache
   * @return {Array} View data
   */
  getViewData() {
    if (stryMutAct_9fa48("43559")) {
      {}
    } else {
      stryCov_9fa48("43559");
      switch (this.currentView) {
        case stryMutAct_9fa48("43561") ? "" : (stryCov_9fa48("43561"), 'nodes'):
          if (stryMutAct_9fa48("43560")) {} else {
            stryCov_9fa48("43560");
            return this.cache.getNodes();
          }
        case stryMutAct_9fa48("43563") ? "" : (stryCov_9fa48("43563"), 'services'):
          if (stryMutAct_9fa48("43562")) {} else {
            stryCov_9fa48("43562");
            return this.cache.getLogicalServices(stryMutAct_9fa48("43566") ? this.currentContext && {} : stryMutAct_9fa48("43565") ? false : stryMutAct_9fa48("43564") ? true : (stryCov_9fa48("43564", "43565", "43566"), this.currentContext || {}));
          }
        case stryMutAct_9fa48("43568") ? "" : (stryCov_9fa48("43568"), 'replicas'):
          if (stryMutAct_9fa48("43567")) {} else {
            stryCov_9fa48("43567");
            return this.cache.getServices(stryMutAct_9fa48("43571") ? this.currentContext && {} : stryMutAct_9fa48("43570") ? false : stryMutAct_9fa48("43569") ? true : (stryCov_9fa48("43569", "43570", "43571"), this.currentContext || {}));
          }
        case stryMutAct_9fa48("43573") ? "" : (stryCov_9fa48("43573"), 'tables'):
          if (stryMutAct_9fa48("43572")) {} else {
            stryCov_9fa48("43572");
            return this.cache.getTables();
          }
        case stryMutAct_9fa48("43575") ? "" : (stryCov_9fa48("43575"), 'partitions'):
          if (stryMutAct_9fa48("43574")) {} else {
            stryCov_9fa48("43574");
            return this.cache.getPartitions(stryMutAct_9fa48("43578") ? this.currentContext && {} : stryMutAct_9fa48("43577") ? false : stryMutAct_9fa48("43576") ? true : (stryCov_9fa48("43576", "43577", "43578"), this.currentContext || {}));
          }
        case stryMutAct_9fa48("43580") ? "" : (stryCov_9fa48("43580"), 'message_groups'):
          if (stryMutAct_9fa48("43579")) {} else {
            stryCov_9fa48("43579");
            return this.cache.getMessageGroups();
          }
        case stryMutAct_9fa48("43582") ? "" : (stryCov_9fa48("43582"), 'logs'):
          if (stryMutAct_9fa48("43581")) {} else {
            stryCov_9fa48("43581");
            return this.cache.getLogs(stryMutAct_9fa48("43585") ? this.currentContext && {} : stryMutAct_9fa48("43584") ? false : stryMutAct_9fa48("43583") ? true : (stryCov_9fa48("43583", "43584", "43585"), this.currentContext || {}));
          }
        case stryMutAct_9fa48("43587") ? "" : (stryCov_9fa48("43587"), 'config'):
          if (stryMutAct_9fa48("43586")) {} else {
            stryCov_9fa48("43586");
            return this.cache.getConfig();
          }
        case stryMutAct_9fa48("43589") ? "" : (stryCov_9fa48("43589"), 'contexts'):
          if (stryMutAct_9fa48("43588")) {} else {
            stryCov_9fa48("43588");
            return this.cache.getContexts(stryMutAct_9fa48("43592") ? this.currentContext && {} : stryMutAct_9fa48("43591") ? false : stryMutAct_9fa48("43590") ? true : (stryCov_9fa48("43590", "43591", "43592"), this.currentContext || {}));
          }
        case stryMutAct_9fa48("43594") ? "" : (stryCov_9fa48("43594"), 'operations'):
          if (stryMutAct_9fa48("43593")) {} else {
            stryCov_9fa48("43593");
            return this.cache.getOperations(stryMutAct_9fa48("43597") ? this.currentContext && {} : stryMutAct_9fa48("43596") ? false : stryMutAct_9fa48("43595") ? true : (stryCov_9fa48("43595", "43596", "43597"), this.currentContext || {}));
          }
        default:
          if (stryMutAct_9fa48("43598")) {} else {
            stryCov_9fa48("43598");
            return stryMutAct_9fa48("43599") ? ["Stryker was here"] : (stryCov_9fa48("43599"), []);
          }
      }
    }
  }

  /**
   * Get counts of related child entities
   * Requirements: 11.6
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @return {Object} Counts of related entities
   */
  getRelatedCounts(entityType, entityId) {
    if (stryMutAct_9fa48("43600")) {
      {}
    } else {
      stryCov_9fa48("43600");
      switch (entityType) {
        case stryMutAct_9fa48("43602") ? "" : (stryCov_9fa48("43602"), 'node'):
          if (stryMutAct_9fa48("43601")) {} else {
            stryCov_9fa48("43601");
            return stryMutAct_9fa48("43603") ? {} : (stryCov_9fa48("43603"), {
              services: this.cache.getLogicalServices(stryMutAct_9fa48("43604") ? {} : (stryCov_9fa48("43604"), {
                nodeId: entityId
              })).length,
              replicas: this.cache.getServices(stryMutAct_9fa48("43605") ? {} : (stryCov_9fa48("43605"), {
                nodeId: entityId
              })).length
            });
          }
        case stryMutAct_9fa48("43607") ? "" : (stryCov_9fa48("43607"), 'table'):
          if (stryMutAct_9fa48("43606")) {} else {
            stryCov_9fa48("43606");
            return stryMutAct_9fa48("43608") ? {} : (stryCov_9fa48("43608"), {
              partitions: this.cache.getPartitions(stryMutAct_9fa48("43609") ? {} : (stryCov_9fa48("43609"), {
                tableId: entityId
              })).length
            });
          }
        case stryMutAct_9fa48("43611") ? "" : (stryCov_9fa48("43611"), 'partition'):
          if (stryMutAct_9fa48("43610")) {} else {
            stryCov_9fa48("43610");
            {
              if (stryMutAct_9fa48("43612")) {
                {}
              } else {
                stryCov_9fa48("43612");
                const partition = this.cache.getPartition(entityId);
                return stryMutAct_9fa48("43613") ? {} : (stryCov_9fa48("43613"), {
                  replicas: partition ? stryMutAct_9fa48("43616") ? partition.replica_count && 0 : stryMutAct_9fa48("43615") ? false : stryMutAct_9fa48("43614") ? true : (stryCov_9fa48("43614", "43615", "43616"), partition.replica_count || 0) : 0
                });
              }
            }
          }
        case stryMutAct_9fa48("43618") ? "" : (stryCov_9fa48("43618"), 'message_group'):
          if (stryMutAct_9fa48("43617")) {} else {
            stryCov_9fa48("43617");
            {
              if (stryMutAct_9fa48("43619")) {
                {}
              } else {
                stryCov_9fa48("43619");
                const group = this.cache.getMessageGroup(entityId);
                return stryMutAct_9fa48("43620") ? {} : (stryCov_9fa48("43620"), {
                  replicas: group ? stryMutAct_9fa48("43623") ? group.replica_count && 0 : stryMutAct_9fa48("43622") ? false : stryMutAct_9fa48("43621") ? true : (stryCov_9fa48("43621", "43622", "43623"), group.replica_count || 0) : 0
                });
              }
            }
          }
        default:
          if (stryMutAct_9fa48("43624")) {} else {
            stryCov_9fa48("43624");
            return {};
          }
      }
    }
  }

  /**
   * Check if we can navigate back
   * @return {boolean} True if back navigation is possible
   */
  canGoBack() {
    if (stryMutAct_9fa48("43625")) {
      {}
    } else {
      stryCov_9fa48("43625");
      return stryMutAct_9fa48("43629") ? this.stack.length <= 0 : stryMutAct_9fa48("43628") ? this.stack.length >= 0 : stryMutAct_9fa48("43627") ? false : stryMutAct_9fa48("43626") ? true : (stryCov_9fa48("43626", "43627", "43628", "43629"), this.stack.length > 0);
    }
  }

  /**
   * Get the navigation stack depth
   * @return {number} Stack depth
   */
  getStackDepth() {
    if (stryMutAct_9fa48("43630")) {
      {}
    } else {
      stryCov_9fa48("43630");
      return this.stack.length;
    }
  }

  /**
   * Reset navigation to initial state
   */
  reset() {
    if (stryMutAct_9fa48("43631")) {
      {}
    } else {
      stryCov_9fa48("43631");
      this.stack = stryMutAct_9fa48("43632") ? ["Stryker was here"] : (stryCov_9fa48("43632"), []);
      this.currentView = stryMutAct_9fa48("43633") ? "" : (stryCov_9fa48("43633"), 'nodes');
      this.currentContext = null;
      this.emitNavigationEvent(stryMutAct_9fa48("43634") ? "" : (stryCov_9fa48("43634"), 'reset'), {});
    }
  }

  /**
   * Emit a navigation event via the event bus
   * @param {string} action - Navigation action
   * @param {Object} data - Event data
   */
  emitNavigationEvent(action, data) {
    if (stryMutAct_9fa48("43635")) {
      {}
    } else {
      stryCov_9fa48("43635");
      if (stryMutAct_9fa48("43637") ? false : stryMutAct_9fa48("43636") ? true : (stryCov_9fa48("43636", "43637"), this.eventBus)) {
        if (stryMutAct_9fa48("43638")) {
          {}
        } else {
          stryCov_9fa48("43638");
          this.eventBus.emit((stryMutAct_9fa48("43639") ? "" : (stryCov_9fa48("43639"), 'navigation:')) + action, stryMutAct_9fa48("43640") ? {} : (stryCov_9fa48("43640"), {
            ...data,
            state: this.getCurrentState()
          }));
        }
      }
    }
  }
}