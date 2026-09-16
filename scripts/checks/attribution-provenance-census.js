#!/usr/bin/env node
/**
 * The formation attribution provenance census
 * (`formation-production-interaction-attribution-authority` quest).
 *
 *   node scripts/checks/attribution-provenance-census.js --json
 *
 * Runs the production-composed seed chain once with observation-only
 * attribution provenance and prints the frozen F4 packet.
 *
 * The window ends where production ends formation attribution: at the
 * "Cluster formed." mark, whose simulator counterpart is D's write-authority
 * handoff. Teardown still runs, still deterministically, and is still
 * required to reach zero pending work - it is measured separately and is not
 * part of the formation owner census.
 */
import process from 'node:process';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  runFormationAttributionCensus,
} from '../../test/simulation/formation-attribution-census.js';

const JSON_FLAG = '--json';
const NODE_ID = 'node-0';
const LOG_LEVEL = 'error';
const JSON_INDENT = 2;
const NEWLINE = '\n';
const EXIT_OK = 0;
const arrayIncludes = Function.call.bind(Array.prototype.includes);

async function main() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID}, logging: {level: LOG_LEVEL},
  });
  LoggingService.getInstance().initialize({level: LOG_LEVEL});
  const packet = await runFormationAttributionCensus();
  const indent = arrayIncludes(process.argv, JSON_FLAG) ? undefined :
    JSON_INDENT;
  process.stdout.write(`${JSON.stringify(packet, null, indent)}${NEWLINE}`);
  process.exit(EXIT_OK);
}

main();
