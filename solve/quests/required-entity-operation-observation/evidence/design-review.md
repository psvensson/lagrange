---
audience: development
---

# Required entity-operation observation design review

Reviewer: `subagent:/root/independent_review`, 2026-11-06. Source baseline: `51269c445a03a0d07326fe86d68c9a6290d75352`; production source remains byte-identical to HEAD. Rule-set revision 5. This is a read-only design and retained-evidence review. No tests or lab jobs were run by the reviewer, and no implementation is approved here.

**Disposition: approve the bounded repair direction provided its sealed scope includes the complete entity-observation interaction below.** The readiness fixture Quest remains separate. No new supervisor, read fallback, deadline extension, or broad service-plane redesign is indicated.

## Measured defect and evidence ceiling

The author's retained executable `required-operation-read-loss.mjs` has SHA-256 `3767a34bd28d802b63c92063a45db171d2516bb7d6922ca7a9af7b78e9b23abf`; its log has SHA-256 `7e35e229f3c1229b0f3098bd7045341ad70446efb129d09166a8ff8510c23c5f`. I inspected both, not reran them. The witness uses the actual repository, coordinator and rebalancer with a controlled authoritative gateway response and explicitly supplied fixture readiness/world. Four actual owner read invocations are recorded in each unavailable case.

With zero retained rows, a failed gateway read produces a repository `deferred` observation and non-null `deferredOutcome`, but the coordinator reconstructs `empty`/null, the required Array facade returns `[]`, and actual critical-topology revalidation returns no blocker. Restoring a successful empty read produces genuine empty authority. With a retained row, the repository correctly preserves `present` plus non-null deferral, which the coordinator also discards. The retained-row log's null topology result is not asserted as the causal failure and should not be promoted into an additional proven scheduling mechanism. These results establish boundary information loss under controlled I/O; they are not formation, durable operation completion, or physical fault-domain evidence.

## One canonical interaction

1. **Repository observation owner.** Retain one entity-scoped observation API with state, operations/count, deferred outcome and retry metadata. At `replica-operation-repository-entity-read-methods.js:142-233`, validate successful `rows` as an Array before decoding. A missing/malformed response must not become successful empty authority. The existing repository builder at `replica-operation-repository-visibility-methods.js:634-653` intentionally permits `present` plus deferral: retained rows are useful evidence but do not prove a complete current owner read. Preserve that distinction.

2. **Coordinator transport of meaning.** Remove the prototype/custom-method adaptation at `rebalance-coordinator-operation-read-methods.js:180-227`. Required reads call the same observation boundary regardless of fixture or production identity. Validate the canonical envelope before consumers use it; unknown states, malformed operation arrays/counts or internally contradictory state/count evidence must refuse. A valid retained `present` plus deferral remains valid evidence, but unusable as proof of complete owner visibility. Do not normalize missing fields into empty success.

3. **Required Array facade.** The existing Array contract may remain a strict extraction from that one validated observation, not an alternative authority or cache path. It refuses any unresolved deferral, including `present` plus deferral. The required mode in `rebalance-coordinator-recovery-helper.js:197-209` must never fall through to the ordinary cache reader when its authoritative dependency is absent. Preserve the existing typed deferred/retry disposition and reason/entity/retry data at the owner that emits it; a generic TypeError without the required caller disposition is insufficient for planner retry claims. `createDeferredOperationVisibilityError` in `rebalance-coordinator-concurrent-budget-gate.js:148-190` is the existing coordinator error owner. Avoid importing coordinator behavior into the repository merely to manufacture that error.

4. **Critical topology consumer.** Remove the missing-reader early grant at `unified-rebalancer-critical-topology-methods.js:377-384`. Call within the existing try/catch and require an Array there so absence, rejection and malformed resolved values produce its existing named `UNAVAILABLE` blocker. Preserve the method receiver and `OWNER_RPC_REQUIRED`. Successful authoritative empty reads remain a distinct positive control.

5. **Inventory handoff.** `rebalance-coordinator-topology-guard-methods.js:473-517` currently passes only state/operations into the inventory, dropping deferral. `replica-inventory.js:498-503` marks only explicit deferred/unavailable states unusable; a retained `present` plus deferral is therefore insufficiently represented. Preserve the full relevant observation meaning across this handoff and let the inventory's existing consistency decision consume it. Do not locally turn generic deferral into empty or into a fresh revision. Any explicit bounded-usable state must still originate at its existing policy owner.

6. **Reachable identity readers.** `rebalance-coordinator-replica-identity-methods.js:114-139` and `:165-195` optionally call the old authoritative Array method and otherwise use `[]`, then merge ordinary cached operations. They feed ID allocation and retired REPLACE-source safety. They must consume the same validated observation and explicit refusal/exception policy, not retain an optional-reader success path. Cached rows may conservatively preserve collision/retirement evidence; absence in a cache cannot prove authoritative absence. Audit the caller outcome at `allocateCanonicalReplicaId` and `getRetiredReplaceSourceMoveSafetyError`, not just the helper return value.

7. **Existing contained-pressure owner.** Keep the named exception at `rebalance-coordinator-pressure-helper.js:98-116` and the explicit topology `bounded_usable` transformation at `rebalance-coordinator-operation-read-methods.js:238-253`. This policy currently requires deferred state, zero visible operations, a deferred outcome and contained priority-recovery pressure. Envelope validation must precede it so malformed/count-disagreeing input cannot acquire permission. Preserve the intended useful creation path through its later identity/safety gates; a unit assertion that only the pressure predicate is true does not establish that the change preserves recovery. Do not broaden the exception to every unavailable read, to retained nonzero work, or to a generic malformed observation.

## Discriminating proof package

- Actual repository → coordinator observation → strict Array → actual topology consumer under the controlled failed gateway, both zero and retained rows; assert preserved outcome/retry identity and no required-read grant. The zero-row pre-repair assertion is already measured red.
- Missing authority, thrown/rejected read, malformed resolved envelope/rows, count/state contradiction, and deliberately incomplete supplied method all refuse. Assert the ordinary cache reader was not called in required mode, including when it has a plausible empty answer.
- Actual successful empty and successful present authoritative reads remain distinct controls. Restore the gateway and observe the next existing owner attempt release the same refusal. This proves recovery on an owner attempt; only a real scheduled trigger witness can support an additional autonomous-redrive claim.
- Real topology guard/inventory tests for both zero and retained-row deferral, not only a mapper unit test. Generic deferral remains unusable; explicit policy-origin bounded-usable zero-row evidence stays accepted only under the existing contained-pressure conditions.
- Actual identity-allocation/retired-source caller paths fail safely with required visibility unavailable and recover when authority returns. Include a contained-pressure positive through its intended useful outcome to detect accidentally stranding recovery behind a newly strict downstream facade.
- Recent operation-intent inspection at `rebalance-coordinator-operation-intent-methods.js:287-334` already checks deferral; retain a regression that unresolved reads cannot discard a recent intent as missing.

Relevant existing suites include `replica-operation-observation-contract.test.js`, the repository deferred-visibility cases, `canonical-replica-inventory-cutover-guard.test.js`, `replica-inventory.test.js`, `rebalance-coordinator-topology-guard.test.js`, and `priority-recovery-stale-planning-visibility.test.js`. Fixture mocks of the replaced Array/prototype branches must be reconciled to the canonical observation shape, with controlled seams explicitly labelled. Frozen affected-caller evidence remains required after implementation review.

## Explicit exclusions

Ordinary cache-mode readers, global incomplete/count APIs, operation-ID visibility, and unrelated service-plane fallbacks are not silently covered by this entity-read repair. For example, the separate repository `getConcurrentRemoveCount` failure-to-zero behavior at entity-read lines 259-265 is an inventory finding for its own owner; it is not evidence this bounded change fixes every unavailable-read path. No claim is made about the CDC lag's first cause, broad E8, E9, publication, main merge, or the epic's completion.

## Source hashes

| Path | SHA-256 |
| --- | --- |
| `src/rebalancer/replica-operation-repository-entity-read-methods.js` | `85b731095f6f7e71bd72e02ccd8936973c4028377447810671d41113cf9b4139` |
| `src/rebalancer/replica-operation-repository-visibility-methods.js` | `1eb7bc55867b2a319bd5e04cdedd09edf314f2483d6639cc6319ef228fce77e8` |
| `src/rebalancer/rebalance-coordinator-operation-read-methods.js` | `cdf568a5e939823b04d46d30d4ae401f2daff8cfb91775e931392356d252c08f` |
| `src/rebalancer/rebalance-coordinator-recovery-helper.js` | `5f3057b84c5c90b5998973634ad6d8ddd7835c6f225b47047cfd366fd2b26f1d` |
| `src/rebalancer/rebalance-coordinator-topology-guard-methods.js` | `a8cf0e1709aa91c2dd33b34ab807cd985726eacaa08fc3b5035d6cd60ac4fea6` |
| `src/rebalancer/replica-inventory.js` | `446d1efba10a5f20bc68901c0588098dfe39fc1ecfad79ef31db5d615d22ad3a` |
| `src/rebalancer/rebalance-coordinator-replica-identity-methods.js` | `bb174620f420b425eb3457c6c251fe299269a6b00ffab9dddad9393140954517` |
| `src/rebalancer/rebalance-coordinator-pressure-helper.js` | `9b640f6b956dacb7b53deda8ef06f2e2e7a54529ea589569ce8374e9b5805d18` |
| `src/rebalancer/rebalance-coordinator-concurrent-budget-gate.js` | `a2ddc20edf9bdac8067a05993cf0b78ce193da1225560bd9d485fd609ce69008` |
| `src/rebalancer/unified-rebalancer-critical-topology-methods.js` | `dbfbffd3bea689d20c4ddc3707fc7fe4b8e3663b721b0e50f6c39798c54f3302` |
| `src/rebalancer/rebalance-coordinator-operation-intent-methods.js` | `1244bfd7640b31a3d0c423dabfeae70e726156f1b73c67f18554d9356fc10eb7` |
