import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent, readLog, projectState} from '../../scripts/solve/store.js';
import {buildReport, writeReport} from '../../scripts/solve/report.js';
import {
  EVENT_ATTEMPT,
  EVENT_SOLVED,
  EVENT_QUEST,
  EVENT_QUEST_DECLARED,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_RESULT,
  EVENT_THEORY_SELECTED,
  EVENT_EVIDENCE_INGESTED,
  STATUS_SOLVED,
} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
}

const GOAL = {
  id: 'demo',
  statement: 'Make the demo scenario pass three times running.',
  priority: 1,
  doneWhen: {probe: 'oracle', args: {file: 'x'}},
  frontiers: [{id: 'demo-main', priority: 1, metric: {probe: 'oracle', args: {file: 'x'}}}],
};

tap.test('report projection (P2)', async (t) => {
  t.test('SOLVED report names the evidence and a progress attempt', (t) => {
    const root = tmp();
    saveQuest(root, GOAL);
    appendEvent(root, GOAL.id, {
      type: EVENT_ATTEMPT, frontier: 'demo-main', rung: 'local-fix', rungIndex: 0,
      hypothesis: 'tighten guard', changeRef: 'diff:a.diff',
      metricBefore: 3, metricAfter: 1, metricDirection: 'lower-is-better',
      evidence: 'r1.json',
    });
    appendEvent(root, GOAL.id, {
      type: EVENT_SOLVED, frontier: 'demo-main', evidence: 'r3.json',
    });
    appendEvent(root, GOAL.id, {
      type: EVENT_QUEST, status: STATUS_SOLVED, evidence: 'r3.json',
    });
    const log = readLog(root, GOAL.id);
    const md = buildReport(GOAL, log, projectState(GOAL, log));
    t.match(md, /Outcome:\*\* SOLVED/, 'banner shows SOLVED');
    t.match(md, /r3\.json/, 'cites terminal evidence');
    t.match(md, /tighten guard|local-fix/, 'lists the attempt');
    t.match(md, /1 -> 1|3 -> 1/, 'shows the metric movement');
    t.match(md, /progress/, 'marks the improving attempt as progress');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('writeReport persists a file under solve/report', (t) => {
    const root = tmp();
    saveQuest(root, GOAL);
    appendEvent(root, GOAL.id, {type: EVENT_QUEST, status: STATUS_SOLVED, evidence: 'e'});
    const {file} = writeReport(root, GOAL.id);
    t.ok(fs.existsSync(file), 'report file written');
    t.match(file, /solve[/\\]report[/\\]demo\.md$/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('report includes selected theories and theory results', (t) => {
    const root = tmp();
    saveQuest(root, GOAL);
    appendEvent(root, GOAL.id, {
      type: EVENT_THEORY_OPTION_DECLARED,
      theory: 'theory-frontier',
      frontier: 'demo-main',
      scope: 'frontier',
      layer: 'observation',
      mechanism: 'observation_gap',
    });
    appendEvent(root, GOAL.id, {
      type: EVENT_THEORY_SELECTED,
      frontier: 'demo-main',
      theory: 'theory-frontier',
    });
    appendEvent(root, GOAL.id, {
      type: EVENT_ATTEMPT, frontier: 'demo-main', rung: 'widen-scope',
      rungIndex: 1, hypothesis: 'capture evidence', changeRef: 'diff:a.diff',
      metricBefore: 3, metricAfter: 3, metricDirection: 'lower-is-better',
      evidence: 'r1.json', theoryRef: 'theory-frontier',
    });
    appendEvent(root, GOAL.id, {
      type: EVENT_THEORY_RESULT,
      theory: 'theory-frontier',
      result: 'falsified',
      evidence: 'r1.json',
    });
    const log = readLog(root, GOAL.id);
    const md = buildReport(GOAL, log, projectState(GOAL, log));
    t.match(md, /## Theories/);
    t.match(md, /theory-frontier/);
    t.match(md, /demo-main\*\*: theory-frontier/);
    t.match(md, /falsified/);
    t.match(md, /\| .* \| theory-frontier \| diff:a\.diff \|/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('report starts with current blocker and diagnostic movement', (t) => {
    const root = tmp();
    saveQuest(root, GOAL);
    appendEvent(root, GOAL.id, {
      type: EVENT_EVIDENCE_INGESTED,
      frontier: 'demo-main',
      evidence: 'r1.json',
      metric: 1,
      done: false,
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      dominantReason: 'snapshot_coverage=1/5',
      mechanism: 'ownership_gap',
    });
    appendEvent(root, GOAL.id, {
      type: EVENT_EVIDENCE_INGESTED,
      frontier: 'demo-main',
      evidence: 'r2.json',
      metric: 1,
      done: false,
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
      dominantReason: 'priority_spread_pending',
      mechanism: 'observation_gap',
      nextAction: 'advance_existing_operation',
    });
    appendEvent(root, GOAL.id, {
      type: 'finding',
      frontier: 'demo-main',
      claim: 'snapshot retry is no longer first blocker',
      rulesOut: 'startup snapshot selected-source retry',
    });
    const log = readLog(root, GOAL.id);
    const md = buildReport(GOAL, log, projectState(GOAL, log), root);
    t.match(md, /## Current Blocker/);
    t.match(md, /Owner: operation_workflow_owner/);
    t.match(md, /Boundary: workflow_progress/);
    t.match(md, /Movement: moved_owner/);
    t.match(md, /No longer current: .*startup snapshot selected-source retry/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('closure kind: oracle done_when => DECISION, harness => MEASURED', (t) => {
    const root = tmp();
    const decisionQuest = {...GOAL, id: 'decision-quest'};
    const measuredQuest = {
      ...GOAL,
      id: 'measured-quest',
      doneWhen: {probe: 'scenario-harness', args: {scenario: 'x', consecutive: 3}},
    };
    saveQuest(root, decisionQuest);
    saveQuest(root, measuredQuest);
    for (const id of ['decision-quest', 'measured-quest']) {
      appendEvent(root, id, {type: EVENT_QUEST, status: STATUS_SOLVED, evidence: 'e'});
    }
    const dLog = readLog(root, 'decision-quest');
    const dMd = buildReport(decisionQuest, dLog, projectState(decisionQuest, dLog));
    t.match(dMd, /Outcome:\*\* SOLVED \(DECISION\)/, 'oracle closure labeled DECISION');
    t.match(dMd, /Closure:\*\* DECISION/, 'header shows DECISION');
    const mLog = readLog(root, 'measured-quest');
    const mMd = buildReport(measuredQuest, mLog, projectState(measuredQuest, mLog));
    t.match(mMd, /Outcome:\*\* SOLVED \(MEASURED\)/, 'harness closure labeled MEASURED');
    t.match(mMd, /Class:\*\* product/, 'header shows class');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('closure kind follows the sealed done_when instead of edited quest JSON', (t) => {
    const root = tmp();
    const quest = {
      ...GOAL,
      id: 'sealed-decision',
      doneWhen: {probe: 'scenario-harness', args: {scenario: 'x'}},
    };
    saveQuest(root, quest);
    appendEvent(root, quest.id, {
      type: EVENT_QUEST_DECLARED,
      sealed: {
        doneWhen: {probe: 'oracle', args: {file: 'sealed.json'}},
        frontierMetrics: quest.frontiers.map((frontier) => frontier.metric),
      },
    });
    appendEvent(root, quest.id, {type: EVENT_QUEST, status: STATUS_SOLVED, evidence: 'e'});
    const log = readLog(root, quest.id);
    const md = buildReport(quest, log, projectState(quest, log));
    t.match(md, /SOLVED \(DECISION\)/, 'uses the sealed oracle probe');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
