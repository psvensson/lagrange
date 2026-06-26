// invariantHeld probe — answers "is this architecture invariant currently HELD?"
// by folding the Solver event log (Tier-2 live-evidence status). Used as the
// doneWhen of an auto-spawned restoration Quest: the Quest closes exactly when a
// fresh re-evaluation has recorded the invariant back to HELD (Requirement 5.3 —
// the Quest does not set HELD; re-evaluation does).

import {deriveStatus, STATUS} from '../invariant-status.js';
import {loadInvariantRegistry} from '../../check-invariants.js';

export const invariantHeldProbe = {
  name: 'invariantHeld',
  measure(args = {}, ctx = {}) {
    const id = args.id;
    const root = ctx.root || process.cwd();
    if (!id) {
      return {metric: null, done: false, evidence: 'invariantHeld: --id required'};
    }
    const {registry} = loadInvariantRegistry(args.registry);
    const known = (registry?.invariants || []).some((entry) => entry && entry.id === id);
    if (!known) {
      return {metric: null, done: false, evidence: `invariant ${id} not in registry`};
    }
    const status = deriveStatus(root, {id});
    return {
      metric: status.status === STATUS.HELD ? 0 : 1,
      done: status.status === STATUS.HELD,
      evidence: `invariant ${id} is ${status.status}`,
      detail: status,
    };
  },
};
