// Oracle probe — a deterministic, file-backed metric source used by the `dry`
// executor and by tests. It lets the whole control loop (terminals, escalation,
// parking) be exercised without a real harness or a real coding agent.
//
// The oracle reads a JSON file `{ "metric": <n>, "done": <bool> }`. The dry executor
// writes/decrements this file to simulate progress, so the probe still answers from
// a real on-disk artifact and the honesty checks remain meaningful.

import fs from 'node:fs';

export const oracleProbe = {
  name: 'oracle',
  measure(args) {
    const file = args.file;
    if (!file || !fs.existsSync(file)) {
      return {metric: null, done: false, evidence: file || null};
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const metric = typeof data.metric === 'number' ? data.metric : null;
    const done = data.done === true ||
      (typeof data.target === 'number' && metric !== null && metric <= data.target);
    return {
      metric,
      done,
      evidence: file,
      // A real harness reports invalidSample when a run produced no trustworthy
      // metric (or when no run exists yet to baseline against). The oracle exposes
      // the same signal so the non-measuring and baseline-absent branches of the
      // control loop stay exercisable without a live harness.
      invalidSample: data.invalidSample === true,
      classification: data.classification || null,
      detail: data,
    };
  },
};
