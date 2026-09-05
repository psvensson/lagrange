/**
 * Shared serve-ready snapshot evidence for the readiness planning owner
 * suites: the runtime-authority and projection-readiness-contract records a
 * positive (serve-eligible, repair-eligible) planning snapshot carries. Suites
 * compose these with their own node identity, revision, and lease window.
 */

function buildServeReadyRuntimeAuthority() {
  return Object.freeze({
    ready: true,
    authorityAvailable: true,
    writeEligible: true,
    recoveryEligible: true,
    repairEligible: true,
    publication: Object.freeze({healthy: true}),
    visibility: Object.freeze({published: true}),
    provisioning: Object.freeze({eligible: true}),
  });
}

function buildServeReadyProjectionReadinessContract() {
  return Object.freeze({
    state: 'serve_ready',
    ready: true,
    serveReady: true,
    recoveryOpen: false,
    lanes: Object.freeze({
      serve: Object.freeze({ready: true}),
      repair: Object.freeze({ready: true}),
      internal: Object.freeze({ready: true}),
      operator: Object.freeze({ready: true}),
    }),
    publication: Object.freeze({ready: true}),
    readiness: Object.freeze({
      internalReady: true,
      repairEligible: true,
      recoveryEligible: true,
      serveEligible: true,
      runtimeServeEligible: true,
      operatorReady: true,
    }),
  });
}

export {
  buildServeReadyProjectionReadinessContract,
  buildServeReadyRuntimeAuthority,
};
