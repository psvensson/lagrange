# Independent offline candidate request-builder delta review

Reviewer: `subagent:/root/retained_effects_tests`.
Verdict: **APPROVE the bounded builder delta for preparing a request.** There
is no final request packet to approve, no submitted job, and no executed source,
test, collector or installed worker in this review. Only AST parsing was run.

## Exact material

| Material | SHA256 |
| --- | --- |
| Candidate `/tmp/mg-delivery-candidate-lab-request.py` | `4d07e125ebb1bf5db596933fdabc565023a7205fdcb5524c8fa65ea84a330b47` |
| Original `/tmp/retained-effects-lab-request.py` | `69641b89ba0d4ca33bc4d45a2c0af87c47653c81ab4efc7f3ec538e559d62df6` |
| Approved collector `/tmp/retained-effects-canonical-tests-with-tap-r2.py` | `ae248b12797118ec5bbfdb671262337cec22f6599cb92208c93208911f1c1aa1` |
| Installed `lab_pool_work_contract.py` | `2d6e5e3c2f032e205c37cbc8ecd1bb7fded442196fa22d91fc5c0fe4625f6586` |
| Installed `generic_worker.py` | `0e363da23b2552bb65ca9bc7590c4f057546cc4d77fe89746535bd881c73cc40` |
| Installed `generic_task.py` | `c298c08ea7bd219b604334f62cbdc0ca87b336cc4b54f8e200b5e4fc7c4bb326` |

Installed files were read from the builder's pinned release path:
`/home/peter/.local/share/lagrange-lab/current-releases/53e262450fada3b4e706898201a3c732811ae4d0/0da649d0fd6a4b6fb9679fb9d5ac4f59`.
All listed hashes were independently checked. The complete original/candidate
diff is limited to an optional collector-path argument and the tests-driver
argv/environment construction. No installed file was changed or imported for
execution. AST parsing of both builders and the collector passed.

## Exact command and test selection

The tests branch reads the collector text and checks its SHA256 before embedding
that exact executable text as an argv element (`candidate:89-96`). The reviewed
text is never interpolated into the shell program. The shell program is fixed:
the unchanged Node PATH setup followed by `exec python3 -c "$1" "${@:2}"`.

The installed tests driver validates the selected files and retains the explicit
argv prefix unchanged (`generic_worker.py:324-344`). Its task executes one
`prefix + files` invocation (`generic_task.py:243-250`). Consequently Bash's
`$0` is the descriptive task label, `$1` is the complete collector text, and
each remaining positional argument is one selected test path. Quoted expansion
does not reinterpret quotes, newlines, substitutions or other text inside an
argument as shell code. Python receives the exact collector code and its
selected filenames; the collector calls canonical `npm run test:file -- ...`
once, as already independently reviewed. There is no second source invocation
or selected-file reconstruction by the builder.

The existing nonempty, unique relative `test/...` selection validation is
unchanged (`:82-88`). The eventual selected list still needs review as a list;
this source review does not certify files that have not been supplied yet.

`spec.env` explicitly sets `LAGRANGE_RETRY_FAILED_ONCE` to string `0` (`:95`).
The installed worker carries this into the task environment (`generic_worker:
377-385`), and the task merges it over its inherited environment before setup
and execution (`generic_task:229-234`). The collector records the actual value
and still retains any optional first-attempt files. No runner retry policy is
rewritten. Other Node setup, npm-ci setup, cwd and work timeout behavior remain
unchanged.

## Source identity, authority and custody remain with existing owners

The pinned contract digest gate, closed source repo/ref/SHA validation,
prepare_delivery/recover_delivery round trip, request UUID, canonical envelope,
chunk digests, controller default, principal/pool fields, host preference and
optional host guard are unchanged (`candidate:16-18,57-80,114-145`). The exact
SHA/ref must still name the final reviewed and preserved candidate; this offline
builder does not verify a remote ref or authorize publication.

The worker independently verifies the materialized source witness and exact Git
SHA (`generic_worker:300-315`). Controller authentication, pool membership,
selection and reservation are not supplied by the collector. The shared machine
lock still precedes task construction and physical execution (`:686-725`).
The host preference remains a preference, and the optional setup guard is not
a replacement for that lock. No environment key or new operation bypasses
controller/lock custody.

The existing physical scope, result files, counter reader, worker stdout and
closure-before-retention order are unchanged (`generic_task:224-262`;
`generic_worker:785-825`). The collector emits its hashed output artifacts before
the task exits; the worker retains its ordinary driver result and only then
reaches installed cleanup. Canonical nonzero exit and collection failure remain
visible according to the separate approved collector review. JSON artifact
lines do not replace the canonical TAP stream or its test counters.

## Remaining finite gate

This delta introduces no new production/runtime architecture and no duplicate
execution controller. No runtime success or artifact custody is inferred from
the static builder/collector path. The final packet still needs exact source
SHA/ref, selected tests, embedded collector hash, actual controller/pool/host
selection, timeout/TTL and payload identity checked before submission. A fresh
owned source workdir and sufficient existing outer time for post-test collection
remain collector prerequisites. Final evidence must include the terminal worker
custody record and reconstructible artifact parts/hashes; absence cannot be
repaired by claiming this source review as execution evidence.
