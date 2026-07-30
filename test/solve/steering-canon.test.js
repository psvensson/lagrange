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
  const runbook = read('docs/development/solver-runbook.md');
  const ignore = read('.gitignore');
  const toolDescriptions = read('docs/steering/tool-descriptions.json');

  t.notMatch(agents, /--executor agent/u,
    'AGENTS owns routing/load order, not an executable boot sequence');
  t.match(agents, /complete selective surfaces/u);

  for (const command of ['doctor', 'start', 'continue', 'land', 'checkpoint', 'next']) {
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
  t.match(agents, /Optional early-stage planning.*bounded decision memos/su,
    'entry routing makes epics optional rather than a mandatory waypoint');
  t.match(canon, /stop before a second evidence-bearing intervention/u,
    'direct work has a mechanically stated progressive-promotion boundary');
  t.match(boot, /failed measurement[\s\S]*before a second evidence-bearing intervention/u,
    'the executable first-read repeats the promotion stop signal');
  t.match(ignore, /^\/solve\/OVERVIEW\.generated\.md$/mu,
    'the self-referential overview is a local projection, not durable state');
  t.match(ignore, /^\/solve\/report\/\*\.md$/mu,
    'ordinary Quest reports are ignored projections');
  t.match(ignore, /^!\/solve\/report\/rolling-restart\.md$/mu,
    'unmatched report evidence remains retainable');
  t.match(toolDescriptions, /ignored local work-overview projection/u,
    'the operator catalog does not promise a durable overview');
  t.end();
});

tap.test('LLM steering surfaces agree on generated-pack and operator contracts',
  (t) => {
    const system = read('docs/steering/system-guidelines.md');
    const architecture = read('docs/steering/architecture.md');
    const findings = read('docs/steering/findings/README.md');
    const doctrine = [
      'INDEX.md',
      'decision-experiments.md',
      'owner-boundaries.md',
      'single-path.md',
      'state-encoding.md',
    ].map((file) => read(`docs/steering/doctrine/${file}`)).join('\n');
    const core = read('docs/steering/llm/core.md');
    const boot = read('docs/steering/llm/boot.md');
    const closure = read('docs/steering/workflow-guidelines/closure.md');
    const roadmap = read('docs/steering/roadmap.md');
    const operational = read('docs/steering/operational-ground-truth.md');
    const subagents = read('docs/steering/workflow-guidelines/subagents.md');
    const templates = read('docs/steering/verification-templates/INDEX.md');
    const memory = read('docs/steering/memory-boundary.md');
    const fixtures = read('docs/steering/testing-guidelines/fixtures.md');
    const solverCanon =
      read('docs/steering/workflow-guidelines/solver-quests.md');
    const config = JSON.parse(read('docs/steering/llm-pack.config.json'));

    for (const source of [system, architecture, findings, doctrine]) {
      t.notMatch(
        source,
        /maxRules|below (?:the )?architecture pack cap|priority-ranked subset/u,
        'canonical sources do not describe the retired capped-pack model',
      );
    }
    t.match(boot, /report --id <id>.*optional human views/su);
    t.match(closure, /optional human-readable\s+projection/u);
    t.match(roadmap, /Solver terminal state and its\s+evidence/u);
    t.notMatch(closure, /regenerate the report/u);

    t.match(operational, /mechanistic.*is not statistical and has no live/su);
    t.notMatch(operational, /Mechanistic.*does-it-engage.*N=3/u);

    const memorySource = config.sources.find((entry) =>
      entry.file === 'memory-boundary.md');
    t.equal(memorySource.role, 'packed');
    t.match(core, /configured packed governance\s+source/u);

    t.match(subagents, /MUST\s+include every attack-surface checklist/u);
    t.match(templates, /prompt MUST include that template's checklist/u);
    t.match(memory, /MUST NOT authenticate, manufacture, or elevate Level-1/u);
    t.match(solverCanon, /not a runtime flag or Quest-local override/u);
    t.match(fixtures, /does not require the complete suite during each iteration/u);
    t.end();
  });
