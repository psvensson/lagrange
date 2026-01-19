/**
 * Unit tests for ContextsView
 *
 * Tests the contexts view functionality including filtering,
 * highlighting, and display formatting.
 *
 * Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6
 */

import {test} from 'tap';
import {
  ContextsView,
  CONTEXT_TYPES,
  RECENT_UPDATE_THRESHOLD_MS,
} from '../../../src/cli/views/contexts-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

test('ContextsView - getColumns returns correct columns', async (t) => {
  const view = new ContextsView();
  const columns = view.getColumns();

  t.equal(columns.length, 5, 'should have 5 columns');
  t.equal(columns[0].key, 'context_id', 'first column should be context_id');
  t.equal(columns[1].key, 'context_type', 'second column should be context_type');
  t.equal(columns[2].key, 'name', 'third column should be name');
  t.equal(columns[3].key, 'created_at', 'fourth column should be created_at');
  t.equal(columns[4].key, 'updated_at', 'fifth column should be updated_at');
});

test('ContextsView - formatRow formats context entry correctly', async (t) => {
  const view = new ContextsView();
  const context = {
    context_id: 'ctx-123',
    context_type: 'function',
    name: 'myFunction',
    created_at: '2025-01-15T10:30:00Z',
    updated_at: '2025-01-15T11:00:00Z',
  };

  const row = view.formatRow(context);

  t.equal(row[0], 'ctx-123', 'context_id should be formatted');
  t.equal(row[1], 'function', 'context_type should be formatted');
  t.equal(row[2], 'myFunction', 'name should be formatted');
  t.match(row[3], /2025-01-15/, 'created_at should be formatted');
  t.match(row[4], /2025-01-15/, 'updated_at should be formatted');
});

test('ContextsView - formatRow handles missing values', async (t) => {
  const view = new ContextsView();
  const context = {};

  const row = view.formatRow(context);

  t.equal(row[0], 'N/A', 'missing context_id should be N/A');
  t.equal(row[1], 'N/A', 'missing context_type should be N/A');
  t.equal(row[2], 'N/A', 'missing name should be N/A');
  t.equal(row[3], 'N/A', 'missing created_at should be N/A');
  t.equal(row[4], 'N/A', 'missing updated_at should be N/A');
});

test('ContextsView - truncateName truncates long names', async (t) => {
  const view = new ContextsView();

  t.equal(view.truncateName('short'), 'short', 'short names should not be truncated');
  t.equal(view.truncateName(null), 'N/A', 'null should be N/A');
  t.equal(view.truncateName(undefined), 'N/A', 'undefined should be N/A');

  const longName = 'a'.repeat(50);
  const truncated = view.truncateName(longName);
  t.ok(truncated.endsWith('...'), 'long names should be truncated with ellipsis');
  t.equal(truncated.length, 40, 'truncated name should be 40 chars');
});

test('ContextsView - formatTimestamp formats timestamps correctly', async (t) => {
  const view = new ContextsView();

  t.equal(view.formatTimestamp(null), 'N/A', 'null should be N/A');
  t.equal(view.formatTimestamp(undefined), 'N/A', 'undefined should be N/A');
  t.equal(view.formatTimestamp('invalid'), 'N/A', 'invalid date should be N/A');

  const formatted = view.formatTimestamp('2025-01-15T10:30:00Z');
  t.match(formatted, /2025-01-15 10:30:00/, 'should format ISO timestamp');

  const numericFormatted = view.formatTimestamp(1705315800000);
  t.match(numericFormatted, /\d{4}-\d{2}-\d{2}/, 'should format numeric timestamp');
});

test('ContextsView - isRecentlyUpdated detects recent updates', async (t) => {
  const view = new ContextsView({recentUpdateThreshold: 5 * 60 * 1000}); // 5 minutes
  const now = Date.now();

  // Recently updated (1 minute ago)
  const recentContext = {updated_at: now - 60 * 1000};
  t.equal(view.isRecentlyUpdated(recentContext, now), true, 'should detect recent update');

  // Not recently updated (10 minutes ago)
  const oldContext = {updated_at: now - 10 * 60 * 1000};
  t.equal(view.isRecentlyUpdated(oldContext, now), false, 'should not detect old update');

  // No updated_at
  const noUpdateContext = {};
  t.equal(view.isRecentlyUpdated(noUpdateContext, now), false, 'should handle missing timestamp');

  // Future timestamp (should not be considered recent)
  const futureContext = {updated_at: now + 60 * 1000};
  t.equal(view.isRecentlyUpdated(futureContext, now), false, 'should not detect future update');
});

test('ContextsView - getRowStatus highlights recently updated', async (t) => {
  const now = Date.now();
  const view = new ContextsView({recentUpdateThreshold: 5 * 60 * 1000});

  // Recently updated context
  const recentContext = {updated_at: now - 60 * 1000};
  t.equal(view.getRowStatus(recentContext), ROW_STATUS.WARNING, 'recent should be warning');

  // Old context
  const oldContext = {updated_at: now - 10 * 60 * 1000};
  t.equal(view.getRowStatus(oldContext), ROW_STATUS.NORMAL, 'old should be normal');

  // No timestamp
  const noTimestampContext = {};
  t.equal(
    view.getRowStatus(noTimestampContext),
    ROW_STATUS.NORMAL,
    'no timestamp should be normal',
  );
});

test('ContextsView - setTypeFilter filters by type', async (t) => {
  const view = new ContextsView();
  view.setData([
    {context_id: '1', context_type: 'function', name: 'func1'},
    {context_id: '2', context_type: 'service', name: 'svc1'},
    {context_id: '3', context_type: 'function', name: 'func2'},
    {context_id: '4', context_type: 'user', name: 'user1'},
  ]);

  // Filter by function type
  view.setTypeFilter('function');
  t.equal(view.filteredData.length, 2, 'should filter to function contexts');
  t.ok(
    view.filteredData.every((c) => c.context_type === 'function'),
    'all filtered should be function type',
  );

  // Filter by service type
  view.setTypeFilter('service');
  t.equal(view.filteredData.length, 1, 'should filter to service contexts');

  // Clear filter
  view.clearTypeFilter();
  t.equal(view.filteredData.length, 4, 'should show all after clearing filter');
});

test('ContextsView - setNamePatternFilter filters by name pattern', async (t) => {
  const view = new ContextsView();
  view.setData([
    {context_id: '1', name: 'userAuth'},
    {context_id: '2', name: 'userProfile'},
    {context_id: '3', name: 'orderService'},
    {context_id: '4', name: 'paymentHandler'},
  ]);

  // Filter by pattern
  view.setNamePatternFilter('user');
  t.equal(view.filteredData.length, 2, 'should filter to names containing "user"');
  t.ok(
    view.filteredData.every((c) => c.name.toLowerCase().includes('user')),
    'all filtered should contain "user"',
  );

  // Clear filter
  view.clearNamePatternFilter();
  t.equal(view.filteredData.length, 4, 'should show all after clearing filter');
});

test('ContextsView - combined filters work together', async (t) => {
  const view = new ContextsView();
  view.setData([
    {context_id: '1', context_type: 'function', name: 'userAuth'},
    {context_id: '2', context_type: 'function', name: 'orderProcess'},
    {context_id: '3', context_type: 'service', name: 'userService'},
    {context_id: '4', context_type: 'user', name: 'adminUser'},
  ]);

  // Apply both filters
  view.setTypeFilter('function');
  view.setNamePatternFilter('user');

  t.equal(view.filteredData.length, 1, 'should filter by both type and name');
  t.equal(view.filteredData[0].context_id, '1', 'should find userAuth function');

  // Clear all filters
  view.clearAllFilters();
  t.equal(view.filteredData.length, 4, 'should show all after clearing all filters');
});

test('ContextsView - getSelectedDetails returns full context details', async (t) => {
  const view = new ContextsView();
  view.setData([
    {
      context_id: 'ctx-123',
      context_type: 'function',
      name: 'myFunction',
      created_at: '2025-01-15T10:30:00Z',
      updated_at: '2025-01-15T11:00:00Z',
      state_data: {key1: 'value1', key2: 123},
    },
  ]);

  const details = view.getSelectedDetails();

  t.ok(details, 'should return details');
  t.ok(details.title.includes('myFunction'), 'should have correct title');
  t.ok(details.sections.length >= 2, 'should have multiple sections');

  // Check main section
  const mainSection = details.sections[0];
  t.equal(mainSection.title, 'Context Entry', 'should have context entry section');

  // Check state data section
  const stateSection = details.sections.find((s) => s.title === 'State Data');
  t.ok(stateSection, 'should have state data section');
  t.ok(stateSection.fields.some((f) => f.label === 'key1'), 'should include state data fields');
});

test('ContextsView - getContextCountByType returns correct counts', async (t) => {
  const view = new ContextsView();
  view.setData([
    {context_id: '1', context_type: 'function'},
    {context_id: '2', context_type: 'function'},
    {context_id: '3', context_type: 'service'},
    {context_id: '4', context_type: 'user'},
    {context_id: '5', context_type: 'function'},
  ]);

  const counts = view.getContextCountByType();

  t.equal(counts.function, 3, 'should count function contexts');
  t.equal(counts.service, 1, 'should count service contexts');
  t.equal(counts.user, 1, 'should count user contexts');
});

test('ContextsView - getStatusBarInfo returns correct info', async (t) => {
  const now = Date.now();
  const view = new ContextsView({recentUpdateThreshold: 5 * 60 * 1000});
  view.setData([
    {context_id: '1', context_type: 'function', updated_at: now - 60 * 1000}, // Recent
    {context_id: '2', context_type: 'function', updated_at: now - 10 * 60 * 1000}, // Old
    {context_id: '3', context_type: 'service', updated_at: now - 60 * 1000}, // Recent
  ]);

  const statusBar = view.getStatusBarInfo();

  t.equal(statusBar.contextCount, 3, 'should count all contexts');
  t.equal(statusBar.totalCount, 3, 'should have total count');
  t.equal(statusBar.recentlyUpdatedCount, 2, 'should count recently updated');
  t.ok(statusBar.countsByType, 'should have counts by type');
  t.equal(statusBar.countsByType.function, 2, 'should count function type');
  t.equal(statusBar.countsByType.service, 1, 'should count service type');
});

test('ContextsView - handleDrillDown returns navigation action', async (t) => {
  const view = new ContextsView();
  view.setData([
    {context_id: 'ctx-123', name: 'testContext'},
  ]);

  const action = view.handleDrillDown();

  t.ok(action, 'should return action');
  t.equal(action.action, 'showDetail', 'should be showDetail action');
  t.equal(action.view, 'contexts', 'should be contexts view');
  t.equal(action.context.contextId, 'ctx-123', 'should have context id in context');
});

test('ContextsView - CONTEXT_TYPES export', async (t) => {
  t.ok(Array.isArray(CONTEXT_TYPES), 'CONTEXT_TYPES should be an array');
  t.ok(CONTEXT_TYPES.includes('function'), 'should include function type');
  t.ok(CONTEXT_TYPES.includes('service'), 'should include service type');
  t.ok(CONTEXT_TYPES.includes('user'), 'should include user type');
});

test('ContextsView - RECENT_UPDATE_THRESHOLD_MS export', async (t) => {
  t.equal(typeof RECENT_UPDATE_THRESHOLD_MS, 'number', 'should be a number');
  t.equal(RECENT_UPDATE_THRESHOLD_MS, 5 * 60 * 1000, 'should be 5 minutes in ms');
});

test('ContextsView - sorting by updated_at', async (t) => {
  const view = new ContextsView();
  view.setData([
    {context_id: '1', updated_at: 1000},
    {context_id: '2', updated_at: 3000},
    {context_id: '3', updated_at: 2000},
  ]);

  // Default sort is desc by updated_at
  t.equal(view.filteredData[0].context_id, '2', 'most recent should be first');
  t.equal(view.filteredData[2].context_id, '1', 'oldest should be last');

  // Change to ascending
  view.setSort('updated_at', 'asc');
  t.equal(view.filteredData[0].context_id, '1', 'oldest should be first in asc');
});

test('ContextsView - getItemKey returns context_id', async (t) => {
  const view = new ContextsView();

  t.equal(view.getItemKey({context_id: 'ctx-123'}), 'ctx-123', 'should return context_id');
  t.equal(view.getItemKey({}), '', 'should return empty string for missing id');
});

test('ContextsView - setRecentUpdateThreshold changes threshold', async (t) => {
  const view = new ContextsView();

  view.setRecentUpdateThreshold(10 * 60 * 1000);
  t.equal(view.getRecentUpdateThreshold(), 10 * 60 * 1000, 'should update threshold');
});
