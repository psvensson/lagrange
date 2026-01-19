/**
 * Property Test: Circular Dependency Detection
 * Property 40: For any component registry with circular dependencies,
 * detection should throw error.
 *
 * **Validates: Requirements 24.7**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {ComponentRegistry} from '../../../src/cli/core/component-registry.js';

test('Property 40: Circular Dependency Detection', async (t) => {
  await t.test('direct circular dependency is detected', async (t) => {
    fc.assert(
      fc.asyncProperty(
        // Generate component names
        fc.string({minLength: 1, maxLength: 10})
          .filter((s) => /^[a-z]+$/i.test(s)),
        fc.string({minLength: 1, maxLength: 10})
          .filter((s) => /^[a-z]+$/i.test(s)),
        async (name1, name2) => {
          // Ensure different names
          if (name1 === name2) name2 = name2 + '2';

          const registry = new ComponentRegistry();

          // Create circular dependency: a -> b -> a
          registry.register(name1, (dep) => ({dep}), {dependencies: [name2]});
          registry.register(name2, (dep) => ({dep}), {dependencies: [name1]});

          try {
            await registry.initialize();
            return false; // Should have thrown
          } catch (err) {
            return err.message.includes('Circular dependency');
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass('Direct circular dependency is detected');
  });

  await t.test('self-referencing dependency is detected', async (t) => {
    fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 10})
          .filter((s) => /^[a-z]+$/i.test(s)),
        async (name) => {
          const registry = new ComponentRegistry();

          // Self-reference: a -> a
          registry.register(name, (dep) => ({dep}), {dependencies: [name]});

          try {
            await registry.initialize();
            return false; // Should have thrown
          } catch (err) {
            return err.message.includes('Circular dependency');
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass('Self-referencing dependency is detected');
  });

  await t.test('indirect circular dependency is detected', async (t) => {
    fc.assert(
      fc.asyncProperty(
        // Generate chain length (3-5)
        fc.integer({min: 3, max: 5}),
        async (chainLength) => {
          const registry = new ComponentRegistry();
          const names = [];

          for (let i = 0; i < chainLength; i++) {
            names.push(`comp${i}`);
          }

          // Create chain: a -> b -> c -> ... -> a (circular)
          for (let i = 0; i < chainLength; i++) {
            const nextIndex = (i + 1) % chainLength;
            registry.register(names[i], (dep) => ({dep}), {
              dependencies: [names[nextIndex]],
            });
          }

          try {
            await registry.initialize();
            return false; // Should have thrown
          } catch (err) {
            return err.message.includes('Circular dependency');
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass('Indirect circular dependency is detected');
  });

  await t.test('non-circular dependencies do not throw', async (t) => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 5}),
        async (chainLength) => {
          const registry = new ComponentRegistry();
          const names = [];

          for (let i = 0; i < chainLength; i++) {
            names.push(`comp${i}`);
          }

          // Create linear chain: a -> b -> c -> ... (no cycle)
          for (let i = 0; i < chainLength; i++) {
            const deps = i > 0 ? [names[i - 1]] : [];
            registry.register(names[i], (...args) => ({args}), {
              dependencies: deps,
            });
          }

          try {
            await registry.initialize();
            return true; // Should succeed
          } catch (_err) {
            return false; // Should not throw
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass('Non-circular dependencies do not throw');
  });

  await t.test('detectCircularDependency returns cycle path', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 2, max: 4}),
        (cycleSize) => {
          const registry = new ComponentRegistry();
          const names = [];

          for (let i = 0; i < cycleSize; i++) {
            names.push(`node${i}`);
          }

          // Create cycle
          for (let i = 0; i < cycleSize; i++) {
            const nextIndex = (i + 1) % cycleSize;
            registry.register(names[i], () => ({}), {
              dependencies: [names[nextIndex]],
            });
          }

          const cycle = registry.detectCircularDependency();

          // Should detect a cycle
          if (!cycle) return false;

          // Cycle should contain at least 2 elements
          if (cycle.length < 2) return false;

          // First and last element should be the same (cycle)
          return cycle[0] === cycle[cycle.length - 1];
        },
      ),
      {numRuns: 10},
    );
    t.pass('detectCircularDependency returns cycle path');
  });

  await t.test('no cycle returns null from detectCircularDependency', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 5}),
        (componentCount) => {
          const registry = new ComponentRegistry();

          // Create independent components (no dependencies)
          for (let i = 0; i < componentCount; i++) {
            registry.register(`independent${i}`, () => ({}));
          }

          const cycle = registry.detectCircularDependency();
          return cycle === null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('No cycle returns null from detectCircularDependency');
  });
});
