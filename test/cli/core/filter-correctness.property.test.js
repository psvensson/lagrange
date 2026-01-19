/**
 * Property Test: Filter Correctness
 * Property 2: For any filter string and data set, all filtered results
 * should contain the filter string (case-insensitive) in at least one field.
 *
 * **Validates: Requirements 2.5, 3.6, 4.5**
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
      {key: 'description', label: 'Description'},
    ];
  }

  formatRow(item) {
    return [item.id, item.name, item.description || ''];
  }

  getItemKey(item) {
    return item.id;
  }
}

/**
 * Generate a data item
 */
const dataItemArb = fc.record({
  id: fc.string({minLength: 1, maxLength: 10}),
  name: fc.string({minLength: 1, maxLength: 20}),
  description: fc.option(fc.string({minLength: 0, maxLength: 30})),
  value: fc.integer({min: 0, max: 1000}),
});

test('Property 2: Filter Correctness', async (t) => {
  await t.test('all filtered results contain filter string', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 1, maxLength: 10}),
        fc.string({minLength: 1, maxLength: 5}).filter((s) => s.trim().length > 0),
        (data, filterStr) => {
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
          view.setFilter(filterStr);

          const lowerFilter = filterStr.toLowerCase();

          // All filtered results should contain the filter string
          for (const item of view.filteredData) {
            const values = Object.values(item);
            const containsFilter = values.some((value) => {
              if (value === null || value === undefined) return false;
              return String(value).toLowerCase().includes(lowerFilter);
            });

            if (!containsFilter) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('all filtered results contain filter string');
  });

  await t.test('empty filter returns all data', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 0, maxLength: 10}),
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
          view.setFilter('');

          return view.filteredData.length === uniqueData.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('empty filter returns all data');
  });

  await t.test('filter is case insensitive', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 10}),
        (name) => {
          const data = [
            {id: '1', name: name.toUpperCase(), description: 'test'},
            {id: '2', name: 'other', description: 'other'},
          ];

          const view = new TestView();
          view.setData(data);
          view.setFilter(name.toLowerCase());

          // Should find the uppercase item with lowercase filter
          const found = view.filteredData.some(
            (item) => item.name === name.toUpperCase(),
          );

          return found;
        },
      ),
      {numRuns: 10},
    );
    t.pass('filter is case insensitive');
  });

  await t.test('filtered count is less than or equal to total', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 0, maxLength: 10}),
        fc.string({minLength: 0, maxLength: 5}),
        (data, filterStr) => {
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
          view.setFilter(filterStr);

          return view.filteredData.length <= uniqueData.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('filtered count is less than or equal to total');
  });

  await t.test('clearFilter restores all data', async (t) => {
    fc.assert(
      fc.property(
        fc.array(dataItemArb, {minLength: 1, maxLength: 10}),
        fc.string({minLength: 1, maxLength: 5}),
        (data, filterStr) => {
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

          // Apply filter
          view.setFilter(filterStr);
          const filteredCount = view.filteredData.length;

          // Clear filter
          view.clearFilter();

          // Should restore all data
          return view.filteredData.length === uniqueData.length &&
                     view.filteredData.length >= filteredCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('clearFilter restores all data');
  });

  await t.test('filter matches any field', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 3, maxLength: 8}),
        fc.integer({min: 0, max: 2}),
        (searchStr, fieldIndex) => {
          const fields = ['id', 'name', 'description'];
          const field = fields[fieldIndex];

          const item = {
            id: fieldIndex === 0 ? searchStr : 'other-id',
            name: fieldIndex === 1 ? searchStr : 'other-name',
            description: fieldIndex === 2 ? searchStr : 'other-desc',
          };

          const view = new TestView();
          view.setData([item, {id: 'x', name: 'y', description: 'z'}]);
          view.setFilter(searchStr);

          // Should find the item regardless of which field matches
          return view.filteredData.some((i) => i[field] === searchStr);
        },
      ),
      {numRuns: 10},
    );
    t.pass('filter matches any field');
  });
});
