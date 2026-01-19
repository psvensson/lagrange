/**
 * Property Test: Breadcrumb Accuracy
 * Property 7: For any sequence of navigation operations, the breadcrumb
 * should accurately reflect the navigation path taken.
 *
 * **Validates: Requirements 11.3**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {NavigationController} from '../../../src/cli/core/navigation-controller.js';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';

/**
 * Valid views for navigation
 */
const VALID_VIEWS = [
  'nodes',
  'services',
  'tables',
  'partitions',
  'message_groups',
  'sql',
  'logs',
  'config',
  'contexts',
];

/**
 * Generate a random navigation action
 */
const navigationActionArb = fc.oneof(
  fc.record({
    type: fc.constant('drillDown'),
    view: fc.constantFrom(...VALID_VIEWS),
    context: fc.record({
      nodeId: fc.option(fc.string({minLength: 1, maxLength: 10})),
      tableId: fc.option(fc.string({minLength: 1, maxLength: 10})),
      partitionId: fc.option(fc.string({minLength: 1, maxLength: 10})),
    }),
  }),
  fc.record({
    type: fc.constant('goBack'),
  }),
  fc.record({
    type: fc.constant('goToView'),
    view: fc.constantFrom(...VALID_VIEWS),
  }),
);

test('Property 7: Breadcrumb Accuracy', async (t) => {
  await t.test('breadcrumb always starts with Home', async (t) => {
    fc.assert(
      fc.property(
        fc.array(navigationActionArb, {minLength: 0, maxLength: 5}),
        (actions) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          // Execute navigation actions
          for (const action of actions) {
            try {
              if (action.type === 'drillDown') {
                nav.drillDown(action.view, action.context || {});
              } else if (action.type === 'goBack') {
                nav.goBack();
              } else if (action.type === 'goToView') {
                nav.goToView(action.view);
              }
            } catch (_e) {
              // Ignore invalid navigation attempts
            }
          }

          const breadcrumb = nav.getBreadcrumb();
          return breadcrumb.startsWith('Home');
        },
      ),
      {numRuns: 10},
    );
    t.pass('breadcrumb always starts with Home');
  });

  await t.test('breadcrumb depth matches stack depth', async (t) => {
    fc.assert(
      fc.property(
        fc.array(navigationActionArb, {minLength: 0, maxLength: 5}),
        (actions) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          for (const action of actions) {
            try {
              if (action.type === 'drillDown') {
                nav.drillDown(action.view, action.context || {});
              } else if (action.type === 'goBack') {
                nav.goBack();
              } else if (action.type === 'goToView') {
                nav.goToView(action.view);
              }
            } catch (_e) {
              // Ignore invalid navigation attempts
            }
          }

          const breadcrumb = nav.getBreadcrumb();
          const parts = breadcrumb.split(' > ');
          const stackDepth = nav.getStackDepth();

          // Breadcrumb parts = Home + stack items + current (if not at root)
          // At root (nodes, no context): just "Home"
          // After drillDown: "Home > [stack items] > current"
          const isAtRoot = nav.currentView === 'nodes' && !nav.currentContext;
          const expectedParts = isAtRoot ? 1 : stackDepth + 2;

          return parts.length === expectedParts;
        },
      ),
      {numRuns: 10},
    );
    t.pass('breadcrumb depth matches stack depth');
  });

  await t.test('breadcrumb reflects current view', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_VIEWS),
        (view) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          nav.goToView(view);
          const breadcrumb = nav.getBreadcrumb();

          // For nodes view without context, breadcrumb is just "Home"
          if (view === 'nodes') {
            return breadcrumb === 'Home';
          }

          // For other views, breadcrumb should contain the view name
          const viewNames = {
            'services': 'Services',
            'tables': 'Tables',
            'partitions': 'Partitions',
            'message_groups': 'Message Groups',
            'sql': 'SQL Query',
            'logs': 'Logs',
            'config': 'Config',
            'contexts': 'Contexts',
          };

          return breadcrumb.includes(viewNames[view]);
        },
      ),
      {numRuns: 10},
    );
    t.pass('breadcrumb reflects current view');
  });

  await t.test('drillDown adds to breadcrumb', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_VIEWS.filter((v) => v !== 'nodes')),
        fc.string({minLength: 1, maxLength: 10}),
        (view, contextId) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          const beforeBreadcrumb = nav.getBreadcrumb();
          const beforeParts = beforeBreadcrumb.split(' > ').length;

          nav.drillDown(view, {nodeId: contextId});

          const afterBreadcrumb = nav.getBreadcrumb();
          const afterParts = afterBreadcrumb.split(' > ').length;

          // After drillDown, breadcrumb should have more parts
          return afterParts > beforeParts;
        },
      ),
      {numRuns: 10},
    );
    t.pass('drillDown adds to breadcrumb');
  });

  await t.test('goBack reduces breadcrumb', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_VIEWS.filter((v) => v !== 'nodes')),
        (view) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          // First drill down
          nav.drillDown(view, {});
          const beforeBreadcrumb = nav.getBreadcrumb();
          const beforeParts = beforeBreadcrumb.split(' > ').length;

          // Then go back
          nav.goBack();
          const afterBreadcrumb = nav.getBreadcrumb();
          const afterParts = afterBreadcrumb.split(' > ').length;

          // After goBack, breadcrumb should have fewer parts
          return afterParts < beforeParts;
        },
      ),
      {numRuns: 10},
    );
    t.pass('goBack reduces breadcrumb');
  });
});
