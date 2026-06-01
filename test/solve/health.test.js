import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {analyzeQuestHealth, renderHealth} from '../../scripts/solve/health.js';
import {appendEvent, saveQuest} from '../../scripts/solve/store.js';
import {EVENT_ATTEMPT, EVENT_PARK} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-health-'));
}

tap.test('Quest health', async (t) => {
  t.test('flags live-probe divergence and theory-required signals', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);
    appendEvent(root, quest.id, {
      type: EVENT_ATTEMPT,
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 2,
      prevRungIndex: 1,
      metricBefore: 2,
      metricAfter: 0,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      changeRef: 'diff:x',
    });

    const health = analyzeQuestHealth(root, quest);
    t.same(
      health.signals.map((signal) => signal.type).sort(),
      [
        'fresh-evidence-unrecorded',
        'frontier-theory-required',
        'live-probe-diverges-from-projection',
        'metric-zero-but-done-false',
        'system-theory-required',
      ].sort(),
    );
    t.match(renderHealth(health), /system-theory-required/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('reports no actionable frontier when all frontiers are parked', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);
    appendEvent(root, quest.id, {
      type: EVENT_PARK,
      frontier: 'demo-main',
      reason: 'ladder exhausted without metric movement',
      finalMetric: 1,
    });

    const health = analyzeQuestHealth(root, quest);
    t.equal(health.frontier, null);
    t.match(health.nextAction, /No open frontier remains/);
    t.match(renderHealth(health), /frontier: none/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('repeated owner/boundary reports require system theory and emit signals', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);

    // Ingest two reports with identical owner/boundary liveness failures
    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r1.json',
      owner: 'operation_workflow_owner',
      boundary: 'rebalancer_handoff',
      dominantReason: 'retry_scheduled',
    });
    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r2.json',
      owner: 'operation_workflow_owner',
      boundary: 'rebalancer_handoff',
      dominantReason: 'retry_scheduled',
    });

    const health = analyzeQuestHealth(root, quest);
    const signalTypes = health.signals.map((s) => s.type);
    t.ok(signalTypes.includes('same-owner-boundary-repeat'), 'emits same-owner-boundary-repeat');
    t.ok(signalTypes.includes('same-dominant-reason-repeat'), 'emits same-dominant-reason-repeat');
    t.ok(health.needs.systemTheoryRequired, 'system theory is now required');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('metric zero but done false emits signal and requires theory result', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);

    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r1.json',
      metric: 0,
      done: false,
    });

    const health = analyzeQuestHealth(root, quest);
    const signalTypes = health.signals.map((s) => s.type);
    t.ok(signalTypes.includes('metric-zero-but-done-false'), 'emits metric-zero-but-done-false');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
