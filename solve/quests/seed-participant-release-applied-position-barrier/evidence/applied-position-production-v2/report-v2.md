# Applied-position production V2 freeze

## Binding

- Worktree HEAD at implementation start/current freeze: `ef99b5fc4519079774348b479e8b5d94f14cb058`.
- Authorized source ancestor: `9ba9a1941b2326d0d0bcfa49c581cc2fcf74af8d`.
- Rejected V1 comparison: `bb976f03b1dca9989cfd990af7f188e490ac5243`.
- Combined correction design approval: `9c35458737d7b4d0499bb26dd06edc0798f241f67de0e35db371609d0bbca36d`.
- No behavioral or lab tests were run. No commit, push, metadata refresh, test, Quest, or fixture edit was made.

## Final production behavior

The release ingress captures immutable scalar identity before canonical hashing. Unsafe shared-message discriminators retain the existing generic unknown-message response; a safely identified RELEASE with malformed nested identity receives the existing invalid-release response. Valid ordinary messages keep their prior dispatch policy.

The release contract is the single generation-domain owner. `participantReleaseGenerationValid` serves strict ingress capture and the participant transaction facts owner. Trusted facts are projected once and are not recursively strict-decoded.

**Ordinary facts and OBS policy remain distinct.** Ordinary canonical fact reads preserve the predecessor term/configuration/applied-index coherence policy. `OBSERVE_APPLIED_POSITION` composes its stricter membership-generation lineage check inside that same facts owner: only the exact same current lineage with committed N below observed K may mark a stale-applied refusal refresh-eligible. A retained dirty wake may then request one fresh canonical observation. Without that retained dirty wake, the actual typed refusal settles immediately. This adds a membership-generation coherence refusal for malformed/current OBS pairs without duplicating or silently tightening the ordinary facts predicate.

The recipient owns one exact retained record and stored inner promise per immutable intent. Matching calls join it without renewing the deadline; conflicts remain typed. The sender supplies one captured absolute clock-derived ceiling, and the receiver applies the earlier valid local ceiling using the same canonical absolute-clock domain and captured scheduler. Invalid clocks/arithmetic return typed unavailable answers.

The observation owner subscribes before its first facts read, rechecks exact service/port/handler/registry/build/term/configuration/membership/pause/deadline context after every await and resource acquisition, retains one dirty wake across an in-flight read, and cancels promptly on registry replacement/removal, lifecycle, term, leader, or membership changes. Cleanup uses fixed resource slots, bounded per-resource error custody, a reentrancy guard, late-handle retirement, and starter-identity deletion. Actual thrown values, including `null`, remain represented by slot state rather than a null sentinel. Handler shutdown cancels before its awaits and retries retained cleanup custody in the existing aggregate-error path.

When the already-fixed RPC duration timer fires, it always terminalizes the observation. The single clock observation still gives overall deadline and invalid-clock outcomes precedence; if neither applies, the fired duration bound returns the existing `UNAVAILABLE` / `replica_release_reply` / `MESSAGE_TIMEOUT` answer. A backward wall-clock step therefore cannot re-enter the wake path after the fixed timer has expired. Ordinary pre-timer clock observations retain their prior nonterminal meaning.

The original V1 publication/cutover paths stay intact: payload-free applied-progress publication, post-ENABLE applied-position observation, fresh final census, current control-owner proof, guarded resume, and ordinary release actions. The impact registry now binds the native application-order witness in both required existing representations/endpoints.

## Exact scope

`source-manifest-v2.sha256` binds 16 source files plus `test/shards/impact-contracts.json`. `correction-paths-v2.sha256` binds the exact ten V2 correction paths. Seven reviewed V1 owners remain byte-identical:

- `replica-handler-participant-cutover.js` — `6cd1791d601242e2f2e4bc83be9f5b64c10ec8e7968a65e3f683139773e59428`
- `partition-service-constants.js` — `c79127084092c6555e4cf7e4bf75b274ea4f50089ab85bed323ebdad43220a85`
- `partition-service-lifecycle-methods.js` — `381038cb68e629a74e44f737954865753cbf1c50c8423df85208a929cf801ba0`
- `raft-operation-port-constants.js` — `87c556c3fb2709f6efae5a941b278c357f662ad469149c41ab4b7a0fb0de9389`
- `raft-rs-operation-port.js` — `ab3b0a3c27b1568ab644d458ebcf078f47d8da98255d41317bdc766923ff0597`
- `raft-rs-runtime-owner-constants.js` — `f31e5d791d55618d5c0441c509b0c2e068d2cb97cba6aa51f82ac683c44ce9a8`
- `raft-rs-runtime-owner.js` — `a75bd8fbcc9c65c3145944820d192aefbc31c5e916d163694d0ec5417edef94e`

The whole delta from `9ba9` is 17 paths, 887 insertions and 112 deletions. The correction delta from rejected V1 `bb976` is ten paths, 601 insertions and 182 deletions.

## Static evidence and holds

Syntax, exact ESLint, diff-check, impact contracts, shard registries, dependency cycles, and dependency rules pass. Scoped cognitive complexity is green. Scoped strict cyclomatic/combined metrics retain four inherited findings only: `fenceFailedReplicaCreateRuntime`, `transactionReleaseProofValid`, `releaseFactsDefect`, and `releaseCensusDefect`.

Global static holds remain explicit: unused-export ratchet 1449 versus 1416; inherited global file-size reds; and the guideline literal audit reports 328 findings before the suite can continue. No baseline was increased and none of these reds is presented as acceptance. Every changed source is below 800 LOC. Exact outputs and their hashes are recorded in `checks-manifest-v2.json` and `check-logs-v2.sha256`.
