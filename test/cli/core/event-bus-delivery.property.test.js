/**
 * Property Test: Event Bus Delivery Completeness
 * Property 34: For any event emitted and any set of registered handlers,
 * all handlers should receive the event.
 *
 * **Validates: Requirements 25.3**
 */

import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EventBus} from '../../../src/cli/core/event-bus.js';

test('Property 34: Event Bus Delivery Completeness', async (t) => {
  await t.test('all registered handlers receive emitted events', async (t) => {
    fc.assert(
      fc.property(
        // Generate event name
        fc.string({minLength: 1, maxLength: 20})
          .filter((s) => /^[a-z][a-z0-9:_]*$/i.test(s)),
        // Generate number of handlers (1-10)
        fc.integer({min: 1, max: 10}),
        // Generate event data
        fc.anything(),
        (eventName, handlerCount, eventData) => {
          const bus = new EventBus();
          const receivedBy = [];

          // Register multiple handlers
          for (let i = 0; i < handlerCount; i++) {
            const handlerId = i;
            bus.on(eventName, (_data) => {
              receivedBy.push(handlerId);
            });
          }

          // Emit the event
          bus.emit(eventName, eventData);

          // All handlers should have received the event
          return receivedBy.length === handlerCount &&
                     receivedBy.every((id, idx) => receivedBy.includes(idx));
        },
      ),
      {numRuns: 10},
    );
    t.pass('All handlers receive emitted events');
  });

  await t.test('handlers receive correct event data', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20})
          .filter((s) => /^[a-z][a-z0-9:_]*$/i.test(s)),
        fc.integer({min: 1, max: 5}),
        fc.record({
          id: fc.integer(),
          value: fc.string(),
        }),
        (eventName, handlerCount, eventData) => {
          const bus = new EventBus();
          const receivedData = [];

          for (let i = 0; i < handlerCount; i++) {
            bus.on(eventName, (data) => {
              receivedData.push(data);
            });
          }

          bus.emit(eventName, eventData);

          // All handlers should receive the same data
          return receivedData.length === handlerCount &&
                     receivedData.every((d) =>
                       d.id === eventData.id && d.value === eventData.value);
        },
      ),
      {numRuns: 10},
    );
    t.pass('All handlers receive correct event data');
  });

  await t.test('wildcard handlers receive matching events', async (t) => {
    fc.assert(
      fc.property(
        // Generate namespace
        fc.string({minLength: 1, maxLength: 10})
          .filter((s) => /^[a-z]+$/i.test(s)),
        // Generate event suffix
        fc.string({minLength: 1, maxLength: 10})
          .filter((s) => /^[a-z]+$/i.test(s)),
        fc.integer({min: 1, max: 5}),
        (namespace, suffix, emitCount) => {
          const bus = new EventBus();
          const received = [];

          // Register wildcard handler
          bus.on(`${namespace}:*`, (data, event) => {
            received.push(event);
          });

          // Emit multiple events in the namespace
          for (let i = 0; i < emitCount; i++) {
            bus.emit(`${namespace}:${suffix}${i}`, {});
          }

          // Wildcard handler should receive all events
          return received.length === emitCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Wildcard handlers receive all matching events');
  });
});
