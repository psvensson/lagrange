// The SQL-engine seam passes the engine's system-table contract.
//
// Same cases as the real leg (test/integration/sql-engine-system-writes-contract.integration.test.js),
// against the cache-backed seam the membership harness uses. Registered as a
// witness of the `sql-engine-cache-membership` pair, so the derived harness
// model can point at it.

import {test} from 'node:test';

import {SystemTableCache} from '../../../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../../../src/cdc/cdc-integration-service.js';
import {registerSqlEngineSystemTableContract} from '../../../query/sql-engine-system-table-contract-cases.js';
import {createSqlEngineSeam} from '../sql-engine-seam.js';

const NODE_ID = 'seam-node';
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});

registerSqlEngineSystemTableContract(test, {
  name: 'seam',
  async open() {
    // The composition the membership harness hosts: the REAL CDC owner over
    // the seam engine over a real cache. Only the engine is seamed.
    const systemTableCache = new SystemTableCache();
    const engine = createSqlEngineSeam(systemTableCache);
    const owner = new CDCIntegrationService({
      nodeId: NODE_ID, systemTableCache, sqlQueryEngine: engine,
    });
    owner.bootstrapMode = false;
    owner.logger = QUIET_LOGGER;
    owner.initialize();
    return {engine, owner, close: async () => {}};
  },
});
