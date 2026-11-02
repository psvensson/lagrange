/**
 * Guest-safe authoring entry point (`lagrange-server/authoring`).
 *
 * Re-exports the pure ESM authoring descriptors without pulling in any
 * Node-only runtime or server modules.
 */
export {
  AUTHORING_DESCRIPTOR_KIND,
  deepFreeze,
  defineService,
} from './define-service.js';
export {distributed} from './distributed-operation.js';
export {HTTP_METHOD, http} from './request-handler.js';
export {AuthoringError, sql} from './sql-template.js';
