/**
 * The probe body: run the production-composed seed chain once with peer
 * provenance instrumentation, and report what the peer population did.
 *
 * @module scripts/checks/peer-raft-authority-probe
 */

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  observePeerRaftAuthority,
} from '../../test/simulation/formation-sim-peer-raft-authority.js';
import {
  runSeedHandoffScenario,
} from '../../test/simulation/formation-sim-production-seed-host.js';

const EXPLAIN_FLAG = '--explain';
const NODE_ID = 'node-0';
const LOG_LEVEL = 'error';
// Captured at module load: a replaced Array.prototype.includes must not be
// able to decide whether the probe is explaining itself.
const arrayIncludes = Function.call.bind(Array.prototype.includes);

/**
 * Run the probe. Never returns.
 * @return {Promise<void>}
 */
async function runPeerRaftAuthorityProbe() {
  const explain = arrayIncludes(process.argv, EXPLAIN_FLAG);
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID}, logging: {level: LOG_LEVEL},
  });
  LoggingService.getInstance().initialize({level: LOG_LEVEL});

  const observer = observePeerRaftAuthority();
  const run = await runSeedHandoffScenario();
  const census = observer.census();
  observer.restore();

  if (explain) {
    process.stdout.write(`${JSON.stringify({
      strictReport: run.strictReport,
      ownerAddressCount: census.ownerAddressCount,
      peerObjectCount: census.peerObjectCount,
      peerAddressCount: census.peerAddressCount,
      peerBehaviours: census.peerBehaviours,
      representationSurface: census.representationSurface,
      ownerInvoked: census.ownerInvoked,
      authorityBreaches: census.authorityBreaches,
      runtimesInPeerSlots: census.runtimesInPeerSlots,
    }, null, 2)}\n`);
  }
  process.stdout.write(`${census.authorityBreachCount}\n`);
  process.exit(census.authorityBreachCount === 0 ? 0 : 1);
}

export {runPeerRaftAuthorityProbe};
