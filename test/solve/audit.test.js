import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {auditQuest} from '../../scripts/solve/audit.js';
import {
  classifyPath,
  classifyQuestScope,
  inspectChangeArtifact,
} from '../../scripts/solve/change-artifact.js';
import {runStep} from '../../scripts/solve/step.js';
import {writeReport} from '../../scripts/solve/report.js';
import {appendEvent, readLog, saveQuest} from '../../scripts/solve/store.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-audit-'));
}

function makeQuest(root, id = 'demo') {
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  const quest = {
    id,
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: `${id}-main`, priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
  saveQuest(root, quest);
  return {quest, oracle};
}

function makeDiff(root, questId, name, changedPath = 'src/demo.js') {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    `diff --git a/${changedPath} b/${changedPath}`,
    `--- a/${changedPath}`,
    `+++ b/${changedPath}`,
    '@@ -1 +1 @@',
    '-before',
    '+after',
  ].join('\n'));
  return `diff:${file}`;
}

function approveLatestAttempt(root, quest, frontier = `${quest.id}-main`) {
  const attempt = [...readLog(root, quest.id)].reverse()
    .find((event) => event.type === 'attempt');
  const fingerprint = `sha256:${attempt.changeRefIdentity.sha256}`;
  appendEvent(root, quest.id, {
    type: 'finding',
    frontier,
    kind: 'verifier-approval',
    claim: 'independent verification passed',
    evidence: 'subagent:verify-1',
    verification: {schemaVersion: 1, scope: 'attempt', fingerprint},
  });
  return fingerprint;
}

tap.test('Quest audit', async (t) => {
  t.test('classifies Markdown by content while preserving owner boundaries',
    (t) => {
      t.equal(classifyPath('src/cli/README.md'), 'docs',
        'runtime-tree Markdown remains documentation');
      t.equal(classifyPath('test/distributed/README.local.md'), 'docs',
        'distributed-harness Markdown remains documentation');
      t.equal(classifyPath('src/cli/admin.js'), 'runtime',
        'runtime source remains runtime');
      t.equal(classifyPath('test/distributed/scenario.js'), 'runtime',
        'distributed source remains runtime');
      t.equal(classifyPath('docs/development/solver-runbook.md'), 'workflow',
        'workflow-owned Markdown keeps workflow scope');
      t.equal(classifyPath('solve/epics/golden-capability-gold-plating.md'), 'docs',
        'an epic planning memo under solve/ is documentation, not workflow tooling');
      t.equal(classifyPath('solve/epics/example.js'), 'workflow',
        'non-Markdown source under solve/epics keeps workflow scope');
      t.equal(classifyPath('solve/epics/example.json'), 'workflow',
        'non-Markdown data under solve/epics keeps workflow scope');
      t.equal(classifyPath('solve/quests/some-quest.json'), 'workflow',
        'a solve/ bookkeeping file keeps workflow scope');
      t.end();
    });

  t.test('an epic planDoc citation does not stamp a runtime process Quest workflow',
    (t) => {
      // Regression: classifyPath('solve/epics/*.md') returned workflow (the bare
      // solve/ prefix was checked before the Markdown rule), so a runtime
      // process Quest citing the gold-plating epic in links.planDoc inherited
      // workflow scope and the changeRef gate refused its runtime guard files.
      const epicLinkedRuntimeQuest = {
        id: 'bootstrap-mode-routing-property-repair',
        class: 'process',
        statement: 'The CDC bootstrap-mode-routing property respects the ' +
          'primary-key re-home refusal.',
        links: {planDoc: 'solve/epics/golden-capability-gold-plating.md'},
        frontiers: [{id: 'bootstrap-mode-routing-property-repair-main'}],
      };
      t.equal(classifyQuestScope(epicLinkedRuntimeQuest), 'runtime',
        'the epic citation is documentation and yields to runtime classification');
      t.end();
    });

  t.test('source citations own scope while artifact filename tokens do not', (t) => {
    const root = tmp();
    const runtimeQuest = {
      id: 'partition-owner-runtime',
      class: 'process',
      statement: 'src/bootstrap/system-partition-classification.js owns the ' +
        'runtime result; evidence is solve/oracle/partition-owner-contract.json.',
      frontiers: [{id: 'partition-owner-runtime-main'}],
    };
    const workflowQuest = {
      id: 'scope-owner-check',
      class: 'process',
      statement: 'scripts/solve/change-artifact.js owns source classification.',
      frontiers: [{id: 'scope-owner-check-main'}],
    };
    const designQuest = {
      id: 'owner-record',
      class: 'process',
      statement: 'architecture/contracts/core-system-logic.md is the ' +
        'authoritative design.',
      frontiers: [{id: 'owner-record-main'}],
    };
    const linkedWorkflowQuest = {
      id: 'linked-process-owner',
      class: 'process',
      statement: 'The linked process contract replays successfully.',
      links: {specRef: 'docs/development/documentation-lifecycle.md'},
      frontiers: [{id: 'linked-process-owner-main'}],
    };

    t.equal(classifyQuestScope(runtimeQuest), 'runtime',
      'an evidence filename cannot override the cited runtime source owner');
    t.equal(classifyQuestScope({
      id: 'artifact-reference-only',
      class: 'process',
      statement: 'Evidence is solve/oracle/owner-contract.json and ' +
        'solve/changes/artifact-reference-only/contract.diff.',
      frontiers: [{id: 'artifact-reference-only-main'}],
    }), 'runtime', 'artifact filenames alone do not create source-owner scope');
    t.equal(classifyQuestScope(workflowQuest), 'workflow',
      'a genuine Solver source path classifies as workflow scope');
    t.equal(classifyQuestScope(designQuest), 'workflow',
      'a genuine architecture-contract citation survives artifact masking');
    t.equal(classifyQuestScope(linkedWorkflowQuest), 'workflow',
      'a process Quest planning link participates in owner-scope classification');
    t.equal(classifyQuestScope({
      id: 'generic-scope-check',
      class: 'process',
      statement: 'The architecture contract remains the governing result.',
      frontiers: [{id: 'generic-scope-check-main'}],
    }), 'workflow', 'generic workflow prose keeps the legacy fallback');
    t.equal(classifyQuestScope({
      ...workflowQuest,
      class: 'product',
    }), 'runtime', 'declared product scope remains authoritative');

    const runtimeChange = makeDiff(
      root, runtimeQuest.id, 'runtime', 'src/bootstrap/runtime-owner.js');
    const workflowChange = makeDiff(
      root, runtimeQuest.id, 'workflow', 'scripts/solve/runtime-owner.js');
    t.same(inspectChangeArtifact(root, runtimeQuest, runtimeChange).problems, [],
      'runtime source is accepted under the runtime citation');
    t.match(
      inspectChangeArtifact(root, runtimeQuest, workflowChange).problems.join(' '),
      /workflow changes must be recorded/u,
      'a workflow artifact remains rejected under runtime scope',
    );

    const workflowRuntimeChange = makeDiff(
      root, workflowQuest.id, 'runtime', 'src/bootstrap/runtime-owner.js');
    const workflowOwnerChange = makeDiff(
      root, workflowQuest.id, 'workflow', 'scripts/solve/scope-owner.js');
    t.same(
      inspectChangeArtifact(root, workflowQuest, workflowOwnerChange).problems,
      [],
      'a genuine workflow owner citation accepts a workflow artifact',
    );
    t.match(
      inspectChangeArtifact(root, workflowQuest, workflowRuntimeChange)
        .problems.join(' '),
      /runtime changes must be recorded/u,
      'a runtime artifact remains rejected under genuine workflow scope',
    );
    const designOwnerChange = makeDiff(
      root, designQuest.id, 'workflow', 'scripts/solve/model-owner.js');
    t.same(inspectChangeArtifact(root, designQuest, designOwnerChange).problems, [],
      'the design citation accepts its genuine workflow owner artifact');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('passes a valid fingerprinted attempt with scoped patch artifact', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'valid', 'docs/demo.md'),
      summary: 'valid scoped patch',
    });

    const audit = auditQuest(root, quest);
    t.equal(audit.status, 'pass');
    t.same(audit.problems, []);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('accepts zero metric attempts closed by later solved events', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'valid', 'docs/demo.md'),
      summary: 'valid solved patch',
    });

    const audit = auditQuest(root, quest);
    t.equal(audit.status, 'pass');
    t.same(audit.problems, []);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('fails source-file changeRefs and missing evidence identity', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      changeRef: 'diff:src/demo.js',
    });

    const audit = auditQuest(root, quest);
    const messages = audit.problems.map((item) => item.message).join('\n');
    t.equal(audit.status, 'fail');
    t.match(messages, /changeRef artifact does not exist/);
    t.match(messages, /evidence event is missing fingerprint identity/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('fails workflow changes recorded under runtime Quest', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      evidenceFingerprint: 'fingerprint',
      changeRef: makeDiff(root, quest.id, 'workflow', 'scripts/solve/step.js'),
    });

    const audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /workflow changes must be recorded/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('classifies Solver command and test surfaces as workflow changes', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      evidenceFingerprint: 'fingerprint',
      changeRef: makeDiff(root, quest.id, 'solver-test', 'test/solve/audit.test.js'),
    });

    const audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /workflow changes must be recorded/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('classifies package script changes as workflow changes', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      evidenceFingerprint: 'fingerprint',
      changeRef: makeDiff(root, quest.id, 'package', 'package.json'),
    });

    const audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /workflow changes must be recorded/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('fails patch artifacts without a real unified hunk', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    const file = path.join(root, 'solve', 'changes', quest.id, 'synthetic.diff');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, [
      'diff --git a/src/demo.js b/src/demo.js',
      '--- a/src/demo.js',
      '+++ b/src/demo.js',
      '@@ synthetic header',
    ].join('\n'));
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      evidenceFingerprint: 'fingerprint',
      changeRef: `diff:${file}`,
    });

    const audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /unified diff hunk/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('requires subagent verification after source changes without opt-in constraint', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root, 'workflow-source-verifier');
    saveQuest(root, quest);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'source', 'scripts/quest-context.js'),
      summary: 'source change requiring verifier',
    });

    let audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /requires a later exact approval for sha256:/u,
    );

    appendEvent(root, quest.id, {
      type: 'finding',
      frontier: 'wrong-frontier',
      claim: 'Subagent verifier approved source changes against Quest intent, system guidelines, and doctrine.',
      evidence: 'subagent:019e870d-3b19-7fa3-ae37-a85868b84226',
    });

    audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /requires a later exact approval for sha256:/u,
    );

    approveLatestAttempt(root, quest);
    writeReport(root, quest.id);

    audit = auditQuest(root, quest);
    t.equal(audit.status, 'pass');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('accepts --kind verifier-approval regardless of claim prose', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root, 'workflow-kind-verifier');
    saveQuest(root, quest);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'source', 'scripts/quest-context.js'),
      summary: 'source change requiring verifier',
    });

    // A claim with NONE of the legacy prose keywords: without the kind tag the
    // matcher must reject it; with kind verifier-approval it must match.
    appendEvent(root, quest.id, {
      type: 'finding',
      frontier: 'workflow-kind-verifier-main',
      claim: 'green across the board',
      evidence: 'subagent:019e870d-3b19-7fa3-ae37-a85868b84226',
    });
    let audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /requires a later exact approval for sha256:/u,
    );

    approveLatestAttempt(root, quest);
    writeReport(root, quest.id);
    audit = auditQuest(root, quest);
    t.equal(audit.status, 'pass');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('requires model evidence after architecture model changes', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root, 'model-contract-demo');
    saveQuest(root, quest);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(
        root,
        quest.id,
        'contract',
        'architecture/contracts/invariants.json',
      ),
      summary: 'model contract change requiring verifier and model evidence',
    });
    approveLatestAttempt(root, quest);

    let audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /model and architecture model changes require modelRef or later model evidence/u,
    );

    appendEvent(root, quest.id, {
      type: 'finding',
      frontier: 'wrong-frontier',
      claim: 'Model evidence from architecture contract report passed.',
      evidence: 'test-output/reports/core-system-logic-alloy.model.report.json',
    });

    audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /model and architecture model changes require modelRef or later model evidence/u,
    );

    appendEvent(root, quest.id, {
      type: 'finding',
      frontier: 'model-contract-demo-main',
      claim: 'Model evidence from architecture contract report passed.',
      evidence: 'test-output/reports/core-system-logic-alloy.model.report.json',
    });
    writeReport(root, quest.id);

    audit = auditQuest(root, quest);
    t.equal(audit.status, 'pass');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('warns when a product quest closes on a DECISION (oracle) probe', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'valid', 'docs/demo.md'),
      summary: 'close the product quest on its oracle',
    });
    const audit = auditQuest(root, quest);
    t.equal(audit.status, 'pass', 'closure-strength is a warning, not a failure');
    t.match(
      (audit.warnings || []).join('\n'),
      /product quest closed on a DECISION/u,
      'surfaces the closure-strength mismatch warning',
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a process quest closing on oracle emits no closure warning', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root, 'proc');
    quest.class = 'process';
    saveQuest(root, quest);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'valid', 'docs/demo.md'),
      summary: 'close the process quest on its oracle',
    });
    const audit = auditQuest(root, quest);
    t.same(audit.warnings, [], 'process quests may legitimately close on a DECISION');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('warns when a product quest has no planning link', (t) => {
    const root = tmp();
    const {quest} = makeQuest(root, 'unlinked'); // product, no links block
    const audit = auditQuest(root, quest);
    t.match(
      (audit.warnings || []).join('\n'),
      /no planning link/u,
      'surfaces the link-hygiene warning so the quest is not invisible to the joins',
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a linked product quest emits no link-hygiene warning', (t) => {
    const root = tmp();
    const {quest} = makeQuest(root, 'linked');
    quest.links = {roadmapRow: null, specRef: 'some-spec', closesCL: [], parentQuest: null};
    saveQuest(root, quest);
    const audit = auditQuest(root, quest);
    t.notMatch((audit.warnings || []).join('\n'), /no planning link/u,
      'a specRef link satisfies link hygiene');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a process quest with no link emits no link-hygiene warning', (t) => {
    const root = tmp();
    const {quest} = makeQuest(root, 'procnolink');
    quest.class = 'process';
    saveQuest(root, quest);
    const audit = auditQuest(root, quest);
    t.notMatch((audit.warnings || []).join('\n'), /no planning link/u,
      'process quests are exempt from the link-hygiene nudge');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

// R6: a theory may only be promoted by a MEASURED post-patch report, never by an
// approval finding alone.
tap.test('R6 unmeasured theory promotion guard', async (t) => {
  function seedQuest(root) {
    const {quest} = makeQuest(root, 'r6');
    return quest;
  }

  t.test('approval finding without a post-patch measured report is flagged', (t) => {
    const root = tmp();
    const quest = seedQuest(root);
    appendEvent(root, quest.id, {
      type: 'theory-selected', frontier: 'r6-main', theoryId: 'th-1',
    });
    appendEvent(root, quest.id, {
      type: 'finding', frontier: 'r6-main',
      evidence: 'subagent:reviewer', claim: 'approve the active-wait patch',
    });
    const audit = auditQuest(root, quest);
    t.equal(audit.status, 'fail');
    t.ok(
      audit.problems.some((p) => /approved by a finding but never confirmed/u.test(p.message)),
      'flags the unmeasured promotion',
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('approval followed by a measured evidence report passes the guard', (t) => {
    const root = tmp();
    const quest = seedQuest(root);
    appendEvent(root, quest.id, {
      type: 'theory-selected', frontier: 'r6-main', theoryId: 'th-1',
    });
    appendEvent(root, quest.id, {
      type: 'finding', frontier: 'r6-main',
      evidence: 'subagent:reviewer', claim: 'approve the active-wait patch',
    });
    appendEvent(root, quest.id, {
      type: 'evidence-ingested', frontier: 'r6-main', metric: 0,
      evidence: 'post-patch.report.json',
    });
    const audit = auditQuest(root, quest);
    t.notOk(
      audit.problems.some((p) => /approved by a finding but never confirmed/u.test(p.message)),
      'a measured post-patch report clears the guard',
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
