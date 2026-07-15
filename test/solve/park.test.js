import tap from 'tap';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent, projectState, readLog}
  from '../../scripts/solve/store.js';
import {parkFrontier, assessPark, PARK_PROVENANCE_OPERATOR}
  from '../../scripts/solve/park.js';
import {pendingFilePath} from '../../scripts/solve/step.js';
import {auditQuest} from '../../scripts/solve/audit.js';
import {buildNextProjection} from '../../scripts/solve/next.js';

const SC = 'operator-park-demo';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-park-'));
}

function makeQuest(root, frontiers = null) {
  const metric = {probe: 'scenario-harness',
    args: {scenario: SC, reportDir: 'reports', metric: 'priority'}};
  const quest = {
    id: 'park-demo',
    statement: 'operator-park demo quest.',
    priority: 1,
    doneWhen: {probe: 'scenario-harness',
      args: {scenario: SC, reportDir: 'reports', metric: 'priority', consecutive: 3}},
    frontiers: frontiers || [{id: 'park-demo-main', priority: 1, metric}],
  };
  saveQuest(root, quest);
  return quest;
}

function makeOracleQuest(root, evidence) {
  const probe = {probe: 'oracle', args: {file: evidence}};
  const quest = {
    id: 'park-oracle-demo',
    statement: 'operator-park oracle evidence demo quest.',
    priority: 1,
    class: 'process',
    doneWhen: probe,
    frontiers: [{id: 'park-oracle-demo-main', priority: 1, metric: probe}],
  };
  saveQuest(root, quest);
  return quest;
}

function recordAltitudeReflection(root, quest, note) {
  appendEvent(root, quest.id, {
    type: 'reflection',
    frontier: `${quest.id}-main`,
    trigger: 'on-demand',
    kind: 'altitude',
    note,
  });
}

tap.test('park (operator-decision frontier terminal)', async (t) => {
  t.test('refuses without a --reason', (t) => {
    const root = tmp();
    const quest = makeQuest(root);
    recordAltitudeReflection(root, quest, 'frame refuted');
    t.throws(() => parkFrontier(root, {id: quest.id}), /--reason/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses without a prior altitude reflection', (t) => {
    const root = tmp();
    const quest = makeQuest(root);
    t.throws(
      () => parkFrontier(root, {id: quest.id, reason: 'operator decision'}),
      /no altitude reflection/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a micro reflection does not sanction a park', (t) => {
    const root = tmp();
    const quest = makeQuest(root);
    appendEvent(root, quest.id, {
      type: 'reflection', frontier: 'park-demo-main',
      trigger: 'on-demand', kind: 'micro', note: 'micro note',
    });
    t.throws(
      () => parkFrontier(root, {id: quest.id, reason: 'operator decision'}),
      /no altitude reflection/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses while a pending supervised step exists', (t) => {
    const root = tmp();
    const quest = makeQuest(root);
    recordAltitudeReflection(root, quest, 'frame refuted');
    const pending = pendingFilePath(root, quest.id);
    fs.mkdirSync(path.dirname(pending), {recursive: true});
    fs.writeFileSync(pending, '{}');
    t.throws(
      () => parkFrontier(root, {id: quest.id, reason: 'operator decision'}),
      /pending supervised step/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses on an already-parked frontier', (t) => {
    const root = tmp();
    const quest = makeQuest(root);
    recordAltitudeReflection(root, quest, 'frame refuted');
    appendEvent(root, quest.id, {
      type: 'park', frontier: 'park-demo-main',
      kind: 'exhausted', reason: 'ladder exhausted without metric movement',
    });
    const assessment = assessPark(root, quest, 'park-demo-main');
    t.equal(assessment.ok, false);
    t.match(assessment.reason, /parked, not open/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('parks the single open frontier and exhausts the quest', (t) => {
    const root = tmp();
    const quest = makeQuest(root);
    recordAltitudeReflection(root, quest, 'frame refuted; pivot to successor');

    const result = parkFrontier(root,
      {id: quest.id, reason: 'frame refuted by RUNG-1; successor authored'});
    t.equal(result.frontierId, 'park-demo-main', 'defaults to the open frontier');
    t.equal(result.event.kind, 'exhausted');
    t.equal(result.event.provenance, PARK_PROVENANCE_OPERATOR,
      'park carries operator provenance');
    t.equal(result.event.sanctionedBy.kind, 'altitude',
      'park cites the sanctioning altitude reflection');
    t.equal(result.questExhausted, true);

    const state = projectState(quest, readLog(root, quest.id));
    const frontier = state.frontiers.find((f) => f.id === 'park-demo-main');
    t.equal(frontier.status, 'parked');
    t.equal(frontier.parkKind, 'exhausted');
    t.equal(state.questStatus, 'exhausted', 'quest-level terminal recorded');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('content-addresses done:false evidence and keeps exhaustion terminal',
    (t) => {
      const root = tmp();
      const evidence = 'solve/oracle/park-oracle-demo.json';
      const evidencePath = path.join(root, evidence);
      const evidenceBytes = '{"metric":1,"target":0,"done":false}\n';
      fs.mkdirSync(path.dirname(evidencePath), {recursive: true});
      fs.writeFileSync(evidencePath, evidenceBytes);
      const quest = makeOracleQuest(root, evidence);
      recordAltitudeReflection(root, quest, 'frame refuted; preserve evidence');

      const result = parkFrontier(root, {
        id: quest.id,
        reason: 'frame refuted; done:false is the honest terminal evidence',
        evidence,
      });
      t.equal(result.questExhausted, true);

      const log = readLog(root, quest.id);
      const terminal = log.find((event) =>
        event.type === 'quest' && event.status === 'exhausted');
      t.equal(terminal.evidence, evidence);
      t.equal(terminal.evidenceIdentity.exists, true);
      t.equal(terminal.evidenceIdentity.path, evidence);
      t.equal(
        terminal.evidenceIdentity.sha256,
        crypto.createHash('sha256').update(evidenceBytes).digest('hex'),
        'terminal identity binds the exact oracle bytes',
      );
      t.equal(
        terminal.evidenceFingerprint,
        terminal.evidenceIdentity.fingerprint,
        'terminal fingerprint is the content identity fingerprint',
      );
      t.equal(terminal.evidenceIdentity.probe, 'oracle');
      t.same(terminal.evidenceIdentity.args, quest.doneWhen.args);

      const audit = auditQuest(root, quest);
      t.equal(audit.status, 'pass', audit.problems.map((item) => item.message));
      t.equal(audit.state.questStatus, 'exhausted');
      const next = buildNextProjection(root, quest.id);
      t.equal(next.quest.status, 'exhausted');
      t.match(next.action.value, /handoff --id park-oracle-demo --commit/u,
        'next remains on terminal handoff instead of evidence ingestion');
      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });

  t.test('refuses missing supplied evidence before appending a park', (t) => {
    const root = tmp();
    const quest = makeOracleQuest(root, 'solve/oracle/missing.json');
    recordAltitudeReflection(root, quest, 'frame refuted; evidence required');
    t.throws(
      () => parkFrontier(root, {
        id: quest.id,
        reason: 'operator decision',
        evidence: 'solve/oracle/missing.json',
      }),
      /park evidence file not found/u,
    );
    t.notOk(readLog(root, quest.id).some((event) => event.type === 'park'),
      'validation failure leaves the append-only log without a partial park');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('quest stays open while another frontier is still active', (t) => {
    const root = tmp();
    const metric = {probe: 'scenario-harness',
      args: {scenario: SC, reportDir: 'reports', metric: 'priority'}};
    const quest = makeQuest(root, [
      {id: 'park-demo-a', priority: 1, metric},
      {id: 'park-demo-b', priority: 2, metric},
    ]);
    recordAltitudeReflection(root, quest, 'frontier A frame refuted');

    const result = parkFrontier(root,
      {id: quest.id, frontier: 'park-demo-a', reason: 'frontier A frame refuted'});
    t.equal(result.questExhausted, false);

    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.questStatus, 'open', 'quest not exhausted with a live frontier');
    t.equal(state.frontiers.find((f) => f.id === 'park-demo-a').status, 'parked');
    t.equal(state.frontiers.find((f) => f.id === 'park-demo-b').status, 'open');

    // Parking the second frontier completes the quest terminal.
    const second = parkFrontier(root,
      {id: quest.id, frontier: 'park-demo-b', reason: 'frontier B frame refuted'});
    t.equal(second.questExhausted, true);
    const after = projectState(quest, readLog(root, quest.id));
    t.equal(after.questStatus, 'exhausted');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('requires --frontier when multiple frontiers are open', (t) => {
    const root = tmp();
    const metric = {probe: 'scenario-harness',
      args: {scenario: SC, reportDir: 'reports', metric: 'priority'}};
    const quest = makeQuest(root, [
      {id: 'park-demo-a', priority: 1, metric},
      {id: 'park-demo-b', priority: 2, metric},
    ]);
    recordAltitudeReflection(root, quest, 'frame refuted');
    t.throws(
      () => parkFrontier(root, {id: quest.id, reason: 'operator decision'}),
      /--frontier/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
