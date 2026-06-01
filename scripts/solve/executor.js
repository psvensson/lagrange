// Executors — perform one attempt on a frontier at a given rung.
//
// All executors share one interface:
//   run(task, ctx) -> { changeRef, summary }
// where `task` = { quest, frontierDef, frontierState, rung, rungIndex }. The executor
// NEVER reports success; the loop re-measures via the probe afterwards, so truth
// always comes from artifacts, not from the executor.
//
// P0 ships `dry` (deterministic, for tests + the loop walking skeleton). `manual` and
// the generic model/CLI-agnostic `agent` executor arrive in P2/P4.

import fs from 'node:fs';

// The dry executor simulates work by stepping a file-backed oracle: each attempt
// reduces the oracle metric by `step` until it reaches the target. This produces a
// real on-disk evidence artifact and a real changeRef file, so honesty checks pass
// and the loop's progress/escalation/park paths are all exercised deterministically.
export function makeDryExecutor(options = {}) {
  const step = Number(options.step) || 1;
  const stallFrontiers = new Set(options.stallFrontiers || []);
  return {
    name: 'dry',
    run(task) {
      const oracleFile = task.frontierDef.metric?.args?.file;
      const changeRef = writeChangeRef(options.changeDir, task);
      if (!oracleFile || !fs.existsSync(oracleFile)) {
        return {changeRef, summary: 'no oracle; no-op'};
      }
      if (stallFrontiers.has(task.frontierDef.id)) {
        return {changeRef, summary: 'stalled frontier; metric unchanged'};
      }
      const data = JSON.parse(fs.readFileSync(oracleFile, 'utf8'));
      if (typeof data.metric === 'number') {
        const target = typeof data.target === 'number' ? data.target : 0;
        data.metric = Math.max(target, data.metric - step);
        fs.writeFileSync(oracleFile, JSON.stringify(data));
      }
      return {changeRef, summary: `dry step -${step}`};
    },
  };
}

function writeChangeRef(changeDir, task) {
  if (!changeDir) return `diff:dry-${task.frontierDef.id}-${task.rungIndex}`;
  fs.mkdirSync(changeDir, {recursive: true});
  const file = `${changeDir}/${task.frontierDef.id}-${Date.now()}.diff`;
  fs.writeFileSync(file, [
    `diff --git a/src/${task.frontierDef.id}.js b/src/${task.frontierDef.id}.js`,
    `--- a/src/${task.frontierDef.id}.js`,
    `+++ b/src/${task.frontierDef.id}.js`,
    '@@ -1 +1 @@',
    `-dry before ${task.frontierDef.id}`,
    `+dry ${task.rung} ${task.frontierDef.id}`,
  ].join('\n'));
  return `diff:${file}`;
}
