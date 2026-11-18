---
audience: evidence
recorded: 2026-11-18
---

# GCP-line takeover, 17-18 November 2026: designs, audits and owner decisions

On 17 November the operator asked a Claude Code session to take over the GCP line of PRs #224-#226. This directory holds that session's audit, verification and design records. The code lives on the `claude/*-20261117` and `claude/*-20261118` branches.

## Owner decisions (17-18 November 2026)

**Formation and placement**
- Formation: replace the wake, stagger and Phase B series (f0dfc1a2b…380fc5f8b) with one level-triggered placement owner ([placement-owner-design.md](placement-owner-design.md)).
- Founding: system partitions are founded with a single voter and grow by learner ADD plus PROMOTE. Growth never commits an even voter set. REPLACE uses a named N+1 window with a REMOVES_LEADER refusal and roll-forward only. ADD and PROMOTE are separate operations ([founding-membership-design.md](founding-membership-design.md)).
- Formation latch: the declared host count D is set at seed bootstrap. FORMED means D hosts are READY and the six priority partitions are spread. Reads are allowed before FORMED; writes and DDL are refused with 57P03 ([formation-latch-design.md](formation-latch-design.md)).
- Release: latch, placement and founding ship in ONE release behind ONE version fence. Old clusters are re-founded.
- Host identity: a required, declared `NODE_HOST_ID`, stored in `NODES.host_id`.
- Placement resync may admit work only under four conditions: every clearing trigger exists in code, the interval is fixed, any resync admission raises an alarm, and acceptance requires zero.

**SQL**
- SQLite evaluates the coordinator merge. Every JavaScript SQL evaluator is deleted, and values travel in one typed wire format ([coordinator-sqlite-merge-design.md](coordinator-sqlite-merge-design.md)).
- The guarded exact integer SUM/AVG partial is part of the merge Quest.
- The facade adopts the single input-typing table.

**Benchmark, transactions and nodes**
- The benchmark runs Lagrange at product defaults, with one readiness bound for every arm.
- Row-level participant concurrency is finished properly as its own Quest ([row-level-participant-concurrency-design.md](row-level-participant-concurrency-design.md)).
- A wiped node rejoining under the same node id is handled automatically, refused when host ids conflict ([node-incarnation-design.md](node-incarnation-design.md)).

## Findings
- [audit-candidate-4b0c8ec1d.md](audit-candidate-4b0c8ec1d.md): the formation series is a timer, wake and lottery scheduler that breaks the sealed no-timer rule. Defect classes D1-D4.
- 29 candidate regressions against main, invisible to the composed gate. Bisected in `classify.tsv` and `bisect.txt`, and fixed on `claude/fix-{a,b,b2,c,d,j,k2,m}`.
- [pregate-219c27bfe-summary.md](pregate-219c27bfe-summary.md): the physical three-host pre-gate failed.
- [review-query-semantics.md](review-query-semantics.md): the coordinator's SQL evaluators diverge from SQLite.
- [verification-fixes-a-g.md](verification-fixes-a-g.md): independent verification of fixes A-G.
- A raft-rs removed-leader wedge (RemoveNode(leader)), being fixed on `claude/fix-raft-selfremoval-20261118`.
