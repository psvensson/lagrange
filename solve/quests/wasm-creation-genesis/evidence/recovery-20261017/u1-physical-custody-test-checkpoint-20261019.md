# U1 physical custody test-only checkpoint, 2026-10-19

Status: prepared WIP; no production edit and no local behavioral test run.
Author: `subagent:/root`. Base:
`8c9b14141f89872938d21cc35472b262929818d6`.

## Recovery binding

The recovered remote head contains the four-file F1 correction and approved
inventory contracts/tests, but no F2–F6 production correction. The previous
inventory implementation was not present in the recovered scratch or remote
branch census. Reconstruction therefore starts from the approved v3 and all
mandatory addenda; prior progress text is not an implementation receipt.

The recovered F1 run is Lagrange lab issue 235, request
`e7e09dcb4fdcba1a0d30d41d037ff259`, on exact source
`77a888af01f13e30052135075964c6508b1d0b24`: three files, 123 assertions,
exit 0, terminal PASS. Its execution interval was 2026-10-18
20:19:20–20:19:53 UTC. This checkpoint cites a recovered receipt and makes no
new execution claim. Independent mutation controls and a combined U1 run
remain separate gates.

Receipt: <https://github.com/psvensson/lagrange-lab/issues/235#issuecomment-6254678839>.
Terminal-log SHA256:
`a1372b5c0421f99197126ba7a70d587a49d64e9e8a439ae71dee711849bb3824`.

## Independent physical witnesses

The new `test/wasm-service/bound-creation-physical-custody.integration.test.js`
uses the existing C6 embedding, real journal/resource owners, native raft-rs
objects and real storage. It adds nine cases:

1. Exact CREATED/STARTING/READY admission, STOPPING/registered-STOPPED refusal,
   and closed-lifetime precedence, with `.live` unchanged.
2. Same token with a different valid immutable intent is DIFFERENT, without
   opening storage.
3. A real failed cleanup retains resource custody but cannot grant start.
4. Exact retirement task registration precedes a synchronously reentrant
   shutdown; post-fence admission remains closed.
5. Twenty identical requests coalesce, while a valid changed body under the
   same operation ID is refused without a second owner call.
6. Failed retirement cleanup retains the tombstone obligation across a later
   `shutdownAll` retry.
7. Real RETIRED storage plus real bounded metadata HISTORY_UNAVAILABLE is FINAL
   while retaining `closed: false` and the raw owner answer.
8. Missing storage plus the same real history loss remains UNRESOLVED.
9. An old retained driver context cannot start the real physical successor
   through a service-ID lookup.

The first three tests deliberately assert the required physical-owner method
exists. Their baseline missing-method failures establish an interface
prerequisite only. Behavioral predicate proof requires the corrected source
and meaningful negative controls; no claim that an absent method proves a
lifecycle race is made. Other tests retain direct effect/order oracles.
The stale driver pointer in case 9 is an explicitly labelled seam following
real successor selection and physical preparation, not invented authority.

## Existing handler fixture adaptation

`test/node/runtime-service-bound-route.test.js` gives its labelled scripted
runtime the approved full-origin synchronous observation and explicit
retirement `finality`. Its history fixture now supplies the actual required
ALREADY tombstone shape. Assertions are retained. Existing compact hydration
test callbacks were reformatted to satisfy the inherited brace-style errors;
this formatting does not change their meaning.

These scripted answers describe the consumer contract only. Physical-owner
implementation is exercised by the independent native file above. Neither
fixture is abrupt-process, power-loss or multi-machine consensus proof.

## Static preparation

The exact Node 22.16.0 binary and locked JavaScript dependencies were recovered
for static tooling only. Parser/whitespace checks pass. Canonical
`npm run test:metadata:refresh` regenerated the primary/resource/subsystem
indexes and impact seal from the actual filesystem census (2,411 test files).
The pinned MovieLens input was recovered from its canonical URL and checked
against the existing SHA256 before regeneration; no missing-input metadata
was accepted. New generated entries classify this file as integration,
ordinary and wasm-toolchain.

The scoped read-only gate
`node scripts/check-fast-static.js --base 8c9b14141f89872938d21cc35472b262929818d6`
passed in 17,855 ms under Node 22.16.0. Its changed-path census included the
edited JavaScript, rather than an empty range. The gate includes the shard
and impact-contract audits, dependency boundaries, changed-file ESLint and
scoped metrics; it intentionally excludes the repository's full global
ratchets. The subsequently added evidence Markdown does not alter the code
or test subjects of that run.

Publication uses the repository's documented WIP-only precommit exemption;
the native/lab gates are still pending, and no normal hook pass is claimed.
No locally executed source test, mutation run, native build, full static
green result, normal merge readiness or U1 closure is claimed here.
