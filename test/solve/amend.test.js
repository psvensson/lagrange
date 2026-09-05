import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {appendEvent, readLog, saveQuest, loadQuest}
  from '../../scripts/solve/store.js';
import {
  applyAmendments,
  questAmendments,
  runAmendCommand,
} from '../../scripts/solve/amend.js';
import {ensureSealedGoal} from '../../scripts/solve/loop.js';
import {validateGoalpostsImmutable} from '../../scripts/solve/honesty.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'amend-'));
}

function goal(root) {
  const metric = {probe: 'scenario-harness', args: {
    scenario: 'amend-fixture', metric: 'priority',
    reportDir: path.join(root, 'reports'),
  }};
  return {
    id: 'amend-fixture',
    authoringContractVersion: 1,
    statement: 'The process contract holds.',
    class: 'product',
    priority: 1,
    constraints: [],
    links: {roadmapRow: 'row-1'},
    doneWhen: {...metric, args: {...metric.args, consecutive: 3}},
    frontiers: [{
      id: 'amend-fixture-main',
      priority: 1,
      metric,
    }],
  };
}

function sealed(root) {
  const quest = goal(root);
  saveQuest(root, quest);
  ensureSealedGoal(root, quest);
  return quest;
}

tap.test('solve amend', async (t) => {
  t.test('class-correction legalizes the corrected file; unamended edits still violate',
    (t) => {
      const root = tmp();
      const quest = sealed(root);

      // Editing the file without an amendment is still a goalpost violation.
      const drifted = {...quest, class: 'process'};
      saveQuest(root, drifted);
      t.throws(() => ensureSealedGoal(root, drifted), /goalpost violation/u);
      t.match(String((() => {
        try {
          ensureSealedGoal(root, drifted);
          return '';
        } catch (err) {
          return err.message;
        }
      })()), /solve\.js amend/u, 'the violation offers the amendment path');

      saveQuest(root, quest); // restore, then amend properly
      runAmendCommand(root, {id: quest.id, kind: 'class-correction',
        class: 'process', evidence: 'quest-lint: statement classifies as process'});
      const amendedFile = loadQuest(root, quest.id);
      t.equal(amendedFile.class, 'process', 'the quest file is updated');
      t.doesNotThrow(() => ensureSealedGoal(root, amendedFile),
        'the amended class is legal against sealed + amendments');

      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });

  t.test('statement-strengthen appends only and needs a recorded finding', (t) => {
    const root = tmp();
    const quest = sealed(root);
    t.throws(() => runAmendCommand(root, {id: quest.id,
      kind: 'statement-strengthen',
      statement: 'The process contract holds. And headings match S0/L0.',
      evidence: 'no-such-finding'}),
    /requires --evidence referencing a recorded verifier-rejection finding/u);

    // Laundering guards: a self-authored non-verifier finding never satisfies
    // the linkage, and neither does a trivial claim substring on a real one.
    appendEvent(root, quest.id, {type: 'finding', kind: null,
      claim: 'operator note: headings must match S0/L0', evidence: 'note'});
    t.throws(() => runAmendCommand(root, {id: quest.id,
      kind: 'statement-strengthen',
      statement: 'The process contract holds. And headings match S0/L0.',
      evidence: 'headings must match'}),
    /verifier-rejection finding/u, 'non-verifier findings never satisfy');

    appendEvent(root, quest.id, {type: 'finding', kind: 'verifier-rejection',
      claim: 'headings must match S0/L0', evidence: 'subagent:v1'});
    t.throws(() => runAmendCommand(root, {id: quest.id,
      kind: 'statement-strengthen',
      statement: 'The process contract holds. And headings match S0/L0.',
      evidence: 'h'}),
    /verifier-rejection finding/u, 'a trivial substring never satisfies');
    t.throws(() => runAmendCommand(root, {id: quest.id,
      kind: 'statement-strengthen',
      statement: 'A rewritten weaker statement.',
      evidence: 'subagent:v1'}),
    /only appends/u, 'rewrites are refused');

    runAmendCommand(root, {id: quest.id, kind: 'statement-strengthen',
      statement: 'The process contract holds. And headings match S0/L0.',
      evidence: 'subagent:v1'});
    t.match(loadQuest(root, quest.id).statement, /headings match S0\/L0/u);
    t.doesNotThrow(() => ensureSealedGoal(root, loadQuest(root, quest.id)));
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('the third amendment is refused with the successor message', (t) => {
    const root = tmp();
    const quest = sealed(root);
    appendEvent(root, quest.id, {type: 'finding', kind: 'verifier-rejection',
      claim: 'first', evidence: 'subagent:v1'});
    runAmendCommand(root, {id: quest.id, kind: 'statement-strengthen',
      statement: 'The process contract holds. A.', evidence: 'subagent:v1'});
    runAmendCommand(root, {id: quest.id, kind: 'statement-strengthen',
      statement: 'The process contract holds. A. B.', evidence: 'subagent:v1'});
    t.throws(() => runAmendCommand(root, {id: quest.id,
      kind: 'statement-strengthen',
      statement: 'The process contract holds. A. B. C.',
      evidence: 'subagent:v1'}),
    /limit 2.*successor/su);
    t.equal(questAmendments(readLog(root, quest.id)).length, 2);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('monotone amendments carry their own cap and never spend a correction',
    (t) => {
      const root = tmp();
      const quest = sealed(root);
      const templateDir = path.join(root, 'docs/steering/verification-templates');
      fs.mkdirSync(templateDir, {recursive: true});
      for (const slug of ['bar-a', 'bar-b', 'bar-c', 'bar-d', 'bar-e']) {
        fs.writeFileSync(path.join(templateDir, `${slug}.md`),
          `---\ncategories: [${slug}]\n---\n`);
      }
      appendEvent(root, quest.id, {type: 'finding', kind: 'verifier-rejection',
        claim: 'first', evidence: 'subagent:v1'});
      runAmendCommand(root, {id: quest.id, kind: 'statement-strengthen',
        statement: 'The process contract holds. A.', evidence: 'subagent:v1'});
      runAmendCommand(root, {id: quest.id, kind: 'statement-strengthen',
        statement: 'The process contract holds. A. B.', evidence: 'subagent:v1'});
      // Both corrections are spent; a bar expansion is still admitted.
      t.match(runAmendCommand(root, {id: quest.id,
        kind: 'verification-bar-expansion', template: 'bar-a',
        evidence: 'subagent:v1'}), /1\/4\)/u, 'the monotone cap counts apart');
      for (const slug of ['bar-b', 'bar-c', 'bar-d']) {
        runAmendCommand(root, {id: quest.id,
          kind: 'verification-bar-expansion', template: slug,
          evidence: 'subagent:v1'});
      }
      t.throws(() => runAmendCommand(root, {id: quest.id,
        kind: 'verification-bar-expansion', template: 'bar-e',
        evidence: 'subagent:v1'}), /4 monotone amendment\(s\).*limit 4/su,
      'the fifth monotone amendment is refused');
      t.throws(() => runAmendCommand(root, {id: quest.id,
        kind: 'statement-strengthen',
        statement: 'The process contract holds. A. B. C.',
        evidence: 'subagent:v1'}), /2 amendment\(s\).*limit 2/su,
      'monotone amendments did not refund a correction');
      t.equal(questAmendments(readLog(root, quest.id)).length, 6);
      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });

  t.test('oracle-command-correction changes args only; doneWhen probe stays immutable',
    (t) => {
      const root = tmp();
      const quest = sealed(root);
      appendEvent(root, quest.id, {type: 'finding', kind: 'verifier-rejection',
        claim: 'oracle names an unscoped command', evidence: 'subagent:v1'});
      const correctedArgs = {scenario: 'amend-fixture', metric: 'priority',
        reportDir: path.join(root, 'reports'), consecutive: 5};
      runAmendCommand(root, {'id': quest.id, 'kind': 'oracle-command-correction',
        'done-when-args': JSON.stringify(correctedArgs),
        'evidence': 'subagent:v1'});
      const amended = loadQuest(root, quest.id);
      t.equal(amended.doneWhen.args.consecutive, 5);
      t.equal(amended.doneWhen.probe, 'scenario-harness', 'probe untouched');
      t.doesNotThrow(() => ensureSealedGoal(root, amended));
      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });

  t.test('applyAmendments is pure and ordered', (t) => {
    const base = {statement: 'S.', class: 'process',
      doneWhen: {probe: 'oracle', args: {file: 'a'}}};
    const out = applyAmendments(base, [
      {amendmentKind: 'statement-strengthen', statement: 'S. More.'},
      {amendmentKind: 'oracle-command-correction', doneWhenArgs: {file: 'b'}},
    ]);
    t.same(out.doneWhen, {probe: 'oracle', args: {file: 'b'}});
    t.equal(out.statement, 'S. More.');
    t.same(base.doneWhen.args, {file: 'a'}, 'input untouched');
    t.same(validateGoalpostsImmutable(
      {...base, statement: 'S. More.',
        doneWhen: {probe: 'oracle', args: {file: 'b'}}, frontiers: []},
      {sealed: {...base, frontierMetrics: [], authoringContractVersion: undefined}},
      [],
    ).length >= 1, true, 'unamended comparison still sees the drift');
    t.end();
  });
});
