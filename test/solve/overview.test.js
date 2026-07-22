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
  EVENT_QUEST_DECLARED,
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

function declareQuest(root, value) {
  appendEvent(root, value.id, {
    type: EVENT_QUEST_DECLARED,
    sealed: {
      doneWhen: value.doneWhen,
      frontierMetrics: value.frontiers.map((frontier) => frontier.metric),
    },
  });
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
    const openQuest = quest('q-open', {
      specRef: 'widget-spec#T2',
      roadmapRow: 'row-7',
      closesCL: ['CL-009'],
      planDoc: 'solve/epics/widget.md',
    });
    saveQuest(root, openQuest);
    declareQuest(root, openQuest);
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
    t.equal(o.epics[0].stage, 'linked-open',
      'work stage is derived from the linked open Quest');
    t.equal(o.epics[0].linkedQuests.length, 1,
      'epic projection carries its explicit linked Quest');
    t.equal(o.epics[0].graduatesTo, 'widget-spec');

    const widget = o.specs.find((s) => s.name === 'widget-spec');
    t.equal(widget.open, 1, 'spec shows its one open quest');
    t.equal(widget.total, 1);
    t.equal(o.specs.find((s) => s.name === 'lonely-spec').total, 0, 'unlinked spec has no quests');
    t.notOk(o.specs.find((s) => s.name === 'archived'), 'archived spec dir is skipped');

    const md = renderOverview(o);
    t.match(md, /## 4 · Quests — 0 draft \/ 1 open \/ 1 terminal/,
      'draft/open/terminal split rendered');
    t.match(md, /CL-009/, 'open quest closes-CL surfaced');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('derives epic work stage without trusting legacy status prose', (t) => {
    const root = tmp();
    fs.mkdirSync(path.join(root, 'solve/epics'), {recursive: true});
    fs.mkdirSync(path.join(root, 'solve/specs/widget-spec'), {recursive: true});
    fs.writeFileSync(path.join(root, 'solve/epics/framing.md'),
      '---\nid: framing\nstatus: resolved\nroadmapRow: null\ngraduatesTo: null\n---\n# Framing\n');
    fs.writeFileSync(path.join(root, 'solve/epics/graduated.md'),
      '---\nid: graduated\nepicContractVersion: 2\nroadmapRow: null\ngraduatesTo: widget-spec\n---\n# Graduated\n');
    fs.writeFileSync(path.join(root, 'solve/epics/terminal.md'),
      '---\nid: terminal\nstatus: discussing\nroadmapRow: null\ngraduatesTo: null\n---\n# Terminal\n');
    const linkedTerminal = quest('q-terminal', {
      planDoc: 'solve/epics/terminal.md',
    });
    saveQuest(root, linkedTerminal);
    declareQuest(root, linkedTerminal);
    appendEvent(root, 'q-terminal', {
      type: EVENT_QUEST,
      status: STATUS_SOLVED,
      evidence: 'report.json',
    });

    const overview = buildOverview(root);
    const byId = new Map(overview.epics.map((epic) => [epic.id, epic]));
    t.equal(byId.get('framing').stage, 'framing',
      'stale legacy status does not become work authority');
    t.equal(byId.get('graduated').stage, 'linked-spec',
      'an existing explicit spec target produces a mechanical linked-spec stage');
    t.equal(byId.get('terminal').stage, 'linked-terminal',
      'all explicitly linked Quests terminal produces linked-terminal');
    t.match(renderOverview(overview), /\| terminal\s+\| linked-terminal\s+\|/u,
      'overview renders derived stage instead of legacy status');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('matches exact epic/spec links without roadmap or prefix inference', (t) => {
    const root = tmp();
    fs.mkdirSync(path.join(root, 'solve/epics'), {recursive: true});
    fs.mkdirSync(path.join(root, 'solve/specs/foo'), {recursive: true});
    fs.writeFileSync(path.join(root, 'solve/epics/direct.md'),
      '---\nid: direct\nstatus: discussing\nroadmapRow: row-1\ngraduatesTo: null\n---\n# Direct\n');
    fs.writeFileSync(path.join(root, 'solve/epics/spec.md'),
      '---\nid: spec\nstatus: discussing\nroadmapRow: null\ngraduatesTo: foo\n---\n# Spec\n');
    const direct = quest('q-direct', {
      specRef: 'solve/epics/direct.md#decision', roadmapRow: null,
    });
    const spec = quest('q-spec', {
      planDoc: 'solve/specs/foo/design.md#owner', roadmapRow: null,
    });
    const prefix = quest('q-prefix', {
      specRef: 'foobar#task', roadmapRow: 'row-1',
    });
    for (const value of [direct, spec, prefix]) {
      saveQuest(root, value);
      declareQuest(root, value);
    }

    const byId = new Map(buildOverview(root).epics.map((epic) => [epic.id, epic]));
    t.same(byId.get('direct').linkedQuests.map((item) => item.id), ['q-direct'],
      'specRef may point directly at an epic');
    t.same(byId.get('spec').linkedQuests.map((item) => item.id), ['q-spec'],
      'planDoc may point inside the graduated spec');
    t.notMatch(byId.get('spec').linkedQuests.map((item) => item.id).join(','), /q-prefix/u,
      'foo does not prefix-match foobar');
    t.notMatch(byId.get('direct').linkedQuests.map((item) => item.id).join(','), /q-prefix/u,
      'sharing a roadmap row does not imply an epic link');
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
    const reopenedQuest = quest(id, {});
    saveQuest(root, reopenedQuest);
    declareQuest(root, reopenedQuest);
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
    t.match(overview, /## 4 · Quests — 0 draft \/ 1 open \/ 0 terminal/u,
      'overview derives the reopened state from the portfolio projection');
    t.match(overview, /q-reopened/u, 'overview lists the reopened Quest');
    t.match(frontier, /## Open quests — 1/u,
      'frontier derives the reopened state from the portfolio projection');
    t.match(frontier, /q-reopened/u, 'frontier lists the reopened Quest');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('overview surfaces undeclared quests as drafts instead of terminals', (t) => {
    const root = tmp();
    saveQuest(root, quest('q-draft', {}));
    const overview = renderOverview(buildOverview(root));
    t.match(overview, /## 4 · Quests — 1 draft \/ 0 open \/ 0 terminal/u,
      'draft is not mislabeled as terminal');
    t.match(overview, /### Draft[\s\S]*q-draft/u, 'draft remains visible');
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
