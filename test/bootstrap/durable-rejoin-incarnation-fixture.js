// The node identity and clock the durable-rejoin incarnation suites share: one
// node id and address, the wall clock reading, and the previous and current
// boot incarnations.
export const NODE_ID = 'node-durable-rejoin';
export const NODE_ADDRESS = 'rejoin-host:8080';
export const NOW = 1_710_000_000_000;
export const PREVIOUS_BOOT = 2;
export const THIS_BOOT = 3;
