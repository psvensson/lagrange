/**
 * Property Test: Sort Correctness
 * Property 4: For any sort column and direction, the sorted data should
 * be in the correct order according to the sort criteria.
 *
 * **Validates: Requirements 2.6**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {BaseView} from '../../../src/cli/core/base-view.js';

/**
 * Test view implementation
 */
class TestView extends BaseView {
  getColumns() {
    return [
      {key: 'id', label: 'ID'},
      {key: 'name', label: 'Name'},
      {key: 'value', label: 'Value'},
    ];
  }

  formatRow(item) {
    return [item.id, item.name, String(item.value)];
  }

  getItemKey(item) {
    return item.id;
  }
}

/**
 * Generate a data item with string fields
 */
const stringDataItemArb = fc.record({
  id: fc.string({minLength: 1, maxLength: 10}),
  name: fc.string({minLength: 1, maxLength: 20}),
  value: fc.integer({min: 0, max: 1000}),
});

test('Property 4: Sort Correctness', async (t) => {
  await t.test('ascending sort produces non-decreasing order', async (t) => {
    fc.assert(
      fc.property(
        fc.array(stringDataItemArb, {minLength: 2, maxLength: 10}),
        fc.constantFrom('name', 'value'),
        (data, sortColumn) => {
          // Ensure unique IDs
          const uniqueData = [];
          const seenIds = new Set();
          for (const item of data) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              uniqueData.push(item);
            }
          }

          if (uniqueData.length < 2) return true;

          const view = new TestView();
          view.setData(uniqueData);
          view.setSort(sortColumn, 'asc');

          // Check that each element is <= the next
          for (let i = 0; i < view.filteredData.length - 1; i++) {
            const current = view.filteredData[i][sortColumn];
            const next = view.filteredData[i + 1][sortColumn];

            // Handle null values (should be at end)
            if (current === null || current === undefined) {
              return false; // Null should be at end in asc
            }
            if (next === null || next === undefined) {
              continue; // Null at end is ok
            }

            // Compare values
            if (typeof current === 'number' && typeof next === 'number') {
              if (current > next) return false;
            } else {
              if (String(current).localeCompare(String(next)) > 0) {
                return false;
              }
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('ascending sort produces non-decreasing order');
  });

  await t.test('descending sort produces non-increasing order', async (t) => {
    fc.assert(
      fc.property(
        fc.array(stringDataItemArb, {minLength: 2, maxLength: 10}),
        fc.constantFrom('name', 'value'),
        (data, sortColumn) => {
          // Ensure unique IDs
          const uniqueData = [];
          const seenIds = new Set();
          for (const item of data) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              uniqueData.push(item);
            }
          }

          if (uniqueData.length < 2) return true;

          const view = new TestView();
          view.setData(uniqueData);
          view.setSort(sortColumn, 'desc');

          // Check that each element is >= the next
          for (let i = 0; i < view.filteredData.length - 1; i++) {
            const current = view.filteredData[i][sortColumn];
            const next = view.filteredData[i + 1][sortColumn];

            // Handle null values (should be at end in desc too)
            if (current === null || current === undefined) {
              continue; // Null at end is ok
            }
            if (next === null || next === undefined) {
              continue;
            }

            // Compare values
            if (typeof current === 'number' && typeof next === 'number') {
              if (current < next) return false;
            } else {
              if (String(current).localeCompare(String(next)) < 0) {
                return false;
              }
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('descending sort produces non-increasing order');
  });

  await t.test('sort preserves all elements', async (t) => {
    fc.assert(
      fc.property(
        fc.array(stringDataItemArb, {minLength: 0, maxLength: 10}),
        fc.constantFrom('name', 'value'),
        fc.constantFrom('asc', 'desc'),
        (data, sortColumn, direction) => {
          // Ensure unique IDs
          const uniqueData = [];
          const seenIds = new Set();
          for (const item of data) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              uniqueData.push(item);
            }
          }

          const view = new TestView();
          view.setData(uniqueData);
          view.setSort(sortColumn, direction);

          // Same number of elements
          if (view.filteredData.length !== uniqueData.length) {
            return false;
          }

          // All original IDs present
          const originalIds = new Set(uniqueData.map((d) => d.id));
          const sortedIds = new Set(view.filteredData.map((d) => d.id));

          for (const id of originalIds) {
            if (!sortedIds.has(id)) return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('sort preserves all elements');
  });

  await t.test('clearSort returns to original order', async (t) => {
    fc.assert(
      fc.property(
        fc.array(stringDataItemArb, {minLength: 1, maxLength: 10}),
        (data) => {
          // Ensure unique IDs
          const uniqueData = [];
          const seenIds = new Set();
          for (const item of data) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              uniqueData.push(item);
            }
          }

          const view = new TestView();
          view.setData(uniqueData);

          // Get original order
          const originalOrder = view.filteredData.map((d) => d.id);

          // Sort and clear
          view.setSort('name', 'desc');
          view.clearSort();

          // Should be back to original order
          const finalOrder = view.filteredData.map((d) => d.id);

          return JSON.stringify(originalOrder) ===
                     JSON.stringify(finalOrder);
        },
      ),
      {numRuns: 10},
    );
    t.pass('clearSort returns to original order');
  });

  await t.test('numeric sort is correct', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({min: 0, max: 1000}), {minLength: 2, maxLength: 10}),
        (values) => {
          const data = values.map((v, i) => ({
            id: `id-${i}`,
            name: `name-${i}`,
            value: v,
          }));

          const view = new TestView();
          view.setData(data);
          view.setSort('value', 'asc');

          // Check numeric ordering
          for (let i = 0; i < view.filteredData.length - 1; i++) {
            if (view.filteredData[i].value > view.filteredData[i + 1].value) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('numeric sort is correct');
  });

  await t.test('toggle sort direction works', async (t) => {
    fc.assert(
      fc.property(
        fc.array(stringDataItemArb, {minLength: 2, maxLength: 5}),
        (data) => {
          // Ensure unique IDs
          const uniqueData = [];
          const seenIds = new Set();
          for (const item of data) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              uniqueData.push(item);
            }
          }

          if (uniqueData.length < 2) return true;

          const view = new TestView();
          view.setData(uniqueData);

          // First sort - ascending
          view.setSort('name');
          const ascOrder = view.filteredData.map((d) => d.id);

          // Toggle - descending
          view.setSort('name');
          const descOrder = view.filteredData.map((d) => d.id);

          // Orders should be different (unless all same value)
          const allSameName = uniqueData.every(
            (d) => d.name === uniqueData[0].name,
          );

          if (allSameName) {
            return true; // Can't verify order difference
          }

          // At least first or last should differ
          return ascOrder[0] !== descOrder[0] ||
                     ascOrder[ascOrder.length - 1] !==
                     descOrder[descOrder.length - 1];
        },
      ),
      {numRuns: 10},
    );
    t.pass('toggle sort direction works');
  });
});
