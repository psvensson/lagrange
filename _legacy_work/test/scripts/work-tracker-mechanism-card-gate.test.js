import tap from 'tap';
import { validateMechanismCardGate } from '../../scripts/work-tracker.js';

tap.test('validateMechanismCardGate unit tests', async (t) => {
  t.test('returns no errors for non-theory-loop packages', (t) => {
    const content = '# Title\nSome content';
    const metadata = {
      status: 'active',
      lane: 'read-review-doc-only',
      boundary: 'generic_boundary'
    };
    const errors = validateMechanismCardGate(content, metadata, 'work/packages/active-test.md');
    t.equal(errors.length, 0, 'No errors for doc-only lane');
    t.end();
  });

  t.test('returns error for theory-loop lanes when mechanism card is completely missing', (t) => {
    const content = '# Title\nSome content';
    const metadata = {
      status: 'active',
      lane: 'experiment',
      boundary: 'generic_boundary'
    };
    const errors = validateMechanismCardGate(content, metadata, 'work/packages/active-test.md');
    t.ok(errors.length > 0, 'Should error when missing card');
    t.match(errors[0], 'requires mechanism-card readiness', 'Error message matches expected');
    t.end();
  });

  t.test('returns error for theory-loop tooling lightweight-maintenance package when mechanism card is missing', (t) => {
    const content = '# Title\nSome content';
    const metadata = {
      status: 'active',
      lane: 'lightweight-maintenance',
      boundary: 'theory_loop_calibration'
    };
    const errors = validateMechanismCardGate(content, metadata, 'work/packages/active-theory-loop-something.md');
    t.ok(errors.length > 0, 'Should error for theory-loop tooling maintenance');
    t.match(errors[0], 'requires mechanism-card readiness');
    t.end();
  });

  t.test('validates metadata mechanismCard object fields', (t) => {
    const content = '# Title\nSome content';
    const metadata = {
      status: 'active',
      lane: 'experiment',
      boundary: 'generic_boundary',
      mechanismCard: {
        failureMechanism: 'transition_gap',
        stableFacts: 'some stable facts',
        changedFacts: 'some changed facts',
        // rejectedAlternatives is missing
        ownerWhoDecides: 'owner',
        currentAction: 'action',
        missingTransitionOrObservation: 'transition',
        smallestFalsifyingProbe: 'probe',
        expectedMovement: '<placeholder>', // placeholder check
        negativeResultMeans: 'rollback',
        escalationRule: 'rule'
      }
    };

    const errors = validateMechanismCardGate(content, metadata, 'work/packages/active-test.md');
    t.ok(errors.length >= 2, 'Should flag missing field and placeholder field');
    t.ok(errors.some(e => e.includes('missing required field rejectedAlternatives')));
    t.ok(errors.some(e => e.includes('expectedMovement must be a concrete value')));
    t.end();
  });

  t.test('validates markdown ## Mechanism Card section fields', (t) => {
    const content = `
# Title

## Mechanism Card
- Failure Mechanism: <placeholder>
- Stable Facts: Stable facts here
- Changed Facts: Changed facts here
- Rejected Alternatives: Alternatives
- Owner who decides: owner
- Current Action: action
- Missing Transition Or Observation: transition
- Smallest falsifying probe: probe
- Expected movement: movement
- Negative result means: rollback
- Escalation rule: rule
`;
    const metadata = {
      status: 'active',
      lane: 'experiment',
      boundary: 'generic_boundary'
    };

    const errors = validateMechanismCardGate(content, metadata, 'work/packages/active-test.md');
    t.equal(errors.length, 1, 'One error for active placeholder');
    t.match(errors[0], 'failureMechanism must be a concrete value');
    t.end();
  });

  t.test('validates markdown ## Mechanism Card section fields in todo status with placeholder allowed', (t) => {
    const content = `
# Title

## Mechanism Card
- Failure Mechanism: <placeholder>
- Stable Facts: Stable facts here
- Changed Facts: Changed facts here
- Rejected Alternatives: Alternatives
- Owner who decides: owner
- Current Action: action
- Missing Transition Or Observation: transition
- Smallest falsifying probe: probe
- Expected movement: movement
- Negative result means: rollback
- Escalation rule: rule
`;
    const metadata = {
      status: 'todo',
      lane: 'experiment',
      boundary: 'generic_boundary'
    };

    const errors = validateMechanismCardGate(content, metadata, 'work/packages/active-test.md', { status: 'todo' });
    t.equal(errors.length, 0, 'No errors in todo status because placeholder is allowed');
    t.end();
  });

  t.test('passes validation with a complete metadata mechanismCard', (t) => {
    const content = '# Title\nSome content';
    const metadata = {
      status: 'active',
      lane: 'experiment',
      boundary: 'generic_boundary',
      mechanismCard: {
        failureMechanism: 'transition_gap',
        stableFacts: 'stable',
        changedFacts: 'changed',
        rejectedAlternatives: 'rejected',
        ownerWhoDecides: 'owner',
        currentAction: 'action',
        missingTransitionOrObservation: 'transition',
        smallestFalsifyingProbe: 'probe',
        expectedMovement: 'movement',
        negativeResultMeans: 'means',
        escalationRule: 'rule'
      }
    };

    const errors = validateMechanismCardGate(content, metadata, 'work/packages/active-test.md');
    t.equal(errors.length, 0, 'No errors when metadata card is complete');
    t.end();
  });

  t.test('passes validation with a complete markdown ## Mechanism Card section', (t) => {
    const content = `
# Title

## Mechanism Card
- Failure Mechanism: transition_gap
- Stable Facts: stable
- Changed Facts: changed
- Rejected Alternatives: rejected
- Owner who decides: owner
- Current code or workflow action: action
- Missing transition or missing observation: transition
- Smallest falsifying probe: probe
- Expected movement: movement
- Negative result means: means
- Escalation rule: rule
`;
    const metadata = {
      status: 'active',
      lane: 'experiment',
      boundary: 'generic_boundary'
    };

    const errors = validateMechanismCardGate(content, metadata, 'work/packages/active-test.md');
    t.equal(errors.length, 0, 'No errors when markdown card is complete');
    t.end();
  });
});
