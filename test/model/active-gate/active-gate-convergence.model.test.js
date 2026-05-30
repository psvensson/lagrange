import tap from 'tap';
import fc from 'fast-check';

import {
  AbstractGate,
  DEFAULT_NODES,
  ACTION_NAMES,
  greedyDriveToConvergence,
  detectStallWindows,
  quorum,
} from './model.js';
import {gateCommands, COMMAND_CLASSES} from './commands.js';

tap.test('model↔code binding holds on every reachable state', async (t) => {
  // For any sequence of actions (including unbounded re-entry and staleness),
  // the abstract convergence predicate must equal the production catch-up
  // fence's promotionAllowed, and the safety invariants must hold. The
  // assertions live inside the commands; fast-check surfaces any counterexample.
  fc.assert(
    fc.property(
      fc.commands(gateCommands(DEFAULT_NODES), {maxCommands: 60}),
      (cmds) => {
        const setup = () => {
          const gate = new AbstractGate(DEFAULT_NODES,
            {allowUnboundedReentry: true});
          const holder = {gate};
          return {model: holder, real: holder};
        };
        fc.modelRun(setup, cmds);
      },
    ),
    {numRuns: 300},
  );
  t.pass('no model↔code drift and no safety violation across 300 runs');
  t.end();
});

tap.test('safety invariants are never reachable-violated (explicit)', async (t) => {
  fc.assert(
    fc.property(
      fc.commands(gateCommands(DEFAULT_NODES), {maxCommands: 40}),
      (cmds) => {
        const gate = new AbstractGate(DEFAULT_NODES,
          {allowUnboundedReentry: true});
        const holder = {gate};
        fc.modelRun(() => ({model: holder, real: holder}), cmds);
        // After the whole run, the invariants must still hold.
        return gate.publishedSubsetCovered() && gate.coveredDisjointPending();
      },
    ),
    {numRuns: 200},
  );
  t.pass('PublishedSubsetCovered and CoveredDisjointPending preserved');
  t.end();
});

tap.test('STALL reproduction: unbounded re-entry can starve convergence', (t) => {
  // The current protocol (allowUnboundedReentry) admits a cycle where a
  // reconciled-but-unpublished node is bounced back to pending forever, so the
  // residual never reaches zero. This is the oscillation R14 gates after the
  // fact and TLA+ refutes formally.
  const gate = new AbstractGate(['n1', 'n2'], {allowUnboundedReentry: true});
  const trajectory = [gate.residual()];
  for (let i = 0; i < 12; i += 1) {
    // Reconcile then immediately defer n1 — a non-progressing 2-cycle.
    if (gate.canReconcileOwner('n1')) gate.reconcileOwner('n1');
    trajectory.push(gate.residual());
    if (gate.canDeferReentry('n1')) gate.deferReentry('n1');
    trajectory.push(gate.residual());
  }
  t.notOk(gate.convergedAbstract(), 'gate never converges under the cycle');
  const windows = detectStallWindows(trajectory, 4);
  t.ok(windows.length > 0, 'stall detector flags the non-progressing window');
  t.equal(gate.realPromotionAllowed(), false,
    'production fence also denies promotion in the stalled state');
  t.end();
});

tap.test('ROUTE liveness: bounded re-entry converges with no stall window', async (t) => {
  // The architecture route (allowUnboundedReentry=false) must always reach the
  // green gate from any random progress-only prefix, with a strictly
  // decreasing residual and no stall window — the executable analog of the
  // TLA+ liveness proof.
  fc.assert(
    fc.property(
      fc.commands(gateCommands(DEFAULT_NODES), {maxCommands: 30}),
      (cmds) => {
        const gate = new AbstractGate(DEFAULT_NODES,
          {allowUnboundedReentry: false});
        const holder = {gate};
        fc.modelRun(() => ({model: holder, real: holder}), cmds);
        const {converged, trajectory} = greedyDriveToConvergence(gate);
        if (!converged) return false;
        const windows = detectStallWindows(trajectory, 4);
        return windows.length === 0;
      },
    ),
    {numRuns: 300},
  );
  t.pass('every route-mode run reaches green with no stall window');
  t.end();
});

tap.test('greedy route driver reaches green from the initial state', (t) => {
  const gate = new AbstractGate(DEFAULT_NODES, {allowUnboundedReentry: false});
  const {converged, trajectory} = greedyDriveToConvergence(gate);
  t.ok(converged, 'converged');
  t.equal(gate.residual(), 0, 'residual reduced to zero');
  t.equal(gate.realPromotionAllowed(), true, 'production fence allows promotion');
  t.ok(trajectory[trajectory.length - 1] === 0, 'trajectory ends at zero');
  t.end();
});

tap.test('quorum matches the production majority rule', (t) => {
  t.equal(quorum(0), 0);
  t.equal(quorum(1), 1);
  t.equal(quorum(2), 2);
  t.equal(quorum(3), 2);
  t.equal(quorum(5), 3);
  t.end();
});

tap.test('command set matches the manifest action names', (t) => {
  const classNames = Object.keys(COMMAND_CLASSES).sort();
  t.same(classNames, [...ACTION_NAMES].sort(),
    'every manifest action has exactly one command class');
  t.end();
});
