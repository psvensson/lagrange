/**
 * The throttled diagnostics line admits the first occurrence of a key, then
 * at most one per window, and folds the suppressed count and the largest
 * suppressed duration into the next line it writes.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  ThrottledDiagnosticsLine,
} from '../../src/diagnostics/throttled-diagnostics-line.js';

function createLine(windowMs = 1000) {
  const clock = {nowMs: 0};
  const lines = [];
  const line = new ThrottledDiagnosticsLine({
    message: 'Test line',
    windowMs,
    maxField: 'maxWaveMs',
    now: () => clock.nowMs,
    write: (level, message, context) => lines.push({level, message, context}),
  });
  return {clock, line, lines};
}

test('the first occurrence of a key is written at once', async (t) => {
  const {line, lines} = createLine();

  t.equal(line.report('wave', 12, () => ({tableName: 'nodes'})), true);

  t.same(lines, [{
    level: 'info',
    message: 'Test line',
    context: {tableName: 'nodes', suppressed: 0, maxWaveMs: 12},
  }]);
});

test('occurrences inside the window are suppressed, counted and their ' +
  'largest duration kept', async (t) => {
  const {clock, line, lines} = createLine();
  line.report('wave', 5, () => ({wave: 1}));
  let contextBuilds = 0;
  const counted = () => {
    contextBuilds += 1;
    return {};
  };
  clock.nowMs = 100;
  t.equal(line.report('wave', 300, counted), false);
  clock.nowMs = 200;
  t.equal(line.report('wave', 40, counted), false);
  clock.nowMs = 999;
  t.equal(line.report('wave', null, counted), false);
  t.equal(contextBuilds, 0, 'a suppressed occurrence builds no fields');

  clock.nowMs = 1000;
  t.equal(line.report('wave', 7, () => ({wave: 5})), true);

  t.same(lines[1].context, {wave: 5, suppressed: 3, maxWaveMs: 300},
    'the slowest suppressed occurrence survives into the next line');

  clock.nowMs = 2000;
  line.report('wave', 2, () => ({wave: 6}));
  t.same(lines[2].context, {wave: 6, suppressed: 0, maxWaveMs: 2},
    'the aggregate starts over after each written line');
});

test('keys are throttled independently', async (t) => {
  const {line, lines} = createLine();

  line.report('busy', null, () => ({reason: 'busy'}));
  line.report('yield_hold', null, () => ({reason: 'yield_hold'}));
  line.report('busy', null, () => ({reason: 'busy'}));

  t.same(lines.map((entry) => entry.context.reason), ['busy', 'yield_hold']);
  t.equal(lines[0].context.maxWaveMs, null,
    'a line without any measured duration says so');
});

test('a failing field builder still yields a line and never throws',
  async (t) => {
    const {line, lines} = createLine();

    t.equal(line.report('wave', 9, () => {
      throw new Error('database is closed');
    }), true);

    t.same(lines[0].context, {
      state: 'diagnostics_context_failed',
      error: 'database is closed',
      suppressed: 0,
      maxWaveMs: 9,
    });
  });
