# Independent first-baseline classification

ACCEPT the preserved run as two existing-behavior positive controls and two correctly engaged semantic REDs. This is baseline evidence, not approval of the later source candidate.

Reviewer: subagent:/root/native_witness_verifier, 2026-10-15. No tests were rerun and no source, raw evidence, process or lab state was modified. I parsed the four raw diagnostic payloads independently and recomputed their recorded hashes.

## Executed identity and custody

- Test checkpoint: 04391697aeabea5ddd504491321546212b95982e.
- Host: lenovo-laptop; native RF3 replicas share this one physical host.
- run.log records placement-head=04391697aeabea5ddd504491321546212b95982e and placement-env retry:0. One classified file execution is present.
- Placement: /home/peter/projects/lagrange/test-output/placement-worktrees/04391697aeab-mv9sjpzi-2092154.
- Whole-file exit 1; four subtests, two PASS, two FAIL, no skip/cancel/todo.
- Classified duration 3650ms; raw TAP duration 2417.582289ms. These are different measurements.
- The raw.tap bytes match the complete corresponding lenovo-prefixed segment in run.log.
- discovery.json describes pre-placement fleet checkouts; their different initial heads do not override the actual isolated placement identity.
- The controller now has an in-progress production edit owned by the parent. I used git show of the executed checkpoint for baseline source identity rather than attributing current dirty bytes to this run.

Approved unchanged test SHA256:
9cb552e83ef5fcdcc1ab0248961b7e2b9f14961542b3c1178fad3a95b8d2c1ff.
Approved helper SHA256:
4ac1dce5cc8bb72de533055b03ea892fb212fbd24d16b586edac21243fdc014e.
Executed checkpoint runtime-owner SHA256:
a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b.

## Exact observed classifications

| Subtest | Classification | Native evidence |
| --- | --- | --- |
| Queued admitted capture | PASS, existing behavior | Two exact accepted heartbeat occurrences step at sequences 669 and 678; both real replies precede selected propose 687. Predecessor propose is 660. Selected bytes appear once and are present in a real forwarded native message. |
| Consumed-wake remainder | Semantic RED: live-tail extension | Two occurrences are accepted, stepped and replied. h1 steps at 1407. h2 is accepted during the first reply hold, after which the actual wake reports callback and turn-request. After the last external progress event, h2 steps at 1416 BEFORE selected propose 1425. Failure is the named selected-before-late-input assertion at test:101, not missing input, setup or timeout. |
| Pre-dequeue current-execution guard | Semantic RED: accepted occurrence lost before guard | Both occurrences were acknowledged inbound-enqueued. h1 steps once at 2066 and produces one real reply. The explicit WebAssembly.RuntimeError injection at final status causes the existing HOST_FAILURE/runtime-generation-changed result. A separately marked real recovery tick replaces runtime generation 1 with 2, restoring three groups, but no second native step/reply appears. The named preservation assertion at test:230 fails 1 !== 2. Selected never enters native propose. |
| Capture after actual ensureExecution wait | PASS, existing behavior | Real application failure starts with durable applied=2, committed=3. Reconstruction calls free/create_node in generation 2, reaches persist_ready and the real host transaction hold. A heartbeat is accepted during that wait, then steps at 2926 and emits its reply before selected propose 2935. The exact final result is CORE_OK/drained, applied=3, committed=3, markerCount=1; selected bytes are forwarded once. |

For C2, the baseline proves late input extends the current drain. It does not show loss or lack of service. For C3, the source at the executed checkpoint removes an envelope at runtime-owner:1700 before invokeCoreAt checks runtime health/generation at :1709; the injected final announcement failure occurs at the intended gap. The observed missing second step after successful explicit reconstruction is therefore source-correspondent preservation failure. This is not proof of autonomous recovery: the test labels its later tick as a separate recovery driver.

The fault is explicitly injected at the existing native-call boundary. It is not a claim that the underlying WASM spontaneously trapped. The subsequent runtime replacement and operation-port results are real owner behavior.

## Payload and cleanup checks

All four measured diagnostic payloads decode. For each case I checked:
- actual-message SHA256 against the recorded native-step hash;
- reconstructed native transport envelope (protocol/group/from/to/message in production owner order) against every recorded native-send packet hash;
- input-envelope hashes against the matching actual heartbeat shape, including every duplicate occurrence;
- exact CORE_OK/inbound-enqueued acknowledgement shape;
- proposal command bytes against the decoded actual native forwarded entries.

All checks agree. Each of four cleanup records is settled=true, retainedDirectory=null, error=null. Cleanup observations are separate from the measured diagnostics and are not used to turn a RED into a PASS.

Derived evidence, which does not replace raw TAP:
- /tmp/lagrange-runtime-correction-20261015/companion-first-baseline-event-summary.json
- SHA256 74a6c6013a1539168f0e6bcfb9e2c34f261656430c51d1a95e4fe59f10c70ab4

## Reviewed immutable input hashes

All inputs are under /tmp/lagrange-runtime-correction-20261015/companion-first-baseline/:
- raw.tap: d170d052e70204c0fe0b90d1a406f7623021582343f9cec41d904cd25143ae80
- run.log: e216c67e1ae03163b78bb0b398d34fecfc4acdf7f14f398b69476ce70236153a
- plan.json: 14edf1ae6ceb73230fdd19be1eb413be3f9a5e102a400927a48c3cf075d24412
- discovery.json: cf262526b30b59a2696c4ee4984cde4df51c88b9ce2dc50adede4fd16126a2ab
- exit-code.txt: 4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865

The category-complete source/fixture decisions remain in the preserved round-1 and round-2 pre-run reviews. This receipt closes their first-baseline evidence classification only. Candidate whole-file results, source review, identical-test predecessor and incorrect-capture controls, affected-owner suites and final evidence review remain outstanding. No release/snapshot/TX1 protocol claim, physical multi-host certification, successor activation, Quest completion or merge authority follows.

