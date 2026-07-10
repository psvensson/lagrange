import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {auditQuest} from '../../scripts/solve/audit.js';
import {
  EVENT_ATTEMPT,
  EVENT_PARK,
  EVENT_QUEST,
  EVENT_QUEST_UPGRADED,
  EVENT_SOLVED,
  EVENT_VIOLATION,
  OUTCOME_BLOCKED,
  STATUS_EXHAUSTED,
  STATUS_SOLVED,
} from '../../scripts/solve/constants.js';
import {inspectChangeArtifact} from '../../scripts/solve/change-artifact.js';
import {
  finalizeAttempt,
  makeRunContext,
  recordQuestSolvedIfDone,
  runLoop,
} from '../../scripts/solve/loop.js';
import {buildNextLines} from '../../scripts/solve/next.js';
import {registerProbe} from '../../scripts/solve/probe.js';
import {buildReport} from '../../scripts/solve/report.js';
import {
  appendEvent,
  projectState,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';

const PROBE_NAME = 'terminal-integrity-cutover-guard';
const MISSING_EVIDENCE_PROBE_NAME =
  'terminal-integrity-cutover-missing-evidence-guard';

registerProbe(PROBE_NAME, {
  name: PROBE_NAME,
  measure(args) {
    const data = JSON.parse(fs.readFileSync(args.file, 'utf8'));
    return {
      metric: data.metric,
      done: data.done === true,
      invalidSample: data.invalidSample === true,
      evidence: args.file,
    };
  },
});

registerProbe(MISSING_EVIDENCE_PROBE_NAME, {
  name: MISSING_EVIDENCE_PROBE_NAME,
  measure(args) {
    return {
      metric: 0,
      done: true,
      evidence: args.file,
    };
  },
});

function makeDiff(root, questId, name, target = 'src/demo.js') {
  const relative = path.join('solve', 'changes', questId, `${name}.diff`);
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, [
    `diff --git a/${target} b/${target}`,
    `--- a/${target}`,
    `+++ b/${target}`,
    '@@ -1 +1 @@',
    '-before',
    `+${name}`,
    '',
  ].join('\n'));
  return `diff:${relative}`;
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solver-terminal-integrity-'));
  const evidence = path.join(root, 'evidence.json');
  fs.writeFileSync(evidence, JSON.stringify({metric: 0, done: true}));
  const metric = {probe: PROBE_NAME, args: {file: evidence}};
  const quest = {
    id: 'terminal-integrity-guard',
    statement: 'terminal state requires accepted evidence',
    class: 'process',
    priority: 1,
    links: {},
    doneWhen: metric,
    frontiers: [{id: 'main', priority: 1, metric}],
  };
  saveQuest(root, quest);
  return {root, evidence, quest};
}

tap.test('rejected evidence cannot become an attempt or terminal transition', (t) => {
  const {root, evidence, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const state = projectState(quest, []);
  const pick = {def: quest.frontiers[0], state: state.frontiers[0]};
  const ctx = makeRunContext({
    autoCommit: false,
    changeRefResolves: () => true,
    inspectChangeRef: () => ({valid: true, problems: []}),
  });
  ctx.probeCtx = {root};

  finalizeAttempt(
    root,
    quest,
    ctx,
    pick,
    {metric: null, evidence},
    {changeRef: 'diff:solve/changes/terminal-integrity-guard/change.diff'},
  );

  const log = readLog(root, quest.id);
  t.equal(
    log.filter((event) => event.type === EVENT_VIOLATION).length,
    1,
    'W1-GUARD-VIOLATION-RECORDED',
  );
  t.equal(
    log.filter((event) => event.type === EVENT_ATTEMPT).length,
    0,
    'W1-GUARD-REJECTED-NOT-ATTEMPT',
  );
  t.equal(
    log.filter((event) => event.type === EVENT_SOLVED).length,
    0,
    'W1-GUARD-REJECTED-NOT-SOLVED',
  );
  t.end();
});

tap.test('audit names an unresolved integrity violation', (t) => {
  const {root, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  appendEvent(root, quest.id, {
    type: EVENT_VIOLATION,
    eventSchemaVersion: 2,
    frontier: 'main',
    violationId: 'terminal-integrity-guard:main:metric-before-null',
    violations: ['metricBefore must be a finite number'],
  });
  appendEvent(root, quest.id, {
    type: EVENT_QUEST,
    status: STATUS_SOLVED,
  });

  const audit = auditQuest(root, quest);
  t.ok(
    audit.problems.some((item) =>
      /unresolved integrity violation/iu.test(item.message)),
    'W1-GUARD-AUDIT-UNRESOLVED-VIOLATION',
  );
  t.end();
});

tap.test('terminal report omits active-only blocker and continuation sections', (t) => {
  const {root, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  appendEvent(root, quest.id, {
    type: EVENT_QUEST,
    status: STATUS_SOLVED,
    evidence: 'evidence.json',
  });
  const log = readLog(root, quest.id);
  const report = buildReport(quest, log, projectState(quest, log), root);
  t.notMatch(
    report,
    /## Current Blocker|## Continuation/u,
    'W1-GUARD-TERMINAL-PROJECTION',
  );
  t.end();
});

tap.test('terminal next projection omits an active blocker card', (t) => {
  const {root, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  appendEvent(root, quest.id, {
    type: EVENT_QUEST,
    status: STATUS_SOLVED,
    evidence: 'evidence.json',
  });
  const lines = buildNextLines(root, quest.id);
  t.notOk(
    lines.some((line) => line.startsWith('blocker:')),
    'W1-GUARD-TERMINAL-NEXT-PROJECTION',
  );
  t.end();
});

tap.test('honest invalid samples use a dedicated non-measurement event', (t) => {
  const {root, evidence, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(evidence, JSON.stringify({
    metric: null,
    done: false,
    invalidSample: true,
  }));
  const state = projectState(quest, []);
  const pick = {def: quest.frontiers[0], state: state.frontiers[0]};
  const ctx = makeRunContext({
    autoCommit: false,
    changeRefResolves: () => true,
    inspectChangeRef: () => ({valid: true, problems: []}),
  });
  ctx.probeCtx = {root};
  finalizeAttempt(
    root,
    quest,
    ctx,
    pick,
    {metric: 5, evidence},
    {changeRef: 'diff:solve/changes/terminal-integrity-guard/change.diff'},
  );
  const log = readLog(root, quest.id);
  t.equal(
    log.filter((event) => event.type === 'non-measurement').length,
    1,
    'W1-GUARD-NON-MEASUREMENT-EVENT',
  );
  t.equal(
    log.filter((event) => event.type === EVENT_ATTEMPT).length,
    0,
    'W1-GUARD-NON-MEASUREMENT-NOT-ATTEMPT',
  );
  t.end();
});

tap.test('operator-authored resolution cannot launder a violation', (t) => {
  const {root, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const violationId = 'terminal-integrity-guard:main:identity-mismatch';
  appendEvent(root, quest.id, {
    type: EVENT_VIOLATION,
    eventSchemaVersion: 2,
    frontier: 'main',
    violationId,
    violations: ['evidence identity mismatch'],
  });
  appendEvent(root, quest.id, {
    type: 'violation-resolved',
    frontier: 'main',
    violationId,
    reason: 'operator says fixed',
  });
  const audit = auditQuest(root, quest);
  t.ok(
    audit.problems.some((item) =>
      item.message.includes(violationId) &&
      /unresolved integrity violation/iu.test(item.message)),
    'W1-GUARD-OPERATOR-CANNOT-RESOLVE-VIOLATION',
  );
  t.end();
});

tap.test('legacy accepted-after-violation history is explicitly unverifiable', (t) => {
  const {root, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  appendEvent(root, quest.id, {
    type: EVENT_VIOLATION,
    frontier: 'main',
    violations: ['legacy metric identity failure'],
  });
  appendEvent(root, quest.id, {
    type: EVENT_ATTEMPT,
    frontier: 'main',
    metricBefore: 1,
    metricAfter: 0,
    evidence: 'legacy-evidence.json',
    changeRef: null,
  });
  const audit = auditQuest(root, quest);
  t.ok(
    audit.problems.some((item) =>
      /legacy_integrity_unverifiable/iu.test(item.message)),
    'W1-GUARD-LEGACY-HISTORY-UNVERIFIABLE',
  );
  t.end();
});

tap.test('manual-step terminal projection requires an accepted attempt', (t) => {
  const {root, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const ctx = makeRunContext();
  ctx.probeCtx = {root};
  const result = recordQuestSolvedIfDone(root, quest, ctx, {accepted: false});
  t.equal(result.done, false, 'W1-GUARD-MANUAL-STEP-REJECTED-NOT-TERMINAL');
  t.equal(
    readLog(root, quest.id).filter((event) => event.type === EVENT_QUEST).length,
    0,
    'W1-GUARD-MANUAL-STEP-NO-QUEST-EVENT',
  );
  t.end();
});

tap.test('done=true cannot override a non-measuring terminal sample', (t) => {
  const {root, evidence, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(evidence, JSON.stringify({
    metric: null,
    done: true,
    invalidSample: true,
  }));
  const ctx = makeRunContext();
  ctx.probeCtx = {root};
  const result = recordQuestSolvedIfDone(root, quest, ctx, {accepted: true});
  t.equal(result.done, false,
    'W1-GUARD-NON-MEASURING-DONE-NOT-TERMINAL');
  t.end();
});

tap.test('fresh accepted replacement evidence resolves its bound violation', (t) => {
  const {root, evidence, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  let state = projectState(quest, []);
  let pick = {def: quest.frontiers[0], state: state.frontiers[0]};
  const ctx = makeRunContext({
    autoCommit: false,
    changeRefResolves: () => true,
    inspectChangeRef: () => ({valid: true, problems: []}),
  });
  ctx.probeCtx = {root};
  const changeRef = makeDiff(root, quest.id, 'fresh-replacement');
  finalizeAttempt(
    root,
    quest,
    ctx,
    pick,
    {metric: null, evidence},
    {changeRef},
  );
  const violation = readLog(root, quest.id)
    .find((event) => event.type === EVENT_VIOLATION);

  fs.writeFileSync(evidence, JSON.stringify({metric: 0, done: true, run: 2}));
  state = projectState(quest, readLog(root, quest.id));
  pick = {def: quest.frontiers[0], state: state.frontiers[0]};
  finalizeAttempt(
    root,
    quest,
    ctx,
    pick,
    {metric: 1, evidence},
    {changeRef},
  );
  const accepted = readLog(root, quest.id)
    .find((event) => event.type === EVENT_ATTEMPT);
  t.same(
    accepted.replacesViolationIds,
    [violation.violationId],
    'W1-GUARD-FRESH-ACCEPTED-SAMPLE-RESOLVES-BOUND-VIOLATION',
  );
  t.notOk(
    auditQuest(root, quest).problems.some((item) =>
      item.message.includes(violation.violationId)),
    'W1-GUARD-RESOLVED-VIOLATION-CLEARS-AUDIT',
  );
  t.end();
});

tap.test('an older unresolved integrity violation blocks attempt-level SOLVED', (t) => {
  const {root, evidence, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  appendEvent(root, quest.id, {
    type: EVENT_VIOLATION,
    eventSchemaVersion: 2,
    frontier: 'main',
    violationId: 'terminal-integrity-guard:goalposts:sealed-drift',
    resolutionPolicy: 'new-quest-only',
    violations: ['sealed goalposts drifted'],
  });
  const state = projectState(quest, readLog(root, quest.id));
  const pick = {def: quest.frontiers[0], state: state.frontiers[0]};
  const changeRef = makeDiff(root, quest.id, 'historical-violation');
  const ctx = makeRunContext({
    autoCommit: false,
    inspectChangeRef: (ref) => inspectChangeArtifact(root, quest, ref),
  });
  ctx.probeCtx = {root};

  finalizeAttempt(
    root,
    quest,
    ctx,
    pick,
    {metric: 1, evidence},
    {changeRef},
  );

  const log = readLog(root, quest.id);
  t.equal(
    log.filter((event) => event.type === EVENT_ATTEMPT).length,
    1,
    'W1-GUARD-HISTORICAL-VIOLATION-ATTEMPT-RECORDED',
  );
  t.equal(
    log.filter((event) => event.type === EVENT_SOLVED).length,
    0,
    'W1-GUARD-HISTORICAL-VIOLATION-NOT-SOLVED',
  );
  t.end();
});

tap.test('missing evidence identity cannot close a quest', (t) => {
  const {root, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  quest.doneWhen = {
    probe: MISSING_EVIDENCE_PROBE_NAME,
    args: {file: path.join(root, 'missing-evidence.json')},
  };
  const ctx = makeRunContext();
  ctx.probeCtx = {root};

  const result = recordQuestSolvedIfDone(root, quest, ctx, {accepted: true});

  t.equal(result.done, false, 'W1-GUARD-MISSING-EVIDENCE-NOT-TERMINAL');
  t.equal(
    readLog(root, quest.id).filter((event) => event.type === EVENT_QUEST).length,
    0,
    'W1-GUARD-MISSING-EVIDENCE-NO-QUEST-EVENT',
  );
  t.end();
});

tap.test('strict audit upgrade cannot launder legacy integrity history', (t) => {
  const {root, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  appendEvent(root, quest.id, {
    type: EVENT_VIOLATION,
    frontier: 'main',
    violations: ['legacy evidence identity failure'],
  });
  appendEvent(root, quest.id, {
    type: EVENT_ATTEMPT,
    frontier: 'main',
    metricBefore: 1,
    metricAfter: 0,
    evidence: 'legacy-evidence.json',
    changeRef: null,
  });
  appendEvent(root, quest.id, {
    type: EVENT_QUEST_UPGRADED,
    strictAudit: true,
  });

  const audit = auditQuest(root, quest);
  t.ok(
    audit.problems.some((item) =>
      /legacy_integrity_unverifiable/iu.test(item.message)),
    'W1-GUARD-STRICT-UPGRADE-CANNOT-LAUNDER-LEGACY-INTEGRITY',
  );
  t.end();
});

tap.test('audit detects replacement of a sealed accepted changeRef artifact', (t) => {
  const {root, evidence, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const state = projectState(quest, []);
  const pick = {def: quest.frontiers[0], state: state.frontiers[0]};
  const changeRef = makeDiff(root, quest.id, 'sealed-change');
  const ctx = makeRunContext({
    autoCommit: false,
    inspectChangeRef: (ref) => inspectChangeArtifact(root, quest, ref),
  });
  ctx.probeCtx = {root};
  finalizeAttempt(
    root,
    quest,
    ctx,
    pick,
    {metric: 1, evidence},
    {changeRef},
  );
  const accepted = readLog(root, quest.id)
    .find((event) => event.type === EVENT_ATTEMPT);
  t.equal(accepted.changeRefIdentity.exists, true,
    'W1-GUARD-ACCEPTED-CHANGEREF-IDENTITY-SEALED');

  makeDiff(root, quest.id, 'sealed-change', 'src/replacement.js');
  const audit = auditQuest(root, quest);
  t.ok(
    audit.problems.some((item) =>
      /accepted changeRef artifact identity changed/iu.test(item.message)),
    'W1-GUARD-CHANGEREF-REPLACEMENT-DETECTED',
  );
  const closureCtx = makeRunContext();
  closureCtx.probeCtx = {root};
  const closure = recordQuestSolvedIfDone(
    root,
    quest,
    closureCtx,
    {accepted: true},
  );
  t.equal(
    closure.done,
    false,
    'W1-GUARD-CHANGEREF-REPLACEMENT-BLOCKS-TERMINAL',
  );
  t.equal(
    readLog(root, quest.id).filter((event) =>
      event.type === EVENT_QUEST && event.status === STATUS_SOLVED).length,
    0,
    'W1-GUARD-CHANGEREF-REPLACEMENT-NO-SOLVED-QUEST',
  );
  const loopOutcome = runLoop(root, quest, {
    autoCommit: false,
    maxCycles: 1,
  });
  t.equal(
    loopOutcome.outcome,
    OUTCOME_BLOCKED,
    'W1-GUARD-CHANGEREF-REPLACEMENT-BLOCKS-RUN-LOOP',
  );
  fs.writeFileSync(evidence, JSON.stringify({metric: 1, done: false}));
  const exhaustionOutcome = runLoop(root, quest, {
    autoCommit: false,
    maxCycles: 1,
  });
  t.equal(
    exhaustionOutcome.outcome,
    OUTCOME_BLOCKED,
    'W1-GUARD-CHANGEREF-REPLACEMENT-BLOCKS-EXHAUSTED',
  );
  t.equal(
    readLog(root, quest.id).filter((event) =>
      event.type === EVENT_QUEST && event.status === STATUS_EXHAUSTED).length,
    0,
    'W1-GUARD-CHANGEREF-REPLACEMENT-NO-EXHAUSTED-QUEST',
  );
  t.end();
});

tap.test('malformed v2 violations are unresolved corruption', (t) => {
  const {root, evidence, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  appendEvent(root, quest.id, {
    type: EVENT_VIOLATION,
    eventSchemaVersion: 2,
    scope: 'goalposts',
    resolutionPolicy: 'new-quest-only',
    violations: ['sealed goalposts drifted'],
  });
  const ctx = makeRunContext();
  ctx.probeCtx = {root};

  const closure = recordQuestSolvedIfDone(root, quest, ctx, {accepted: true});
  const audit = auditQuest(root, quest);

  t.equal(closure.done, false,
    'W1-GUARD-MALFORMED-V2-VIOLATION-BLOCKS-TERMINAL');
  t.ok(
    audit.problems.some((item) =>
      /unresolved integrity violation.*missing violationId/iu.test(item.message)),
    'W1-GUARD-MALFORMED-V2-VIOLATION-FAILS-AUDIT',
  );
  const loopOutcome = runLoop(root, quest, {
    autoCommit: false,
    maxCycles: 1,
  });
  t.equal(
    loopOutcome.outcome,
    OUTCOME_BLOCKED,
    'W1-GUARD-MALFORMED-V2-VIOLATION-BLOCKS-RUN-LOOP',
  );
  fs.writeFileSync(evidence, JSON.stringify({metric: 1, done: false}));
  appendEvent(root, quest.id, {
    type: EVENT_PARK,
    frontier: 'main',
    kind: 'exhausted',
    reason: 'exhausted',
    finalMetric: 1,
  });
  const exhaustionOutcome = runLoop(root, quest, {
    autoCommit: false,
    maxCycles: 1,
  });
  t.equal(
    exhaustionOutcome.outcome,
    OUTCOME_BLOCKED,
    'W1-GUARD-MALFORMED-V2-VIOLATION-BLOCKS-EXHAUSTED',
  );
  t.equal(
    readLog(root, quest.id).filter((event) =>
      event.type === EVENT_QUEST && event.status === STATUS_EXHAUSTED).length,
    0,
    'W1-GUARD-MALFORMED-V2-VIOLATION-NO-EXHAUSTED-QUEST',
  );
  t.end();
});

tap.test('attempt acceptance requires a sealable changeRef content identity', (t) => {
  const {root, evidence, quest} = setup();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const state = projectState(quest, []);
  const pick = {def: quest.frontiers[0], state: state.frontiers[0]};
  const ctx = makeRunContext({
    autoCommit: false,
    inspectChangeRef: () => ({valid: true, problems: []}),
  });
  ctx.probeCtx = {root};

  const result = finalizeAttempt(
    root,
    quest,
    ctx,
    pick,
    {metric: 1, evidence},
    {changeRef: 'diff:solve/changes/terminal-integrity-guard/vanished.diff'},
  );
  const log = readLog(root, quest.id);

  t.equal(result.accepted, false,
    'W1-GUARD-MISSING-CHANGEREF-IDENTITY-REJECTED');
  t.equal(
    log.filter((event) => event.type === EVENT_ATTEMPT).length,
    0,
    'W1-GUARD-MISSING-CHANGEREF-IDENTITY-NOT-ATTEMPT',
  );
  t.equal(
    log.filter((event) => event.type === EVENT_SOLVED).length,
    0,
    'W1-GUARD-MISSING-CHANGEREF-IDENTITY-NOT-SOLVED',
  );
  t.end();
});
