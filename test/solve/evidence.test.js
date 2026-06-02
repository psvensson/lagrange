import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, readLog, appendEvent} from '../../scripts/solve/store.js';
import {
  detectUnrecordedEvidence,
  ingestEvidence,
} from '../../scripts/solve/evidence.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
}

const GOAL = {
  id: 'evidence-quest-test',
  statement: 'rolling-restart passes 3 consecutive harness runs.',
  priority: 1,
  doneWhen: {
    probe: 'scenario-harness',
    args: {scenario: 'rolling-restart', consecutive: 3, metric: 'priority'},
  },
  frontiers: [
    {
      id: 'evidence-quest-test-main',
      priority: 1,
      metric: {probe: 'scenario-harness', args: {scenario: 'rolling-restart', metric: 'priority'}},
    },
  ],
};

function getGoal(root) {
  const reportDir = path.join(root, 'test-output', 'reports');
  return {
    ...GOAL,
    doneWhen: {
      ...GOAL.doneWhen,
      args: {
        ...GOAL.doneWhen.args,
        reportDir,
      },
    },
    frontiers: GOAL.frontiers.map((f) => ({
      ...f,
      metric: {
        ...f.metric,
        args: {
          ...f.metric.args,
          reportDir,
        },
      },
    })),
  };
}

const sampleReport = {
  timestamp: '2026-06-01T12:52:33.550Z',
  summary: {
    total: 1,
    passed: 0,
    failed: 1,
  },
  optimizationSummary: {
    totalPriorityItems: 2,
  },
  scenarios: [
    {
      scenario: 'rolling-restart',
      passed: false,
      verdict: 'BLOCK_EVIDENCE_INCOMPLETE',
      verdictReason: 'execution_incomplete_or_metrics_missing',
      details: {
        diagnostics: {
          failure: {
            rootCauseClass: 'topology',
            dominantReason: 'priority_recovery_rebalancer_handoff_retry_scheduled',
            ownerContract: {
              frontierWitnesses: [
                {
                  edgeId: 'priority_recovery_partition_progress',
                  owner: 'operation_workflow_owner',
                  boundary: 'rebalancer_handoff',
                  source: {
                    waitModes: 'retry_scheduled',
                    nextRequiredActions: 'wait_for_operation_progress',
                    actuationStates: 'dispatched_waiting_progress',
                  },
                },
              ],
            },
          },
        },
      },
    },
  ],
};

tap.test('evidence ingestion (P2)', async (t) => {
  t.test('correctly parses report, appends event, and adds finding', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'r1.report.json');
    fs.writeFileSync(reportPath, JSON.stringify(sampleReport));

    const event = ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });

    t.equal(event.type, 'evidence-ingested');
    t.equal(event.metric, 2);
    t.equal(event.done, false);
    t.equal(event.verdict, 'BLOCK_EVIDENCE_INCOMPLETE');
    t.equal(event.rootCauseClass, 'topology');
    t.equal(event.dominantReason, 'priority_recovery_rebalancer_handoff_retry_scheduled');
    t.equal(event.owner, 'operation_workflow_owner');
    t.equal(event.boundary, 'rebalancer_handoff');
    t.equal(event.waitMode, 'retry_scheduled');

    const log = readLog(root, goal.id);
    const finding = log.find((e) => e.type === 'finding');
    t.ok(finding, 'finding event written');
    t.match(finding.claim, /BLOCK_EVIDENCE_INCOMPLETE/);
    t.match(finding.claim, /operation_workflow_owner/);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('updates selected theory result correctly', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'r1.report.json');
    fs.writeFileSync(reportPath, JSON.stringify(sampleReport));

    // Record system and frontier theory, then select it
    appendEvent(root, goal.id, {
      type: 'theory-option-declared',
      theory: 't1',
      frontier: 'evidence-quest-test-main',
      scope: 'frontier',
      status: 'active',
      layer: 'observation',
      mechanism: 'observation_gap',
    });
    appendEvent(root, goal.id, {
      type: 'theory-selected',
      frontier: 'evidence-quest-test-main',
      theory: 't1',
    });

    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });

    const log = readLog(root, goal.id);
    const theoryResult = log.find((e) => e.type === 'theory-result' && e.theory === 't1');
    t.ok(theoryResult, 'theory result recorded');
    t.equal(theoryResult.result, 'needs-rerun');
    t.equal(theoryResult.scenarioOutcome, 'invalid');
    t.equal(theoryResult.theoryOutcome, 'needs-rerun');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('records partial theory support when blocker moves without metric movement', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const firstPath = path.join(reportDir, 'r1.report.json');
    const secondPath = path.join(reportDir, 'r2.report.json');
    const validReport = {
      ...sampleReport,
      scenarios: [{
        ...sampleReport.scenarios[0],
        verdict: 'FAIL_CORE_INVARIANT',
        verdictReason: 'core_invariant_or_safety_violation',
      }],
    };
    fs.writeFileSync(firstPath, JSON.stringify(validReport));
    fs.writeFileSync(secondPath, JSON.stringify({
      ...validReport,
      timestamp: '2026-06-01T12:55:33.550Z',
      scenarios: [{
        ...validReport.scenarios[0],
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: 'topology',
              dominantReason: 'priority_spread_pending',
              ownerContract: {
                frontierWitnesses: [{
                  owner: 'operation_workflow_owner',
                  boundary: 'workflow_progress',
                  source: {
                    nextRequiredActions: 'advance_existing_operation',
                  },
                }],
              },
            },
          },
        },
      }],
    }));
    appendEvent(root, goal.id, {
      type: 'theory-option-declared',
      theory: 't1',
      frontier: 'evidence-quest-test-main',
      scope: 'frontier',
      status: 'active',
      layer: 'ownership',
      mechanism: 'active_gate',
    });
    appendEvent(root, goal.id, {
      type: 'theory-selected',
      frontier: 'evidence-quest-test-main',
      theory: 't1',
    });

    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: firstPath,
    });
    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: secondPath,
    });

    const results = readLog(root, goal.id)
      .filter((event) => event.type === 'theory-result' && event.theory === 't1');
    const latest = results[results.length - 1];
    t.equal(latest.result, 'supported');
    t.equal(latest.scenarioOutcome, 'failed');
    t.equal(latest.theoryOutcome, 'partial');
    t.equal(latest.blockerMovement, 'moved_boundary');
    t.match(latest.diagnosticMovement, /operation_workflow_owner/);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('records scenario improvement separately from doneWhen closure', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const firstPath = path.join(reportDir, 'r1.report.json');
    const secondPath = path.join(reportDir, 'r2.report.json');
    const validReport = {
      ...sampleReport,
      scenarios: [{
        ...sampleReport.scenarios[0],
        verdict: 'FAIL_CORE_INVARIANT',
        verdictReason: 'core_invariant_or_safety_violation',
      }],
    };
    fs.writeFileSync(firstPath, JSON.stringify({
      ...validReport,
      optimizationSummary: {totalPriorityItems: 5},
    }));
    fs.writeFileSync(secondPath, JSON.stringify({
      ...validReport,
      timestamp: '2026-06-01T12:56:33.550Z',
      optimizationSummary: {totalPriorityItems: 3},
    }));
    appendEvent(root, goal.id, {
      type: 'theory-option-declared',
      theory: 't1',
      frontier: 'evidence-quest-test-main',
      scope: 'frontier',
      status: 'active',
      layer: 'ownership',
      mechanism: 'active_gate',
    });
    appendEvent(root, goal.id, {
      type: 'theory-selected',
      frontier: 'evidence-quest-test-main',
      theory: 't1',
    });

    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: firstPath,
    });
    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: secondPath,
    });

    const results = readLog(root, goal.id)
      .filter((event) => event.type === 'theory-result' && event.theory === 't1');
    const latest = results[results.length - 1];
    t.equal(latest.result, 'supported');
    t.equal(latest.scenarioOutcome, 'improved');
    t.equal(latest.theoryOutcome, 'supported');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('detects overwritten evidence by fingerprint, not path alone', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'latest.report.json');
    fs.writeFileSync(reportPath, JSON.stringify(sampleReport));

    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });
    t.equal(detectUnrecordedEvidence(root, goal.id), null);

    fs.writeFileSync(reportPath, JSON.stringify({
      ...sampleReport,
      timestamp: '2026-06-01T13:52:33.550Z',
      optimizationSummary: {totalPriorityItems: 1},
    }));

    const unrecorded = detectUnrecordedEvidence(root, goal.id);
    t.ok(unrecorded, 'same path with changed content is fresh evidence');
    t.equal(unrecorded.evidence, reportPath);
    t.type(unrecorded.evidenceFingerprint, 'string');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('treats one recorded artifact as current across doneWhen and frontier probes', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'latest.report.json');
    fs.writeFileSync(reportPath, JSON.stringify(sampleReport));

    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });

    t.equal(
      detectUnrecordedEvidence(root, goal.id),
      null,
      'frontier evidence identity also satisfies the doneWhen freshness check',
    );

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
