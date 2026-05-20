# Probe Package Template

<!-- work-package
{"schema":"work-package-v1","status":"todo","opened":"YYYY-MM-DD","lane":"experiment","scenario":"none","artifact":"none","playback":"none","owner":"owner_name","boundary":"boundary_name","dominantReason":"reason_name","currentState":"One sentence describing the uncertainty.","nextAction":"Run the smallest probe that can distinguish the competing hypotheses.","proof":["npm test -- path/to/focused-probe.test.js"],"writeScope":["work/packages/todo-YYYYMMDD-short-probe.md"],"handoffFiles":[],"generatedFiles":[],"candidateRuntimeFiles":[],"commitScope":["work/packages/todo-YYYYMMDD-short-probe.md"],"modelFit":{"packageClass":"compact-probe","intendedMinimumModel":"gpt-5.3-codex-spark","scopeShape":"leaf-slice","outputProfile":"medium","escalationTriggers":["probe cannot distinguish H1/H2/H3"]},"boundedExperiment":{"hypothesis":"H1 says the owner edge is missing; H2 says the downstream observer is stale; H3 says the fixture is stale.","hypothesisDiscriminator":"H1 predicts observable A; H2 predicts observable B; H3 predicts observable C.","expectedMetric":"observable A vs observable B vs observable C","inheritsFrom":"none","timebox":"24h","mergeRequirement":"probe distinguishes H1/H2/H3 or closes as evidence-incomplete","killRule":"stop runtime edits if the probe cannot distinguish hypotheses"},"validationTier":"single-owner","observablePrediction":{"metric":"observable A vs observable B vs observable C","predicted":"H1 observable A","observed":"pending-before-observation","accuracy":"pending-before-observation","evidence":"pending-before-observation","metricDelta":0}}
-->

## Probe

- Question: <single falsifiable question>
- Hypothesis discriminator: <different observable under H1 vs H2 vs H3>
- Expected signal: <numeric/state prediction written before the run>
- Observed signal: <filled at closure>
- Prediction accuracy: <matched|partial|missed|contradicted>
- Distinguished hypothesis at closure: <H1|H2|H3|evidence-incomplete>
- Experiment decision at closure: <open-runtime-owner-boundary|open-architecture-contract|owner-boundary-migration|human-escalation|evidence-incomplete>
- Outcome evidence at closure: <focused command or artifact>
- Stop rule: <what result prevents implementation>
