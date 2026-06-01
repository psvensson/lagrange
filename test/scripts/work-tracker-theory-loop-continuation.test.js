import {test} from '../../src/test-helpers/tap.js';
import {
  validateTheoryLoopContinuation,
  validateSprintStrategyBrief,
} from '../../scripts/work-tracker.js';

const SPRINT_PATH = 'work/sprints/active-theory-loop.md';
const DONE_SPRINT_PATH = 'work/sprints/done-theory-loop.md';

function strategyBrief(redirectLine) {
  return [
    '## Sprint Strategy Brief',
    '',
    '- Goal state: rolling-restart harness exits 0 with representative green.',
    '- Current causal thesis: active-gate snapshot coverage saturates.',
    '- Competing hypotheses: H1 scheduling, H2 coupled invariant, H3 readiness.',
    '- Confidence and evidence: high; frontier-history reports contract_gap.',
    '- Expected green path: rederive then bounded architecture experiment.',
    '- Wrong direction signals: closing on architecture-gap or migration.',
    '- Next best package: fresh route evidence or architecture experiment.',
    redirectLine,
  ];
}

function theoryLoopSprint(extraSections = []) {
  return [
    '# Sprint',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Option Set',
    '',
    '1. H1',
    '',
    '## Discriminator First',
    '',
    '- run the discriminator',
    '',
    '## Real Package Rule',
    '',
    '- source packages only',
    ...(extraSections.length > 0 ? ['', ...extraSections] : []),
  ].join('\n');
}

function theoryLoopShapeSprint(extraSections = []) {
  return [
    '# Sprint',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Loop Shape',
    '',
    '- System theory: continue until representative green.',
    '- Promotion rule: create one executable package after each discriminator.',
    ...(extraSections.length > 0 ? ['', ...extraSections] : []),
  ].join('\n');
}

function terminationSection(lines) {
  return ['## Theory Loop Termination', '', ...lines];
}

test('non-theory-loop sprints are exempt from the continuation invariant', (t) => {
  const plainSprint = [
    '# Sprint',
    '',
    '## Strategy',
    '',
    '- Loop status: terminated',
    '- Termination reason: nonsense-reason',
  ].join('\n');
  t.same(
    validateTheoryLoopContinuation(plainSprint, SPRINT_PATH, {status: 'active'}),
    [],
  );
  t.end();
});

test('theory-loop sprint without a termination section is exempt (additive)', (t) => {
  t.same(
    validateTheoryLoopContinuation(theoryLoopSprint(), SPRINT_PATH, {
      status: 'active',
    }),
    [],
  );
  t.end();
});

test('a recorded stop must use a closed-enum termination reason', (t) => {
  const sprint = theoryLoopSprint(terminationSection([
    '- Loop status: terminated',
    '- Termination reason: loop-exhausted',
    '- Evidence: npm run work:frontier-history',
  ]));
  t.match(
    validateTheoryLoopContinuation(sprint, SPRINT_PATH, {status: 'active'})
      .join('\n'),
    /theory-loop-termination-reason-invalid/u,
  );
  t.end();
});

test('a recorded stop requires concrete evidence', (t) => {
  const sprint = theoryLoopSprint(terminationSection([
    '- Loop status: terminated',
    '- Termination reason: blocked-external-dependency',
    '- Evidence: TBD',
  ]));
  t.match(
    validateTheoryLoopContinuation(sprint, SPRINT_PATH, {status: 'active'})
      .join('\n'),
    /requires a concrete Evidence/u,
  );
  t.end();
});

test('blocked-frozen-decision requires a human override reference', (t) => {
  const sprint = theoryLoopSprint(terminationSection([
    '- Loop status: terminated',
    '- Termination reason: blocked-frozen-decision',
    '- Evidence: frozen architecture route ADR-12',
  ]));
  t.match(
    validateTheoryLoopContinuation(sprint, SPRINT_PATH, {status: 'active'})
      .join('\n'),
    /requires a concrete Human override ref/u,
  );
  t.end();
});

test('a valid blocked-frozen-decision handoff passes on an active sprint', (t) => {
  const sprint = theoryLoopSprint(terminationSection([
    '- Loop status: terminated',
    '- Termination reason: blocked-frozen-decision',
    '- Evidence: frozen architecture route ADR-12',
    '- Human override ref: user override 2026-05-29 thread #42',
  ]));
  t.same(
    validateTheoryLoopContinuation(sprint, SPRINT_PATH, {status: 'active'}),
    [],
  );
  t.end();
});

test('a valid blocked-external-dependency handoff passes on an active sprint', (t) => {
  const sprint = theoryLoopSprint(terminationSection([
    '- Loop status: terminated',
    '- Termination reason: blocked-external-dependency',
    '- Evidence: upstream release lagrange-core 2.1 not yet published',
  ]));
  t.same(
    validateTheoryLoopContinuation(sprint, SPRINT_PATH, {status: 'active'}),
    [],
  );
  t.end();
});

test('a done theory-loop sprint may not terminate on a blocked reason', (t) => {
  const sprint = theoryLoopSprint(terminationSection([
    '- Loop status: terminated',
    '- Termination reason: blocked-external-dependency',
    '- Evidence: upstream release lagrange-core 2.1 not yet published',
  ]));
  t.match(
    validateTheoryLoopContinuation(sprint, DONE_SPRINT_PATH, {status: 'done'})
      .join('\n'),
    /theory-loop-blocked-cannot-be-done/u,
  );
  t.end();
});

test('a done theory-loop sprint may not declare loop status running', (t) => {
  const sprint = theoryLoopSprint(terminationSection([
    '- Loop status: running',
  ]));
  t.match(
    validateTheoryLoopContinuation(sprint, DONE_SPRINT_PATH, {status: 'done'})
      .join('\n'),
    /theory-loop-halted-without-termination/u,
  );
  t.end();
});

test('a done theory-loop sprint terminating as success-condition-met passes', (t) => {
  const sprint = theoryLoopSprint(terminationSection([
    '- Loop status: terminated',
    '- Termination reason: success-condition-met',
    '- Evidence: npm run work:scenario-route -- test-output/reports/green.report.json',
  ]));
  t.same(
    validateTheoryLoopContinuation(sprint, DONE_SPRINT_PATH, {status: 'done'}),
    [],
  );
  t.end();
});

test('strategy brief redirect rule accepts the legacy stop-or-escalate label', (t) => {
  const content = strategyBrief(
    '- Stop or escalate rule: on same-frontier unchanged evidence redirect to ' +
      'a bounded architecture experiment and open the successor package.',
  ).join('\n');
  t.same(validateSprintStrategyBrief(content, SPRINT_PATH), []);
  t.end();
});

test('strategy brief redirect rule accepts the new redirect-rule label', (t) => {
  const content = strategyBrief(
    '- Redirect rule: on same-frontier unchanged evidence redirect to a ' +
      'bounded architecture experiment and open the successor package.',
  ).join('\n');
  t.same(validateSprintStrategyBrief(content, SPRINT_PATH), []);
  t.end();
});

test('running theory-loop sprint with a bare-halt redirect rule is rejected', (t) => {
  const sprint = theoryLoopSprint(strategyBrief(
    '- Redirect rule: on unchanged evidence end the turn and await human ' +
      'confirmation before proceeding.',
  ));
  const errors = validateTheoryLoopContinuation(sprint, SPRINT_PATH, {
    status: 'active',
  });
  t.match(errors.join('\n'), /theory-loop-redirect-rule-not-actionable/u);
  t.end();
});

test('running Theory Loop Shape sprint with a bare-halt redirect rule is rejected', (t) => {
  const sprint = theoryLoopShapeSprint(strategyBrief(
    '- Redirect rule: on unchanged evidence end the turn and await human ' +
      'confirmation before proceeding.',
  ));
  const errors = validateTheoryLoopContinuation(sprint, SPRINT_PATH, {
    status: 'active',
  });
  t.match(errors.join('\n'), /theory-loop-redirect-rule-not-actionable/u);
  t.end();
});

test('running theory-loop sprint with a non-actionable redirect rule is rejected', (t) => {
  const sprint = theoryLoopSprint(strategyBrief(
    '- Redirect rule: reflect on the evidence and reconsider the situation.',
  ));
  const errors = validateTheoryLoopContinuation(sprint, SPRINT_PATH, {
    status: 'active',
  });
  t.match(errors.join('\n'), /theory-loop-redirect-rule-not-actionable/u);
  t.end();
});

test('running theory-loop sprint with an actionable redirect rule passes', (t) => {
  const sprint = theoryLoopSprint(strategyBrief(
    '- Redirect rule: on same-frontier unchanged evidence open a bounded ' +
      'architecture experiment and run fresh route evidence.',
  ));
  t.same(
    validateTheoryLoopContinuation(sprint, SPRINT_PATH, {status: 'active'}),
    [],
  );
  t.end();
});

test('a running loop reporting termination reason none is not treated as a stop', (t) => {
  const sprint = theoryLoopSprint([
    ...terminationSection([
      '- Loop status: running',
      '- Termination reason: none',
    ]),
    ...strategyBrief(
      '- Redirect rule: on unchanged evidence open the successor package and ' +
        'run fresh route evidence.',
    ),
  ]);
  t.same(
    validateTheoryLoopContinuation(sprint, SPRINT_PATH, {status: 'active'}),
    [],
  );
  t.end();
});
