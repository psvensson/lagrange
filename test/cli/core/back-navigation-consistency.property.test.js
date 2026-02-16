/**
 * Property Test: Back Navigation Consistency
 * Property 8: For any sequence of drillDown operations followed by the same
 * number of goBack operations, the navigation state should return to the
 * original state.
 *
 * **Validates: Requirements 11.4**
 */

import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {NavigationController} from '../../../src/cli/core/navigation-controller.js';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';

/**
 * Valid views for navigation
 */
const VALID_VIEWS = [
  'nodes',
  'services',
  'replicas',
  'tables',
  'partitions',
  'message_groups',
  'sql',
  'logs',
  'config',
  'contexts',
];

/**
 * Generate a drillDown action
 */
const drillDownArb = fc.record({
  view: fc.constantFrom(...VALID_VIEWS),
  context: fc.record({
    nodeId: fc.option(fc.string({minLength: 1, maxLength: 8})),
    tableId: fc.option(fc.string({minLength: 1, maxLength: 8})),
  }),
});

test('Property 8: Back Navigation Consistency', async (t) => {
  await t.test('goBack after drillDown returns to previous state', async (t) => {
    fc.assert(
      fc.property(
        drillDownArb,
        (action) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          // Capture initial state
          const initialView = nav.currentView;
          const initialContext = nav.currentContext;

          // Drill down
          nav.drillDown(action.view, action.context);

          // Go back
          const result = nav.goBack();

          // Should return true (navigation occurred)
          if (!result) return false;

          // Should be back to initial state
          return nav.currentView === initialView &&
                     JSON.stringify(nav.currentContext) ===
                     JSON.stringify(initialContext);
        },
      ),
      {numRuns: 10},
    );
    t.pass('goBack after drillDown returns to previous state');
  });

  await t.test('multiple drillDowns followed by same goBack count', async (t) => {
    fc.assert(
      fc.property(
        fc.array(drillDownArb, {minLength: 1, maxLength: 5}),
        (actions) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          // Capture initial state
          const initialView = nav.currentView;
          const initialContext = nav.currentContext;

          // Perform all drillDowns
          for (const action of actions) {
            nav.drillDown(action.view, action.context);
          }

          // Verify stack depth matches action count
          if (nav.getStackDepth() !== actions.length) return false;

          // Go back the same number of times
          for (let i = 0; i < actions.length; i++) {
            const result = nav.goBack();
            if (!result) return false;
          }

          // Should be back to initial state
          return nav.currentView === initialView &&
                     JSON.stringify(nav.currentContext) ===
                     JSON.stringify(initialContext) &&
                     nav.getStackDepth() === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('multiple drillDowns followed by same goBack count');
  });

  await t.test('goBack at root returns false', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 5}),
        (_n) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          // At root, goBack should return false
          const result = nav.goBack();
          return result === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('goBack at root returns false');
  });

  await t.test('extra goBack calls after returning to root', async (t) => {
    fc.assert(
      fc.property(
        fc.array(drillDownArb, {minLength: 1, maxLength: 3}),
        fc.integer({min: 1, max: 3}),
        (actions, extraBackCount) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          // Perform drillDowns
          for (const action of actions) {
            nav.drillDown(action.view, action.context);
          }

          // Go back to root
          for (let i = 0; i < actions.length; i++) {
            nav.goBack();
          }

          // Extra goBack calls should return false
          for (let i = 0; i < extraBackCount; i++) {
            const result = nav.goBack();
            if (result !== false) return false;
          }

          // Should still be at root
          return nav.currentView === 'nodes' &&
                     nav.currentContext === null &&
                     nav.getStackDepth() === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('extra goBack calls after returning to root');
  });

  await t.test('goBack preserves intermediate states', async (t) => {
    fc.assert(
      fc.property(
        fc.array(drillDownArb, {minLength: 2, maxLength: 4}),
        (actions) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          // Track states after each drillDown
          const states = [{
            view: nav.currentView,
            context: nav.currentContext,
          }];

          for (const action of actions) {
            nav.drillDown(action.view, action.context);
            states.push({
              view: nav.currentView,
              context: nav.currentContext,
            });
          }

          // Go back and verify each intermediate state
          for (let i = actions.length - 1; i >= 0; i--) {
            nav.goBack();
            const expectedState = states[i];
            if (nav.currentView !== expectedState.view) return false;
            if (JSON.stringify(nav.currentContext) !==
                    JSON.stringify(expectedState.context)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('goBack preserves intermediate states');
  });
});
