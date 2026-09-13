// The script-reachability probe (`push-gate-unused-files.js
// --unreachable-scripts`): a script is reachable when a surface that runs
// scripts - package.json, a workflow, a hook, a gate manifest, the image,
// the examples, the solver, an open quest or epic probe - reaches it through
// imports and literal mentions; everything else under scripts/ is counted.

import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const PROBE = fileURLToPath(new URL(
  '../../scripts/checks/push-gate-unused-files.js', import.meta.url));
const UNREACHABLE_FLAG = '--unreachable-scripts';
const LIST_FLAG = '--list';

function write(root, relativePath, content) {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), {recursive: true});
  fs.writeFileSync(path.join(root, relativePath), content);
}

// A tree shaped like the repository's runner surfaces, with one script per
// kind of root and a few nothing runs.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'script-reachability-'));
  execFileSync('git', ['init', '--quiet'], {cwd: root});
  write(root, 'package.json',
    '{"scripts":{"check":"node scripts/from-package.js"}}\n');
  write(root, 'scripts/from-package.js',
    'import \'./imported-by-package.js\';\nnew URL(\'./baseline.json\', import.meta.url);\n');
  write(root, 'scripts/imported-by-package.js', 'export const x = 1;\n');
  write(root, 'scripts/baseline.json', '{}\n');
  write(root, '.github/workflows/ci.yml', 'run: node scripts/from-workflow.js\n');
  write(root, 'scripts/from-workflow.js',
    'spawn(\'node\', [\'scripts/spawned-by-workflow.js\']);\n');
  write(root, 'scripts/spawned-by-workflow.js', '');
  write(root, '.githooks/pre-push', 'node scripts/from-hook.sh\n');
  write(root, 'scripts/from-hook.sh', '');
  write(root, 'test/manifests/gate.json', '{"command":"node scripts/from-manifest.js"}\n');
  write(root, 'scripts/from-manifest.js', '');
  write(root, 'Dockerfile', 'COPY scripts/from-image.js /app/\n');
  write(root, 'scripts/from-image.js', '');
  write(root, 'examples/demo/README.md', 'run `node scripts/from-example.js`\n');
  write(root, 'scripts/from-example.js', '');
  write(root, 'scripts/solve.js', 'import \'./solve/step.js\';\n');
  write(root, 'scripts/solve/step.js', '');
  write(root, 'solve/quests/open/quest.json',
    '{"doneWhen":{"args":{"command":"node scripts/open-quest-probe.js"}}}\n');
  write(root, 'solve/quests/open/log.ndjson', '{"type":"attempt"}\n');
  write(root, 'scripts/open-quest-probe.js', '');
  write(root, 'solve/quests/closed/quest.json',
    '{"doneWhen":{"args":{"command":"node scripts/closed-quest-probe.js"}}}\n');
  write(root, 'solve/quests/closed/log.ndjson', '{"type":"terminal","status":"solved"}\n');
  write(root, 'scripts/closed-quest-probe.js', '');
  write(root, 'solve/epics/open.md', '---\nstatus: open\n---\nprobe: node scripts/open-epic-probe.js\n');
  write(root, 'scripts/open-epic-probe.js', '');
  write(root, 'solve/epics/done.md', '---\nstatus: done\n---\nprobe: node scripts/done-epic-probe.js\n');
  write(root, 'scripts/done-epic-probe.js', '');
  write(root, 'docs/guide.md', 'see scripts/only-in-docs.js\n');
  write(root, 'scripts/only-in-docs.js', '');
  write(root, 'scripts/untracked.js', '');
  execFileSync('git', ['add', '-A'], {cwd: root});
  execFileSync('git', ['rm', '--cached', '--quiet', 'scripts/untracked.js'], {cwd: root});
  return root;
}

// The probe exits 1 while anything is unreachable; the count is its last line.
function probe(root, ...flags) {
  const run = spawnSync('node', [PROBE, UNREACHABLE_FLAG, ...flags],
    {cwd: root, encoding: 'utf8'});
  assert.equal(run.stderr, '', 'the probe reports on stdout only');
  const lines = run.stdout.trim().split('\n');
  const count = Number(lines[lines.length - 1]);
  assert.equal(run.status, count === 0 ? 0 : 1, 'exit status follows the count');
  return {count, listed: lines.slice(0, -1)};
}

test('every runner surface reaches its script; closed records and prose reach nothing', () => {
  const root = fixture();
  const {count, listed} = probe(root, LIST_FLAG);
  assert.deepEqual(listed, [
    'scripts/closed-quest-probe.js',
    'scripts/done-epic-probe.js',
    'scripts/only-in-docs.js',
  ], 'a closed quest, a done epic and a docs mention keep nothing alive');
  assert.equal(count, listed.length, 'the last line is the count the quest probe reads');
  assert.equal(probe(root).listed.length, 0, 'without --list only the count prints');
});

test('deleting the unreachable scripts brings the count to zero', () => {
  const root = fixture();
  for (const file of probe(root, LIST_FLAG).listed) {
    execFileSync('git', ['rm', '--force', '--quiet', file], {cwd: root});
  }
  assert.equal(probe(root).count, 0);
});
