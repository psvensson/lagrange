// Local, EvoClaw-inspired scorer for the standing-invariant tier.
//
// NOT the EvoClaw / SWE-EVO benchmark itself (those are external academic harnesses
// that score frontier *agents* on a milestone DAG and cannot run in-repo). This is
// the same EMPIRICAL QUESTION applied locally to our own closure ledger: of the
// known, repro-backed regressions (the "milestone checkpoints"), how many are GUARDED
// by a standing invariant (coverage), and how many of those currently hold
// (coherence). It answers "is the architecture's regression surface actually watched,
// and is it holding right now?" without any external dependency.

import fs from 'node:fs';
import path from 'node:path';

import {loadInvariantRegistry} from '../check-invariants.js';
import {
  liveInvariants, evaluateAndRecord, deriveStatus, isStandingInvariantsEnabled, STATUS,
} from './invariant-liveness.js';

const CL_RE = /CL-\d+/i;

// The set of closure-ledger CLs that have a deterministic repro (registry-mapped or
// the convention file) — the verifiable "milestone checkpoints".
export function reproBackedCLs(root) {
  const set = new Set();
  const registryPath = path.join(root, 'test/closure/registry.json');
  if (fs.existsSync(registryPath)) {
    const repros = JSON.parse(fs.readFileSync(registryPath, 'utf8')).repros || {};
    for (const id of Object.keys(repros)) set.add(id.toUpperCase());
  }
  const dir = path.join(root, 'test/closure');
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      const match = file.match(/^(CL-\d+)\.repro\.test\.js$/i);
      if (match) set.add(match[1].toUpperCase());
    }
  }
  return set;
}

// Which CL (if any) a live invariant guards — parsed from its evidence ref/test.
export function invariantGuardedCL(invariant) {
  const evidence = invariant.liveEvidence?.evidence || {};
  const match = `${evidence.ref || ''} ${evidence.test || ''}`.match(CL_RE);
  return match ? match[0].toUpperCase() : null;
}

// Score the standing tier. With evaluate=true, re-verifies each invariant first;
// otherwise scores the folded status. Inert (enabled:false) when the flag is off.
export function scoreInvariants(root, {registry: registryPath, evaluate = false} = {},
  env = process.env) {
  if (!isStandingInvariantsEnabled(env)) {
    return {enabled: false};
  }
  const {registry} = loadInvariantRegistry(registryPath);
  const live = liveInvariants(registry);
  const guarded = new Set();
  const statuses = live.map((invariant) => {
    if (evaluate) {
      try {
        evaluateAndRecord(root, invariant, env);
      } catch {
        // a single invariant's evaluation failure must not abort scoring
      }
    }
    const cl = invariantGuardedCL(invariant);
    if (cl) guarded.add(cl);
    return deriveStatus(root, invariant);
  });
  const held = statuses.filter((s) => s.status === STATUS.HELD).length;
  const breached = statuses.filter((s) => s.status === STATUS.BREACHED).length;
  const unguarded = statuses.filter((s) => s.status === STATUS.UNGUARDED).length;
  const reproCLs = reproBackedCLs(root);
  const guardedRepro = [...guarded].filter((cl) => reproCLs.has(cl));
  const unguardedRepro = [...reproCLs].filter((cl) => !guarded.has(cl)).sort();
  return {
    enabled: true,
    liveInvariants: live.length,
    held,
    breached,
    unguarded,
    // fraction of live invariants currently holding
    coherence: live.length ? held / live.length : null,
    reproBackedCLs: reproCLs.size,
    guardedReproBackedCLs: guardedRepro.length,
    // fraction of the known repro-backed regression surface that a standing invariant guards
    coverage: reproCLs.size ? guardedRepro.length / reproCLs.size : null,
    // the worklist: repro-backed CLs not yet guarded by any standing invariant
    unguardedReproBackedCLs: unguardedRepro,
    statuses: statuses.map((s) => ({id: s.id, status: s.status})),
  };
}
