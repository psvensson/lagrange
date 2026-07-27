import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {saveQuest, appendEvent, appendFinding} from '../../scripts/solve/store.js';
import {runAttemptCommand} from '../../scripts/solve/attempt.js';
import {candidateRejectionFingerprintsSinceApproval}
  from '../../scripts/solve/gate.js';

const FRONTIER = 'escalation-quest-main';

function rejection(fingerprintHex) {
  return {
    type: 'finding',
    frontier: FRONTIER,
    kind: 'verifier-rejection',
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      fingerprint: `sha256:${fingerprintHex.repeat(64)}`,
      verdict: 'rejected',
    },
  };
}

function approval(fingerprintHex) {
  return {
    type: 'finding',
    frontier: FRONTIER,
    kind: 'verifier-approval',
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      fingerprint: `sha256:${fingerprintHex.repeat(64)}`,
    },
  };
}

tap.test('the counter tracks distinct rejections and resets on approval', (t) => {
  t.equal(candidateRejectionFingerprintsSinceApproval([], FRONTIER).size, 0);
  t.equal(candidateRejectionFingerprintsSinceApproval(
    [rejection('a'), rejection('a')], FRONTIER).size, 1,
  'a re-asserted identical fingerprint is one failed round');
  t.equal(candidateRejectionFingerprintsSinceApproval(
    [rejection('a'), rejection('b')], FRONTIER).size, 2);
  t.equal(candidateRejectionFingerprintsSinceApproval(
    [rejection('a'), rejection('b'), approval('c'), rejection('d')],
    FRONTIER).size, 1,
  'a candidate approval resets the escalation window');
  t.equal(candidateRejectionFingerprintsSinceApproval(
    [{...rejection('a'), frontier: 'other-frontier'}], FRONTIER).size, 0,
  'other frontiers never count');
  t.end();
});

tap.test('a fourth-round attempt is gated toward reframing', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'escalation-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const reportDir = path.join(root, 'test-output', 'reports');
  fs.mkdirSync(reportDir, {recursive: true});
  const quest = {
    id: 'escalation-quest',
    statement: 'escalation gate fires after two failed rounds.',
    priority: 1,
    doneWhen: {
      probe: 'scenario-harness',
      args: {scenario: 'rolling-restart', consecutive: 3, metric: 'priority',
        reportDir},
    },
    frontiers: [{
      id: FRONTIER,
      priority: 1,
      metric: {probe: 'scenario-harness',
        args: {scenario: 'rolling-restart', metric: 'priority', reportDir}},
    }],
  };
  saveQuest(root, quest);
  appendEvent(root, quest.id, {
    type: 'theory-option-declared',
    theory: 't1',
    frontier: FRONTIER,
    scope: 'frontier',
    status: 'active',
    layer: 'observation',
    mechanism: 'observation_gap',
  });
  appendEvent(root, quest.id, {
    type: 'theory-selected',
    frontier: FRONTIER,
    theory: 't1',
  });
  for (const hex of ['a', 'b', 'c']) {
    appendFinding(root, quest.id, {
      frontier: FRONTIER,
      kind: 'verifier-rejection',
      claim: `independent verification rejected candidate ${hex} with detail`,
      evidence: 'subagent:verify-escalation',
      verification: {
        schemaVersion: 2,
        scope: 'candidate',
        fingerprint: `sha256:${hex.repeat(64)}`,
        verdict: 'rejected',
      },
    });
  }
  const changeDir = path.join(root, 'solve', 'changes', quest.id);
  fs.mkdirSync(changeDir, {recursive: true});
  const diffFile = path.join(changeDir, 'x.diff');
  fs.writeFileSync(diffFile, [
    'diff --git a/src/x.js b/src/x.js',
    '--- a/src/x.js',
    '+++ b/src/x.js',
    '@@ -1 +1 @@',
    '-before',
    '+after',
  ].join('\n'));
  const outcome = runAttemptCommand(root, {
    id: quest.id,
    frontier: FRONTIER,
    changeRef: `diff:${diffFile}`,
    summary: 'fourth round',
    _: ['node', '-e', 'process.exit(0)'],
  });
  t.equal(outcome.blocked, true, 'the attempt is gated');
  t.equal(outcome.disposition, 'reroute');
  t.match((outcome.problems || []).join('\n'),
    /candidate rejection escalation: 3 distinct rejected candidates/u);
  t.match(String(outcome.nextCommand), /decompose-rejection/u,
    'the gate names the decomposition and successor paths');
  t.end();
});
