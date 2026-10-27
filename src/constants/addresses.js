const ADDRESS = Object.freeze({
  SEPARATOR: '/',
  PORT_SEPARATOR: ':',
});

const ENTITY_TYPE = Object.freeze({
  BOOTSTRAP: 'bootstrap',
  MESSAGE_GROUP: 'message-group',
  PARTITION: 'partition',
  LIFECYCLE: 'lifecycle',
  SERVICE: 'service',
  WASM_SERVICE: 'wasm_service',
});

export {ADDRESS, ENTITY_TYPE};
