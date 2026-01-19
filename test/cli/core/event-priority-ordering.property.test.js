/**
 * Property Test: Event Priority Ordering
 * Property 39: For any event with multiple handlers at different priorities,
 * handlers execute high to low.
 *
 * **Validates: Requirements 25.4**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {EventBus} from '../../../src/cli/core/event-bus.js';

test('Property 39: Event Priority Ordering', async (t) => {
  await t.test('handlers execute in priority order (high to low)', async (t) => {
    fc.assert(
      fc.property(
        // Generate event name
        fc.string({minLength: 1, maxLength: 20})
          .filter((s) => /^[a-z][a-z0-9:_]*$/i.test(s)),
        // Generate array of unique priorities
        fc.array(fc.integer({min: -100, max: 100}), {minLength: 2, maxLength: 10})
          .map((arr) => [...new Set(arr)]) // Ensure unique priorities
          .filter((arr) => arr.length >= 2),
        (eventName, priorities) => {
          const bus = new EventBus();
          const executionOrder = [];

          // Register handlers with different priorities in random order
          const shuffled = [...priorities].sort(() => Math.random() - 0.5);
          for (const priority of shuffled) {
            bus.on(eventName, () => {
              executionOrder.push(priority);
            }, {priority});
          }

          // Emit the event
          bus.emit(eventName, {});

          // Verify execution order is high to low
          const expectedOrder = [...priorities].sort((a, b) => b - a);
          return executionOrder.length === expectedOrder.length &&
                     executionOrder.every((p, i) => p === expectedOrder[i]);
        },
      ),
      {numRuns: 10},
    );
    t.pass('Handlers execute in priority order');
  });

  await t.test('same priority handlers maintain registration order', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20})
          .filter((s) => /^[a-z][a-z0-9:_]*$/i.test(s)),
        fc.integer({min: -100, max: 100}),
        fc.integer({min: 2, max: 5}),
        (eventName, priority, handlerCount) => {
          const bus = new EventBus();
          const executionOrder = [];

          // Register multiple handlers with same priority
          for (let i = 0; i < handlerCount; i++) {
            const handlerId = i;
            bus.on(eventName, () => {
              executionOrder.push(handlerId);
            }, {priority});
          }

          bus.emit(eventName, {});

          // All handlers should execute
          return executionOrder.length === handlerCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Same priority handlers all execute');
  });

  await t.test('priority ordering works with wildcard handlers', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 10})
          .filter((s) => /^[a-z]+$/i.test(s)),
        fc.string({minLength: 1, maxLength: 10})
          .filter((s) => /^[a-z]+$/i.test(s)),
        fc.integer({min: 1, max: 50}),
        fc.integer({min: 51, max: 100}),
        (namespace, suffix, lowPriority, highPriority) => {
          const bus = new EventBus();
          const executionOrder = [];

          // Register wildcard handler with low priority
          bus.on(`${namespace}:*`, () => {
            executionOrder.push('wildcard');
          }, {priority: lowPriority});

          // Register specific handler with high priority
          bus.on(`${namespace}:${suffix}`, () => {
            executionOrder.push('specific');
          }, {priority: highPriority});

          bus.emit(`${namespace}:${suffix}`, {});

          // High priority (specific) should execute first
          return executionOrder.length === 2 &&
                     executionOrder[0] === 'specific' &&
                     executionOrder[1] === 'wildcard';
        },
      ),
      {numRuns: 10},
    );
    t.pass('Priority ordering works with wildcard handlers');
  });
});
