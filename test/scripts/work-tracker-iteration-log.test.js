import tap from 'tap';

import {
  validateIterationLog,
} from '../../scripts/work-tracker.js';

function entry(iteration, residualCount, extra = {}) {
  return {
    iteration,
    hypothesis: `h${iteration}`,
    observation: `o${iteration}`,
    residualCount,
    ...extra,
  };
}

const FILE = 'work/packages/active-gap.md';

tap.test('in-package iteration log (R20)', async (t) => {
  t.test('absent iterationLog is a no-op', (t) => {
    t.equal(validateIterationLog({owner: 'a'}, FILE, {}).length, 0);
    t.end();
  });

  t.test('well-formed log with matching headline residual passes', (t) => {
    const errors = validateIterationLog(
      {
        iterationLog: [entry(1, 5), entry(2, 3)],
        representativeResidual: {residualCount: 3},
      },
      FILE,
      {phase: 'pre-impl'},
    );
    t.equal(errors.length, 0, 'valid log passes');
    t.end();
  });

  t.test('non-array iterationLog is rejected', (t) => {
    const errors = validateIterationLog(
      {iterationLog: {iteration: 1}}, FILE, {},
    );
    t.ok(errors.some((e) => e.includes('non-empty array')));
    t.end();
  });

  t.test('empty array is rejected', (t) => {
    const errors = validateIterationLog({iterationLog: []}, FILE, {});
    t.ok(errors.some((e) => e.includes('non-empty array')));
    t.end();
  });

  t.test('missing hypothesis/observation is rejected', (t) => {
    const errors = validateIterationLog(
      {iterationLog: [{iteration: 1, residualCount: 1}]}, FILE, {},
    );
    t.ok(errors.some((e) => e.includes('non-empty hypothesis')));
    t.ok(errors.some((e) => e.includes('non-empty observation')));
    t.end();
  });

  t.test('non-contiguous iteration numbering is rejected', (t) => {
    const errors = validateIterationLog(
      {iterationLog: [entry(1, 5), entry(3, 3)]}, FILE, {},
    );
    t.ok(errors.some((e) => e.includes('iteration=2')));
    t.end();
  });

  t.test('unknown outcome enum is rejected', (t) => {
    const errors = validateIterationLog(
      {iterationLog: [entry(1, 5, {outcome: 'sideways'})]}, FILE, {},
    );
    t.ok(errors.some((e) => e.includes('is not one of')));
    t.end();
  });

  t.test('headline residual mismatch is rejected', (t) => {
    const errors = validateIterationLog(
      {
        iterationLog: [entry(1, 5), entry(2, 3)],
        representativeResidual: {residualCount: 9},
      },
      FILE,
      {phase: 'pre-impl'},
    );
    t.ok(errors.some((e) => e.includes('must equal')));
    t.end();
  });

  t.test('stall bound blocks flat internal loop without escalation', (t) => {
    const errors = validateIterationLog(
      {
        iterationLog: [entry(1, 2), entry(2, 2), entry(3, 2), entry(4, 2)],
      },
      FILE,
      {phase: 'pre-impl'},
    );
    t.ok(errors.some((e) => e.includes('iteration-log-exhaustion')));
    t.end();
  });

  t.test('stall bound is satisfied by a final escalate outcome', (t) => {
    const errors = validateIterationLog(
      {
        iterationLog: [
          entry(1, 2), entry(2, 2), entry(3, 2),
          entry(4, 2, {outcome: 'escalate'}),
        ],
      },
      FILE,
      {phase: 'pre-impl'},
    );
    t.equal(errors.length, 0, 'recorded escalation clears the stall bound');
    t.end();
  });

  t.test('stall bound is satisfied by net residual reduction', (t) => {
    const errors = validateIterationLog(
      {iterationLog: [entry(1, 5), entry(2, 4), entry(3, 3), entry(4, 2)]},
      FILE,
      {phase: 'pre-impl'},
    );
    t.equal(errors.length, 0, 'shrinking residual clears the stall bound');
    t.end();
  });

  t.test('stall bound does not run outside pre-impl/closure', (t) => {
    const errors = validateIterationLog(
      {iterationLog: [entry(1, 2), entry(2, 2), entry(3, 2), entry(4, 2)]},
      FILE,
      {phase: 'entry'},
    );
    t.equal(errors.length, 0, 'entry phase skips the stall bound');
    t.end();
  });
});
