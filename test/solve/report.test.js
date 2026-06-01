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
});
