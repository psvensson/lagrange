#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Binding schema v3 handler-interface guard: v3 targets declaring
// interface (request_v2/call_v2) + handler_id and omitting export_name
// validate, normalize, bind, and reach Cell readiness through the
// existing binding contract, manifest, and access-policy owners, with
// the interface-to-fixed-export mapping owned solely by the
// deployment-binding contract's mapping constant (mirroring
// component-export-resolution); schema v2 bindings and *_v1 interfaces
// normalize and activate byte-for-byte as before.
const SCENARIOS = {
  'binding-schema-v3-handler-interfaces': [
    'test/control-plane/binding-schema-v3-handler-interfaces.test.js',
    'test/control-plane/deployment-binding-owner.test.js',
    'test/control-plane/request-binding-service-definition-owner.test.js',
    'test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
