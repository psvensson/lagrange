import tap from 'tap';

import {
  validateAttempt,
  validateGoalpostsImmutable,
  METRIC_DIRECTION_LOWER_IS_BETTER,
} from '../../scripts/solve/honesty.js';

const okCtx = {
  fileExists: () => true,
  changeRefResolves: () => true,
};

function attempt(extra = {}) {
  return {
    metricBefore: 5,
    metricAfter: 3,
    metricDirection: METRIC_DIRECTION_LOWER_IS_BETTER,
    evidence: 'report.json',
    changeRef: 'diff:/tmp/x.diff',
    prevRungIndex: 1,
    rungIndex: 1,
    ...extra,
  };
}

tap.test('honesty checks (the only process)', async (t) => {
  t.test('a well-formed attempt passes', (t) => {
    t.same(validateAttempt(attempt(), okCtx), []);
    t.end();
  });

  t.test('non-numeric metrics are rejected', (t) => {
    const v = validateAttempt(attempt({metricAfter: 'better'}), okCtx);
    t.ok(v.some((e) => e.includes('finite numbers')));
    t.end();
  });

  t.test('an invalid sample may carry a null metric (honest no-measurement)', (t) => {
    // A blocked/incomplete probe run reports a null metric. With invalidSample set
    // this is an honest stall, not dishonest data, so it must not be flagged — but
    // the evidence artifact and sealed direction are still required.
    const v = validateAttempt(
      attempt({invalidSample: true, metricBefore: 5, metricAfter: null}),
      okCtx,
    );
    t.same(v, [], 'null metric on an invalid sample is permitted');
    t.end();
  });

  t.test('a null metric WITHOUT the invalid-sample flag is still rejected', (t) => {
    const v = validateAttempt(attempt({metricAfter: null}), okCtx);
    t.ok(v.some((e) => e.includes('finite numbers')));
    t.ok(v.some((e) => e.includes('invalidSample=true')));
    t.end();
  });

  t.test('before and after metrics must share probe identity when recorded', (t) => {
    const v = validateAttempt(
      attempt({beforeProbeKey: 'probe:a', afterProbeKey: 'probe:b'}),
      okCtx,
    );
    t.ok(v.some((e) => e.includes('same probe identity')));
    t.end();
  });

  t.test('invalid-sample only exempts null metrics, not arbitrary values', (t) => {
    const v = validateAttempt(attempt({invalidSample: true, metricAfter: 'bad'}), okCtx);
    t.ok(v.some((e) => e.includes('finite numbers')));
    t.end();
  });

  t.test('an invalid sample still requires its evidence artifact', (t) => {
    const v = validateAttempt(
      attempt({invalidSample: true, metricAfter: null}),
      {...okCtx, fileExists: () => false},
    );
    t.ok(v.some((e) => e.includes('evidence artifact missing')));
    t.end();
  });

  t.test('missing evidence artifact is rejected', (t) => {
    const v = validateAttempt(attempt(), {...okCtx, fileExists: () => false});
    t.ok(v.some((e) => e.includes('evidence artifact missing')));
    t.end();
  });

  t.test('a redefined metric direction is rejected', (t) => {
    const v = validateAttempt(attempt({metricDirection: 'higher-is-better'}), okCtx);
    t.ok(v.some((e) => e.includes('metricDirection')));
    t.end();
  });

  t.test('an unresolved changeRef is rejected', (t) => {
    const v = validateAttempt(attempt(), {...okCtx, changeRefResolves: () => false});
    t.ok(v.some((e) => e.includes('changeRef does not resolve')));
    t.end();
  });

  t.test('lowering a rung without improvement is rejected', (t) => {
    const v = validateAttempt(
      attempt({prevRungIndex: 3, rungIndex: 1, metricBefore: 4, metricAfter: 4}),
      okCtx,
    );
    t.ok(v.some((e) => e.includes('rung reset')));
    t.end();
  });

  t.test('lowering a rung WITH improvement is allowed', (t) => {
    const v = validateAttempt(
      attempt({prevRungIndex: 3, rungIndex: 1, metricBefore: 5, metricAfter: 2}),
      okCtx,
    );
    t.same(v, []);
    t.end();
  });

  t.test('goalposts: unchanged done_when/metric passes', (t) => {
    const quest = {
      doneWhen: {probe: 'oracle', args: {file: 'o'}},
      frontiers: [{metric: {probe: 'oracle', args: {file: 'o'}}}],
    };
    const declared = {sealed: {
      doneWhen: quest.doneWhen,
      frontierMetrics: quest.frontiers.map((f) => f.metric),
    }};
    t.same(validateGoalpostsImmutable(quest, declared), []);
    t.end();
  });

  t.test('goalposts: a moved done_when is rejected', (t) => {
    const declared = {sealed: {
      doneWhen: {probe: 'oracle', args: {file: 'o', consecutive: 3}},
      frontierMetrics: [{probe: 'oracle', args: {file: 'o'}}],
    }};
    const quest = {
      doneWhen: {probe: 'oracle', args: {file: 'o', consecutive: 1}},
      frontiers: [{metric: {probe: 'oracle', args: {file: 'o'}}}],
    };
    t.ok(validateGoalpostsImmutable(quest, declared)
      .some((e) => e.includes('doneWhen changed')));
    t.end();
  });

  t.test('goalposts: refining the frontier gradient priority->distance passes', (t) => {
    const declared = {sealed: {
      doneWhen: {probe: 'harness', args: {scenario: 'rr', metric: 'priority'}},
      frontierMetrics: [{probe: 'harness', args: {scenario: 'rr', metric: 'priority'}}],
    }};
    const quest = {
      doneWhen: {probe: 'harness', args: {scenario: 'rr', metric: 'priority'}},
      frontiers: [{metric: {probe: 'harness', args: {scenario: 'rr', metric: 'distance'}}}],
    };
    t.same(validateGoalpostsImmutable(quest, declared), [],
      'a sharper gradient with identical probe/args and sealed doneWhen is allowed');
    t.end();
  });

  t.test('goalposts: a refined gradient does NOT excuse a moved done_when', (t) => {
    const declared = {sealed: {
      doneWhen: {probe: 'harness', args: {scenario: 'rr', metric: 'priority', consecutive: 3}},
      frontierMetrics: [{probe: 'harness', args: {scenario: 'rr', metric: 'priority'}}],
    }};
    const quest = {
      doneWhen: {probe: 'harness', args: {scenario: 'rr', metric: 'priority', consecutive: 1}},
      frontiers: [{metric: {probe: 'harness', args: {scenario: 'rr', metric: 'distance'}}}],
    };
    t.ok(validateGoalpostsImmutable(quest, declared)
      .some((e) => e.includes('doneWhen changed')),
    'closure is still sealed even when the gradient is refined');
    t.end();
  });

  t.test('goalposts: changing a non-metric arg is still a violation', (t) => {
    const declared = {sealed: {
      doneWhen: {probe: 'harness', args: {scenario: 'rr', metric: 'priority'}},
      frontierMetrics: [{probe: 'harness', args: {scenario: 'rr', metric: 'priority'}}],
    }};
    const quest = {
      doneWhen: {probe: 'harness', args: {scenario: 'rr', metric: 'priority'}},
      frontiers: [{metric: {probe: 'harness', args: {scenario: 'other', metric: 'distance'}}}],
    };
    t.ok(validateGoalpostsImmutable(quest, declared)
      .some((e) => e.includes('frontier metric definitions changed')),
    'a different scenario is goalpost movement, not a gradient refinement');
    t.end();
  });
});
