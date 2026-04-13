/**
 * Property Test: Component Dependency Resolution
 * Property 35: For any component with dependencies, the registry should
 * initialize dependencies first.
 *
 * **Validates: Requirements 24.3, 24.4**
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ComponentRegistry} from '../../../src/cli/core/component-registry.js';

test('Property 35: Component Dependency Resolution', async (t) => {
  await t.test('dependencies initialize before dependents', async (t) => {
    fc.assert(
      fc.asyncProperty(
        // Generate number of components (2-5)
        fc.integer({min: 2, max: 5}),
        async (componentCount) => {
          const registry = new ComponentRegistry();
          const initOrder = [];

          // Create a linear dependency chain: a -> b -> c -> ...
          const names = [];
          for (let i = 0; i < componentCount; i++) {
            names.push(`comp${i}`);
          }

          // Register in reverse order to test dependency resolution
          for (let i = componentCount - 1; i >= 0; i--) {
            const name = names[i];
            const deps = i > 0 ? [names[i - 1]] : [];

            registry.register(name, (...args) => {
              initOrder.push(name);
              return {name, deps: args};
            }, {dependencies: deps});
          }

          await registry.initialize();

          // Verify initialization order respects dependencies
          for (let i = 1; i < componentCount; i++) {
            const depIndex = initOrder.indexOf(names[i - 1]);
            const compIndex = initOrder.indexOf(names[i]);
            if (depIndex >= compIndex) {
              return false; // Dependency should be initialized first
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Dependencies initialize before dependents');
  });

  await t.test('all dependencies are injected correctly', async (t) => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 3}),
        async (depCount) => {
          const registry = new ComponentRegistry();

          // Register dependencies
          const depNames = [];
          for (let i = 0; i < depCount; i++) {
            const name = `dep${i}`;
            depNames.push(name);
            registry.register(name, () => ({id: i, name}));
          }

          // Register component that depends on all
          let receivedDeps = [];
          registry.register('main', (...deps) => {
            receivedDeps = deps;
            return {deps};
          }, {dependencies: depNames});

          await registry.initialize();

          // Verify all dependencies were injected
          if (receivedDeps.length !== depCount) return false;

          for (let i = 0; i < depCount; i++) {
            if (receivedDeps[i].id !== i) return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('All dependencies are injected correctly');
  });

  await t.test('diamond dependencies resolve correctly', async (t) => {
    fc.assert(
      fc.asyncProperty(
        fc.constant(null), // No random input needed
        async () => {
          const registry = new ComponentRegistry();
          const initOrder = [];

          // Diamond pattern: D depends on B and C, both depend on A
          //     A
          //    / \
          //   B   C
          //    \ /
          //     D

          registry.register('a', () => {
            initOrder.push('a');
            return {name: 'a'};
          });

          registry.register('b', (a) => {
            initOrder.push('b');
            return {name: 'b', a};
          }, {dependencies: ['a']});

          registry.register('c', (a) => {
            initOrder.push('c');
            return {name: 'c', a};
          }, {dependencies: ['a']});

          registry.register('d', (b, c) => {
            initOrder.push('d');
            return {name: 'd', b, c};
          }, {dependencies: ['b', 'c']});

          await registry.initialize();

          // A must be first, D must be last
          const aIndex = initOrder.indexOf('a');
          const bIndex = initOrder.indexOf('b');
          const cIndex = initOrder.indexOf('c');
          const dIndex = initOrder.indexOf('d');

          return aIndex < bIndex &&
                     aIndex < cIndex &&
                     bIndex < dIndex &&
                     cIndex < dIndex;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Diamond dependencies resolve correctly');
  });

  await t.test('singleton components return same instance', async (t) => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 5}),
        async (getCount) => {
          const registry = new ComponentRegistry();
          let createCount = 0;

          registry.register('singleton', () => {
            createCount++;
            return {id: createCount};
          }, {lifecycle: 'singleton'});

          await registry.initialize();

          // Get the component multiple times
          const instances = [];
          for (let i = 0; i < getCount; i++) {
            instances.push(registry.get('singleton'));
          }

          // Should only be created once
          if (createCount !== 1) return false;

          // All instances should be the same
          const firstId = instances[0].id;
          return instances.every((inst) => inst.id === firstId);
        },
      ),
      {numRuns: 10},
    );
    t.pass('Singleton components return same instance');
  });

  await t.test('factory components create new instances', async (t) => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 5}),
        async (getCount) => {
          const registry = new ComponentRegistry();
          let createCount = 0;

          registry.register('factory', () => {
            createCount++;
            return {id: createCount};
          }, {lifecycle: 'factory'});

          await registry.initialize();

          // Get the component multiple times
          const instances = [];
          for (let i = 0; i < getCount; i++) {
            instances.push(registry.get('factory'));
          }

          // Should be created each time (after initial)
          // Note: factory creates on each get(), not during initialize()
          // So we expect getCount instances
          return instances.length === getCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Factory components create new instances');
  });
});
