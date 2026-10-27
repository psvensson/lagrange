import {createBootstrapServiceSeedDelegateMethods} from
  '../../src/bootstrap/bootstrap-service-seed-delegates.js';

// Phase component tests substitute the continuation decision, then use its
// actual delegate adapter. They exercise sequencing behind that decision;
// they do not establish authority for original startup to continue. The real
// BootstrapService HOLD remains covered by seed-original-attempt-lifetime.
function createSeedPhaseContinuationFixture({refusal = null} = {}) {
  let checks = 0;
  const host = {
    assertOriginalSeedContinuation() {
      checks += 1;
      if (refusal) throw refusal;
    },
  };
  const {assertOriginalSeedContinuation} = createBootstrapServiceSeedDelegateMethods()
    ._buildPhaseExecutionDelegates.call(host);
  return {
    delegates: {assertOriginalSeedContinuation},
    get checks() {
      return checks;
    },
  };
}

export {createSeedPhaseContinuationFixture};
