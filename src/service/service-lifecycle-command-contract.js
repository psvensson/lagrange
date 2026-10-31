/**
 * Semantic command vocabulary shared by SQL ingress and lifecycle ownership.
 */

const SERVICE_LIFECYCLE_COMMAND = Object.freeze({
  CALL_BINDING: 'call_binding',
  CONFIGURE_ACCESS: 'configure_service_access',
  CREATE_BINDING: 'create_binding',
  INSTALL: 'install_service',
  PUBLISH_ARTIFACT: 'publish_service_artifact',
  REMOVE: 'remove_service',
  SHOW_ALL: 'show_services',
  SHOW_ONE: 'show_service',
  UPGRADE: 'upgrade_service',
});

export {SERVICE_LIFECYCLE_COMMAND};
