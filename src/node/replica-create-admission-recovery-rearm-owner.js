/**
 * Owns the one native timer that rearms retained CREATE admission recovery.
 * The handler controls the recovery work; this owner only serializes,
 * unreferences, and cancels its delayed wake.
 */
class ReplicaCreateAdmissionRecoveryRearmOwner {
  constructor() {
    this.handle = null;
  }

  arm(callback, delayMs) {
    this.cancel();
    const handle = setTimeout(() => {
      if (this.handle === handle) this.handle = null;
      callback();
    }, delayMs);
    handle.unref?.();
    this.handle = handle;
    return handle;
  }

  cancel() {
    if (!this.handle) return false;
    clearTimeout(this.handle);
    this.handle = null;
    return true;
  }

  current() {
    return this.handle;
  }
}

export {ReplicaCreateAdmissionRecoveryRearmOwner};
