/**
 * Shared test support for Node Joining Service suites.
 *
 * Extracted from the parent suite and the formerly-orphaned
 * node-joining-service.test-part-N.js files, which each carried a
 * byte-identical local copy of initializeTestEnvironment(). The helper body
 * is preserved verbatim; the parent and the re-enabled concern suites import
 * it from here instead of redefining it.
 */

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';

// Initialize configuration and logging for tests
export function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}
