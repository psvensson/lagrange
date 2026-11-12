// Permission witnesses use the same unprivileged POSIX principal required
// by lab worker provisioning. This checks infrastructure, never skips a test
// or changes identity; the caller must still measure the actual EACCES.
export const PERMISSION_WITNESS_UNAVAILABLE = 'ERR_PERMISSION_WITNESS_UNAVAILABLE';
const ROOT_UID = 0;

/** Require an effective identity that can witness ordinary filesystem permissions. */
export function requirePermissionWitness() {
  const realUid = process.getuid?.();
  const effectiveUid = process.geteuid?.();
  if (Number.isInteger(realUid) && realUid > ROOT_UID &&
    Number.isInteger(effectiveUid) && effectiveUid > ROOT_UID) return;
  const error = new Error('Permission witness requires an unprivileged POSIX ' +
    'test process (the provisioned lab user); root or unavailable real/effective UID ' +
    'is an infrastructure failure.');
  error.code = PERMISSION_WITNESS_UNAVAILABLE;
  error.realUid = realUid;
  error.effectiveUid = effectiveUid;
  throw error;
}
