# Node Address Resolution Complexity Reduction

## Why

`src/transport/node-address-resolution.js` was carrying a concentrated
branch-heavy parsing and address-selection path, and it also appeared in the
duplication report.

This package landed a bounded transport slice that reduces that complexity
without broadening into message-router or control-plane readiness work.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reduce the complexity of address parsing in
   `src/transport/node-address-resolution.js`
2. Reduce the complexity of advertised websocket address selection in the same
   owner
3. Add focused transport regressions for the touched paths

## Result

1. Split address parsing into explicit helper stages for URL, bracketed IPv6,
   and single-colon host/port inputs.
2. Split advertised websocket address resolution into explicit host, port, and
   explicit-address normalization helpers.
3. Normalized canonical source constants and URL-host handling so IPv6 parsing
   behaves consistently across code paths.
4. Added focused transport regression coverage for parsed websocket URLs in
   `test/transport/node-address-resolution.test.js`.

## Validation

1. `node test/transport/node-address-resolution.test.js`
2. `node --test test/scripts/check-guideline-literals.test.js test/scripts/check-guideline-decision-boundaries.test.js test/transport/node-address-resolution.test.js`
3. `npm run test:metrics`

## Done When

1. The node-address-resolution hotspot count is reduced
2. The transport address-resolution contract stays green under focused tests
