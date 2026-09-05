import tap from 'tap';
import fs from 'node:fs';

import {runStep, stepAbort} from '../../scripts/solve/step.js';
import {
  FRONTIER,
  commitStep,
  makeDiff,
  refreshFlatEvidence,
  setup as setupQuest,
} from './step-theory-fixture.js';
import {
  createRunAuthorizations,
  latestAttemptAdmissionWasOverridden,
} from '../../scripts/solve/gate.js';
import {appendEvent, appendFinding, readLog}
  from '../../scripts/solve/store.js';
import {
  CONTINUATION_BLOCKED_REJECTION_ESCALATION,
  CONTINUATION_BLOCKED_THEORY,
} from '../../scripts/solve/continuation.js';
import {EVENT_ATTEMPT, EVENT_GATE_DECISION, EVENT_GUARD_OVERRIDE}
  from '../../scripts/solve/constants.js';

// Witness for the solver-streamlining P7a item, driven through the REAL
// supervised step: one recorded override authorizes one logical run and is
// charged only when that run records its attempt. In v3 an escalation
// override was consumed by the commit-phase advisory and the SAME run was
// then blocked by the theory gate, so the operator learned the second block
// one run later and had to record the override again. Here the begin+commit
// pair shares one run map, every commit gate is reported in one pass, an
// aborted run charges nothing, and the recording run charges each bypass
// exactly once, before its attempt event.

const OVERRIDE_REASON_THEORY = 'a corrective replacement needs no new theory';
const OVERRIDE_REASON_ESCALATION = 'three narrowing rounds, one more';
const THEORY_PROBLEM = /frontier theory required/u;
const ESCALATION_PROBLEM = /candidate rejection escalation/u;
const ONE_PASS_HEADER = /commit blocked by 1 gate\(s\)/u;
const OVERRIDE_COMMAND = new RegExp(
  `override --id demo --frontier ${FRONTIER} --code ` +
  `${CONTINUATION_BLOCKED_REJECTION_ESCALATION} --reason`, 'u');

// The escalation-armed rig: two flat steps climb to the widen-scope rung
// (a selected frontier theory is required at both begin and commit) and
// three distinct rejected candidates arm the escalation gate.
function setup() {
  const {root, quest} = setupQuest();
  commitStep(root, quest, 'flat');
  commitStep(root, quest, 'flat2');
  for (const hex of ['a', 'b', 'c']) {
    appendFinding(root, quest.id, {
      frontier: FRONTIER,
      kind: 'verifier-rejection',
      claim: `independent verification rejected candidate ${hex} with detail`,
      evidence: 'subagent:verify-override-run',
      verification: {
        schemaVersion: 2,
        scope: 'candidate',
        fingerprint: `sha256:${hex.repeat(64)}`,
        verdict: 'rejected',
      },
    });
  }
  return {root, quest};
}

function recordOverride(root, quest, code, reason) {
  appendEvent(root, quest.id, {
    type: EVENT_GUARD_OVERRIDE,
    frontier: FRONTIER,
    code,
    problem: null,
    reason,
  });
}

function consumingRecords(root, quest, code) {
  return readLog(root, quest.id).filter((event) =>
    event.type === EVENT_GATE_DECISION && event.override &&
    event.code === code);
}

// The begin+commit pair as one operator action: one shared run map.
function runPair(root, quest, name, runAuthorizations) {
  const begin = runStep(root, quest, {runAuthorizations});
  refreshFlatEvidence(quest, name);
  return {begin, commit: () => runStep(root, quest, {
    changeRef: makeDiff(root, name),
    summary: name,
    runAuthorizations,
  })};
}

tap.test('override consumption is transactional with the run', async (t) => {
  t.test('a run blocked by a later gate after a bypass leaves the override ' +
    'active and reports the block with its override command', (t) => {
    const {root, quest} = setup();
    recordOverride(root, quest, CONTINUATION_BLOCKED_THEORY,
      OVERRIDE_REASON_THEORY);
    const pair = runPair(root, quest, 'first', createRunAuthorizations());
    t.equal(pair.begin.terminal, null,
      'the begin-phase theory gate bypasses under the override');
    let refusal = null;
    try {
      pair.commit();
    } catch (error) {
      refusal = error;
    }
    t.ok(refusal, 'the commit stops at the escalation gate');
    t.match(refusal.message, ESCALATION_PROBLEM);
    t.match(refusal.message, ONE_PASS_HEADER, `one-pass report: ${refusal.message}`);
    t.match(refusal.message, OVERRIDE_COMMAND,
      'the report names the exact override command');
    t.notMatch(refusal.message, THEORY_PROBLEM,
      'the bypassed theory gate is not reported as blocked');
    t.equal(consumingRecords(root, quest, CONTINUATION_BLOCKED_THEORY).length,
      0, 'the aborted run charged the theory override nothing');
    t.equal(readLog(root, quest.id).filter((event) =>
      event.type === EVENT_ATTEMPT).length, 2, 'no attempt was recorded');

    // The corrected run: the escalation override is added; the theory
    // override is still active, so the pair records without re-recording it.
    recordOverride(root, quest, CONTINUATION_BLOCKED_REJECTION_ESCALATION,
      OVERRIDE_REASON_ESCALATION);
    stepAbort(root, quest.id);
    const corrected = runPair(root, quest, 'second',
      createRunAuthorizations());
    t.equal(corrected.begin.terminal, null);
    const committed = corrected.commit();
    t.equal(committed.terminal, undefined, 'the attempt is recorded');
    const log = readLog(root, quest.id);
    t.equal(log.filter((event) => event.type === EVENT_ATTEMPT).length, 3);
    t.equal(consumingRecords(root, quest, CONTINUATION_BLOCKED_THEORY).length,
      1, 'the theory override is charged exactly once');
    t.equal(consumingRecords(root, quest,
      CONTINUATION_BLOCKED_REJECTION_ESCALATION).length, 1,
    'the escalation override is charged exactly once');
    const attemptIndex = log.findLastIndex((event) =>
      event.type === EVENT_ATTEMPT);
    const consumingIndices = log.map((event, index) =>
      event.type === EVENT_GATE_DECISION && event.override ? index : -1)
      .filter((index) => index >= 0);
    t.ok(consumingIndices.every((index) => index < attemptIndex),
      'every consuming record precedes the attempt it authorized');
    t.ok(latestAttemptAdmissionWasOverridden(log,
      CONTINUATION_BLOCKED_REJECTION_ESCALATION,
      consumingRecords(root, quest,
        CONTINUATION_BLOCKED_REJECTION_ESCALATION)[0].problems[0]),
    'terminal owners still see the admission as overridden');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('separate begin and commit runs without a shared map keep the ' +
    'per-run charge for the begin phase', (t) => {
    const {root, quest} = setup();
    recordOverride(root, quest, CONTINUATION_BLOCKED_THEORY,
      OVERRIDE_REASON_THEORY);
    const begin = runStep(root, quest);
    t.equal(begin.terminal, null, 'the standalone begin bypasses');
    t.equal(consumingRecords(root, quest, CONTINUATION_BLOCKED_THEORY).length,
      1, 'a legacy standalone begin charges at once');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
