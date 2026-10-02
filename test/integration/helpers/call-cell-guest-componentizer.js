/**
 * Deploy-time tooling shared by the public call-seam proofs: componentize
 * a call-cell guest source against the canonical WIT `call-cell` world
 * with the same disabled features the call-cell fixtures use.
 */

import {componentize} from '@bytecodealliance/componentize-js';

const CANONICAL_WIT_DIRECTORY = new URL('../../../wit', import.meta.url);
const CALL_CELL_WORLD = 'call-cell';
const COMPONENTIZE_DISABLED_FEATURES = Object.freeze([
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
]);

/**
 * @param {string} guestSource - Guest module source text.
 * @return {Promise<Buffer>} Component bytes.
 */
async function componentizeCallCellGuest(guestSource) {
  const {component} = await componentize(guestSource, {
    disableFeatures: [...COMPONENTIZE_DISABLED_FEATURES],
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName: CALL_CELL_WORLD,
  });
  return Buffer.from(component);
}

export {componentizeCallCellGuest};
