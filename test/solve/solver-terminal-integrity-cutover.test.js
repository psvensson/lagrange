import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {auditQuest} from '../../scripts/solve/audit.js';
import {
  EVENT_ATTEMPT,
  EVENT_QUEST,
  EVENT_SOLVED,
  EVENT_VIOLATION,
  STATUS_SOLVED,
} from '../../scripts/solve/constants.js';
import {
  finalizeAttempt,
  makeRunContext,
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
