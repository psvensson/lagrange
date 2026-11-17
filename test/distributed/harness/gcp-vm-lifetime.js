/**
 * The one definition of a benchmark VM's provider-enforced lifetime on GCP.
 *
 * Every Compute Engine VM that a benchmark, the distributed matrix or CI
 * creates names a maximum run duration in whole seconds at creation. When it
 * elapses, Compute Engine itself DELETEs the VM, boot disk included, whether or
 * not the run that created it is still alive to tear it down. A creation that
 * does not name a well-formed bound is refused before any provider call: there
 * is no unbounded creation path.
 *
 * Both GCP VM creators render this one definition:
 *   - docs/benchmarks/cloud/provision-gcp.sh (the comparative campaign's six
 *     VMs) passes gcpVmLifetimeGcloudArgs() to `gcloud compute instances
 *     create`, through docs/benchmarks/cloud/gcp-vm-lifetime-args.mjs;
 *   - GCPProvisioner (gcp-provisioner.js: the distributed runner and matrix,
 *     the TiDB reference workflows and the MovieLens demo) spreads
 *     gcpVmLifetimeInstanceArgs() into every Pulumi gcp.compute.Instance.
 *
 * The duration is Compute Engine's maxRunDuration: it counts from the last time
 * the VM entered RUNNING. Google owns the admissible range and refuses a value
 * outside it at creation; this definition refuses only absent or malformed
 * values, which it can decide without the provider.
 */

import {inspect} from 'node:util';

import {
  numberIsSafeInteger,
  objectFreeze,
  toNumber,
} from './real-product-captured-intrinsics.js';

const regExpTest = Function.call.bind(RegExp.prototype.test);

const MIN_SECONDS = 1;
const WHOLE_SECONDS_TEXT = /^[1-9][0-9]*$/u;
const TERMINATION_ACTION = 'DELETE';
const BOOT_DISK_AUTO_DELETE = true;
const GCLOUD_MAX_RUN_DURATION = '--max-run-duration=';
const GCLOUD_SECONDS_UNIT = 's';
const GCLOUD_TERMINATION_ACTION = '--instance-termination-action=';
const GCLOUD_BOOT_DISK_AUTO_DELETE = '--boot-disk-auto-delete';

function notSet(label) {
  return new Error(`${label} is not set: name the whole seconds each VM may run ` +
    'before Compute Engine deletes it; no VM is created without a provider-enforced ' +
    'lifetime bound');
}

function malformed(label, value) {
  return new Error(`${label} must be a positive whole number of seconds, got ` +
    `${inspect(value)}`);
}

/**
 * The bound as a configuration names it (a JSON number).
 * @param {*} value
 * @param {string} label - the name the caller knows the bound by
 * @return {number} whole seconds, at least one
 */
function requireGcpVmMaxRunDurationSeconds(value, label) {
  if (value === undefined || value === null) throw notSet(label);
  if (!numberIsSafeInteger(value) || value < MIN_SECONDS) throw malformed(label, value);
  return value;
}

/**
 * The bound as an operator's environment names it (text).
 * @param {string|undefined} text
 * @param {string} label
 * @return {number}
 */
function parseGcpVmMaxRunDurationSeconds(text, label) {
  if (text === undefined || text === '') throw notSet(label);
  if (!regExpTest(WHOLE_SECONDS_TEXT, text)) throw malformed(label, text);
  return requireGcpVmMaxRunDurationSeconds(toNumber(text), label);
}

/**
 * The `gcloud compute instances create` arguments every VM of the call carries.
 * @param {number} maxRunDurationSeconds
 * @param {string} label
 * @return {Array<string>}
 */
function gcpVmLifetimeGcloudArgs(maxRunDurationSeconds, label) {
  const seconds = requireGcpVmMaxRunDurationSeconds(maxRunDurationSeconds, label);
  return objectFreeze([
    `${GCLOUD_MAX_RUN_DURATION}${seconds}${GCLOUD_SECONDS_UNIT}`,
    `${GCLOUD_TERMINATION_ACTION}${TERMINATION_ACTION}`,
    GCLOUD_BOOT_DISK_AUTO_DELETE,
  ]);
}

/**
 * The Pulumi gcp.compute.Instance arguments every VM carries: spread
 * `bootDisk` into the instance's bootDisk and `scheduling` into its scheduling.
 * @param {number} maxRunDurationSeconds
 * @param {string} label
 * @return {{bootDisk: {autoDelete: boolean}, scheduling: {maxRunDuration:
 *   {seconds: number}, instanceTerminationAction: string}}}
 */
function gcpVmLifetimeInstanceArgs(maxRunDurationSeconds, label) {
  const seconds = requireGcpVmMaxRunDurationSeconds(maxRunDurationSeconds, label);
  return objectFreeze({
    bootDisk: objectFreeze({autoDelete: BOOT_DISK_AUTO_DELETE}),
    scheduling: objectFreeze({
      maxRunDuration: objectFreeze({seconds}),
      instanceTerminationAction: TERMINATION_ACTION,
    }),
  });
}

export {
  gcpVmLifetimeGcloudArgs,
  gcpVmLifetimeInstanceArgs,
  parseGcpVmMaxRunDurationSeconds,
};
