import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {TraceCollector} from '../../src/debug/trace-collector.js';

const LEVELS = ['error', 'warn', 'info', 'debug', 'trace'];

test('TraceCollector property: lineage prefix filter is exact-by-prefix',
  async () => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 6}),
        fc.array(
          fc.record({
            lineageId: fc.string({minLength: 1, maxLength: 12}),
            level: fc.constantFrom(...LEVELS),
          }),
          {minLength: 1, maxLength: 30},
        ),
        (prefix, events) => {
          const collector = new TraceCollector();
          const delivered = [];
          collector.subscribe((payload) => {
            delivered.push(JSON.parse(payload));
          }, {lineagePrefix: prefix});

          for (const event of events) {
            collector.emit({
              level: event.level,
              message: 'event',
              context: null,
              timestamp: 1,
              lineageId: event.lineageId,
              stageId: null,
              partitionId: null,
              nodeId: 'node-a',
              serviceDefinitionId: 'svc-a',
              replicaId: null,
              runtimeKind: 'wasm_component',
              source: 'service',
            });
          }

          const expected = events.filter((event) =>
            event.lineageId.startsWith(prefix),
          );
          assert.equal(delivered.length, expected.length);
          assert.equal(
            delivered.every((event) =>
              String(event.lineageId).startsWith(prefix),
            ),
            true,
          );
        },
      ),
      {numRuns: 10},
    );
  });

test('TraceCollector property: level filter only forwards selected levels',
  async () => {
    await fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...LEVELS), {minLength: 1, maxLength: 5}),
        fc.array(fc.constantFrom(...LEVELS), {minLength: 1, maxLength: 30}),
        (allowedLevels, emittedLevels) => {
          const collector = new TraceCollector();
          const delivered = [];
          collector.subscribe((payload) => {
            delivered.push(JSON.parse(payload).level);
          }, {levels: allowedLevels});

          for (const level of emittedLevels) {
            collector.emit({
              level,
              message: 'event',
              context: null,
              timestamp: 1,
              lineageId: 'lineage-1',
              stageId: null,
              partitionId: null,
              nodeId: 'node-a',
              serviceDefinitionId: 'svc-a',
              replicaId: null,
              runtimeKind: 'wasm_component',
              source: 'service',
            });
          }

          assert.equal(
            delivered.every((level) => allowedLevels.includes(level)),
            true,
          );
        },
      ),
      {numRuns: 10},
    );
  });
