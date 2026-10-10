import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLICATION_CONVERGENCE_CLAIM_STATE,
  admitsPublicationConvergence,
} from '../publication-convergence-claim.js';

describe('publication convergence claim', () => {
  it('absent evidence is never ready; a load claim needs a ready gate', () => {
    assert.equal(admitsPublicationConvergence(null), false);
    assert.equal(admitsPublicationConvergence({}), false);
    assert.equal(admitsPublicationConvergence({claimState:
      PUBLICATION_CONVERGENCE_CLAIM_STATE.CLAIMED_LOAD, ready: false}), false);
    assert.equal(admitsPublicationConvergence({claimState:
      PUBLICATION_CONVERGENCE_CLAIM_STATE.CLAIMED_LOAD, ready: true}), true);
  });

  it('a startup gate admits only by its named not-claimed state', () => {
    assert.equal(admitsPublicationConvergence({claimState:
      PUBLICATION_CONVERGENCE_CLAIM_STATE.NOT_CLAIMED_STARTUP, ready: false}),
    true);
  });
});
