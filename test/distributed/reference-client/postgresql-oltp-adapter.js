// PostgreSQL arm of the canonical OLTP workload. PostgreSQL speaks the same
// PG wire and accepts the same statement text as the Lagrange public path, so
// this is the ONE pg-protocol adapter (createLagrangeOltpAdapter: dataset
// load, schema, executor sessions) with exactly one dialect parameter: native
// row locking (FOR UPDATE on the locking reads), which PostgreSQL implements.
// No second workload definition or statement table exists.
import {
  PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE,
  createLagrangeOltpAdapter,
} from './lagrange-oltp-adapter.js';

async function createPostgreSqlOltpAdapter(options = {}) {
  if (Object.hasOwn(options, 'lockingReadMode')) {
    throw new Error('PostgreSQL OLTP adapter owns its locking read mode');
  }
  return createLagrangeOltpAdapter({
    ...options,
    lockingReadMode: PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE,
  });
}

export {
  createPostgreSqlOltpAdapter,
};
