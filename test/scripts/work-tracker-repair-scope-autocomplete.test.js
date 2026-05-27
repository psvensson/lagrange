import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  metadataAllowsRepairDirtyScopeAutocomplete,
  metadataHasPureClassificationIntent,
} from '../../scripts/work-tracker.js';

describe('work tracker repair scope autocompletion', () => {
  it('does not auto-adopt dirty implementation files for classifier packages', () => {
    const classificationEfficiencyPackage = {
      status: 'active',
      lane: 'causal-escalation',
      scenario: 'rolling-restart',
      classificationEfficiency: {
        defaultMode: 'inline-gate-default',
      },
    };
    const diagnosticPackage = {
      status: 'active',
      lane: 'diagnostic-classification',
      scenario: 'rolling-restart',
    };
    const runtimePackage = {
      status: 'active',
      lane: 'runtime-owner-boundary',
      scenario: 'rolling-restart',
    };

    assert.equal(
      metadataHasPureClassificationIntent(classificationEfficiencyPackage),
      true,
    );
    assert.equal(
      metadataAllowsRepairDirtyScopeAutocomplete(
        classificationEfficiencyPackage,
      ),
      false,
    );
    assert.equal(
      metadataAllowsRepairDirtyScopeAutocomplete(diagnosticPackage),
      false,
    );
    assert.equal(
      metadataAllowsRepairDirtyScopeAutocomplete(runtimePackage),
      true,
    );
  });
});
