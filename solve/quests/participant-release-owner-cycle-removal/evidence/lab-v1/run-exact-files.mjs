import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {labTestCommit, labTestDeps, runLabTest} from '../../scripts/lab/probe.js';
import {planClassifiedTestFiles, estimateFileCosts, lastResultsRoots} from '../../scripts/run-classified-test-files.js';
const [sha, host, tag, ...files] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[a-z0-9-]+$/.test(tag ?? '') || files.length === 0) throw new Error('Expected exact SHA, host, tag and files');
const root = process.cwd();
const out = path.join(root, 'test-output/seed-release-diagnostics-20261013', tag);
fs.mkdirSync(out, {recursive: false});
const env = {...process.env, LAGRANGE_LAB_AGENT: 'codex:seed-release-diagnostics-20261013'};
const commit = labTestCommit({root, sha});
const plan = planClassifiedTestFiles(commit.gitRoot, files);
const costs = estimateFileCosts(plan, lastResultsRoots(root));
const deps = labTestDeps({root, env});
const runRemote = deps.runRemote;
const discover = deps.discover;
const raw = [];
deps.discover = async (head) => { const result = await discover(head); fs.writeFileSync(path.join(out, 'fleet.json'), JSON.stringify(result, null, 2) + '\n'); return result; };
deps.runRemote = (shard, options) => {
  const run = runRemote(shard, options);
  raw.push(run.done.then((result) => {
    fs.writeFileSync(path.join(out, shard.machine.name + '.raw.log'), result.log ?? '');
    fs.writeFileSync(path.join(out, shard.machine.name + '.raw.err'), result.errors ?? '');
    fs.writeFileSync(path.join(out, shard.machine.name + '.status.json'), JSON.stringify({status: result.status, reason: result.reason ?? null}, null, 2) + '\n');
  }));
  return run;
};
fs.writeFileSync(path.join(out, 'input.json'), JSON.stringify({sha, tree: execFileSync('git', ['rev-parse', sha + '^{tree}'], {encoding:'utf8'}).trim(), host, files, plan, costs, startedAt: new Date().toISOString()}, null, 2) + '\n');
const log = path.join(out, 'lab.log');
try {
  const status = await runLabTest({plan, costs, commit, on: host, root, env, write: line => {fs.appendFileSync(log, line + '\n'); if (line.startsWith('lab test:') || line.startsWith('Test files:')) process.stdout.write(line + '\n');}}, deps);
  await Promise.all(raw);
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({status, finishedAt: new Date().toISOString()}, null, 2) + '\n');
  process.exitCode = status;
} catch (error) {
  await Promise.allSettled(raw);
  fs.writeFileSync(path.join(out, 'placement-error.txt'), String(error.stack ?? error) + '\n');
  throw error;
} finally { commit.release(); }
