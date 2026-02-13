/**
 * Test fixture: a scenario module that throws on run.
 * Used by CLI runner tests to verify error handling.
 */

/**
 * @param {Object} _cluster
 */
async function run(_cluster) {
  throw new Error('Intentional scenario failure for testing');
}

export {run};
