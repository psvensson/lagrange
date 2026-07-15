import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent} from '../../scripts/solve/store.js';
import {buildOverview, renderOverview} from '../../scripts/solve/overview.js';
import {buildFrontier, renderFrontier} from '../../scripts/solve/frontier.js';
import {
  EVENT_ATTEMPT,
  EVENT_EVIDENCE_INGESTED,
  EVENT_QUEST,
  STATUS_SOLVED,
} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'overview-'));
}

function quest(id, links) {
  return {
    id,
    statement: `${id} statement`,
    priority: 1,
    class: 'product',
    links,
    doneWhen: {probe: 'scenario-harness', args: {scenario: id, consecutive: 3}},
    frontiers: [{id: `${id}-main`, priority: 1,
      metric: {probe: 'scenario-harness', args: {scenario: id}}}],
  };
}

tap.test('work overview projection', async (t) => {
  t.test('groups quests under specs/rows and splits open vs terminal', (t) => {
    const root = tmp();
    // An epic citing a roadmap row.
    fs.mkdirSync(path.join(root, 'solve/epics'), {recursive: true});
    fs.writeFileSync(path.join(root, 'solve/epics/widget.md'),
      '---\nid: widget\nroadmapRow: row-7\nstatus: sharpening\ngraduatesTo: widget-spec\n---\n# Epic: Widget\n');
    // Two spec dirs; one will be matched by a quest's specRef, one stays empty.
    fs.mkdirSync(path.join(root, 'solve/specs/widget-spec'), {recursive: true});
    fs.mkdirSync(path.join(root, 'solve/specs/lonely-spec'), {recursive: true});
    fs.mkdirSync(path.join(root, 'solve/specs/archived'), {recursive: true}); // skipped

    // Open quest linked to spec + row; cites a closure record.
    saveQuest(root, quest('q-open', {specRef: 'widget-spec#T2', roadmapRow: 'row-7', closesCL: ['CL-009']}));
    appendEvent(root, 'q-open', {type: EVENT_ATTEMPT, frontier: 'q-open-main',
      rung: 'local-fix', metricBefore: 5, metricAfter: 4});
    // Terminal quest, no links.
    saveQuest(root, quest('q-done', {}));
    appendEvent(root, 'q-done', {type: EVENT_QUEST, status: STATUS_SOLVED, evidence: 'r.json'});

    const o = buildOverview(root);

    t.same(o.roadmapRows.map((r) => r.id), ['row-7'], 'row-7 is in play');
    t.same(o.roadmapRows[0].epics, ['widget'], 'epic attributed to its row');
    t.same(o.roadmapRows[0].quests, ['q-open'], 'quest attributed to its row');

    t.equal(o.epics.length, 1);
    t.equal(o.epics[0].status, 'sharpening', 'front-matter status parsed');
    t.equal(o.epics[0].graduatesTo, 'widget-spec');

    const widget = o.specs.find((s) => s.name === 'widget-spec');
    t.equal(widget.open, 1, 'spec shows its one open quest');
    t.equal(widget.total, 1);
    t.equal(o.specs.find((s) => s.name === 'lonely-spec').total, 0, 'unlinked spec has no quests');
    t.notOk(o.specs.find((s) => s.name === 'archived'), 'archived spec dir is skipped');

    const md = renderOverview(o);
    t.match(md, /## 4 · Quests — 1 open \/ 1 terminal/, 'open/terminal split rendered');
    t.match(md, /CL-009/, 'open quest closes-CL surfaced');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('closure frontier groups active records by concern area', (t) => {
    const overview = {
      roadmapRows: [], epics: [], specs: [], quests: [],
      records: [
        {id: 'CL-001', status: 'narrowed', lastGate: 'g1', concern: 'membership-publication', active: true},
        {id: 'CL-030', status: 'open', lastGate: 'g2', concern: 'harness-oracle (primary)', active: true},
        {id: 'CL-031', status: 'open', lastGate: 'g3', concern: 'harness-oracle (blindness)', active: true},
        {id: 'CL-009', status: 'closed', lastGate: 'g4', concern: 'transport', active: false},
      ],
    };
    const md = renderOverview(overview);
    t.match(md, /Areas: harness-oracle \(2\) · membership-publication \(1\)/,
      'area tally counts active records per subsystem');
    t.match(md, /### harness-oracle — 2/, 'groups the two harness-oracle records');
    t.match(md, /### membership-publication — 1/, 'groups the single membership record');
    t.notMatch(md, /CL-009/, 'settled (inactive) records are excluded from the frontier');
    t.end();
  });

  t.test('overview and frontier include a terminal Quest reopened by fresh evidence', (t) => {
    const root = tmp();
    const id = 'q-reopened';
    saveQuest(root, quest(id, {}));
    appendEvent(root, id, {
      type: EVENT_QUEST,
      status: STATUS_SOLVED,
      evidence: 'passing-report.json',
    });
    appendEvent(root, id, {
      type: EVENT_EVIDENCE_INGESTED,
      frontier: `${id}-main`,
      probeScope: 'doneWhen',
      invalidSample: false,
      done: false,
      evidence: 'fresh-failing-report.json',
    });

    const overview = renderOverview(buildOverview(root));
    const frontier = renderFrontier(buildFrontier(root));
    t.match(overview, /## 4 · Quests — 1 open \/ 0 terminal/u,
      'overview derives the reopened state from the portfolio projection');
    t.match(overview, /q-reopened/u, 'overview lists the reopened Quest');
    t.match(frontier, /## Open quests — 1/u,
      'frontier derives the reopened state from the portfolio projection');
    t.match(frontier, /q-reopened/u, 'frontier lists the reopened Quest');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('empty repo renders every section without throwing', (t) => {
    const root = tmp();
    const md = renderOverview(buildOverview(root));
    t.match(md, /No epic or quest cites a roadmap row yet/, 'roadmap section handles empty');
    t.match(md, /## 2 · Epics — 0/, 'epics section handles empty');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
