/**
 * The choke points of the CDC integration service's operation classes. Each
 * one passes the owner's one terminal gate (refuseIfTerminal, the lifecycle
 * owner) before it issues work, so no caller needs a check of its own:
 * - (a) issueAuthoritativeReadStage: every authoritative read stage (a local
 *   replica read, an owner-RPC read and its re-issue, the routing-overlay
 *   reseed, the SQL fallback read);
 * - (b) applyAuthoritativeCacheMutation: every authoritative cache repair
 *   and sweep;
 * - (c) submitRoutedMutationHop: every hop of a routed mutation to a
 *   partition or an engine.
 * Once the owner is terminal each answers the owner's typed SHUT_DOWN in its
 * class's own shape, and never as a success.
 */

/**
 * The owner's terminal answer for a stage, if it is terminal. A service
 * record without the lifecycle owner (a bare record) has no terminal state.
 * @param {Object} service - The CDC integration service.
 * @param {string} stage - A CDC_TERMINAL_STAGE.
 * @param {*} [priorAnswer] - The answer of an earlier hop, when one ran.
 * @return {Error|null|undefined}
 */
function terminalRefusal(service, stage, priorAnswer = undefined) {
  return typeof service?.refuseIfTerminal === 'function' ?
    service.refuseIfTerminal(stage, priorAnswer) :
    null;
}

/**
 * (a) Issue one authoritative read stage, unless the owner is terminal: then
 * the stage is not issued, and it answers a failed read carrying the typed
 * SHUT_DOWN, with no rows.
 * @param {Object} service
 * @param {string} stage - A CDC_TERMINAL_STAGE read stage.
 * @param {Function} issue - Issues the read; returns its answer.
 * @return {Promise<Object>|Object} The read's answer or the terminal answer.
 */
function issueAuthoritativeReadStage(service, stage, issue) {
  const refusal = terminalRefusal(service, stage);
  if (!refusal) {
    return issue();
  }
  return {
    success: false,
    error: refusal.message,
    errorCode: refusal.code,
    code: refusal.code,
    terminalStage: stage,
    rows: [],
  };
}

/**
 * (b) Apply one authoritative cache repair or sweep, unless the owner is
 * terminal: then nothing is applied, and it answers `notApplied`.
 * @param {Object} service
 * @param {string} stage - A CDC_TERMINAL_STAGE apply stage.
 * @param {Function} apply - Applies the mutation; returns its answer.
 * @param {*} notApplied - The caller's own "not applied" answer.
 * @return {*}
 */
function applyAuthoritativeCacheMutation(service, stage, apply, notApplied) {
  return terminalRefusal(service, stage) ? notApplied : apply();
}

/**
 * (c) Submit one hop of a routed mutation, unless the owner is terminal:
 * then the hop is not submitted and the typed SHUT_DOWN is thrown. When an
 * earlier hop of the same mutation was issued (`priorAnswer`), the answer is
 * NOT_CONFIRMED carrying that hop's answer: its outcome is not known here.
 * @param {Object} service
 * @param {string} stage - A CDC_TERMINAL_STAGE mutation stage.
 * @param {Function} submit - Submits the hop; returns its answer.
 * @param {*} [priorAnswer] - The answer of an earlier hop, when one ran.
 * @return {Promise<Object>} The hop's answer.
 */
async function submitRoutedMutationHop(
  service,
  stage,
  submit,
  priorAnswer = undefined,
) {
  const refusal = terminalRefusal(service, stage, priorAnswer);
  if (refusal) {
    throw refusal;
  }
  return submit();
}

export {
  applyAuthoritativeCacheMutation,
  issueAuthoritativeReadStage,
  submitRoutedMutationHop,
};
