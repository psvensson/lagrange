#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// doneWhen guard for the cluster-owned-artifact-payload-store quest: the
// registered payload table schemas, the chunked write / seal / verified-
// read store owner over real-schema SQLite, INSTALL-time payload
// internalization plus the payload-seal bindable gate and the store
// attachment seam, and the end-to-end durability proof (real component
// installed from a real local OCI layout, caches and source destroyed, a
// previously unused node reconstructs from the replicated tables, digest
// verification passes, the component starts and produces the expected
// run result, with typed store-absent and tampered-chunk refusals).
const SCENARIOS = {
  'cluster-owned-artifact-payload-store': [
    'test/bootstrap/artifact-payload-table-schemas.test.js',
    'test/service/artifact-payload-store.test.js',
    'test/service/artifact-payload-internalization.test.js',
    'test/integration/artifact-payload-durability.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
