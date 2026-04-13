/**
 * ComponentRegistry - Dependency injection container with topological initialization
 * Manages component lifecycles and dependency resolution
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7
 */
// @ts-nocheck


/**
 * @typedef {Object} ComponentDefinition
 * @property {Function} factory - Factory function to create the component
 * @property {string[]} dependencies - Names of required dependencies
 * @property {'singleton'|'factory'} lifecycle - Component lifecycle type
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
export class ComponentRegistry {
  constructor() {
    if (stryMutAct_9fa48("40518")) {
      {}
    } else {
      stryCov_9fa48("40518");
      /** @type {Map<string, ComponentDefinition>} */
      this.definitions = new Map();

      /** @type {Map<string, *>} */
      this.instances = new Map();

      /** @type {Map<string, *>} */
      this.mocks = new Map();
      this.initialized = stryMutAct_9fa48("40519") ? true : (stryCov_9fa48("40519"), false);
    }
  }

  /**
   * Register a component factory
   * @param {string} name - Component name
   * @param {Function} factory - Factory function (receives dependencies as args)
   * @param {Object} options - Registration options
   * @param {string[]} [options.dependencies=[]] - Required dependency names
   * @param {'singleton'|'factory'} [options.lifecycle='singleton'] - Lifecycle type
   */
  register(name, factory, options = {}) {
    if (stryMutAct_9fa48("40520")) {
      {}
    } else {
      stryCov_9fa48("40520");
      if (stryMutAct_9fa48("40522") ? false : stryMutAct_9fa48("40521") ? true : (stryCov_9fa48("40521", "40522"), this.initialized)) {
        if (stryMutAct_9fa48("40523")) {
          {}
        } else {
          stryCov_9fa48("40523");
          throw new Error(stryMutAct_9fa48("40524") ? "" : (stryCov_9fa48("40524"), 'Cannot register components after initialization'));
        }
      }
      const definition = stryMutAct_9fa48("40525") ? {} : (stryCov_9fa48("40525"), {
        factory,
        dependencies: stryMutAct_9fa48("40528") ? options.dependencies && [] : stryMutAct_9fa48("40527") ? false : stryMutAct_9fa48("40526") ? true : (stryCov_9fa48("40526", "40527", "40528"), options.dependencies || (stryMutAct_9fa48("40529") ? ["Stryker was here"] : (stryCov_9fa48("40529"), []))),
        lifecycle: stryMutAct_9fa48("40532") ? options.lifecycle && 'singleton' : stryMutAct_9fa48("40531") ? false : stryMutAct_9fa48("40530") ? true : (stryCov_9fa48("40530", "40531", "40532"), options.lifecycle || (stryMutAct_9fa48("40533") ? "" : (stryCov_9fa48("40533"), 'singleton')))
      });
      this.definitions.set(name, definition);
    }
  }

  /**
   * Register a mock component for testing
   * @param {string} name - Component name to mock
   * @param {*} mock - Mock instance
   */
  registerMock(name, mock) {
    if (stryMutAct_9fa48("40534")) {
      {}
    } else {
      stryCov_9fa48("40534");
      this.mocks.set(name, mock);
    }
  }

  /**
   * Clear all mocks
   */
  clearMocks() {
    if (stryMutAct_9fa48("40535")) {
      {}
    } else {
      stryCov_9fa48("40535");
      this.mocks.clear();
    }
  }

  /**
   * Initialize all components in dependency order
   * @throws {Error} If circular dependency detected
   */
  async initialize() {
    if (stryMutAct_9fa48("40536")) {
      {}
    } else {
      stryCov_9fa48("40536");
      // Check for circular dependencies first
      const circularDep = this.detectCircularDependency();
      if (stryMutAct_9fa48("40538") ? false : stryMutAct_9fa48("40537") ? true : (stryCov_9fa48("40537", "40538"), circularDep)) {
        if (stryMutAct_9fa48("40539")) {
          {}
        } else {
          stryCov_9fa48("40539");
          throw new Error(stryMutAct_9fa48("40540") ? `` : (stryCov_9fa48("40540"), `Circular dependency detected: ${circularDep.join(stryMutAct_9fa48("40541") ? "" : (stryCov_9fa48("40541"), ' -> '))}`));
        }
      }

      // Get initialization order via topological sort
      const order = this.getInitializationOrder();

      // Initialize components in order
      for (const name of order) {
        if (stryMutAct_9fa48("40542")) {
          {}
        } else {
          stryCov_9fa48("40542");
          await this.initializeComponent(name);
        }
      }
      this.initialized = stryMutAct_9fa48("40543") ? false : (stryCov_9fa48("40543"), true);
    }
  }

  /**
   * Initialize a single component
   * @param {string} name - Component name
   */
  async initializeComponent(name) {
    if (stryMutAct_9fa48("40544")) {
      {}
    } else {
      stryCov_9fa48("40544");
      // Check for mock first
      if (stryMutAct_9fa48("40546") ? false : stryMutAct_9fa48("40545") ? true : (stryCov_9fa48("40545", "40546"), this.mocks.has(name))) {
        if (stryMutAct_9fa48("40547")) {
          {}
        } else {
          stryCov_9fa48("40547");
          this.instances.set(name, this.mocks.get(name));
          return;
        }
      }

      // Skip if already initialized (singleton)
      if (stryMutAct_9fa48("40549") ? false : stryMutAct_9fa48("40548") ? true : (stryCov_9fa48("40548", "40549"), this.instances.has(name))) {
        if (stryMutAct_9fa48("40550")) {
          {}
        } else {
          stryCov_9fa48("40550");
          return;
        }
      }
      const definition = this.definitions.get(name);
      if (stryMutAct_9fa48("40553") ? false : stryMutAct_9fa48("40552") ? true : stryMutAct_9fa48("40551") ? definition : (stryCov_9fa48("40551", "40552", "40553"), !definition)) {
        if (stryMutAct_9fa48("40554")) {
          {}
        } else {
          stryCov_9fa48("40554");
          throw new Error(stryMutAct_9fa48("40555") ? `` : (stryCov_9fa48("40555"), `Component not registered: ${name}`));
        }
      }

      // Resolve dependencies
      const deps = definition.dependencies.map(depName => {
        if (stryMutAct_9fa48("40556")) {
          {}
        } else {
          stryCov_9fa48("40556");
          const dep = this.get(depName);
          if (stryMutAct_9fa48("40559") ? dep !== undefined : stryMutAct_9fa48("40558") ? false : stryMutAct_9fa48("40557") ? true : (stryCov_9fa48("40557", "40558", "40559"), dep === undefined)) {
            if (stryMutAct_9fa48("40560")) {
              {}
            } else {
              stryCov_9fa48("40560");
              throw new Error(stryMutAct_9fa48("40561") ? `` : (stryCov_9fa48("40561"), `Dependency not found: ${depName} (required by ${name})`));
            }
          }
          return dep;
        }
      });

      // Create instance
      const instance = await definition.factory(...deps);

      // Store singleton instances
      if (stryMutAct_9fa48("40564") ? definition.lifecycle !== 'singleton' : stryMutAct_9fa48("40563") ? false : stryMutAct_9fa48("40562") ? true : (stryCov_9fa48("40562", "40563", "40564"), definition.lifecycle === (stryMutAct_9fa48("40565") ? "" : (stryCov_9fa48("40565"), 'singleton')))) {
        if (stryMutAct_9fa48("40566")) {
          {}
        } else {
          stryCov_9fa48("40566");
          this.instances.set(name, instance);
        }
      }
      return instance;
    }
  }

  /**
   * Get a component instance
   * @param {string} name - Component name
   * @returns {*} Component instance
   */
  get(name) {
    if (stryMutAct_9fa48("40567")) {
      {}
    } else {
      stryCov_9fa48("40567");
      // Check mocks first
      if (stryMutAct_9fa48("40569") ? false : stryMutAct_9fa48("40568") ? true : (stryCov_9fa48("40568", "40569"), this.mocks.has(name))) {
        if (stryMutAct_9fa48("40570")) {
          {}
        } else {
          stryCov_9fa48("40570");
          return this.mocks.get(name);
        }
      }

      // Check existing instances
      if (stryMutAct_9fa48("40572") ? false : stryMutAct_9fa48("40571") ? true : (stryCov_9fa48("40571", "40572"), this.instances.has(name))) {
        if (stryMutAct_9fa48("40573")) {
          {}
        } else {
          stryCov_9fa48("40573");
          return this.instances.get(name);
        }
      }

      // For factory lifecycle, create new instance
      const definition = this.definitions.get(name);
      if (stryMutAct_9fa48("40576") ? definition || definition.lifecycle === 'factory' : stryMutAct_9fa48("40575") ? false : stryMutAct_9fa48("40574") ? true : (stryCov_9fa48("40574", "40575", "40576"), definition && (stryMutAct_9fa48("40578") ? definition.lifecycle !== 'factory' : stryMutAct_9fa48("40577") ? true : (stryCov_9fa48("40577", "40578"), definition.lifecycle === (stryMutAct_9fa48("40579") ? "" : (stryCov_9fa48("40579"), 'factory')))))) {
        if (stryMutAct_9fa48("40580")) {
          {}
        } else {
          stryCov_9fa48("40580");
          const deps = definition.dependencies.map(stryMutAct_9fa48("40581") ? () => undefined : (stryCov_9fa48("40581"), d => this.get(d)));
          return definition.factory(...deps);
        }
      }
      return undefined;
    }
  }

  /**
   * Check if a component is registered
   * @param {string} name - Component name
   * @returns {boolean}
   */
  has(name) {
    if (stryMutAct_9fa48("40582")) {
      {}
    } else {
      stryCov_9fa48("40582");
      return stryMutAct_9fa48("40585") ? this.definitions.has(name) && this.mocks.has(name) : stryMutAct_9fa48("40584") ? false : stryMutAct_9fa48("40583") ? true : (stryCov_9fa48("40583", "40584", "40585"), this.definitions.has(name) || this.mocks.has(name));
    }
  }

  /**
   * Get topological initialization order
   * @returns {string[]} Component names in initialization order
   */
  getInitializationOrder() {
    if (stryMutAct_9fa48("40586")) {
      {}
    } else {
      stryCov_9fa48("40586");
      const visited = new Set();
      const order = stryMutAct_9fa48("40587") ? ["Stryker was here"] : (stryCov_9fa48("40587"), []);
      const visit = name => {
        if (stryMutAct_9fa48("40588")) {
          {}
        } else {
          stryCov_9fa48("40588");
          if (stryMutAct_9fa48("40590") ? false : stryMutAct_9fa48("40589") ? true : (stryCov_9fa48("40589", "40590"), visited.has(name))) return;
          visited.add(name);
          const definition = this.definitions.get(name);
          if (stryMutAct_9fa48("40592") ? false : stryMutAct_9fa48("40591") ? true : (stryCov_9fa48("40591", "40592"), definition)) {
            if (stryMutAct_9fa48("40593")) {
              {}
            } else {
              stryCov_9fa48("40593");
              for (const dep of definition.dependencies) {
                if (stryMutAct_9fa48("40594")) {
                  {}
                } else {
                  stryCov_9fa48("40594");
                  visit(dep);
                }
              }
            }
          }
          order.push(name);
        }
      };
      for (const name of this.definitions.keys()) {
        if (stryMutAct_9fa48("40595")) {
          {}
        } else {
          stryCov_9fa48("40595");
          visit(name);
        }
      }
      return order;
    }
  }

  /**
   * Detect circular dependencies
   * @returns {string[]|null} Cycle path or null if no cycle
   */
  detectCircularDependency() {
    if (stryMutAct_9fa48("40596")) {
      {}
    } else {
      stryCov_9fa48("40596");
      const WHITE = 0; // Not visited
      const GRAY = 1; // Being visited (in current path)
      const BLACK = 2; // Fully visited

      const colors = new Map();
      const parent = new Map();
      for (const name of this.definitions.keys()) {
        if (stryMutAct_9fa48("40597")) {
          {}
        } else {
          stryCov_9fa48("40597");
          colors.set(name, WHITE);
        }
      }
      const dfs = (name, path) => {
        if (stryMutAct_9fa48("40598")) {
          {}
        } else {
          stryCov_9fa48("40598");
          colors.set(name, GRAY);
          const definition = this.definitions.get(name);
          if (stryMutAct_9fa48("40600") ? false : stryMutAct_9fa48("40599") ? true : (stryCov_9fa48("40599", "40600"), definition)) {
            if (stryMutAct_9fa48("40601")) {
              {}
            } else {
              stryCov_9fa48("40601");
              for (const dep of definition.dependencies) {
                if (stryMutAct_9fa48("40602")) {
                  {}
                } else {
                  stryCov_9fa48("40602");
                  if (stryMutAct_9fa48("40605") ? false : stryMutAct_9fa48("40604") ? true : stryMutAct_9fa48("40603") ? this.definitions.has(dep) : (stryCov_9fa48("40603", "40604", "40605"), !this.definitions.has(dep))) {
                    if (stryMutAct_9fa48("40606")) {
                      {}
                    } else {
                      stryCov_9fa48("40606");
                      // Dependency not registered, skip
                      continue;
                    }
                  }
                  if (stryMutAct_9fa48("40609") ? colors.get(dep) !== GRAY : stryMutAct_9fa48("40608") ? false : stryMutAct_9fa48("40607") ? true : (stryCov_9fa48("40607", "40608", "40609"), colors.get(dep) === GRAY)) {
                    if (stryMutAct_9fa48("40610")) {
                      {}
                    } else {
                      stryCov_9fa48("40610");
                      // Found cycle - reconstruct path
                      const cycleStart = path.indexOf(dep);
                      return stryMutAct_9fa48("40611") ? [] : (stryCov_9fa48("40611"), [...(stryMutAct_9fa48("40612") ? path : (stryCov_9fa48("40612"), path.slice(cycleStart))), dep]);
                    }
                  }
                  if (stryMutAct_9fa48("40615") ? colors.get(dep) !== WHITE : stryMutAct_9fa48("40614") ? false : stryMutAct_9fa48("40613") ? true : (stryCov_9fa48("40613", "40614", "40615"), colors.get(dep) === WHITE)) {
                    if (stryMutAct_9fa48("40616")) {
                      {}
                    } else {
                      stryCov_9fa48("40616");
                      parent.set(dep, name);
                      const cycle = dfs(dep, stryMutAct_9fa48("40617") ? [] : (stryCov_9fa48("40617"), [...path, dep]));
                      if (stryMutAct_9fa48("40619") ? false : stryMutAct_9fa48("40618") ? true : (stryCov_9fa48("40618", "40619"), cycle)) return cycle;
                    }
                  }
                }
              }
            }
          }
          colors.set(name, BLACK);
          return null;
        }
      };
      for (const name of this.definitions.keys()) {
        if (stryMutAct_9fa48("40620")) {
          {}
        } else {
          stryCov_9fa48("40620");
          if (stryMutAct_9fa48("40623") ? colors.get(name) !== WHITE : stryMutAct_9fa48("40622") ? false : stryMutAct_9fa48("40621") ? true : (stryCov_9fa48("40621", "40622", "40623"), colors.get(name) === WHITE)) {
            if (stryMutAct_9fa48("40624")) {
              {}
            } else {
              stryCov_9fa48("40624");
              const cycle = dfs(name, stryMutAct_9fa48("40625") ? [] : (stryCov_9fa48("40625"), [name]));
              if (stryMutAct_9fa48("40627") ? false : stryMutAct_9fa48("40626") ? true : (stryCov_9fa48("40626", "40627"), cycle)) return cycle;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Get dependency graph for debugging
   * @returns {Object} Dependency graph
   */
  getDependencyGraph() {
    if (stryMutAct_9fa48("40628")) {
      {}
    } else {
      stryCov_9fa48("40628");
      const graph = {};
      for (const [name, definition] of this.definitions) {
        if (stryMutAct_9fa48("40629")) {
          {}
        } else {
          stryCov_9fa48("40629");
          graph[name] = stryMutAct_9fa48("40630") ? {} : (stryCov_9fa48("40630"), {
            dependencies: stryMutAct_9fa48("40631") ? [] : (stryCov_9fa48("40631"), [...definition.dependencies]),
            lifecycle: definition.lifecycle,
            initialized: this.instances.has(name)
          });
        }
      }
      return graph;
    }
  }

  /**
   * Get all registered component names
   * @returns {string[]}
   */
  getComponentNames() {
    if (stryMutAct_9fa48("40632")) {
      {}
    } else {
      stryCov_9fa48("40632");
      return Array.from(this.definitions.keys());
    }
  }

  /**
   * Reset the registry (for testing)
   */
  reset() {
    if (stryMutAct_9fa48("40633")) {
      {}
    } else {
      stryCov_9fa48("40633");
      this.definitions.clear();
      this.instances.clear();
      this.mocks.clear();
      this.initialized = stryMutAct_9fa48("40634") ? true : (stryCov_9fa48("40634"), false);
    }
  }

  /**
   * Dispose all components (call dispose method if exists)
   */
  async dispose() {
    if (stryMutAct_9fa48("40635")) {
      {}
    } else {
      stryCov_9fa48("40635");
      // Dispose in reverse initialization order
      const order = stryMutAct_9fa48("40636") ? this.getInitializationOrder() : (stryCov_9fa48("40636"), this.getInitializationOrder().reverse());
      for (const name of order) {
        if (stryMutAct_9fa48("40637")) {
          {}
        } else {
          stryCov_9fa48("40637");
          const instance = this.instances.get(name);
          if (stryMutAct_9fa48("40640") ? instance || typeof instance.dispose === 'function' : stryMutAct_9fa48("40639") ? false : stryMutAct_9fa48("40638") ? true : (stryCov_9fa48("40638", "40639", "40640"), instance && (stryMutAct_9fa48("40642") ? typeof instance.dispose !== 'function' : stryMutAct_9fa48("40641") ? true : (stryCov_9fa48("40641", "40642"), typeof instance.dispose === (stryMutAct_9fa48("40643") ? "" : (stryCov_9fa48("40643"), 'function')))))) {
            if (stryMutAct_9fa48("40644")) {
              {}
            } else {
              stryCov_9fa48("40644");
              await instance.dispose();
            }
          }
        }
      }
      this.instances.clear();
      this.initialized = stryMutAct_9fa48("40645") ? true : (stryCov_9fa48("40645"), false);
    }
  }
}