# FreshMG implementation progress - 2026-10-08

This is a continuation record, not a new Quest or acceptance rule. Existing
message-group-fresh-identity-membership and its eight complete-operation
receipts remain authoritative. All published increments below are WIP and
unmerged; no independent approval is inferred from tests or requested review.

## Exact published increments

| Increment | Branch / PR | Published head | Measured source |
| --- | --- | --- | --- |
| Existing dormant holder and branch-authorization foundation | work/freshmg-branch-authorization-20261008 | 01463d0cda429840aeeb31cb17efae4f34a1d11c | Existing foundation, not reapproved by this continuation |
| SQL NULL ordinary-lease claim correction plus cache witness | work/freshmg-null-claim-20261008 / #105 | 2b754edd5b5e026a43e1d9022306549374fada79 | 72726c495701d6276746271c75dda6e8519e3795 (source fix); 98b4de5f31094e397ce97019d72ebfcadb2a2b36 (real cache integration) |
| Terminal non-admission and returned-read-failure correction | work/freshmg-terminal-nonadmission-20261008 / #106 | 9ab6470f8728b0322a864bdaec917701f39d707b | 8d57e4093d297953f2cf563c634147cea0b79487 (T0); f9f341ae20cf29d3957b86a2b594b807ef61da10 (typed observation + generated metadata) |

The underlying C0 classification branch is
integrate/rs-raft-contract-first-20261008 at
ad02002076ce7fb761254ab05538782228cc6d18. It has no runtime changes.
Its terminal-membership-resolution.md describes T0/T1/T2 and preserves the
approved J1 forward-recovery boundary at durable promotion authorization.
C0 replacement/snapshot/independent-review receipts remain open.

## What changed in the actual repository owner

1. An omitted decoded ordinary lease matches SQL IS NULL, not an undefined
   bound equality. All exact lease-renewal and holder predicates remain.
2. settleMessageGroupMembershipNonAdmission resolves a terminal intent that
   never issued a membership action: one exact row CAS clears only the lane
   and records definitive_non_admission. It neither revives ordinary work nor
   creates a new holder. An existing holder must be current/local/live.
3. The shared observer consumes the existing authoritative visibility result
   with requireAbsenceConfirmation=true. Returned read failure is UNAVAILABLE,
   confirmed empty is CONFLICT, and unreadable postwrite result is UNKNOWN.
   No new retry owner, cache authority or persistence store was introduced.

## Measured proof and limits

- 37765480208: NULL-lease two-case test-first RED; same tests after fix GREEN,
  three files/62 reported assertions; removed-lease-predicate mutant RED; lint
  PASS and clean checkout.
- 37767400569: T0 test-first RED then four files/120 reported assertions GREEN;
  removed-holder-predicate mutant RED; lint PASS. The initial publisher failed
  on obsolete --quest syntax; exact passing source was recovered and pushed
  without rerunning measurement. Prior test-loop lint failure 37766536144 is
  retained, not greenwashed.
- 37770209784: returned-read-failure tests RED before correction; same four
  files/126 reported assertions GREEN; absence-confirmation-false mutant RED.
  Canonical metadata producers and audit:shards PASS, targeted lint PASS,
  final tracked state clean. Original independent findings 4218254620 and
  4218254688 are retained with the exact source response.
- 37770527496: real single-seed gateway/SQL/Raft/CDC/SystemTableCache visibility
  PASS, lint PASS. Existing RebalanceCoordinator shutdown is joined BEFORE
  inserting the synthetic operation row. The data path remains real/live;
  the separate real repository facade uses the issued boot. Exact NULL SQL
  arm, returned claim, cache claim, unchanged identities/status/lease, single
  row and no physical fixture service are asserted. This is NOT proof under
  active reconciliation or a valid physical source/CREATE admission.

Every final passing result and preceding failed experiment is retained via
canonical evidence assets plus JSON/append-only logs on its source branch.
The first two suites use file-backed SQLite with a substituted distributed
SQL gateway. They do not prove multi-host membership or late runtime actions.

## Findings that must not be lost in the passing cache result

The initial booted founder service lacked the nonempty CREATE-attempt token
expected by the new identity format (37767526592). Determine the actual
founder lifecycle authority before changing admission. Never invent a token
or treat the synthetic cache fixture as proof of founder compatibility.

The synthetic row initially entered ordinary reconciliation (37768602809);
then holding its operation key still did not exclude all ordinary lease
touches (37769585028). The latter recorded a claim but correctly failed the
NULL-SQL engagement assertion. These are retained owner-interaction facts,
not proved by the final quiesced-owner test. The future membership driver
must establish its own explicit relationship to ordinary lease/dispatch.

## Next bounded work

1. Address exact-head independent findings for #105/#106. The cache response
   is now measured; the typed read/shard corrections are measured. Neither
   review request is approval. Broad source/owner interaction proof remains.
2. Reconcile the accepted source stack and append-only evidence into one
   candidate. The base branch advanced independently, so #106 is not presently
   merge-ready. Refresh canonical metadata again on the composed bytes;
   preserve both histories, never force-push or drop evidence to resolve it.
3. Implement T1's exact terminal committed-learner abandonment arm under the
   current membership holder. Promotion remains nonterminal-only; a promotion
   authorization that wins first retains J1 forward recovery. Test both CAS
   orders and unchanged ordinary terminal/reservation fields.
4. Complete initial learner authorization, immutable action context, exact
   runtime request/readback and existing CREATE worker admission. Resolve
   founder source-generation compatibility through its actual owner. Wire
   outstanding membership debt, including terminal records, to the existing
   reconciliation owner; do not add a parallel workflow/lease/store.
5. Only then unpark the planner/handler for the proved complete chain, followed
   by real state transfer/promotion/handoff/source removal, restart and two
   serial off-seed replacements using Actions/GCP physical acceptance.

Keep PR #73, all salvage refs, main and the final A1-v13 compatibility gate
unchanged. No full FreshMG receipt, C0 terminal or release claim is granted
by this progress record. The unused early claim-API draft is already preserved
as inert evidence, not an alternative implementation contract.
