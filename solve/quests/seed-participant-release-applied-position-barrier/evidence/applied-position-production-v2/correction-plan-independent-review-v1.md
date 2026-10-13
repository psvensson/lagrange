# Applied-position V2 correction design: independent review

Verdict: **REVISE, design only.** The PA/R current-context assessment, conditional retained wake, synchronous registry invalidation, and retained same-map resource custody are the correct owner boundaries. Four correction groups below must be explicit before implementation. This is one complete batch; no source/test/metadata/Quest edits or behavior/checker runs were performed.

Reviewed 2026-10-13 22:02 UTC (2026-10-14 local). Exact plan `correction-plan-v1.md` SHA256 `99f11f83e3888d0d90dec8a54cf1809d7068aaef54b376da2edb94b20879034e`, 88 lines. Its binding review is the durable `solve/quests/seed-participant-release-applied-position-barrier/evidence/applied-position-production-v1/independent-source-review-v1.md`, verified SHA256 `7350c29ef69a49da0e16c512d2330ca9ea2814c4a7c6a05b2191db3d9c4c526a`. All 48 dispositions and its exact15-path manifest are incorporated without changing the historical V1 verdict. Actual code inspected is immutable `bb976f03b1dca9989cfd990af7f188e490ac5243`, src tree `aeb56ee8f9a208b693dc2251a11558e7d11386a1`, at `/tmp/session-worktree-Q14Yjd/tree`. No current mutable native-witness bytes are used as implementation proof.

Evidence abbreviations: P = the exact correction plan; O = `src/node/participant-release-applied-position-observation.js`; R = `src/node/replica-handler-participant-release.js`; L = `src/node/replica-handler-lifecycle-methods.js`; PA = `src/partition/partition-participant-transaction-pause.js`; CL = `src/node/participant-release-client.js`; D = `src/node/participant-release-diagnostic-observation.js`; K = `src/partition/partition-participant-release-contract.js`; HC = `src/node/replica-runtime-cleanup-custody.js`; U = `src/utils/strict-own-data.js`. Source line numbers below bind the immutable V1.

## Complete corrections

**D1 — capture at the registered ingress, then primitive-pin before hashing.** P23 puts capture in O, but actual registered `handleMessage` reads payload type/action at L134–143 and R125–133 reads raw action/replica/partition before O. Zero getter/proxy/TOCTOU effects cannot be claimed there. Put one strict own-data capture at the actual release dispatch boundary before these reads, and pass that same captured intent through the new phase. Explicitly add L to the correction scope and state the effect on malformed ordinary release envelopes; preserve valid native and controllable producer shapes and ordinary action policy. Do not add competing capture/decision algorithms at each caller or broaden generic message grammar silently.

U61–87 is deliberately shallow: a nested own data value can still be a box, coercible object, or object carrying `toJSON`. K53–60 applies a regular expression to the digest and serializes it. Copying a plain release record containing such a value does not prevent coercion. Pin the declared scalar types using the existing canonical domains before `releaseIdentityValid`/serialization; consume the existing canonical identity/hash once, never invent a second hash or generation projection. Preserve actual native string lifecycle incarnations and controllable numeric incarnations rather than guessing a narrower valid grammar. Copy/freeze with captured intrinsics or primitive operations; avoid new ambient helper trust. The existing unchanged K/Map/Set algorithms are not thereby certified against every possible intrinsic replacement.

**D2 — one cap arithmetic and one captured clock owner.** P27–31 properly requires a carried absolute ceiling, remaining-first safe arithmetic, and overall-expiry precedence. However P31 also promises the old ordinary timeout function is byte-preserved, while CL29–34 and CL41–53 implement the same cap twice. Preserve ordinary timeout *policy and observable behavior* while sharing its numeric cap operation in CL; specialize input policy where it differs. Reuse D24–26's captured primitive predicate without changing signed diagnostic sampling. State that the starter captures its exact clock/scheduler owner, samples once for registration, and uses that owner's clock for later expiry checks, installation and clearing; replacing `handler.timeSource` must not change which clock adjudicates the original stored deadline. No new fallback, timer cap, normalizer or arrival renewal. `min`/`max`/freeze at the new boundary must not newly trust ambient methods.

**D3 — validate a coherent fresh intent, not merely exact later joins.** P25 promises full join comparison but does not require a new starter's `request.deadlineAtMs === request.attempt.deadlineAtMs`. Require that equality at capture/enforcement, plus release partition binding and target replica binding, before map/budget/resource effects. Use R/K's existing identity decision for this coherent tuple. Invalid grammar/body returns INVALID; a coherent valid different intent is STALE. A changed top-level deadline with an unchanged attempt is INVALID, not a valid STALE join. A coherent changed pair of deadlines is the separate STALE/nonrenewal witness. Exact joins must return the stored starter Promise including after settlement; a cleanup-triggering join cannot clean the slot and create a renewed starter in that same call.

**D4 — finish the resource custody contract, including acquire reentry.** P57–71 is sound in retaining failed entries in the existing map and surfacing them through the existing handler AggregateError. Specify these missing details together:

- Actual API grammars determine successful retirement. Native Raft unsubscribe returns `Set.delete` at `src/raft/raft-rs-operation-port.js:364–367`, registry unsubscribe likewise at `src/node/replica-handler-membership-relay.js:71–73`. False means already absent and is idempotent completion; it is not a generic cleanup failure. Timer clear returns void and EventEmitter.off returns the emitter. Do not impose a fabricated boolean failure convention.
- Keep bounded error state per exact acquired resource (for example one retained actual error plus a bounded count), not an append-only error array on repeated callbacks/joins/shutdown retries. Retire successes once, retry only failed entries, preserve actual error objects and exact record/handle identity. At most the declared subscriptions, registry listener, service listener, and timer are owned; no parallel debt store or retry timer.
- Installation must stop acquiring after synchronous terminal/reentrant cancellation. An acquisition in progress must retain a pending slot before invoking its owner; if that call cancels the record and subsequently returns an unsubscribe or timer handle, retire that late resource immediately under the same record. Never resume installation or forget the late handle because an earlier cleanup looked complete. Include subscribe and timer reentry, not only ordinary timer callbacks.
- Preserve the original settled answer/Promise during cleanup retries; keep a failed record blocking replacement until custody is discharged. Handler cancellation is inside existing owned shutdown settlement before awaits, followed by the same final custody check, so exceptions cannot strand `shutdownPromise` and every independent service release is still attempted (HC88–135).
- `participant_release_cleanup_incomplete` is a new domain reason. Name/import it at the existing cutover value owner, explicitly add that path to scope, and retain the current UNAVAILABLE identity/missingFact/retry shape. Do not introduce a new result API or magic local reason.

## Accepted design portions and proof qualifications

P35–53 correctly keeps membership/status/facts assessment in PA, generation projection at PA67–74, exact request/fence decision in R, scheduling/dirty retention in O, and final release authority in the existing classifier/resume owner. PA may expose a bounded assessment of the one authentic committed N/current K applied mismatch, carrying actual measured context; it must not turn all unreadable facts into refresh eligibility. R must revalidate registry/lifetime/build/pause/term/leader/configuration/membership generation/full current generation after awaits even when the wire fact is unavailable. A satisfying first observation settles without a second read; only valid below-watermark or same-context stale-applied evidence may consume a retained dirty wake. Registry set/delete is already synchronous authoritative notification (`replica-handler-membership-relay.js:44–68`), so prompt STALE does not wait on the held membership answer. Ordinary PA/recipient await races remain explicitly inherited/out of this correction, neither certified nor quietly fixed.

P75 correctly keeps exactly two existing endpoint IDs and adds the actual native primary to both selection forms. Final source/test hashes and canonical metadata must be rebound after content approval. The V8 witness cited by P83 was separately REVISE; subsequent V10 content review does not supply behavior proof.

The controls' ambient Number/Object mutation must isolate the new client/budget guard: unchanged K27 and PA54–56 still use ambient `Number.isSafeInteger`. A transparent transport tap can restore the intrinsics immediately before delegating the original request once to the real registered recipient, thereby testing the new client boundary without hardening unrelated owners. It cannot claim blanket recipient resilience. Retain direct recipient malformed/current-context controls separately.

## All48 category dispositions (design; evidence pending)

Each item in the V1 full matrix remains binding. These dispositions cover every item, with scoped N/A only where stated:

| Category/item | Disposition and exact evidence |
| --- | --- |
| Admission1 | REVISE D1/D3: precheck and enforcement consume the same captured coherent canonical tuple, P23–25/R81–114. |
| Admission2 | APPROVE intent: malformed INVALID, coherent conflict/lifecycle STALE, real dependency/clock/cleanup UNAVAILABLE; D1/D3/D4 must preserve that distinction, P25/31/39/59. |
| Admission3 | REVISE D2: existing5000ms cap/original deadline, no arrival renewal; CL29–53/P27–31. |
| Admission4 | APPROVE proposed existing releaseAnswer wrapping, P39/K181–184; D4 reason ownership required. |
| Admission5 | REVISE D4 actual release completion/debt; final OPEN still PA-owned, HC/PA unchanged authority. |
| Admission6 | APPROVE intended fresh PA/R decision after each await, P35–51; no cached permission. |
| Admission7 | APPROVE intended actual release/partition/phase identity on typed refusals P39; malformed records use safe copied/empty identity D1. |
| Retry1 | APPROVE conditional retained wake P41–49; no timer polling/reconstruction driver. |
| Retry2 | REVISE D2/D4: original RPC/attempt expiry and retained cleanup lifetime explicitly owned. |
| Retry3 | REVISE D1–D4: invalid/stale/unavailable exits are loud and complete, P25/31/59–71. |
| Retry4 | APPROVE prompt registry/handler/service cancellation design P51/71; D4 installation reentry must not reintroduce waiting behind itself. |
| Retry5 | REVISE D4 bounded per-resource errors; one replica record/dirty bit/refresh flag otherwise P49/69. |
| Retry6 | REVISE D3/D4 exact settled join and inactive tail/identity deletion, O72–76/P51/69. |
| Retry7 | APPROVE carry-forward runtime publication/ACK separation from V1; no new counter/ACK permission. |
| Concurrency1 | REVISE D1/D3 coherent capture before map and exact canonical backstop, P23–25. |
| Concurrency2 | APPROVE intended complete PA/R revalidation P35–39, inherited ordinary race explicitly excluded P53. |
| Concurrency3 | REVISE D3 stored winner/Promise on every exact join; no cleanup-triggered successor in the same call. |
| Concurrency4 | REVISE D2/D4 scheduler identity, acquire cancellation and late handles; P57–71. |
| Concurrency5 | APPROVE per-current-handler/exact-replica/service identity, P25/51 and R129–132; no address alias. |
| Formation1 | APPROVE carry-forward canonical build/membership/status/origin/work reads, PA84–111/P35; no new subsystem read. |
| Formation2 | APPROVE intended post-publication wake plus synchronous lifecycle cancellation P49–51; no CDC/self dependency. |
| Formation3 | APPROVE unchanged CLOSED/full classifier/final guarded RESUME; OBS facts are never permission, P19/53. |
| Formation4 | REVISE D2 clock domain/window; hard budgets retained and every future healthy expiry remains red. |
| Formation5 | APPROVE no tick/election/proposal/read repair/pause reset/raw-core/cached OPEN, P19/49/84. |
| Harness1 | HOLD proof: exact source/treatment negatives must engage owners, not missing action/import or setup. P81–88 and V1 Harness1. |
| Harness2 | APPROVE intended real registered handler/service/native seam; controllable immediate-apply ceiling explicit, P81–84. |
| Harness3 | REVISE D2; no timing compression or extra wait, P27–31. |
| Harness4 | REVISE D1/D3 all carried/current/attempt/generation fields coherent; no inferred optional deadline. |
| Harness5 | HOLD native N/K, one-read, cleanup failures, real pending work/final-query nonvacuity until exact runs; P81–84. |
| Harness6 | HOLD all startup/corpus/Quest/main/full-cutover claims, P88. |
| Owner1 | APPROVE intended PA facts/R request/CL budget/O scheduling/runtime publication/K admission split, P35–49; D2 eliminates remaining formula competition. |
| Owner2 | REVISE D1/D3/D4 exact typed boundary and valid producer preservation; no alternative verdict. |
| Owner3 | HOLD same-witness paused/no-effects + same-attempt release/K+1 and source-only red, P83–88. |
| Owner4 | APPROVE intended fresh-first-read vs authentic stale-N distinction P43–49; no permanent stale veto or unconditional second read. |
| Owner5 | REVISE D2/D4 no extra wait/renewal/unbounded error growth; current pressure/singleflight otherwise unchanged. |
| Owner6 | REVISE D4 owned cleanup/debt; P51/57–71 release/cancel converges on one map/lifecycle. |
| Owner7 | APPROVE passive event/diagnostic projections cannot grant release, P19/41 and carry-forward V1. |
| Owner8 | HOLD immutable final A/B and dirty-only treatment; plan hash is a design fingerprint, not a run receipt. |
| Owner9 | REVISE D2 and D1: shared arithmetic/canonical hash/projection only, no copied predicate or raw read; P35–39 otherwise sound. |
| Owner10 | APPROVE two-form/two-endpoint registry design P75; canonical generated selection audit remains pending. |
| JS1 | REVISE D2/D3 primitive safe nonnegative/-0/MAX domain and derived duration safety P29–31; signed diagnostic meaning unchanged. |
| JS2 | REVISE D1 strict own top/nested declared input before ingress field access; U61–87/R125–133/L134–143. |
| JS3 | REVISE D1 single capture and D3 immutable intent across joins/awaits; no raw reread. |
| JS4 | REVISE new-boundary intrinsic capture D1/D2; unchanged K/Map/Set pollution assumptions explicitly unclaimed. |
| JS5 | REVISE D1 nested primitive boxes/coercible values rejected before effects; shallow record copy alone insufficient. |
| JS6 | REVISE D1/D2 captured new guards/operations; scoped client mutation witness, not unrelated-owner hardening. |
| JS7 | REVISE D1 type-pin before K53–60 canonical hash/serialization; preserve one existing identity algorithm. |
| JS8 | N/A new peer/array decoding: none proposed, P19/35/75; reuse unchanged bounded canonical membership/census and fixed owned resource slots. |

Approval remains withheld for this correction design. Root should record one explicit scope/contract revision for D1–D4, then obtain narrow design re-vet before releasing a source batch. Exact-source, tests/fixtures, generated metadata, no-new static/duplication/unused gates, locked candidate/source-control/dirty-only measurements, full selection and actual startup remain separate HOLD gates; no inherited red is waived.
