/**
 * Semantic command vocabulary shared by SQL ingress and lifecycle ownership.
 */

const SERVICE_LIFECYCLE_COMMAND = Object.freeze({
  INSTALL: 'install_service',
  REMOVE: 'remove_service',
  SHOW_ALL: 'show_services',
  SHOW_ONE: 'show_service',
  UPGRADE: 'upgrade_service',
});

export {SERVICE_LIFECYCLE_COMMAND};
