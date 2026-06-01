import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  metadataAllowsRepairDirtyScopeAutocomplete,
  metadataHasPureClassificationIntent,
  metadataShouldIgnoreDirtyFileInRepair,
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

  it('correctly filters out dirty implementation files for classification concerns', () => {
    const classifierConcernPackage = {
      status: 'active',
      lane: 'lightweight-maintenance',
      dominantReason: 'pure_classification_scope_guard',
    };

    const regularPackage = {
      status: 'active',
      lane: 'runtime-owner-boundary',
    };

    // Dirty implementation/test files should be ignored for classification concerns
    assert.equal(
      metadataShouldIgnoreDirtyFileInRepair('src/index.js', classifierConcernPackage),
      true,
    );
    assert.equal(
      metadataShouldIgnoreDirtyFileInRepair('test/index.test.js', classifierConcernPackage),
      true,
    );

    // Non-implementation files like markdown packages or sprints should always be ignored regardless
    assert.equal(
      metadataShouldIgnoreDirtyFileInRepair('work/packages/active-test.md', classifierConcernPackage),
      true,
    );

    // Regular package should not ignore src/ index.js
    assert.equal(
      metadataShouldIgnoreDirtyFileInRepair('src/index.js', regularPackage),
      false,
    );
  });
});
