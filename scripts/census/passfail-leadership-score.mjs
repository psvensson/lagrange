#!/usr/bin/env node
// PASS/FAIL differential census for the rolling-restart run4 line.
// Corpus-only: reads terminal playback snapshots already on disk. NO new gates.
// Features (pre-committed in the quest doneWhenSealed):
//   F1 rejoiner-node identity      = node holding the most partition leaderships at the terminal snapshot
//   F2 leadership co-location count = max # of the 34 partition leaderships concentrated on a single node
//   F3 drain-deadline elapse       = terminal snapshot still shows undrained replicaOperations (source removal not settled)
// Separation margin (pre-committed): a feature separates only if a single split yields balanced accuracy >= 0.80.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'test-output/reports';
const FEATS = JSON.parse(fs.readFileSync(path.join(ROOT, 'passfail-census-features.json'), 'utf8'));

function terminalSnapshot(file) {
  // stream last parseable snapshot line that carries partitions
  const runKey = path.basename(file).replace('.report.json', '');
  const snap = path.join(ROOT, '.playback', runKey, 'rolling-restart', 'snapshots.ndjson');
  if (!fs.existsSync(snap)) return null;
  const lines = fs.readFileSync(snap, 'utf8').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l) continue;
    try {
      const o = JSON.parse(l);
      if (Array.isArray(o.partitions) && o.partitions.length) return o;
    } catch {/* skip */}
  }
  return null;
}

const rows = [];
for (const r of FEATS) {
  if (r.verdict !== 'PASS' && r.verdict !== 'FAIL') continue;
  const t = terminalSnapshot(r.file);
  if (!t) {
    rows.push({file: r.file, verdict: r.verdict, observable: false}); continue;
  }
  const leaderCounts = new Map();
  for (const p of t.partitions) {
    const n = p.leader_node_id;
    if (n) leaderCounts.set(n, (leaderCounts.get(n) || 0) + 1);
  }
  let f1 = null; let f2 = 0;
  for (const [n, c] of leaderCounts) {
    if (c > f2) {
      f2 = c; f1 = n;
    }
  }
  const totalPartitions = t.partitions.length;
  const drainRemaining = Array.isArray(t.replicaOperations) ? t.replicaOperations.length : 0;
  rows.push({
    file: r.file, verdict: r.verdict, observable: true,
    F1_rejoiner: f1, F2_maxLeaderConcentration: f2, totalPartitions,
    F3_drainRemaining: drainRemaining, F3_drainElapsed: drainRemaining > 0,
  });
}

const obs = rows.filter((r) => r.observable);
const pass = obs.filter((r) => r.verdict === 'PASS');
const fail = obs.filter((r) => r.verdict === 'FAIL');

// balanced accuracy for "predict FAIL when feature>=t" over threshold sweep (positive class = FAIL)
function bestThresholdBA(vals) {
  const cand = [...new Set(obs.map(vals))].sort((a, b) => a - b);
  let best = {t: null, ba: 0, tpr: 0, tnr: 0};
  for (const t of cand) {
    const tp = fail.filter((r) => vals(r) >= t).length;
    const fn = fail.length - tp;
    const fp = pass.filter((r) => vals(r) >= t).length;
    const tn = pass.length - fp;
    const tpr = tp / (tp + fn || 1); const tnr = tn / (tn + fp || 1);
    const ba = 0.5 * (tpr + tnr);
    if (ba > best.ba) best = {t, ba, tpr, tnr};
  }
  return best;
}
function boolBA(pred) {
  const tp = fail.filter(pred).length; const fn = fail.length - tp;
  const fp = pass.filter(pred).length; const tn = pass.length - fp;
  const tpr = tp / (tp + fn || 1); const tnr = tn / (tn + fp || 1);
  return {ba: 0.5 * (tpr + tnr), tpr, tnr};
}
function dist(arr, vals) {
  const xs = arr.map(vals).sort((a, b) => a - b);
  const q = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  return {n: xs.length, min: xs[0], p25: q(0.25), median: q(0.5),
    p75: q(0.75), max: xs[xs.length - 1], mean: +mean.toFixed(2)};
}

const f2Pass = dist(pass, (r) => r.F2_maxLeaderConcentration);
const f2Fail = dist(fail, (r) => r.F2_maxLeaderConcentration);
const f2Best = bestThresholdBA((r) => r.F2_maxLeaderConcentration);
const f3 = boolBA((r) => r.F3_drainElapsed);
// F1 identity: best single-node "predict FAIL if rejoiner===node"
const nodeIds = [...new Set(obs.map((r) => r.F1_rejoiner).filter(Boolean))];
let f1Best = {node: null, ba: 0};
for (const n of nodeIds) {
  const b = boolBA((r) => r.F1_rejoiner === n);
  if (b.ba > f1Best.ba) {
    f1Best = {node: n, ba: +b.ba.toFixed(3),
      tpr: +b.tpr.toFixed(3), tnr: +b.tnr.toFixed(3)};
  }
}

const MARGIN = 0.80;
const results = {
  corpus: {measured: obs.length, pass: pass.length, fail: fail.length,
    unobservable: rows.length - obs.length},
  F2_leadershipConcentration: {passDist: f2Pass, failDist: f2Fail,
    bestSplit: {threshold: f2Best.t, balancedAccuracy: +f2Best.ba.toFixed(3),
      tpr: +f2Best.tpr.toFixed(3), tnr: +f2Best.tnr.toFixed(3)},
    separates: f2Best.ba >= MARGIN},
  F3_drainElapsed: {balancedAccuracy: +f3.ba.toFixed(3),
    tpr: +f3.tpr.toFixed(3), tnr: +f3.tnr.toFixed(3),
    separates: f3.ba >= MARGIN,
    note: 'terminal-snapshot undrained replicaOperations as proxy for drain-not-settled'},
  F1_rejoinerIdentity: {bestNode: f1Best.node, balancedAccuracy: f1Best.ba,
    separates: (f1Best.ba || 0) >= MARGIN},
  margin: MARGIN,
};
const anySeparates = results.F2_leadershipConcentration.separates ||
  results.F3_drainElapsed.separates || results.F1_rejoinerIdentity.separates;
results.verdict = anySeparates ? 'separator-found' : 'no-separator';
console.log(JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(ROOT, 'passfail-census-scores.json'), JSON.stringify({results, rows: obs}, null, 2));
