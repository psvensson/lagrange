# CDC transfer-owner implementation witness

Date: 2026-10-11 UTC. Scope: the first bounded implementation slice under the
round-twelve approved resource design. This packet does not approve or activate
the coverage transport.

## Exact inputs

- Approved design plus hash erratum:
  `cdc-coverage-response-resource-handoff-amendment-20261011.md`, SHA-256 in
  `source-sha256.txt`.
- Native/profile prerequisite:
  `../cdc-native-profile-prerequisite-20261011T2223/packet-sha256.txt`, SHA-256
  `0be370529fc9d4a18a5f9587c25030aa02e55b3b87a9c0480eaa493f5f32ff3f`.
- Selected executable: SHA-256
  `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`,
  Node 22.22.0 / V8 12.4.254.21-node.33 / libuv 1.51.0 / Linux x64.

`selected-runtime.txt` records the executable identity used by the focused
test. The prerequisite packet retains the official Node signature/source
correspondence and signed distroless base attestation; this packet does not
duplicate those larger artifacts.

## Implemented owner transition

`src/cdc/cdc-coverage-transfer-owner.js` now provides one node-pool listener
claim beside the existing row sessions:

1. The first listener generation atomically debits 16 MiB. It does not consume
   one of the eight root-session identities.
2. The node pool divides that debit into 16 MiB minus 16 KiB of listener
   capacity and a standing 16 KiB terminal reserve.
3. A first-terminal-check entry clears the previous generation's conservative
   scalar descriptor without releasing bytes or waking a waiter. Reaching that
   entry is the approved proof that the old scheduler stack/list aliases ended.
4. Terminal transfer validates the exact service, opaque claim, boot,
   generation, shutdown record, first-check phase and 4/8/4 KiB descriptor.
   The token enters an internal `transferring` state before invoking the
   MessageRouter mutation, so callback reentry cannot consume it twice.
5. The MessageRouter mutation must synchronously install and return the exact
   fixed terminal result. Throw, a different result, an invalid descriptor or
   stale identity retains all listener capacity and emits no wake.
6. On success, the owner consumes the release capability, replaces the input
   descriptor with a fixed scalar-only copy, clears its shutdown-record,
   owner, service and pool references, returns exactly listener capacity and
   then invokes the existing wake callbacks from a fixed snapshot.
7. A synchronous wake can reserve one successor beside the continuously held
   terminal reserve. The old claim cannot affect it. The node pool persists
   with 16 KiB retained even while endpoint and root-session counts are zero.
8. Retirement refuses while that endpoint owns an active listener claim. It
   cannot strand a live release capability.

The terminal identity is bounded: boot incarnation must be issued by the
existing boot-incarnation owner and listener generation identity is at most
128 encoded bytes. Only the seven declared numeric occupancy fields and that
bounded generation identity enter the standing descriptor; extra object
properties are discarded.

## Fixed arithmetic and test result

```text
first generation: Wlistener 16,760,832 + Rterminal 16,384 = 16,777,216 bytes
between generations:                                      16,384 bytes
successor active:  Wlistener 16,760,832 + Rterminal 16,384 = 16,777,216 bytes
root sessions consumed by Wbase/Rterminal:                         0
```

`selected-runtime-test.txt` is the unedited output of:

```sh
/tmp/cdc-node-cap-20261012/node scripts/run-classified-test-files.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js
```

It passes 64 assertions on the exact selected executable. The test covers
atomic first acquisition, synchronous successor wake, terminal state before
wake, scalar-only descriptor copying, recursive and stale release refusal,
4/8/4 KiB overrun refusal, failed mutation retention, endpoint-free pool
persistence, exact retained-byte arithmetic and eventual later completion.

`eslint.txt` is the empty successful output of:

```sh
npx eslint src/cdc/cdc-coverage-transfer-owner.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js
```

## Remaining gates and STOPs

- This slice does not yet construct the MessageRouter shutdown record,
  Immediate pair, listener or wire adapter. Therefore the full terminal
  Promise/reaction/Immediate graph still needs its implementation census
  against 4/8/4 KiB. This is a later source witness, not a missing native
  prerequisite.
- The fixed Aactive/Mlane/Gc/Bsend/Frecv/Fmeta/S/H/C/K coefficients still need
  exact adapter-source witnesses before activation.
- Exact future candidate receipts remain absent for required OCI/Helm, SEA,
  npm/source and lab forms. The existing release/platform owner must certify
  each advertised required form. None is downgraded or made optional here.
- Coverage listener, capability publication and coverage traffic remain off.
  Ordinary and snapshot transport behavior is unchanged.
- Caller source `2de419483c9b4ce9e3fabc87bb54d93e4afb8817` is unchanged and remains closed.

Any failed future coefficient or artifact receipt is a typed source/release
HOLD. It cannot raise the 128 MiB pool, enlarge Wbase or narrow a supported row.
