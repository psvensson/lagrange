import tap from 'tap';

import {SYSTEM_THEORY_STALL_THRESHOLD} from '../../scripts/solve/constants.js';
import {attemptIndicesUnderStandingRejection} from
  '../../scripts/solve/rejection-findings.js';
import {projectState} from '../../scripts/solve/store.js';
import {stepTheoryGateProblems} from '../../scripts/solve/theory.js';

// Witness for the solver-streamlining P8 item: the system-theory stall gate
// counts flat attempts on a frontier, but a replacement of a rejected
// candidate on an already-solved frontier moves the metric 0 -> 0 by
// construction. Attempts recorded while a candidate rejection stands are
// corrective work a verifier demanded, never a stall; ordinary flat attempts
// outside that window still count.

const FRONTIER = 'demo-main';
const OTHER_FRONTIER = 'demo-other';
const STALL_PROBLEM = /system theory required after repeated same-frontier stalls/u;
const QUEST = {
  id: 'demo',
  statement: 'Drive the oracle metric to zero.',
  priority: 1,
  doneWhen: {probe: 'oracle', args: {file: 'oracle.json'}},
  frontiers: [{id: FRONTIER, priority: 1,
    metric: {probe: 'oracle', args: {file: 'oracle.json'}}}],
};
const FINGERPRINT = `sha256:${'a'.repeat(64)}`;

function attempt(metricBefore, metricAfter, frontier = FRONTIER) {
  return {type: 'attempt', frontier, metricBefore, metricAfter,
    name: `attempt-${metricBefore}-${metricAfter}`};
}

function rejection(frontier = FRONTIER) {
  return {type: 'finding', frontier, kind: 'verifier-rejection',
    claim: 'independent landing verification rejected',
    verification: {schemaVersion: 2, scope: 'candidate',
      fingerprint: FINGERPRINT, verdict: 'rejected'}};
}

function approval(frontier = FRONTIER) {
  return {type: 'finding', frontier, kind: 'verifier-approval',
    claim: 'independent landing verification passed',
    verification: {schemaVersion: 2, scope: 'candidate',
      fingerprint: FINGERPRINT}};
}

function discharge(frontier = FRONTIER) {
  return {type: 'rejection-decomposition', frontier, remainingPaths: []};
}

function flatAttempts(count) {
  return Array.from({length: count}, () => attempt(3, 3));
}

function replacementAttempts(count) {
  return Array.from({length: count}, () => attempt(0, 0));
}

function stallProblems(log) {
  return stepTheoryGateProblems({
    log,
    state: projectState(QUEST, log),
    frontierId: FRONTIER,
    rungIndex: 1,
    theoryRef: null,
    modelRef: null,
    modelNotApplicable: null,
  }).filter((problem) => STALL_PROBLEM.test(problem));
}

tap.test('stall gate under a standing candidate rejection', async (t) => {
  t.test('ordinary flat attempts still trip the stall gate', (t) => {
    const log = flatAttempts(SYSTEM_THEORY_STALL_THRESHOLD);
    t.equal(stallProblems(log).length, 1,
      'the threshold of flat attempts without a rejection requires a theory');
    t.equal(stallProblems(log.slice(1)).length, 0,
      'one fewer flat attempt stays under the threshold');
    t.end();
  });

  t.test('replacement attempts after a rejection do not count as stalls',
    (t) => {
      const log = [
        ...flatAttempts(SYSTEM_THEORY_STALL_THRESHOLD - 1),
        rejection(),
        ...replacementAttempts(SYSTEM_THEORY_STALL_THRESHOLD),
      ];
      t.equal(stallProblems(log).length, 0,
        'corrective replacements under a standing rejection are not stalls');
      t.same([...attemptIndicesUnderStandingRejection(log, FRONTIER)],
        [SYSTEM_THEORY_STALL_THRESHOLD, SYSTEM_THEORY_STALL_THRESHOLD + 1,
          SYSTEM_THEORY_STALL_THRESHOLD + 2],
        'exactly the attempts recorded after the rejection are excluded');
      t.end();
    });

  t.test('an approval closes the rejection window and flat attempts count ' +
    'again', (t) => {
    const log = [
      ...flatAttempts(SYSTEM_THEORY_STALL_THRESHOLD - 1),
      rejection(),
      ...replacementAttempts(2),
      approval(),
      attempt(3, 3),
    ];
    t.equal(stallProblems(log).length, 1,
      'the flat attempt after the approval completes the stall count');
    t.end();
  });

  t.test('a decomposition that discharges every remaining path closes the ' +
    'window too', (t) => {
    const log = [
      ...flatAttempts(SYSTEM_THEORY_STALL_THRESHOLD - 1),
      rejection(),
      discharge(),
      attempt(3, 3),
    ];
    t.equal(stallProblems(log).length, 1);
    t.same([...attemptIndicesUnderStandingRejection(log, FRONTIER)], []);
    t.end();
  });

  t.test('another frontier\'s rejection does not shield this frontier',
    (t) => {
      const log = [
        rejection(OTHER_FRONTIER),
        ...flatAttempts(SYSTEM_THEORY_STALL_THRESHOLD),
      ];
      t.equal(stallProblems(log).length, 1,
        'only a rejection on this frontier opens the window');
      t.end();
    });
});
