# Operator ruling: hardware-sensitive test cost

Authority: user instruction in this continuation, 2026-10-12. Up to 10x an
observed test-case target is acceptable because VM/hardware differs. Targets
remain 2 s/unit and 30 s/integration; tolerance ceilings are 20 s and 300 s.
This supersedes only the elapsed-case hard-error wording in
test/guidelines/harness.md. Protocol/caller/seed/lease/election/retry deadlines,
assertion budgets, non-timing failures and pending independent review remain.

The prior boundary case at 5380.348862 ms is 2.690174431x its 2000 ms target:
TOLERATED_OVER_TARGET under this ruling, not a new measured run or a rewritten
historical pass. Actual measured source was 5833c254, run 38247043718.
The WASM safety red, cleanup masking, receiver-snapshot history finding, legacy
transaction proof and literal/patch-representation failures remain open.
