/**
 * The one entry to the node-local, one-way drain. A node drains only
 * itself: the membership lifecycle controller owns the drain intent where
 * the startup branch built one (join); otherwise the bootstrap readiness
 * owner marks the node draining (seed). Shutdown and the admin drain
 * operation both submit through here, so the two cannot diverge.
 */

const LOCAL_STR_FUNCTION = 'function';

/**
 * Submit this node's drain intent to its lifecycle owner.
 * @param {Object} owners
 * @param {Object|null} [owners.membershipLifecycleController]
 * @param {Object|null} [owners.bootstrapAPI]
 * @param {Object} options
 * @param {number|null} options.drainDeadlineMs
 * @param {string} options.reasonCode
 * @param {string} [options.signal]
 * @return {Promise<Object>|Object} The owner's drain snapshot.
 */
function submitLocalNodeDrainIntent(owners, options) {
  const controller = owners?.membershipLifecycleController;
  if (typeof controller?.submitDrainIntent === LOCAL_STR_FUNCTION) {
    return controller.submitDrainIntent({
      drainDeadlineMs: options.drainDeadlineMs,
      reasonCode: options.reasonCode,
      signal: options.signal,
    });
  }
  return owners.bootstrapAPI.markDraining({
    drainDeadlineMs: options.drainDeadlineMs,
    reasonCode: options.reasonCode,
  });
}

export {submitLocalNodeDrainIntent};
