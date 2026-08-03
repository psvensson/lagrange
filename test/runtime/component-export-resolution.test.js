/**
 * Unit proof for the canonical kebab-to-camel export resolution seam:
 * deployment surfaces keep WIT kebab-case export names ('handle-request')
 * while jco's instantiated component object exposes lowerCamelCase keys
 * ('handleRequest'); resolveComponentExport is the one translation owner
 * the worker consults at both export-resolution sites.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {resolveComponentExport} from
  '../../src/runtime/component-export-resolution.js';

function namedExport(label) {
  const exportFunction = () => label;
  return exportFunction;
}

test('resolves a kebab-case WIT export name to the jco camelCase key',
  () => {
    const handleRequest = namedExport('handle-request');
    const resolved = resolveComponentExport(
      {handleRequest},
      'handle-request',
    );
    assert.equal(resolved, handleRequest);
  });

test('maps every kebab segment of a multi-word WIT name', () => {
  const exportFunction = namedExport('multi');
  const resolved = resolveComponentExport(
    {someLongExportV2: exportFunction},
    'some-long-export-v2',
  );
  assert.equal(resolved, exportFunction);
});

test('single-word export names resolve unchanged', () => {
  const run = namedExport('run');
  assert.equal(resolveComponentExport({run}, 'run'), run);
});

test('an exact key wins over the mapped key', () => {
  const exact = namedExport('exact');
  const mapped = namedExport('mapped');
  const resolved = resolveComponentExport(
    {'handle-request': exact, 'handleRequest': mapped},
    'handle-request',
  );
  assert.equal(resolved, exact);
});

test('a camelCase caller key still resolves directly', () => {
  const handleRequest = namedExport('camel');
  assert.equal(
    resolveComponentExport({handleRequest}, 'handleRequest'),
    handleRequest,
  );
});

test('missing exports and non-function keys resolve to undefined', () => {
  assert.equal(
    resolveComponentExport({}, 'handle-request'),
    undefined,
  );
  assert.equal(
    resolveComponentExport({handleRequest: 'not-a-function'},
      'handle-request'),
    undefined,
  );
  assert.equal(resolveComponentExport(null, 'run'), undefined);
  assert.equal(resolveComponentExport({run: namedExport('run')}, undefined),
    undefined);
});
