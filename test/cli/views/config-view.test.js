/**
 * Unit tests for ConfigView
 *
 * Tests the config view functionality including filtering,
 * highlighting, and display formatting.
 *
 * Requirements: 30.1, 30.2, 30.6, 30.7
 */

import {test} from 'tap';
import {ConfigView, CONFIG_TYPES} from '../../../src/cli/views/config-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

test('ConfigView - getColumns returns correct columns', async (t) => {
  const view = new ConfigView();
  const columns = view.getColumns();

  t.equal(columns.length, 5, 'should have 5 columns');
  t.equal(columns[0].key, 'key', 'first column should be key');
  t.equal(columns[1].key, 'value', 'second column should be value');
  t.equal(columns[2].key, 'type', 'third column should be type');
  t.equal(columns[3].key, 'requires_restart', 'fourth column should be requires_restart');
  t.equal(columns[4].key, 'updated_at', 'fifth column should be updated_at');
});

test('ConfigView - formatRow formats config entry correctly', async (t) => {
  const view = new ConfigView();
  const config = {
    key: 'max_connections',
    value: 100,
    type: 'number',
    requires_restart: true,
    updated_at: '2025-01-15T10:30:00Z',
  };

  const row = view.formatRow(config);

  t.equal(row[0], 'max_connections', 'key should be formatted');
  t.equal(row[1], '100', 'value should be formatted as string');
  t.equal(row[2], 'number', 'type should be formatted');
  t.equal(row[3], 'Yes', 'requires_restart should be Yes');
  t.match(row[4], /2025-01-15/, 'timestamp should be formatted');
});

test('ConfigView - formatValue handles different types', async (t) => {
  const view = new ConfigView();

  t.equal(view.formatValue(null, 'string'), 'null', 'null should be "null"');
  t.equal(view.formatValue(undefined, 'string'), 'null', 'undefined should be "null"');
  t.equal(view.formatValue('test', 'string'), 'test', 'string should be returned');
  t.equal(view.formatValue(123, 'number'), '123', 'number should be stringified');
  t.equal(view.formatValue(true, 'boolean'), 'true', 'boolean true should be "true"');
  t.equal(view.formatValue(false, 'boolean'), 'false', 'boolean false should be "false"');

  // JSON object
  const jsonValue = {a: 1, b: 2};
  t.equal(view.formatValue(jsonValue, 'json'), '{"a":1,"b":2}', 'json should be stringified');

  // Long value truncation
  const longValue = 'a'.repeat(50);
  const formatted = view.formatValue(longValue, 'string');
  t.ok(formatted.endsWith('...'), 'long values should be truncated');
  t.equal(formatted.length, 40, 'truncated value should be 40 chars');
});

test('ConfigView - formatRequiresRestart shows warning indicator', async (t) => {
  const view = new ConfigView();

  t.equal(
    view.formatRequiresRestart({requires_restart: false}),
    'No',
    'should show No when not required',
  );
  t.equal(
    view.formatRequiresRestart({requires_restart: true}),
    'Yes',
    'should show Yes when required',
  );
  t.equal(
    view.formatRequiresRestart({requires_restart: true, pending_restart: true}),
    'Yes (!)',
    'should show warning when pending restart',
  );
});

test('ConfigView - getRowStatus highlights non-default values', async (t) => {
  const view = new ConfigView();

  // Normal status when value equals default
  const normalConfig = {
    key: 'test',
    value: 100,
    default_value: 100,
    requires_restart: false,
  };
  t.equal(view.getRowStatus(normalConfig), ROW_STATUS.NORMAL, 'should be normal when matching');

  // Warning status when value differs from default
  const changedConfig = {
    key: 'test',
    value: 200,
    default_value: 100,
    requires_restart: false,
  };
  t.equal(view.getRowStatus(changedConfig), ROW_STATUS.WARNING, 'should warn when different');

  // Warning status when pending restart
  const restartConfig = {
    key: 'test',
    value: 100,
    default_value: 100,
    requires_restart: true,
    pending_restart: true,
  };
  t.equal(view.getRowStatus(restartConfig), ROW_STATUS.WARNING, 'should warn when pending restart');
});

test('ConfigView - isDifferentFromDefault compares values correctly', async (t) => {
  const view = new ConfigView();

  // No default_value property
  t.equal(
    view.isDifferentFromDefault({key: 'test', value: 100}),
    false,
    'should be false when no default_value',
  );

  // Same primitive values
  t.equal(
    view.isDifferentFromDefault({value: 100, default_value: 100}),
    false,
    'should be false for same numbers',
  );
  t.equal(
    view.isDifferentFromDefault({value: 'test', default_value: 'test'}),
    false,
    'should be false for same strings',
  );

  // Different primitive values
  t.equal(
    view.isDifferentFromDefault({value: 100, default_value: 200}),
    true,
    'should be true for different numbers',
  );
  t.equal(
    view.isDifferentFromDefault({value: 'test', default_value: 'other'}),
    true,
    'should be true for different strings',
  );

  // Object comparison
  t.equal(
    view.isDifferentFromDefault({value: {a: 1}, default_value: {a: 1}}),
    false,
    'should be false for same objects',
  );
  t.equal(
    view.isDifferentFromDefault({value: {a: 1}, default_value: {a: 2}}),
    true,
    'should be true for different objects',
  );

  // Null handling
  t.equal(
    view.isDifferentFromDefault({value: null, default_value: null}),
    false,
    'should be false for both null',
  );
  t.equal(
    view.isDifferentFromDefault({value: null, default_value: 100}),
    true,
    'should be true when value is null but default is not',
  );
  t.equal(
    view.isDifferentFromDefault({value: 100, default_value: null}),
    true,
    'should be true when default is null but value is not',
  );
});

test('ConfigView - setKeyPatternFilter filters by key pattern', async (t) => {
  const view = new ConfigView();
  view.setData([
    {key: 'max_connections', value: 100},
    {key: 'min_connections', value: 10},
    {key: 'timeout_seconds', value: 30},
    {key: 'max_retries', value: 3},
  ]);

  // Filter by pattern
  view.setKeyPatternFilter('max');
  t.equal(view.filteredData.length, 2, 'should filter to entries containing "max"');
  t.ok(
    view.filteredData.every((c) => c.key.includes('max')),
    'all filtered entries should contain "max"',
  );

  // Clear filter
  view.clearKeyPatternFilter();
  t.equal(view.filteredData.length, 4, 'should show all entries after clearing filter');
});

test('ConfigView - getSelectedDetails returns full config details', async (t) => {
  const view = new ConfigView();
  view.setData([
    {
      key: 'max_connections',
      value: 200,
      default_value: 100,
      type: 'number',
      requires_restart: true,
      pending_restart: true,
      description: 'Maximum number of connections',
      updated_at: '2025-01-15T10:30:00Z',
    },
  ]);

  const details = view.getSelectedDetails();

  t.ok(details, 'should return details');
  t.equal(details.title, 'Config: max_connections', 'should have correct title');
  t.ok(details.sections.length >= 2, 'should have multiple sections');

  // Check main section
  const mainSection = details.sections[0];
  t.equal(mainSection.title, 'Configuration Entry', 'should have config entry section');
  t.ok(
    mainSection.fields.some((f) => f.label === 'Default Value'),
    'should include default value',
  );
});

test('ConfigView - getStatusBarInfo returns correct counts', async (t) => {
  const view = new ConfigView();
  view.setData([
    {key: 'config1', value: 100, default_value: 100},
    {key: 'config2', value: 200, default_value: 100}, // Different from default
    {key: 'config3', value: 300, default_value: 300, requires_restart: true, pending_restart: true},
  ]);

  const statusBar = view.getStatusBarInfo();

  t.equal(statusBar.configCount, 3, 'should count all configs');
  t.equal(statusBar.nonDefaultCount, 1, 'should count non-default configs');
  t.equal(statusBar.restartRequiredCount, 1, 'should count restart required configs');
});

test('ConfigView - handleDrillDown returns navigation action', async (t) => {
  const view = new ConfigView();
  view.setData([
    {key: 'test_config', value: 100},
  ]);

  const action = view.handleDrillDown();

  t.ok(action, 'should return action');
  t.equal(action.action, 'showDetail', 'should be showDetail action');
  t.equal(action.view, 'config', 'should be config view');
  t.equal(action.context.configKey, 'test_config', 'should have config key in context');
});

test('ConfigView - CONFIG_TYPES export', async (t) => {
  t.ok(Array.isArray(CONFIG_TYPES), 'CONFIG_TYPES should be an array');
  t.ok(CONFIG_TYPES.includes('string'), 'should include string type');
  t.ok(CONFIG_TYPES.includes('number'), 'should include number type');
  t.ok(CONFIG_TYPES.includes('boolean'), 'should include boolean type');
  t.ok(CONFIG_TYPES.includes('json'), 'should include json type');
});

test('ConfigView - validateValue validates string type', async (t) => {
  const view = new ConfigView();

  const result = view.validateValue('hello', 'string');
  t.equal(result.valid, true, 'should accept string');
  t.equal(result.parsedValue, 'hello', 'should return trimmed string');

  const trimResult = view.validateValue('  hello  ', 'string');
  t.equal(trimResult.parsedValue, 'hello', 'should trim whitespace');
});

test('ConfigView - validateValue validates number type', async (t) => {
  const view = new ConfigView();

  const intResult = view.validateValue('123', 'number');
  t.equal(intResult.valid, true, 'should accept integer');
  t.equal(intResult.parsedValue, 123, 'should parse integer');

  const floatResult = view.validateValue('3.14', 'number');
  t.equal(floatResult.valid, true, 'should accept float');
  t.equal(floatResult.parsedValue, 3.14, 'should parse float');

  const negResult = view.validateValue('-42', 'number');
  t.equal(negResult.valid, true, 'should accept negative');
  t.equal(negResult.parsedValue, -42, 'should parse negative');

  const invalidResult = view.validateValue('abc', 'number');
  t.equal(invalidResult.valid, false, 'should reject non-number');
  t.ok(invalidResult.error, 'should have error message');

  const emptyResult = view.validateValue('', 'number');
  t.equal(emptyResult.valid, false, 'should reject empty string');
});

test('ConfigView - validateValue validates boolean type', async (t) => {
  const view = new ConfigView();

  t.equal(view.validateValue('true', 'boolean').parsedValue, true, 'should parse "true"');
  t.equal(view.validateValue('false', 'boolean').parsedValue, false, 'should parse "false"');
  t.equal(view.validateValue('yes', 'boolean').parsedValue, true, 'should parse "yes"');
  t.equal(view.validateValue('no', 'boolean').parsedValue, false, 'should parse "no"');
  t.equal(view.validateValue('1', 'boolean').parsedValue, true, 'should parse "1"');
  t.equal(view.validateValue('0', 'boolean').parsedValue, false, 'should parse "0"');
  t.equal(view.validateValue('TRUE', 'boolean').parsedValue, true, 'should be case insensitive');

  const invalidResult = view.validateValue('maybe', 'boolean');
  t.equal(invalidResult.valid, false, 'should reject invalid boolean');
});

test('ConfigView - validateValue validates json type', async (t) => {
  const view = new ConfigView();

  const objResult = view.validateValue('{"a": 1}', 'json');
  t.equal(objResult.valid, true, 'should accept valid JSON object');
  t.same(objResult.parsedValue, {a: 1}, 'should parse JSON object');

  const arrResult = view.validateValue('[1, 2, 3]', 'json');
  t.equal(arrResult.valid, true, 'should accept valid JSON array');
  t.same(arrResult.parsedValue, [1, 2, 3], 'should parse JSON array');

  const invalidResult = view.validateValue('{invalid}', 'json');
  t.equal(invalidResult.valid, false, 'should reject invalid JSON');
  t.ok(invalidResult.error, 'should have error message');

  const emptyResult = view.validateValue('', 'json');
  t.equal(emptyResult.valid, false, 'should reject empty string');
});

test('ConfigView - prepareEdit validates and prepares edit operation', async (t) => {
  const view = new ConfigView();
  view.setData([
    {key: 'max_connections', value: 100, type: 'number', requires_restart: true},
    {key: 'debug_mode', value: false, type: 'boolean', requires_restart: false},
  ]);

  // Valid edit
  const validEdit = view.prepareEdit('max_connections', '200');
  t.equal(validEdit.success, true, 'should succeed for valid edit');
  t.equal(validEdit.oldValue, 100, 'should have old value');
  t.equal(validEdit.newValue, 200, 'should have parsed new value');
  t.equal(validEdit.requiresRestart, true, 'should indicate restart required');

  // Invalid value
  const invalidEdit = view.prepareEdit('max_connections', 'abc');
  t.equal(invalidEdit.success, false, 'should fail for invalid value');
  t.ok(invalidEdit.error, 'should have error message');

  // Non-existent key
  const notFoundEdit = view.prepareEdit('nonexistent', '123');
  t.equal(notFoundEdit.success, false, 'should fail for non-existent key');
});

test('ConfigView - prepareRevert prepares revert operation', async (t) => {
  const view = new ConfigView();
  view.setData([
    {key: 'max_connections', value: 200, default_value: 100, type: 'number'},
    {key: 'timeout', value: 30, default_value: 30, type: 'number'},
    {key: 'no_default', value: 'test', type: 'string'},
  ]);

  // Valid revert
  const validRevert = view.prepareRevert('max_connections');
  t.equal(validRevert.success, true, 'should succeed for valid revert');
  t.equal(validRevert.oldValue, 200, 'should have old value');
  t.equal(validRevert.newValue, 100, 'should have default value');
  t.equal(validRevert.isRevert, true, 'should be marked as revert');

  // Already at default
  const alreadyDefault = view.prepareRevert('timeout');
  t.equal(alreadyDefault.success, false, 'should fail when already at default');

  // No default value
  const noDefault = view.prepareRevert('no_default');
  t.equal(noDefault.success, false, 'should fail when no default defined');

  // Non-existent key
  const notFound = view.prepareRevert('nonexistent');
  t.equal(notFound.success, false, 'should fail for non-existent key');
});

test('ConfigView - getEditConfirmation generates confirmation message', async (t) => {
  const view = new ConfigView();
  view.setData([
    {key: 'max_connections', value: 100, type: 'number', requires_restart: true},
  ]);

  const editOp = view.prepareEdit('max_connections', '200');
  const confirmation = view.getEditConfirmation(editOp);

  t.ok(confirmation, 'should return confirmation');
  t.ok(confirmation.title, 'should have title');
  t.ok(confirmation.message.includes('max_connections'), 'should include key');
  t.ok(confirmation.message.includes('100'), 'should include old value');
  t.ok(confirmation.message.includes('200'), 'should include new value');
  t.equal(confirmation.requiresRestart, true, 'should indicate restart required');
});

test('ConfigView - canEdit checks editability', async (t) => {
  const view = new ConfigView();
  view.setData([
    {key: 'editable', value: 100, type: 'number'},
    {key: 'readonly', value: 200, type: 'number', read_only: true},
  ]);

  const editableResult = view.canEdit('editable');
  t.equal(editableResult.editable, true, 'should be editable');

  const readonlyResult = view.canEdit('readonly');
  t.equal(readonlyResult.editable, false, 'should not be editable');
  t.ok(readonlyResult.reason, 'should have reason');

  const notFoundResult = view.canEdit('nonexistent');
  t.equal(notFoundResult.editable, false, 'should not be editable if not found');
});

test('ConfigView - canRevert checks revertability', async (t) => {
  const view = new ConfigView();
  view.setData([
    {key: 'changed', value: 200, default_value: 100, type: 'number'},
    {key: 'unchanged', value: 100, default_value: 100, type: 'number'},
    {key: 'no_default', value: 'test', type: 'string'},
    {key: 'readonly', value: 200, default_value: 100, type: 'number', read_only: true},
  ]);

  const changedResult = view.canRevert('changed');
  t.equal(changedResult.revertable, true, 'should be revertable');

  const unchangedResult = view.canRevert('unchanged');
  t.equal(unchangedResult.revertable, false, 'should not be revertable if unchanged');

  const noDefaultResult = view.canRevert('no_default');
  t.equal(noDefaultResult.revertable, false, 'should not be revertable without default');

  const readonlyResult = view.canRevert('readonly');
  t.equal(readonlyResult.revertable, false, 'should not be revertable if readonly');
});
