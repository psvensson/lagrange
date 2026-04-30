const LOCAL_STR_1YSCS = 'Cannot register components after initialization';
const LOCAL_STR_1LD1G = ' -> ';
const LOCAL_STR_SINGLETON = 'singleton';
const LOCAL_STR_FACTORY = 'factory';
const LOCAL_STR_FUNCTION = 'function';

/**
 * ComponentRegistry - Dependency injection container with topological initialization
 * Manages component lifecycles and dependency resolution
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7
 */

/**
 * @typedef {Object} ComponentDefinition
 * @property {Function} factory - Factory function to create the component
 * @property {string[]} dependencies - Names of required dependencies
 * @property {'singleton'|'factory'} lifecycle - Component lifecycle type
 */

export class ComponentRegistry {
  constructor() {
    /** @type {Map<string, ComponentDefinition>} */
    this.definitions = new Map();

    /** @type {Map<string, *>} */
    this.instances = new Map();

    /** @type {Map<string, *>} */
    this.mocks = new Map();

    this.initialized = false;
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
    if (this.initialized) {
      throw new Error(LOCAL_STR_1YSCS);
    }

    const definition = {
      factory,
      dependencies: options.dependencies || [],
      lifecycle: options.lifecycle || 'singleton',
    };

    this.definitions.set(name, definition);
  }

  /**
   * Register a mock component for testing
   * @param {string} name - Component name to mock
   * @param {*} mock - Mock instance
   */
  registerMock(name, mock) {
    this.mocks.set(name, mock);
  }

  /**
   * Clear all mocks
   */
  clearMocks() {
    this.mocks.clear();
  }

  /**
   * Initialize all components in dependency order
   * @throws {Error} If circular dependency detected
   */
  async initialize() {
    // Check for circular dependencies first
    const circularDep = this.detectCircularDependency();
    if (circularDep) {
      throw new Error(`Circular dependency detected: ${circularDep.join(LOCAL_STR_1LD1G)}`);
    }

    // Get initialization order via topological sort
    const order = this.getInitializationOrder();

    // Initialize components in order
    for (const name of order) {
      await this.initializeComponent(name);
    }

    this.initialized = true;
  }

  /**
   * Initialize a single component
   * @param {string} name - Component name
   */
  async initializeComponent(name) {
    // Check for mock first
    if (this.mocks.has(name)) {
      this.instances.set(name, this.mocks.get(name));
      return;
    }

    // Skip if already initialized (singleton)
    if (this.instances.has(name)) {
      return;
    }

    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`Component not registered: ${name}`);
    }

    // Resolve dependencies
    const deps = definition.dependencies.map((depName) => {
      const dep = this.get(depName);
      if (dep === undefined) {
        throw new Error(`Dependency not found: ${depName} (required by ${name})`);
      }
      return dep;
    });

    // Create instance
    const instance = await definition.factory(...deps);

    // Store singleton instances
    if (definition.lifecycle === LOCAL_STR_SINGLETON) {
      this.instances.set(name, instance);
    }

    return instance;
  }

  /**
   * Get a component instance
   * @param {string} name - Component name
   * @returns {*} Component instance
   */
  get(name) {
    // Check mocks first
    if (this.mocks.has(name)) {
      return this.mocks.get(name);
    }

    // Check existing instances
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    // For factory lifecycle, create new instance
    const definition = this.definitions.get(name);
    if (definition && definition.lifecycle === LOCAL_STR_FACTORY) {
      const deps = definition.dependencies.map((d) => this.get(d));
      return definition.factory(...deps);
    }

    return undefined;
  }

  /**
   * Check if a component is registered
   * @param {string} name - Component name
   * @returns {boolean}
   */
  has(name) {
    return this.definitions.has(name) || this.mocks.has(name);
  }

  /**
   * Get topological initialization order
   * @returns {string[]} Component names in initialization order
   */
  getInitializationOrder() {
    const visited = new Set();
    const order = [];

    const visit = (name) => {
      if (visited.has(name)) return;
      visited.add(name);

      const definition = this.definitions.get(name);
      if (definition) {
        for (const dep of definition.dependencies) {
          visit(dep);
        }
      }

      order.push(name);
    };

    for (const name of this.definitions.keys()) {
      visit(name);
    }

    return order;
  }

  /**
   * Detect circular dependencies
   * @returns {string[]|null} Cycle path or null if no cycle
   */
  detectCircularDependency() {
    const WHITE = 0; // Not visited
    const GRAY = 1; // Being visited (in current path)
    const BLACK = 2; // Fully visited

    const colors = new Map();
    const parent = new Map();

    for (const name of this.definitions.keys()) {
      colors.set(name, WHITE);
    }

    const dfs = (name, path) => {
      colors.set(name, GRAY);

      const definition = this.definitions.get(name);
      if (definition) {
        for (const dep of definition.dependencies) {
          if (!this.definitions.has(dep)) {
            // Dependency not registered, skip
            continue;
          }

          if (colors.get(dep) === GRAY) {
            // Found cycle - reconstruct path
            const cycleStart = path.indexOf(dep);
            return [...path.slice(cycleStart), dep];
          }

          if (colors.get(dep) === WHITE) {
            parent.set(dep, name);
            const cycle = dfs(dep, [...path, dep]);
            if (cycle) return cycle;
          }
        }
      }

      colors.set(name, BLACK);
      return null;
    };

    for (const name of this.definitions.keys()) {
      if (colors.get(name) === WHITE) {
        const cycle = dfs(name, [name]);
        if (cycle) return cycle;
      }
    }

    return null;
  }

  /**
   * Get dependency graph for debugging
   * @returns {Object} Dependency graph
   */
  getDependencyGraph() {
    const graph = {};

    for (const [name, definition] of this.definitions) {
      graph[name] = {
        dependencies: [...definition.dependencies],
        lifecycle: definition.lifecycle,
        initialized: this.instances.has(name),
      };
    }

    return graph;
  }

  /**
   * Get all registered component names
   * @returns {string[]}
   */
  getComponentNames() {
    return Array.from(this.definitions.keys());
  }

  /**
   * Reset the registry (for testing)
   */
  reset() {
    this.definitions.clear();
    this.instances.clear();
    this.mocks.clear();
    this.initialized = false;
  }

  /**
   * Dispose all components (call dispose method if exists)
   */
  async dispose() {
    // Dispose in reverse initialization order
    const order = this.getInitializationOrder().reverse();

    for (const name of order) {
      const instance = this.instances.get(name);
      if (instance && typeof instance.dispose === LOCAL_STR_FUNCTION) {
        await instance.dispose();
      }
    }

    this.instances.clear();
    this.initialized = false;
  }
}
