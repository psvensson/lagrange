/**
 * Property Test: ViewModel Computed Property Caching
 * Property 38: For any computed property, calling getComputed multiple times
 * without data changes should return the cached value without recomputation.
 *
 * **Validates: Requirements 27.6**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {BaseViewModel} from '../../../src/cli/core/base-view-model.js';

/**
 * Generate a data item
 */
const dataItemArb = fc.record({
  id: fc.string({minLength: 1, maxLength: 10}),
  value: fc.integer({min: 0, max: 1000}),
});

/**
 * Generate a property name
 */
const propertyNameArb = fc.string({minLength: 1, maxLength: 10})
  .filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s));

test('Property 38: ViewModel Computed Property Caching', async (t) => {
  await t.test('computed value is cached after first call', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 1, maxLength: 10}),
        propertyNameArb,
        (data, propName) => {
          const vm = new BaseViewModel();
          vm.setData(data);

          let computeCount = 0;
          vm.defineComputed(propName, (d) => {
            computeCount++;
            return d.length;
          });

          // First call should compute
          const result1 = vm.getComputed(propName);
          if (computeCount !== 1) return false;

          // Second call should use cache
          const result2 = vm.getComputed(propName);
          if (computeCount !== 1) return false;

          // Results should be equal
          return result1 === result2;
        },
      ),
      {numRuns: 10},
    );
    t.pass('computed value is cached after first call');
  });

  await t.test('cache is invalidated on data change', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 1, maxLength: 5}),
        fc.array(dataItemArb, {minLength: 1, maxLength: 5}),
        propertyNameArb,
        (data1, data2, propName) => {
          const vm = new BaseViewModel();
          vm.setData(data1);

          let computeCount = 0;
          vm.defineComputed(propName, (d) => {
            computeCount++;
            return d.length;
          });

          // First call computes
          vm.getComputed(propName);
          if (computeCount !== 1) return false;

          // Change data
          vm.setData(data2);

          // Next call should recompute
          vm.getComputed(propName);
          return computeCount === 2;
        },
      ),
      {numRuns: 10},
    );
    t.pass('cache is invalidated on data change');
  });

  await t.test('cache is invalidated on explicit invalidation', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 1, maxLength: 5}),
        propertyNameArb,
        (data, propName) => {
          const vm = new BaseViewModel();
          vm.setData(data);

          let computeCount = 0;
          vm.defineComputed(propName, (d) => {
            computeCount++;
            return d.reduce((acc, item) => acc + item.value, 0);
          });

          // First call computes
          vm.getComputed(propName);
          if (computeCount !== 1) return false;

          // Invalidate cache
          vm.invalidateCache();

          // Next call should recompute
          vm.getComputed(propName);
          return computeCount === 2;
        },
      ),
      {numRuns: 10},
    );
    t.pass('cache is invalidated on explicit invalidation');
  });

  await t.test('multiple computed properties cache independently', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 1, maxLength: 5}),
        (data) => {
          const vm = new BaseViewModel();
          vm.setData(data);

          let countA = 0;
          let countB = 0;

          vm.defineComputed('propA', (d) => {
            countA++;
            return d.length;
          });

          vm.defineComputed('propB', (d) => {
            countB++;
            return d.reduce((acc, item) => acc + item.value, 0);
          });

          // Call propA twice
          vm.getComputed('propA');
          vm.getComputed('propA');
          if (countA !== 1) return false;

          // Call propB twice
          vm.getComputed('propB');
          vm.getComputed('propB');
          if (countB !== 1) return false;

          // propA should still be cached
          vm.getComputed('propA');
          return countA === 1 && countB === 1;
        },
      ),
      {numRuns: 10},
    );
    t.pass('multiple computed properties cache independently');
  });

  await t.test('isComputedCached reflects cache state', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 1, maxLength: 5}),
        propertyNameArb,
        (data, propName) => {
          const vm = new BaseViewModel();
          vm.setData(data);

          vm.defineComputed(propName, (d) => d.length);

          // Before first call, not cached
          if (vm.isComputedCached(propName)) return false;

          // After first call, cached
          vm.getComputed(propName);
          if (!vm.isComputedCached(propName)) return false;

          // After invalidation, not cached
          vm.invalidateCache();
          return !vm.isComputedCached(propName);
        },
      ),
      {numRuns: 10},
    );
    t.pass('isComputedCached reflects cache state');
  });

  await t.test('cached value equals recomputed value', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 1, maxLength: 10}),
        propertyNameArb,
        (data, propName) => {
          const vm = new BaseViewModel();
          vm.setData(data);

          vm.defineComputed(propName, (d) => {
            return d.reduce((acc, item) => acc + item.value, 0);
          });

          // Get cached value
          const cached = vm.getComputed(propName);

          // Invalidate and recompute
          vm.invalidateCache();
          const recomputed = vm.getComputed(propName);

          // Values should be equal
          return cached === recomputed;
        },
      ),
      {numRuns: 10},
    );
    t.pass('cached value equals recomputed value');
  });

  await t.test('clear invalidates all caches', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 1, maxLength: 5}),
        (data) => {
          const vm = new BaseViewModel();
          vm.setData(data);

          vm.defineComputed('prop1', (d) => d.length);
          vm.defineComputed('prop2', (d) => d.length * 2);

          // Cache both
          vm.getComputed('prop1');
          vm.getComputed('prop2');

          if (!vm.isComputedCached('prop1')) return false;
          if (!vm.isComputedCached('prop2')) return false;

          // Clear
          vm.clear();

          // Both should be invalidated
          return !vm.isComputedCached('prop1') &&
                     !vm.isComputedCached('prop2');
        },
      ),
      {numRuns: 10},
    );
    t.pass('clear invalidates all caches');
  });
});
