/**
 * The states of a durable partition CREATE admission. The admission owner
 * (replica-create-admission-owner.js) moves a row between them; pure readers
 * of operation fields import the names from here without loading the owner.
 */
const CREATE_ADMISSION_STATE = Object.freeze({
  ADMITTED: 'ADMITTED',
  MATERIALIZED: 'MATERIALIZED',
  ROTATING: 'ROTATING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  CLOSED: 'CLOSED',
});

export {CREATE_ADMISSION_STATE};
