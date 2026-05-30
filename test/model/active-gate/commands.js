// Phase A — fast-check model-based commands for the active-gate protocol.
// Each command mirrors exactly one action from models/active-gate/
// action-manifest.json. After every applied command we assert the safety
// invariants AND the model↔code binding (abstract convergence == the real
// production catch-up fence's promotionAllowed).

import assert from 'node:assert';
import fc from 'fast-check';

function assertInvariants(gate) {
  assert.ok(
    gate.publishedSubsetCovered(),
    `safety PublishedSubsetCovered violated: ${JSON.stringify(gate.snapshot())}`,
  );
  assert.ok(
    gate.coveredDisjointPending(),
    `safety CoveredDisjointPending violated: ${JSON.stringify(gate.snapshot())}`,
  );
  assert.strictEqual(
    gate.convergedAbstract(),
    gate.realPromotionAllowed(),
    'model↔code drift: abstract convergence disagrees with the production ' +
    `catch-up fence promotionAllowed for ${JSON.stringify(gate.snapshot())}`,
  );
}

class GateCommand {
  constructor(name, node) {
    this.name = name;
    this.node = node;
  }

  toString() {
    return this.node ? `${this.name}(${this.node})` : this.name;
  }
}

class ReconcileOwner extends GateCommand {
  constructor(node) {super('ReconcileOwner', node);}
  check({gate}) {return gate.canReconcileOwner(this.node);}
  run({gate}) {gate.reconcileOwner(this.node); assertInvariants(gate);}
}

class AdvanceSnapshotCoverage extends GateCommand {
  constructor(node) {super('AdvanceSnapshotCoverage', node);}
  check({gate}) {return gate.canAdvanceSnapshotCoverage(this.node);}
  run({gate}) {gate.advanceSnapshotCoverage(this.node); assertInvariants(gate);}
}

class PublishNode extends GateCommand {
  constructor(node) {super('PublishNode', node);}
  check({gate}) {return gate.canPublishNode(this.node);}
  run({gate}) {gate.publishNode(this.node); assertInvariants(gate);}
}

class RefreshSnapshot extends GateCommand {
  constructor() {super('RefreshSnapshot');}
  check({gate}) {return gate.canRefreshSnapshot();}
  run({gate}) {gate.refreshSnapshot(); assertInvariants(gate);}
}

class DeferReentry extends GateCommand {
  constructor(node) {super('DeferReentry', node);}
  check({gate}) {return gate.canDeferReentry(this.node);}
  run({gate}) {gate.deferReentry(this.node); assertInvariants(gate);}
}

class StaleEvent extends GateCommand {
  constructor() {super('StaleEvent');}
  check({gate}) {return gate.canStaleEvent();}
  run({gate}) {gate.staleEvent(); assertInvariants(gate);}
}

// Returns the fast-check command arbitraries for the given node set. The
// regression commands (DeferReentry, StaleEvent) are only meaningful when the
// gate allows unbounded re-entry; they self-disable via their guards otherwise.
export function gateCommands(nodes) {
  const node = fc.constantFrom(...nodes);
  return [
    node.map((n) => new ReconcileOwner(n)),
    node.map((n) => new AdvanceSnapshotCoverage(n)),
    node.map((n) => new PublishNode(n)),
    fc.constant(new RefreshSnapshot()),
    node.map((n) => new DeferReentry(n)),
    fc.constant(new StaleEvent()),
  ];
}

export const COMMAND_CLASSES = Object.freeze({
  ReconcileOwner,
  AdvanceSnapshotCoverage,
  PublishNode,
  RefreshSnapshot,
  DeferReentry,
  StaleEvent,
});
