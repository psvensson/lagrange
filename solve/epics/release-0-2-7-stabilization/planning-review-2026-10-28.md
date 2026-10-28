---
audience: development
documentClass: evidence
---

# Independent review of the 0.2.7 planning change

Base source: `98e69ba13db8f9a5bbf6bc919d6e9c941b07ac8e`.
Reviewed on 2026-10-28: the release epic, requirements, verification dossier,
evidence manifest and seven inert witness-source attachments. Scope is
verification and planning, not a runtime repair or release certification.

## Initial findings and resolution

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| subagent:verify_sql_027 | Blanket incomplete-run wording could hide measured product failures | Q17 preserves measured safety/liveness/resource failure and existing certification sample classification |
| subagent:verify_raft_027 | Interrupted/partial/unverifiable archived attempts must retain failed-sample/reset semantics | Q17 now links and preserves the existing certification owner |
| subagent:verify_raft_027 | Future scenario probe also requires actual recordedLog binding | Epic/Q17 explicitly require the real append-only certification Quest log before acceptance; no fake record is created now |
| subagent:verify_release_027 | Q17 candidate gate depended on Q16 post-publication confirmation | Candidate qualification now precedes authorized publication; registry confirmation then gates epic closure |
| subagent:verify_sql_027 | Legacy partly-committed quote was strengthened inadvertently | Q14 uses the exact current capability wording |
| subagent:verify_raft_027 | Narrative message-group/transport scope absent from authorizes | Epic includes those owner directories; each future Quest still needs bounded scope |

All three reviewers rechecked the corrections and returned **approve**.
The SQL reviewer additionally noted that archives without a recorded log can
be measuring but not done; the final wording preserves that distinction.

## Retained review conclusions

- SQL, Raft and release/ingress measurements remain accurately scoped.
- All seven attachment SHA256s and byte counts match the manifest.
- Relative Markdown links were checked; existing ownership references resolve.
- Native versus source-only and artifact versus source-tree claims are distinct.
- Existing seals, admitted-work custody, TX1/SN1, proof reuse and edition
  boundaries are preserved; no arbitrary TTL cleanup or parallel authority.
- The planned terminal scenario is absent/unmeasured, with no sealed Quest or
  pass receipt manufactured to represent completion.

The repository documentation/audience/roadmap checks validate the planning
surface separately. Their success does not establish 0.2.7 runtime acceptance.
