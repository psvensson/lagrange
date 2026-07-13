import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

tap.test('LLM steering canon has one owner per concern', (t) => {
  const agents = read('AGENTS.md');
  const core = read('docs/steering/llm/core.md');
  const boot = read('docs/steering/llm/boot.md');
  const lifecycle = read('docs/steering/workflow-guidelines/lifecycle.md');
  const canon = read('docs/steering/workflow-guidelines/solver-quests.md');
  const runbook = read('docs/solver-runbook.md');

  t.notMatch(agents, /--executor agent/u,
    'AGENTS owns routing/load order, not an executable boot sequence');
  t.match(agents, /complete selective surfaces/u);

  for (const command of ['doctor', 'lint', 'next', 'checkpoint', 'handoff']) {
    t.match(boot, new RegExp(`solve\\.js ${command}`, 'u'),
      `boot owns the ${command} first-action command`);
  }
  t.notMatch(core, /priority-ranked SUBSET|Quest Shape Picker|\| Gate \|/u,
    'core contains invariants and unambiguous terms, not capped-pack or phantom-shape prose');

  t.match(lifecycle, /status: reference-only/u);
  t.notMatch(lifecycle, /## First Commands/u,
    'reference-only lifecycle does not redeclare boot');
  t.match(runbook, /example-oriented operator aid/u);
  t.notMatch(runbook, /--commit-every|Known System-Theory Hypothesis/u,
    'runbook contains current examples, not retired behavior or live Quest snapshots');
  t.notMatch(canon, /Known System-Theory Hypothesis/u);
  t.match(canon, /docs\/case-studies\/rolling-restart-system-theory\.md/u,
    'Quest-specific case study is outside steering canon');
  t.end();
});
