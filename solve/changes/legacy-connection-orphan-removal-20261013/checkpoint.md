# Legacy connection orphan removal: bounded WIP checkpoint

Base: `ffe35e77d51cbd4ba35fb30518de1307eaaa2eec`.
Delete only the unused private `noteLegacySessionServed` function/export and
obsolete attribution. The predecessor had only its definition/export; current
source, tests and scripts have no caller, dynamic exposure or public export.
Four production importers and the existing test retain the same stamp/reader.
Unknown connections remain unsafe, actual opens retain monotonically increasing
clean stamps, and a clean stamp does not itself grant participant admission.

The sole changed source SHA256 is
`bb14a25315c011df931a0de1755dcc2ee7d08ff7c3e200b677e880ac2cb8fead`.
Independent reviewer `subagent:/root/tx1_deletion_design_vet` approves exact
source/content in the adjacent report, SHA256
`73f5dd51987be75cc5b0ff930e2ca1b08c8dee30f3adf85b64ac54588bb1c009`.
Writer-local syntax, exact ESLint, impact audit and the unchanged four-assertion
release-admission file pass. These are not locked-lab or integrated certification.
No new test, metadata, timeout, baseline or compatibility wrapper was added.

This single-sitting structural deletion has an obvious absence/import proof and
uses the direct-change exception in AGENTS. It is preserved on a non-main WIP
branch because inherited static/startup/corpus gates remain red. It does not
land a Quest, certify main, or alter the ongoing startup investigation.
