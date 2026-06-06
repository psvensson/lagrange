import tap from 'tap';

import {
  reflectionTriggersFromHealth,
  buildAdvisories,
  renderAdvisoryLines,
} from '../../scripts/solve/advisories.js';
import {
  CONTINUATION_ALLOWED,
  CONTINUATION_BLOCKED_THEORY,
  CONTINUATION_BLOCKED_SCOPE,
  CONTINUATION_BLOCKED_REGRESSION,
} from '../../scripts/solve/continuation.js';
import {EVENT_ATTEMPT, REFLECTION_INTERVAL} from '../../scripts/solve/constants.js';

const quest = {id: 'q1'};
const attempt = () => ({type: EVENT_ATTEMPT, frontier: 'f', progressed: false});
const health = (over = {}) => ({
  questId: 'q1',
  frontier: 'f',
  signals: [],
  continuation: {status: CONTINUATION_ALLOWED, code: null, problems: []},
  ...over,
});

tap.test('reflectionTriggersFromHealth maps signals to triggers', (t) => {
  t.same(reflectionTriggersFromHealth(health()), {oscillating: false, scope: false});
  t.same(
    reflectionTriggersFromHealth(health({
      signals: [{type: 'coupled-invariant-oscillation'}],
    })),
    {oscillating: true, scope: false});
  t.same(
    reflectionTriggersFromHealth(health({
      signals: [{type: 'scope-pressure-terminal'}],
    })),
    {oscillating: false, scope: true});
  t.same(reflectionTriggersFromHealth(undefined), {oscillating: false, scope: false});
  t.end();
});

tap.test('buildAdvisories reflection-due', (t) => {
  t.test('no advisory when nothing is due', (t) => {
    const advisories = buildAdvisories(quest, health(), []);
    t.equal(advisories.length, 0);
    t.end();
  });

  t.test('cadence reflection surfaces a reflect command', (t) => {
    const log = [];
    for (let i = 0; i < REFLECTION_INTERVAL; i += 1) log.push(attempt());
    const advisories = buildAdvisories(quest, health(), log);
    const reflect = advisories.find((a) => a.kind === 'reflection-due');
    t.ok(reflect, 'reflection-due advisory present');
    t.equal(reflect.trigger, 'cadence');
    t.match(reflect.command, /reflect --id q1 --trigger cadence/);
    t.ok(reflect.prompt, 'carries the reflection prompt');
    t.end();
  });

  t.test('oscillation forces a reflection advisory regardless of cadence', (t) => {
    const advisories = buildAdvisories(
      quest,
      health({signals: [{type: 'coupled-invariant-oscillation'}]}),
      []);
    const reflect = advisories.find((a) => a.kind === 'reflection-due');
    t.ok(reflect, 'reflection-due advisory present');
    t.equal(reflect.trigger, 'oscillation');
    t.end();
  });

  t.end();
});

tap.test('buildAdvisories override-available', (t) => {
  t.test('overridable theory block surfaces an override command', (t) => {
    const advisories = buildAdvisories(
      quest,
      health({continuation: {
        status: CONTINUATION_BLOCKED_THEORY,
        code: CONTINUATION_BLOCKED_THEORY,
        problems: ['system theory required'],
      }}),
      []);
    const override = advisories.find((a) => a.kind === 'override-available');
    t.ok(override, 'override-available advisory present');
    t.equal(override.guard, 'theory');
    t.match(override.command, /override --id q1 --frontier f --guard theory/);
    t.end();
  });

  t.test('overridable scope block surfaces an override command', (t) => {
    const advisories = buildAdvisories(
      quest,
      health({continuation: {
        status: CONTINUATION_BLOCKED_SCOPE,
        code: CONTINUATION_BLOCKED_SCOPE,
        problems: ['scope pressure terminal'],
      }}),
      []);
    const override = advisories.find((a) => a.kind === 'override-available');
    t.ok(override, 'override-available advisory present');
    t.equal(override.guard, 'scope');
    t.end();
  });

  t.test('non-overridable honesty invariant gets no override advisory', (t) => {
    const advisories = buildAdvisories(
      quest,
      health({continuation: {
        status: CONTINUATION_BLOCKED_REGRESSION,
        code: CONTINUATION_BLOCKED_REGRESSION,
        problems: ['regression restore required'],
      }}),
      []);
    t.notOk(advisories.find((a) => a.kind === 'override-available'),
      'regression is not overridable');
    t.end();
  });

  t.test('allowed continuation gets no override advisory', (t) => {
    const advisories = buildAdvisories(quest, health(), []);
    t.notOk(advisories.find((a) => a.kind === 'override-available'));
    t.end();
  });

  t.end();
});

tap.test('buildAdvisories evidence-unrecorded', (t) => {
  t.test('fresh frontier evidence surfaces an ingest command', (t) => {
    const advisories = buildAdvisories(
      quest,
      health({signals: [{
        type: 'fresh-evidence-unrecorded',
        severity: 'high',
        command: 'node scripts/solve.js ingest-evidence --id q1 --evidence r.json',
      }]}),
      []);
    const ev = advisories.find((a) => a.kind === 'evidence-unrecorded');
    t.ok(ev, 'evidence-unrecorded advisory present');
    t.equal(ev.scope, 'frontier');
    t.match(ev.command, /ingest-evidence --id q1/);
    t.end();
  });

  t.test('fresh closure evidence is flagged as closure scope', (t) => {
    const advisories = buildAdvisories(
      quest,
      health({signals: [{
        type: 'fresh-closure-evidence-unrecorded',
        severity: 'medium',
        command: 'node scripts/solve.js ingest-evidence --id q1 --evidence c.json',
      }]}),
      []);
    const ev = advisories.find((a) => a.kind === 'evidence-unrecorded');
    t.ok(ev, 'evidence-unrecorded advisory present');
    t.equal(ev.scope, 'closure');
    t.end();
  });

  t.end();
});

tap.test('buildAdvisories harness-invalid', (t) => {
  t.test('a non-measuring cannot-measure signal surfaces a fix-harness advisory', (t) => {
    const advisories = buildAdvisories(
      quest,
      health({signals: [{
        type: 'cannot-measure',
        mechanism: 'f: 3 consecutive non-measuring runs (harness connectivity)',
        severity: 'high',
      }]}),
      []);
    const harness = advisories.find((a) => a.kind === 'harness-invalid');
    t.ok(harness, 'harness-invalid advisory present');
    t.match(harness.message, /harness has stopped measuring/);
    t.match(harness.command, /status --id q1/);
    t.end();
  });

  t.test('a parked-frontier cannot-measure signal does not surface it', (t) => {
    const advisories = buildAdvisories(
      quest,
      health({signals: [{
        type: 'cannot-measure',
        mechanism: 'demo-main',
        severity: 'high',
      }]}),
      []);
    t.notOk(advisories.find((a) => a.kind === 'harness-invalid'),
      'plain parked cannot-measure (no non-measuring run) is not a harness advisory');
    t.end();
  });

  t.end();
});

tap.test('renderAdvisoryLines', (t) => {
  t.same(renderAdvisoryLines([]), [], 'empty advisories render no lines');
  const lines = renderAdvisoryLines([
    {kind: 'reflection-due', message: 'reflect now', command: 'node x reflect'},
  ]);
  t.equal(lines[0], '## Advisories');
  t.match(lines[1], /reflection-due: reflect now/);
  t.match(lines[2], /run: node x reflect/);
  t.end();
});
