let processRuntimeClaim = null;

function reserveProcessRuntime() {
  if (processRuntimeClaim) return null;
  processRuntimeClaim = Object.freeze(Object.create(null));
  return processRuntimeClaim;
}

function claimProcessRuntime() {
  return reserveProcessRuntime() !== null;
}

function ownsProcessRuntimeClaim(claim) {
  return claim !== null && claim === processRuntimeClaim;
}

function resetProcessRuntimeClaimForTests() {
  processRuntimeClaim = null;
}

export {
  claimProcessRuntime,
  ownsProcessRuntimeClaim,
  reserveProcessRuntime,
  resetProcessRuntimeClaimForTests,
};
