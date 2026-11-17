// The lifetime arguments provision-gcp.sh passes to `gcloud compute instances
// create`, rendered from the one definition of a benchmark VM's
// provider-enforced lifetime (test/distributed/harness/gcp-vm-lifetime.js).
//
//   node docs/benchmarks/cloud/gcp-vm-lifetime-args.mjs "${VM_MAX_RUN_DURATION_SECONDS}"
//
// Prints the arguments on one line, separated by single spaces (none contains
// whitespace). An absent or malformed bound prints why and exits 2 with nothing
// on stdout, so the script refuses before any gcloud call.
import process from 'node:process';

import {
  gcpVmLifetimeGcloudArgs,
  parseGcpVmMaxRunDurationSeconds,
} from '../../../test/distributed/harness/gcp-vm-lifetime.js';
import {arrayJoin} from '../../../test/distributed/harness/real-product-captured-intrinsics.js';

const ENVIRONMENT_NAME = 'VM_MAX_RUN_DURATION_SECONDS';
const USAGE_EXIT_CODE = 2;
const ARGUMENT_SEPARATOR = ' ';

function renderedArgs(text) {
  const seconds = parseGcpVmMaxRunDurationSeconds(text, ENVIRONMENT_NAME);
  return arrayJoin(gcpVmLifetimeGcloudArgs(seconds, ENVIRONMENT_NAME), ARGUMENT_SEPARATOR);
}

try {
  process.stdout.write(`${renderedArgs(process.argv[2])}\n`);
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = USAGE_EXIT_CODE;
}
