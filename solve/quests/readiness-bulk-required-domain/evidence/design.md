# Bulk readiness node domain

Candidate at seal: 04459151a2813fe24e0cc99e2d3eda431f8902a7, rule-set revision5.

ControlPlaneReadinessService owns bulk enumeration. The shared collector combines
published and explicit required node IDs with observed node, service, current
endpoint and retained readiness evidence. Its unconditional observer ID append
invents a member when no such evidence exists. The inherited bulk refresh test
then observes an extra entry and extra authoritative repair reads.

Delete only that append. The existing requiredNodeIds parameter is the one way
to explicitly request any otherwise-unobserved node, including the observer.
Published or required missing-row nodes still receive explicit negative answers.
The actual sync evaluator and the authoritative bulk owners remain unchanged.

Independent prior design review: subagent:/root/independent_review,
independent-readiness-cleanup-design-review.md SHA-256
0206272720dacb4325d11efd85bc529d18c380c2607f34290ee8fe0a7116b6ac,
section on bulk domain. Its36 input manifest SHA-256 is
24e292e7cdfef82feaaacdb52cb5cd77a6d96b4e1ee2adcb93700d401db7dacc.
Those readiness inputs are unchanged from d511 to this seal candidate.
Implementation still requires independent review.

Planning cost and missing-both-rows grace are separate recorded concerns.
No schedule, lease, quorum, readiness permission or test bound changes here.
