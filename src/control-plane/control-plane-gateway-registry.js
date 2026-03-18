let sharedControlPlaneSystemTableGateway = null;

function registerControlPlaneSystemTableGateway(gateway) {
  sharedControlPlaneSystemTableGateway = gateway || null;
  return sharedControlPlaneSystemTableGateway;
}

function getRegisteredControlPlaneSystemTableGateway() {
  return sharedControlPlaneSystemTableGateway || null;
}

function clearRegisteredControlPlaneSystemTableGateway() {
  sharedControlPlaneSystemTableGateway = null;
}

export {
  clearRegisteredControlPlaneSystemTableGateway,
  getRegisteredControlPlaneSystemTableGateway,
  registerControlPlaneSystemTableGateway,
};
