# Scenario and fault-proxy owner proof

Measured 2026-09-11 against the uncommitted process-isolated formation
candidate. No live formation cluster was started.

## Controlled pre-fix witness

Command:

```text
npm run test:file -- test/runtime/bootstrap-contact-fault-proxy.test.js test/runtime/process-formation-scenario.test.js
```

The first execution on the pre-fix helpers exited 1. Both files reached their
intended assertions: `process-formation-scenario.test.js` reported 3/9 passing
and six behavioral failures; `bootstrap-contact-fault-proxy.test.js` reported
21/30 passing and nine behavioral failures. The failures covered canonical
`msg` authority, absent acquisition deadline propagation, restored 100ms
cadence, synchronous teardown abandonment, cancelled listen admission, late
upstream response resurrection, and early stop settlement after server-close
failure. There was no import, fixture, timeout, or empty-TAP failure.

A follow-up destruction-boundary control made an accepted socket's `destroy()`
throw synchronously while its close observation remained pending. The
intermediate proxy test exited 1 at that exact assertion and also exposed the
otherwise abandoned server-close rejection. The restored owner invokes every
destruction behind a Promise boundary and still waits for the socket's eventual
close before returning the aggregate.

## Restored focused proof

The same command exits 0 with two files and 56/56 assertions:

```text
ok test/runtime/process-formation-scenario.test.js (16 assertions, 883ms)
ok test/runtime/bootstrap-contact-fault-proxy.test.js (40 assertions, 937ms)
# test-files total=2 pass=2 fail=0 assertions=56
```

The restored witnesses additionally exercise a real pending TCP listen abort
and a scenario stop overlapping the proxy acquisition. The scenario passes
the one captured absolute 30-second deadline to every process acquisition and
derives proxy cancellation from that same deadline; it does not create a new
success budget. Stop publishes retirement before cancellation, invokes every
stop action behind a Promise boundary, and awaits all settlements.

The seven-node scenario now pairs the seed's exact prepared assignment
`strategy` and `groupId` with the joining process's exact consumed branch log:
`JOIN_ASSIGNMENT_RECEIVED` for `MOVE_REPLICA`, or `SELF_HOSTED_CREATED` for
`CREATE_SELF_HOSTED`. Preparation alone is no longer presented as receipt.

## Static focused checks

Touched-file ESLint and `git diff --check` exit 0. Scoped strict cyclomatic
complexity reports no functions over 12; scoped strict cognitive complexity
reports no functions over 20. Test/helper file-size strict checks report no
new oversized file. A prior non-scoped strict invocation scanned the full
repository and only reproduced the existing global debt census; it was not
used as scoped evidence.

Current content hashes:

```text
c5b1d345c9254f0afae8464752c9f849173e1106f6f5f2f39b780cc9b1b15477  test/integration/helpers/bootstrap-contact-fault-proxy.js
850069d7ea78f33caecb8a02e7deefcf6cf50827d8a43ab2b99db094b3dc10a0  test/integration/helpers/process-formation-scenario.js
2fa71bd2f5ae7f15b10d9fcf203188013e564346b941f3a8c6464efd6f980bb1  test/runtime/bootstrap-contact-fault-proxy.test.js
adc1d51f5d246df56581b3f8ab840b7f68349fe6243b5630707f9a20d487615a  test/runtime/process-formation-scenario.test.js
d7d10d416ff6db9e3116593546ad16ee7069da1df019de1c8b7feea344b2861c  test/bootstrap/fresh-join-via-non-seed-node.integration.test.js
98a333d48d8c89113baa593f5bb928020511386d588b1d91bcfbd9f2ae76c241  test/integration/message-group-multi-join-formation.integration.test.js
```

The pending canonical Admin client cleanup composition is deliberately not
implemented here. Full generated metadata, selected-cone proof, and live
three/seven-process evidence remain terminal Quest work after the collaborating
owner changes freeze.
