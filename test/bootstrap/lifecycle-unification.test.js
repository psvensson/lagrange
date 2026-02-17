import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

/**
 * Validates: Requirements 2.3, 2.4
 *
 * Verifies that the dead SERVICE_STATE constants file and
 * ServiceLifecycleMixin file were deleted as part of the
 * lifecycle enum unification (Requirement 2). No production
 * callers existed, so both files were removed entirely.
 */
describe('lifecycle unification — dead file removal', () => {
  const srcRoot = join(import.meta.dirname, '..', '..', 'src');

  it('service-lifecycle-constants.js does not exist', () => {
    const filePath = join(
      srcRoot, 'bootstrap', 'service-lifecycle-constants.js'
    );
    assert.equal(
      existsSync(filePath),
      false,
      'service-lifecycle-constants.js should have been deleted'
    );
  });

  it('service-lifecycle-mixin.js does not exist', () => {
    const filePath = join(
      srcRoot, 'bootstrap', 'service-lifecycle-mixin.js'
    );
    assert.equal(
      existsSync(filePath),
      false,
      'service-lifecycle-mixin.js should have been deleted'
    );
  });
});
