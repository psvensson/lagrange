/**
 * Whether a readiness claim includes publication convergence.
 *
 * Load readiness CLAIMS publication convergence: its publication gate must
 * be ready. Startup readiness does NOT claim it: the gate is still
 * evaluated from real evidence (it used to be a fabricated {ready: true}
 * in startup, so every startup rule that "required publicationGateReady"
 * required nothing while saying it did), and the startup rules state by
 * name that they do not depend on it. Absent evidence is never ready.
 */

const PUBLICATION_CONVERGENCE_CLAIM_STATE = Object.freeze({
  CLAIMED_LOAD: 'publication_convergence_claimed_load',
  NOT_CLAIMED_STARTUP: 'publication_convergence_not_claimed_startup',
});

/**
 * Whether the gate admits the readiness claim it was evaluated for: a
 * ready gate, or a startup gate whose claim excludes publication.
 * @param {Object|null} gate
 * @return {boolean}
 */
function admitsPublicationConvergence(gate) {
  if (!gate || typeof gate !== 'object') {
    return false;
  }
  return gate.ready === true ||
    gate.claimState === PUBLICATION_CONVERGENCE_CLAIM_STATE.NOT_CLAIMED_STARTUP;
}

export {
  PUBLICATION_CONVERGENCE_CLAIM_STATE,
  admitsPublicationConvergence,
};
