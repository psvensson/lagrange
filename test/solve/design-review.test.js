import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  DESIGN_REVIEW_FINDING_KIND,
  DESIGN_REVIEW_STATE,
  buildDesignReviewReceipt,
  designReviewProjection,
} from '../../scripts/solve/design-review.js';
import {
  declareQuest,
  finalizeAttempt,
  runLoop,
} from '../../scripts/solve/loop.js';
import {runStep, pendingFilePath, stepAbort} from '../../scripts/solve/step.js';
import {runAttemptCommand} from '../../scripts/solve/attempt.js';
import {parkFrontier} from '../../scripts/solve/park.js';
import {
  auditQuest,
  checkpointGateProblemsForLog,
  commitGate,
} from '../../scripts/solve/audit.js';
import {buildNextProjection} from '../../scripts/solve/next.js';
import {terminalAuditVerificationPreflight} from
  '../../scripts/solve/checkpoint-preflight.js';
import {
  appendEvent,
  appendFinding,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';

function fixture(version = 2, frontierCount = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-review-'));
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  const quest = {
    id: 'review-demo',
    ...(version === null ? {} : {authoringContractVersion: version}),
    statement: 'The reviewed workflow result is recorded.',
    class: 'process',
    links: {planDoc: 'solve/epics/review.md'},
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: Array.from({length: frontierCount}, (_, index) => ({
      id: `review-demo-${index}`,
      metric: {probe: 'oracle', args: {file: oracle}},
    })),
    constraints: [],
  };
  saveQuest(root, quest);
  return {root, oracle, quest};
}

function recordReview(fx, verdict = 'approve', overrides = {}) {
  const log = readLog(fx.root, fx.quest.id);
  const projection = designReviewProjection(fx.quest, log);
  const frontier = overrides.frontier || fx.quest.frontiers[0].id;
  const evidence = overrides.evidence || 'subagent:design-reviewer';
  const designReview = buildDesignReviewReceipt(fx.quest, log, {
    frontier,
    evidence,
    verdict,
    declarationFingerprint: projection.declarationFingerprint,
  });
  return appendFinding(fx.root, fx.quest.id, {
    frontier,
    kind: DESIGN_REVIEW_FINDING_KIND,
    claim: `${verdict} the sealed design`,
    evidence,
    designReview,
  });
}

function cleanup(fx) {
  fs.rmSync(fx.root, {recursive: true, force: true});
}

tap.test('v2 declaration-bound design review', async (t) => {
  t.test('next declares first, then requests the exact structured review', (t) => {
    const fx = fixture();
    let next = buildNextProjection(fx.root, fx.quest.id);
    t.equal(next.action.code, 'declare-quest');
    t.equal(next.designReview.state, DESIGN_REVIEW_STATE.UNDECLARED);

    const declaration = declareQuest(fx.root, fx.quest);
    next = buildNextProjection(fx.root, fx.quest.id);
    t.equal(next.action.code, 'record-design-review');
    t.equal(next.designReview.state, DESIGN_REVIEW_STATE.MISSING);
    t.match(next.action.value,
      new RegExp(next.designReview.declarationFingerprint, 'u'));
    t.ok(declaration.sealed);
    cleanup(fx);
    t.end();
  });

  t.test('missing review blocks every execution and append boundary', (t) => {
    const fx = fixture();
    declareQuest(fx.root, fx.quest);
    t.throws(() => runStep(fx.root, fx.quest), /design-review admission refused/u);
    t.notOk(fs.existsSync(pendingFilePath(fx.root, fx.quest.id)));

    fs.mkdirSync(path.dirname(pendingFilePath(fx.root, fx.quest.id)),
      {recursive: true});
    fs.writeFileSync(pendingFilePath(fx.root, fx.quest.id), JSON.stringify({
      frontier: fx.quest.frontiers[0].id,
      rungIndex: 0,
      before: {metric: 1, done: false},
    }));
    t.throws(() => runStep(fx.root, fx.quest, {
      changeRef: 'diff:forged.diff', summary: 'forged pending commit',
    }), /design-review admission refused/u);
    stepAbort(fx.root, fx.quest.id);

    let executorCalls = 0;
    t.throws(() => runLoop(fx.root, fx.quest, {
      executor: {
        run() {
          executorCalls += 1;
          return {};
        },
      },
      maxCycles: 1,
    }), /design-review admission refused/u);
    t.equal(executorCalls, 0, 'autonomous executor never launches');

    t.throws(() => runAttemptCommand(fx.root, {
      id: fx.quest.id,
      frontier: fx.quest.frontiers[0].id,
      changeRef: 'diff:never-inspected.diff',
      _: ['node', '-e', 'process.exit(99)'],
    }), /design-review admission refused/u);

    t.throws(() => finalizeAttempt(
      fx.root,
      fx.quest,
      {},
      {def: fx.quest.frontiers[0], state: {rungIndex: 0}},
      {},
      {},
    ), /design-review admission refused/u);
    t.equal(readLog(fx.root, fx.quest.id)
      .filter((event) => ['attempt', 'non-measurement'].includes(event.type)).length,
    0, 'shared finalizer records no attempt-like event');
    cleanup(fx);
    t.end();
  });

  t.test('missing review blocks operator park before either terminal mutation', (t) => {
    const finalFrontier = fixture();
    declareQuest(finalFrontier.root, finalFrontier.quest);
    t.throws(() => parkFrontier(finalFrontier.root, {
      id: finalFrontier.quest.id,
      frontier: finalFrontier.quest.frontiers[0].id,
      reason: 'would exhaust the final frontier',
    }), /design-review admission refused/u);
    t.notOk(readLog(finalFrontier.root, finalFrontier.quest.id)
      .some((event) => event.type === 'park'));
    cleanup(finalFrontier);

    const complete = fixture(2, 2);
    declareQuest(complete.root, complete.quest);
    for (const frontier of complete.quest.frontiers) {
      appendEvent(complete.root, complete.quest.id, {
        type: 'park', frontier: frontier.id, kind: 'exhausted',
      });
    }
    const before = readLog(complete.root, complete.quest.id).length;
    t.throws(() => parkFrontier(complete.root, {
      id: complete.quest.id,
      reason: 'complete already parked frontiers',
    }), /design-review admission refused/u);
    t.equal(readLog(complete.root, complete.quest.id).length, before,
      'completeExhaustedTerminal appends nothing');
    cleanup(complete);
    t.end();
  });

  t.test('latest valid receipt governs and conflicting receipts fail closed', (t) => {
    const fx = fixture();
    declareQuest(fx.root, fx.quest);
    const downgraded = {...fx.quest, authoringContractVersion: 1};
    t.equal(designReviewProjection(
      downgraded, readLog(fx.root, fx.quest.id)).state,
    DESIGN_REVIEW_STATE.MISSING,
    'the sealed declaration prevents a mutable JSON downgrade');
    recordReview(fx, 'approve');
    t.equal(designReviewProjection(
      fx.quest, readLog(fx.root, fx.quest.id)).state,
    DESIGN_REVIEW_STATE.READY);
    recordReview(fx, 'reject');
    t.equal(designReviewProjection(
      fx.quest, readLog(fx.root, fx.quest.id)).state,
    DESIGN_REVIEW_STATE.INVALID, 'approve then reject remains blocked');
    recordReview(fx, 'approve');
    t.equal(designReviewProjection(
      fx.quest, readLog(fx.root, fx.quest.id)).state,
    DESIGN_REVIEW_STATE.READY, 'reject then approve becomes ready');

    const valid = recordReview(fx, 'approve');
    appendFinding(fx.root, fx.quest.id, {
      frontier: fx.quest.frontiers[0].id,
      kind: DESIGN_REVIEW_FINDING_KIND,
      claim: 'forged conflicting evidence',
      evidence: 'subagent:other-reviewer',
      designReview: valid.designReview,
    });
    t.equal(designReviewProjection(
      fx.quest, readLog(fx.root, fx.quest.id)).state,
    DESIGN_REVIEW_STATE.INVALID);
    cleanup(fx);
    t.end();
  });

  t.test('malformed, misplaced, and late receipts never qualify', (t) => {
    const wrong = fixture();
    appendFinding(wrong.root, wrong.quest.id, {
      frontier: wrong.quest.frontiers[0].id,
      kind: DESIGN_REVIEW_FINDING_KIND,
      claim: 'premature review',
      evidence: 'subagent:premature',
    });
    declareQuest(wrong.root, wrong.quest);
    t.equal(designReviewProjection(
      wrong.quest, readLog(wrong.root, wrong.quest.id)).state,
    DESIGN_REVIEW_STATE.LATE, 'pre-declaration finding is stale');
    cleanup(wrong);

    const malformed = fixture();
    declareQuest(malformed.root, malformed.quest);
    appendFinding(malformed.root, malformed.quest.id, {
      frontier: malformed.quest.frontiers[0].id,
      kind: 'ordinary-finding',
      claim: 'wrong kind cannot unlock review admission',
      evidence: 'subagent:ordinary',
    });
    t.equal(designReviewProjection(
      malformed.quest, readLog(malformed.root, malformed.quest.id)).state,
    DESIGN_REVIEW_STATE.MISSING);
    t.throws(() => recordReview(malformed, 'approve', {
      frontier: 'unknown-frontier',
    }), /frontier is not in the sealed declaration/u);
    appendFinding(malformed.root, malformed.quest.id, {
      frontier: 'unknown-frontier',
      kind: DESIGN_REVIEW_FINDING_KIND,
      claim: 'malformed review',
      evidence: 'subagent:',
      designReview: {},
    });
    t.equal(designReviewProjection(
      malformed.quest, readLog(malformed.root, malformed.quest.id)).state,
    DESIGN_REVIEW_STATE.INVALID);
    cleanup(malformed);

    const late = fixture();
    declareQuest(late.root, late.quest);
    appendEvent(late.root, late.quest.id, {
      type: 'solved', frontier: late.quest.frontiers[0].id,
    });
    appendFinding(late.root, late.quest.id, {
      frontier: late.quest.frontiers[0].id,
      kind: DESIGN_REVIEW_FINDING_KIND,
      claim: 'post-terminal review',
      evidence: 'subagent:late',
      designReview: {},
    });
    t.equal(designReviewProjection(
      late.quest, readLog(late.root, late.quest.id)).state,
    DESIGN_REVIEW_STATE.LATE);
    cleanup(late);
    t.end();
  });

  t.test('receipt builder refuses every post-execution review append', (t) => {
    const fx = fixture();
    declareQuest(fx.root, fx.quest);
    recordReview(fx);
    appendEvent(fx.root, fx.quest.id, {
      type: 'attempt', frontier: fx.quest.frontiers[0].id,
    });
    const before = readLog(fx.root, fx.quest.id).length;
    t.throws(() => recordReview(fx, 'reject'),
      /cannot be recorded after execution or terminal/u);
    t.equal(readLog(fx.root, fx.quest.id).length, before,
      'server-side receipt construction refuses before append');
    cleanup(fx);
    t.end();
  });

  t.test('a forged declaration cannot launder prior execution history', (t) => {
    const fx = fixture();
    appendEvent(fx.root, fx.quest.id, {
      type: 'attempt', frontier: fx.quest.frontiers[0].id,
    });
    appendEvent(fx.root, fx.quest.id, {
      type: 'quest-declared',
      sealed: {
        doneWhen: fx.quest.doneWhen,
        frontierMetrics: fx.quest.frontiers.map((frontier) => frontier.metric),
        authoringContractVersion: 2,
        statement: fx.quest.statement,
        title: null,
        class: fx.quest.class,
        constraints: fx.quest.constraints,
        verificationTemplates: [],
        frontierIds: fx.quest.frontiers.map((frontier) => frontier.id),
      },
    });
    let projection = designReviewProjection(
      fx.quest, readLog(fx.root, fx.quest.id));
    appendFinding(fx.root, fx.quest.id, {
      frontier: fx.quest.frontiers[0].id,
      kind: DESIGN_REVIEW_FINDING_KIND,
      claim: 'valid-looking approval after forged declaration',
      evidence: 'subagent:forged-order',
      designReview: {
        schemaVersion: 1,
        questId: fx.quest.id,
        declarationFingerprint: projection.declarationFingerprint,
        declarationIndex: projection.declarationIndex,
        verdict: 'approve',
        reviewer: 'subagent:forged-order',
        frontier: fx.quest.frontiers[0].id,
      },
    });
    projection = designReviewProjection(fx.quest, readLog(fx.root, fx.quest.id));
    t.equal(projection.state, DESIGN_REVIEW_STATE.LATE);
    t.match(projection.problems.map((item) => item.message).join('\n'),
      /history predates the sealed declaration/u);
    t.throws(() => declareQuest(fx.root, fx.quest),
      /history predates the sealed declaration/u,
      'an existing forged declaration does not bypass declaration validation');
    t.match(checkpointGateProblemsForLog(
      fx.root, fx.quest, readLog(fx.root, fx.quest.id))
      .map((item) => item.message).join('\n'),
    /history predates the sealed declaration/u);
    t.match(auditQuest(fx.root, fx.quest).problems
      .map((item) => item.message).join('\n'),
    /history predates the sealed declaration/u);
    cleanup(fx);
    t.end();
  });

  t.test('audit, checkpoint, landing, and approval simulation preserve the gate',
    (t) => {
      const fx = fixture();
      declareQuest(fx.root, fx.quest);
      appendEvent(fx.root, fx.quest.id, {type: 'quest', status: 'solved'});
      const log = readLog(fx.root, fx.quest.id);
      t.match(checkpointGateProblemsForLog(fx.root, fx.quest, log)
        .map((item) => item.message).join('\n'), /predates design-review/u);
      t.equal(auditQuest(fx.root, fx.quest).status, 'fail');
      t.equal(commitGate(fx.root, fx.quest).status, 'fail');
      const preflight = terminalAuditVerificationPreflight(
        fx.root, fx.quest, log, {audit: auditQuest(fx.root, fx.quest)});
      t.notOk(preflight.readyAfterRequiredApprovals,
        'synthetic implementation approvals cannot clear design review');
      t.match(preflight.nonVerificationProblems
        .map((item) => item.message).join('\n'), /predates design-review/u);
      cleanup(fx);
      t.end();
    });

  t.test('valid review enables work while v1 and unversioned remain compatible',
    (t) => {
      const current = fixture();
      declareQuest(current.root, current.quest);
      recordReview(current);
      const begun = runStep(current.root, current.quest);
      t.ok(begun.pendingFile);
      stepAbort(current.root, current.quest.id);
      cleanup(current);

      for (const version of [1, null]) {
        const legacy = fixture(version);
        t.equal(designReviewProjection(
          legacy.quest, readLog(legacy.root, legacy.quest.id)).state,
        DESIGN_REVIEW_STATE.NOT_REQUIRED);
        const legacyBegin = runStep(legacy.root, legacy.quest);
        t.ok(legacyBegin.pendingFile);
        stepAbort(legacy.root, legacy.quest.id);
        cleanup(legacy);
      }
      t.end();
    });

  t.test('declare refuses execution history and unknown versions fail lint', (t) => {
    const fx = fixture();
    appendEvent(fx.root, fx.quest.id, {
      type: 'non-measurement', frontier: fx.quest.frontiers[0].id,
    });
    t.throws(() => declareQuest(fx.root, fx.quest),
      /history predates the sealed declaration/u);
    cleanup(fx);
    t.end();
  });
});
