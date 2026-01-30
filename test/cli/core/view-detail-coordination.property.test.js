/**
 * Property Test: View-Detail Coordination Correctness
 * Property 36: For any registered view with details enabled, when a selection
 * changes, the detail panel should be updated with the selected item's data.
 *
 * **Validates: Requirements 23.2, 23.3**
 */

import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ViewDetailCoordinator,
  DETAIL_LAYOUT,
} from '../../../src/cli/core/view-detail-coordinator.js';
// EventBus imported for potential future use

/**
 * Generate a view configuration
 */
const _viewConfigArb = fc.record({
  hasDetails: fc.boolean(),
  layout: fc.constantFrom(
    DETAIL_LAYOUT.SIDE,
    DETAIL_LAYOUT.BOTTOM,
    DETAIL_LAYOUT.OVERLAY,
  ),
  preserveOnSwitch: fc.boolean(),
});

/**
 * Generate a data item
 */
const dataItemArb = fc.record({
  id: fc.string({minLength: 1, maxLength: 10}),
  name: fc.string({minLength: 1, maxLength: 20}),
  value: fc.integer({min: 0, max: 1000}),
});

/**
 * Generate a view name
 */
const viewNameArb = fc.constantFrom(
  'nodes', 'services', 'tables', 'partitions', 'message_groups',
);

test('Property 36: View-Detail Coordination Correctness', async (t) => {
  await t.test('selection change updates detail for views with details', async (t) => {
    fc.assert(
      fc.property(
        viewNameArb,
        dataItemArb,
        (viewName, item) => {
          const coordinator = new ViewDetailCoordinator();

          // Register view with details enabled
          coordinator.registerView(viewName, {hasDetails: true});

          // Trigger selection change
          coordinator.handleSelectionChange({
            viewName,
            selectedItem: item,
          });

          // Detail data should be updated
          const detailData = coordinator.getDetailData();
          if (!detailData) return false;

          // Detail should contain the item
          return detailData.item === item ||
                     JSON.stringify(detailData.item) === JSON.stringify(item);
        },
      ),
      {numRuns: 10},
    );
    t.pass('selection change updates detail for views with details');
  });

  await t.test('selection change ignored for views without details', async (t) => {
    fc.assert(
      fc.property(
        viewNameArb,
        dataItemArb,
        (viewName, item) => {
          const coordinator = new ViewDetailCoordinator();

          // Register view without details
          coordinator.registerView(viewName, {hasDetails: false});

          // Trigger selection change
          coordinator.handleSelectionChange({
            viewName,
            selectedItem: item,
          });

          // Detail data should remain null
          return coordinator.getDetailData() === null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('selection change ignored for views without details');
  });

  await t.test('null selection clears detail data', async (t) => {
    fc.assert(
      fc.property(
        viewNameArb,
        dataItemArb,
        (viewName, item) => {
          const coordinator = new ViewDetailCoordinator();

          // Register view with details
          coordinator.registerView(viewName, {hasDetails: true});

          // Set initial selection
          coordinator.handleSelectionChange({
            viewName,
            selectedItem: item,
          });

          // Verify detail is set
          if (!coordinator.getDetailData()) return false;

          // Clear selection
          coordinator.handleSelectionChange({
            viewName,
            selectedItem: null,
          });

          // Detail should be cleared
          return coordinator.getDetailData() === null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('null selection clears detail data');
  });

  await t.test('view switch updates layout from config', async (t) => {
    fc.assert(
      fc.property(
        viewNameArb,
        fc.constantFrom(
          DETAIL_LAYOUT.SIDE,
          DETAIL_LAYOUT.BOTTOM,
          DETAIL_LAYOUT.OVERLAY,
        ),
        (viewName, layout) => {
          const coordinator = new ViewDetailCoordinator();

          // Register view with specific layout
          coordinator.registerView(viewName, {
            hasDetails: true,
            layout,
          });

          // Switch to view
          coordinator.handleViewSwitch({viewName});

          // Layout should match config
          return coordinator.getLayout() === layout;
        },
      ),
      {numRuns: 10},
    );
    t.pass('view switch updates layout from config');
  });

  await t.test('custom getDetailData function is used', async (t) => {
    fc.assert(
      fc.property(
        viewNameArb,
        dataItemArb,
        fc.string({minLength: 1, maxLength: 10}),
        (viewName, item, customType) => {
          const coordinator = new ViewDetailCoordinator();

          // Register view with custom detail function
          coordinator.registerView(viewName, {
            hasDetails: true,
            getDetailData: (selectedItem) => ({
              type: customType,
              customId: selectedItem.id,
            }),
          });

          // Trigger selection change
          coordinator.handleSelectionChange({
            viewName,
            selectedItem: item,
          });

          // Detail should use custom function result
          const detailData = coordinator.getDetailData();
          return detailData &&
                     detailData.type === customType &&
                     detailData.customId === item.id;
        },
      ),
      {numRuns: 10},
    );
    t.pass('custom getDetailData function is used');
  });

  await t.test('unregistered view selection is ignored', async (t) => {
    fc.assert(
      fc.property(
        viewNameArb,
        dataItemArb,
        (viewName, item) => {
          const coordinator = new ViewDetailCoordinator();

          // Don't register the view

          // Trigger selection change
          coordinator.handleSelectionChange({
            viewName,
            selectedItem: item,
          });

          // Detail should remain null
          return coordinator.getDetailData() === null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('unregistered view selection is ignored');
  });

  await t.test('detail preserved on switch when configured', async (t) => {
    fc.assert(
      fc.property(
        fc.array(viewNameArb, {minLength: 2, maxLength: 2}),
        dataItemArb,
        (viewNames, item) => {
          // Ensure different view names
          if (viewNames[0] === viewNames[1]) {
            viewNames[1] = viewNames[0] + '_alt';
          }

          const coordinator = new ViewDetailCoordinator();

          // Register first view with preserve
          coordinator.registerView(viewNames[0], {
            hasDetails: true,
            preserveOnSwitch: true,
          });

          // Register second view
          coordinator.registerView(viewNames[1], {
            hasDetails: true,
            preserveOnSwitch: true,
          });

          // Set detail on first view
          coordinator.handleSelectionChange({
            viewName: viewNames[0],
            selectedItem: item,
          });

          const detailBefore = coordinator.getDetailData();

          // Switch to second view
          coordinator.handleViewSwitch({viewName: viewNames[1]});

          // Detail should be preserved
          const detailAfter = coordinator.getDetailData();
          return JSON.stringify(detailBefore) ===
                     JSON.stringify(detailAfter);
        },
      ),
      {numRuns: 10},
    );
    t.pass('detail preserved on switch when configured');
  });

  await t.test('detail cleared on switch when not preserving', async (t) => {
    fc.assert(
      fc.property(
        fc.array(viewNameArb, {minLength: 2, maxLength: 2}),
        dataItemArb,
        (viewNames, item) => {
          // Ensure different view names
          if (viewNames[0] === viewNames[1]) {
            viewNames[1] = viewNames[0] + '_alt';
          }

          const coordinator = new ViewDetailCoordinator();

          // Register views without preserve
          coordinator.registerView(viewNames[0], {
            hasDetails: true,
            preserveOnSwitch: false,
          });

          coordinator.registerView(viewNames[1], {
            hasDetails: true,
            preserveOnSwitch: false,
          });

          // Set detail on first view
          coordinator.handleSelectionChange({
            viewName: viewNames[0],
            selectedItem: item,
          });

          // Switch to second view
          coordinator.handleViewSwitch({viewName: viewNames[1]});

          // Detail should be cleared
          return coordinator.getDetailData() === null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('detail cleared on switch when not preserving');
  });
});
