/**
 * Quest-scoped rolling-restart certification surface.
 *
 * The implementation intentionally reuses the unchanged rolling-restart
 * scenario. A distinct report identity keeps this Quest's candidate evidence
 * separate from historical rolling-restart runs without weakening any live
 * workload, timeout, topology, or convergence contract.
 */
export {run} from './rolling-restart.js';
