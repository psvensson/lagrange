import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, readLog, appendEvent, projectState}
  from '../../scripts/solve/store.js';
import {
  detectUnrecordedEvidence,
  ingestEvidence,
} from '../../scripts/solve/evidence.js';
import {distanceMetricFromReport}
  from '../../scripts/solve/probes/scenario-harness.js';
import {runStep} from '../../scripts/solve/step.js';
import {
  EVENT_EVIDENCE_INGESTED,
  EVENT_FINDING,
  EVENT_SOLVED,
  EVENT_QUEST,
  STATUS_OPEN,
  STATUS_SOLVED,
  OSCILLATION_REOPEN_BUDGET,
} from '../../scripts/solve/constants.js';

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
  t.test('appends one structured evidence event without a synthetic finding', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    appendEvent(root, goal.id, {
      type: EVENT_FINDING,
      frontier: 'evidence-quest-test-main',
      claim: 'explicit operator finding remains durable',
      evidence: 'operator-observation',
    });
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
    t.equal(event.metric, null);
    t.equal(event.invalidSample, true);
    t.equal(event.done, false);
    t.equal(event.verdict, 'BLOCK_EVIDENCE_INCOMPLETE');
    t.equal(event.rootCauseClass, 'topology');
    t.equal(event.dominantReason, 'priority_recovery_rebalancer_handoff_retry_scheduled');
    t.equal(event.owner, 'operation_workflow_owner');
    t.equal(event.boundary, 'rebalancer_handoff');
    t.equal(event.waitMode, 'retry_scheduled');

    const log = readLog(root, goal.id);
    const evidenceEvents = log.filter((e) => e.type === EVENT_EVIDENCE_INGESTED);
    const findings = log.filter((e) => e.type === EVENT_FINDING);
    t.equal(evidenceEvents.length, 1, 'ingestion records one structured event');
    t.equal(findings.length, 1, 'ingestion does not mirror the event as a finding');
    t.equal(findings[0].claim, 'explicit operator finding remains durable',
      'explicit findings are preserved');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a harness-connectivity failure with a numeric metric is invalid', (t) => {
    // Reproduces the dead-harness bug: BLOCK_HARNESS_INVALID
    // (harness_connectivity_or_system_failure) leaked a numeric priority count, but the
    // harness never reached the cluster, so the sample must be invalid / metric null.
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'dead-harness.report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: '2026-06-05T14:19:38.000Z',
      summary: {total: 1, passed: 0, failed: 1},
      optimizationSummary: {totalPriorityItems: 6},
      scenarios: [{
        scenario: 'rolling-restart',
        passed: false,
        verdict: 'BLOCK_HARNESS_INVALID',
        verdictReason: 'harness_connectivity_or_system_failure',
      }],
    }));

    const event = ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });

    t.equal(event.invalidSample, true, 'dead-harness run flagged invalid');
    t.equal(event.metric, null, 'numeric metric from a dead harness is nulled');
    t.equal(event.done, false, 'a non-measuring run can never be done');
    t.equal(event.verdict, 'BLOCK_HARNESS_INVALID');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a topology convergence block with a numeric metric is measured', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'topology-blocked.report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: '2026-06-05T14:29:38.000Z',
      summary: {total: 1, passed: 0, failed: 1},
      optimizationSummary: {totalPriorityItems: 4},
      scenarios: [{
        scenario: 'rolling-restart',
        passed: false,
        verdict: 'BLOCK_TOPOLOGY_CONVERGENCE',
        verdictReason: 'topology_progress_blocked',
        rootCauseClass: 'topology',
        dominantReason: 'publication_missing_active_node=node-a',
      }],
    }));

    const event = ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });

    t.equal(event.invalidSample, false, 'topology block remains measured');
    t.equal(event.metric, 4, 'numeric priority metric is preserved');
    t.equal(event.done, false, 'a measured topology block is still failing');
    t.equal(event.verdict, 'BLOCK_TOPOLOGY_CONVERGENCE');
    t.equal(event.verdictReason, 'topology_progress_blocked');

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
    const validReport = {
      ...sampleReport,
      scenarios: [{
        ...sampleReport.scenarios[0],
        verdict: 'FAIL_CORE_INVARIANT',
        verdictReason: 'core_invariant_or_safety_violation',
      }],
    };
    fs.writeFileSync(reportPath, JSON.stringify(validReport));

    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });
    t.equal(detectUnrecordedEvidence(root, goal.id, {kind: 'frontier'}), null);

    fs.writeFileSync(reportPath, JSON.stringify({
      ...sampleReport,
      timestamp: '2026-06-01T13:52:33.550Z',
      optimizationSummary: {totalPriorityItems: 1},
    }));

    const unrecorded = detectUnrecordedEvidence(root, goal.id, {kind: 'frontier'});
    t.ok(unrecorded, 'same path with changed content is fresh evidence');
    t.equal(unrecorded.evidence, reportPath);
    t.type(unrecorded.evidenceFingerprint, 'string');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('keeps closure and frontier evidence freshness separate by probe identity', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'latest.report.json');
    const validReport = {
      ...sampleReport,
      scenarios: [{
        ...sampleReport.scenarios[0],
        verdict: 'FAIL_CORE_INVARIANT',
        verdictReason: 'core_invariant_or_safety_violation',
      }],
    };
    fs.writeFileSync(reportPath, JSON.stringify(validReport));

    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });

    t.equal(
      detectUnrecordedEvidence(root, goal.id, {kind: 'frontier'}),
      null,
      'frontier evidence identity satisfies the frontier freshness check',
    );
    const closure = detectUnrecordedEvidence(root, goal.id, {kind: 'closure'});
    t.ok(closure, 'closure probe with different args remains separately stale');
    t.equal(closure.probeScope, 'doneWhen');
    t.match(closure.command, /--probe doneWhen/);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('ingests the frontier metric kind, not the doneWhen metric kind', (t) => {
    const root = tmp();
    const priorityGoal = getGoal(root);
    const goal = {
      ...priorityGoal,
      frontiers: priorityGoal.frontiers.map((frontier) => ({
        ...frontier,
        metric: {
          ...frontier.metric,
          args: {...frontier.metric.args, metric: 'distance'},
        },
      })),
    };
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'latest.report.json');
    const validReport = {
      ...sampleReport,
      scenarios: [{
        ...sampleReport.scenarios[0],
        verdict: 'FAIL_CORE_INVARIANT',
        verdictReason: 'core_invariant_or_safety_violation',
      }],
    };
    fs.writeFileSync(reportPath, JSON.stringify(validReport));

    const event = ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });

    t.equal(event.metricKind, 'distance');
    t.equal(
      event.metric,
      distanceMetricFromReport(validReport, 'rolling-restart') + 1,
    );
    t.type(event.probeKey, 'string');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('fresh measured failed evidence reopens a solved frontier projection', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'latest.report.json');
    const validFailedReport = {
      ...sampleReport,
      scenarios: [{
        ...sampleReport.scenarios[0],
        passed: false,
        verdict: 'BLOCK_TOPOLOGY_CONVERGENCE',
        verdictReason: 'topology_progress_blocked',
      }],
    };
    fs.writeFileSync(reportPath, JSON.stringify(validFailedReport));
    appendEvent(root, goal.id, {
      type: EVENT_SOLVED,
      frontier: 'evidence-quest-test-main',
      evidence: 'previous-pass.report.json',
    });
    appendEvent(root, goal.id, {
      type: EVENT_QUEST,
      status: STATUS_SOLVED,
      evidence: 'previous-pass.report.json',
    });

    const event = ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });
    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
      probeScope: 'doneWhen',
    });
    const state = projectState(goal, readLog(root, goal.id));
    const frontier = state.frontiers.find((item) =>
      item.id === 'evidence-quest-test-main');

    t.equal(event.done, false, 'latest measured evidence does not satisfy frontier');
    t.equal(event.invalidSample, false, 'latest evidence is a valid measured sample');
    t.equal(frontier.status, STATUS_OPEN,
      'projection reopens the frontier after a fresh measured failure');
    t.equal(frontier.current, event.metric,
      'projection keeps the latest measured metric');
    t.equal(state.questStatus, STATUS_OPEN,
      'fresh failed doneWhen evidence reopens the Quest for a corrective attempt');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('supervised step begin re-closes a recovered-reopen quest on green doneWhen', (t) => {
    // Regression: a stale done=false doneWhen ingestion (recorded before enough
    // consecutive green runs existed) reopens the projected quest, and the
    // projection only re-closes on a quest-type event — never on done=true
    // evidence. The change-gated commit path cannot re-close when the work is
    // already done and the tree is clean, so the supervised begin-step must
    // evaluate the live doneWhen and close through the accepted-integrity gate.
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const id = 'evidence-quest-test-main';

    // A measured failing doneWhen sample (valid metric, scenario failed) reopens
    // the quest, exactly as the parent/v2 quests were poisoned.
    const failPath = path.join(reportDir, 'fail.report.json');
    fs.writeFileSync(failPath, JSON.stringify({
      timestamp: '2026-06-01T03:00:00.000Z',
      summary: {total: 1, passed: 0, failed: 1},
      optimizationSummary: {totalPriorityItems: 1},
      standardSummary: {scenarios: [{
        scenario: 'rolling-restart',
        current: {passed: false, verdict: 'BLOCK_TOPOLOGY_CONVERGENCE'},
      }]},
    }));
    appendEvent(root, goal.id, {type: EVENT_SOLVED, frontier: id, evidence: 'pass.json'});
    appendEvent(root, goal.id, {type: EVENT_QUEST, status: STATUS_SOLVED, evidence: 'pass.json'});
    ingestEvidence(root, {questId: goal.id, frontierId: id, evidencePath: failPath, probeScope: 'doneWhen'});
    t.equal(projectState(goal, readLog(root, goal.id)).questStatus, STATUS_OPEN,
      'stale done=false doneWhen evidence holds the quest open');

    // Fresh green runs satisfy the consecutive-3 doneWhen. Newer timestamps win.
    const passReport = (ts) => ({
      timestamp: ts,
      summary: {total: 1, passed: 1, failed: 0},
      optimizationSummary: {totalPriorityItems: 0},
      standardSummary: {scenarios: [{
        scenario: 'rolling-restart',
        current: {passed: true, verdict: 'PASS'},
      }]},
    });
    fs.writeFileSync(path.join(reportDir, 'p1.report.json'),
      JSON.stringify(passReport('2026-06-02T01:00:00.000Z')));
    fs.writeFileSync(path.join(reportDir, 'p2.report.json'),
      JSON.stringify(passReport('2026-06-02T02:00:00.000Z')));
    fs.writeFileSync(path.join(reportDir, 'p3.report.json'),
      JSON.stringify(passReport('2026-06-02T03:00:00.000Z')));

    const result = runStep(root, goal);
    t.equal(result.terminal, 'solved',
      'step begin re-closes the quest without requiring a change');
    t.equal(projectState(goal, readLog(root, goal.id)).questStatus, STATUS_SOLVED,
      'the projection is solved after the recovered-reopen re-close');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('auto-reopen oscillation is bounded: after the budget the frontier stays solved', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'fail.report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      ...sampleReport,
      scenarios: [{
        ...sampleReport.scenarios[0],
        passed: false,
        verdict: 'BLOCK_TOPOLOGY_CONVERGENCE',
        verdictReason: 'topology_progress_blocked',
      }],
    }));
    const id = 'evidence-quest-test-main';
    const statusAfterCycle = () => projectState(goal, readLog(root, goal.id))
      .frontiers.find((f) => f.id === id).status;

    // Each cycle re-solves the frontier then feeds it a fresh measured FAILURE. The first
    // OSCILLATION_REOPEN_BUDGET cycles reopen it (the flap); the next one must NOT — the
    // frontier stays solved so the scheduler runs dry and the quest can terminalize.
    for (let cycle = 0; cycle < OSCILLATION_REOPEN_BUDGET; cycle += 1) {
      appendEvent(root, goal.id, {type: EVENT_SOLVED, frontier: id, evidence: 'pass.json'});
      ingestEvidence(root, {questId: goal.id, frontierId: id, evidencePath: reportPath});
      t.equal(statusAfterCycle(), STATUS_OPEN,
        `cycle ${cycle}: within budget, fresh failure reopens the frontier`);
    }
    const finalState = projectState(goal, readLog(root, goal.id));
    const frontier = finalState.frontiers.find((f) => f.id === id);
    t.equal(frontier.autoReopenCount, OSCILLATION_REOPEN_BUDGET,
      'auto-reopens are counted up to the budget');

    appendEvent(root, goal.id, {type: EVENT_SOLVED, frontier: id, evidence: 'pass.json'});
    ingestEvidence(root, {questId: goal.id, frontierId: id, evidencePath: reportPath});
    const after = projectState(goal, readLog(root, goal.id))
      .frontiers.find((f) => f.id === id);
    t.equal(after.status, STATUS_SOLVED,
      'past the budget the frontier stays solved instead of reopening forever');
    t.match(after.reason, /oscillation reopen budget/,
      'the reason records why the flap was stopped');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('closure evidence ingestion does not mutate frontier metric projection', (t) => {
    const root = tmp();
    const priorityGoal = getGoal(root);
    const goal = {
      ...priorityGoal,
      frontiers: priorityGoal.frontiers.map((frontier) => ({
        ...frontier,
        metric: {
          ...frontier.metric,
          args: {...frontier.metric.args, metric: 'distance'},
        },
      })),
    };
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'latest.report.json');
    const validReport = {
      ...sampleReport,
      scenarios: [{
        ...sampleReport.scenarios[0],
        verdict: 'FAIL_CORE_INVARIANT',
        verdictReason: 'core_invariant_or_safety_violation',
      }],
    };
    fs.writeFileSync(reportPath, JSON.stringify(validReport));

    const frontier = ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
    });
    const afterFrontier = projectState(goal, readLog(root, goal.id))
      .frontiers[0].current;
    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'evidence-quest-test-main',
      evidencePath: reportPath,
      probeScope: 'doneWhen',
    });
    const afterClosure = projectState(goal, readLog(root, goal.id))
      .frontiers[0].current;

    t.equal(afterFrontier, frontier.metric);
    t.equal(afterClosure, frontier.metric,
      'closure priority metric does not overwrite frontier distance metric');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

// R2: an ingestion that returns the frontier to a previously-abandoned blocker is a
// revisit (whack-a-mole), not theory support.
tap.test('R2 oscillation reclassifies a revisit as falsified', async (t) => {
  function blockerReport(ts, owner, boundary, dominantReason) {
    return {
      ...sampleReport,
      timestamp: ts,
      scenarios: [{
        ...sampleReport.scenarios[0],
        verdict: 'FAIL_CORE_INVARIANT',
        verdictReason: 'core_invariant_or_safety_violation',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: 'topology',
              dominantReason,
              ownerContract: {
                frontierWitnesses: [{
                  owner,
                  boundary,
                  source: {nextRequiredActions: 'advance_existing_operation'},
                }],
              },
            },
          },
        },
      }],
    };
  }

  const root = tmp();
  const goal = getGoal(root);
  saveQuest(root, goal);
  const reportDir = path.join(root, 'test-output', 'reports');
  fs.mkdirSync(reportDir, {recursive: true});
  const paths = ['a', 'b', 'c'].map((n) => path.join(reportDir, `${n}.report.json`));
  // A (owner_a/startup) -> B (owner_b/workflow) -> A again (owner_a/startup): a revisit.
  fs.writeFileSync(paths[0], JSON.stringify(
    blockerReport('2026-06-01T12:50:00.000Z', 'owner_a', 'startup', 'reason_a')));
  fs.writeFileSync(paths[1], JSON.stringify(
    blockerReport('2026-06-01T12:55:00.000Z', 'owner_b', 'workflow', 'reason_b')));
  fs.writeFileSync(paths[2], JSON.stringify(
    blockerReport('2026-06-01T13:00:00.000Z', 'owner_a', 'startup', 'reason_a')));

  appendEvent(root, goal.id, {
    type: 'theory-option-declared', theory: 't1',
    frontier: 'evidence-quest-test-main', scope: 'frontier',
    status: 'active', layer: 'ownership', mechanism: 'active_gate',
  });
  appendEvent(root, goal.id, {
    type: 'theory-selected', frontier: 'evidence-quest-test-main', theory: 't1',
  });

  for (const p of paths) {
    ingestEvidence(root, {
      questId: goal.id, frontierId: 'evidence-quest-test-main', evidencePath: p,
    });
  }

  const results = readLog(root, goal.id)
    .filter((event) => event.type === 'theory-result' && event.theory === 't1');
  const latest = results[results.length - 1];
  t.equal(latest.theoryOutcome, 'oscillating', 'revisit is not counted as progress');
  t.equal(latest.oscillating, true);
  t.match(latest.oscillationLabel, /owner_a/);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

// A failed run whose report never locates a blocker (no owner, boundary, dominant
// reason, or root-cause class) cannot have engaged the selected theory's
// discriminating boundary: the honest outcome is 'avoided' (untested), never
// 'falsified'. Attributed same-blocker failures still falsify.
tap.test('unattributed failures record avoided, attributed failures falsify', async (t) => {
  function report(ts, failure) {
    return {
      ...sampleReport,
      timestamp: ts,
      scenarios: [{
        scenario: 'rolling-restart',
        passed: false,
        verdict: 'FAIL_CORE_INVARIANT',
        verdictReason: 'core_invariant_or_safety_violation',
        ...(failure ? {details: {diagnostics: {failure}}} : {}),
      }],
    };
  }

  function selectTheory(root, goal, theory) {
    appendEvent(root, goal.id, {
      type: 'theory-option-declared', theory,
      frontier: 'evidence-quest-test-main', scope: 'frontier',
      status: 'active', layer: 'ownership', mechanism: 'active_gate',
    });
    appendEvent(root, goal.id, {
      type: 'theory-selected', frontier: 'evidence-quest-test-main', theory,
    });
  }

  function latestResult(root, goal, theory) {
    const results = readLog(root, goal.id)
      .filter((event) => event.type === 'theory-result' && event.theory === theory);
    return results[results.length - 1];
  }

  t.test('vacuous attribution yields avoided', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    selectTheory(root, goal, 't-vacuous');
    const paths = ['a', 'b'].map((n) => path.join(reportDir, `${n}.report.json`));
    fs.writeFileSync(paths[0], JSON.stringify(
      report('2026-06-01T12:50:00.000Z', null)));
    fs.writeFileSync(paths[1], JSON.stringify(
      report('2026-06-01T12:55:00.000Z', null)));
    for (const p of paths) {
      ingestEvidence(root, {
        questId: goal.id, frontierId: 'evidence-quest-test-main', evidencePath: p,
      });
    }
    const latest = latestResult(root, goal, 't-vacuous');
    t.equal(latest.theoryOutcome, 'avoided',
      'a run that never located a blocker leaves the theory untested');
    t.equal(latest.result, 'avoided');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('attributed same-blocker failure still falsifies', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    selectTheory(root, goal, 't-attributed');
    const failure = {
      rootCauseClass: 'topology',
      dominantReason: 'reason_a',
      ownerContract: {
        frontierWitnesses: [{
          owner: 'owner_a',
          boundary: 'startup',
          source: {nextRequiredActions: 'advance_existing_operation'},
        }],
      },
    };
    const paths = ['a', 'b'].map((n) => path.join(reportDir, `${n}.report.json`));
    fs.writeFileSync(paths[0], JSON.stringify(
      report('2026-06-01T12:50:00.000Z', failure)));
    fs.writeFileSync(paths[1], JSON.stringify(
      report('2026-06-01T12:55:00.000Z', failure)));
    for (const p of paths) {
      ingestEvidence(root, {
        questId: goal.id, frontierId: 'evidence-quest-test-main', evidencePath: p,
      });
    }
    const latest = latestResult(root, goal, 't-attributed');
    t.equal(latest.theoryOutcome, 'falsified',
      'a located, unchanged blocker still refutes the theory');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.end();
});
