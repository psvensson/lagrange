# Tracks

Tracks are durable planning records for long-lived workstreams.

They are intentionally generic. A track is not tied to one release, version,
feature, or sprint type. Releases, features, stabilization programs, and bug
families may all consume the same track over time.

Tracks are not executable work packages. They do not authorize runtime changes,
package closure, sprint closure, or release claims.

Use tracks to preserve problem ownership when a concern spans multiple sprints
or depends on evidence that does not exist yet.

For a release-specific compact dependency view, use the dependency map under
that release. The current 0.1 consumer uses
[`../releases/0.1-dependency-map.md`](../releases/0.1-dependency-map.md).

## Relationship

```text
release program or roadmap concern
  -> track
    -> sprint
      -> work package
```

Packages remain the only executable unit. Sprints remain the short-lived
execution grouping. Tracks record the invariant, product surface, runtime
boundary, or bug family that survives across those sprints.

## Sprint Membership

A track may include multiple sprint kinds:

| Sprint kind | Purpose |
| --- | --- |
| `development` | Adds or expands intended capability. |
| `bugfix` | Fixes known broken behavior inside the track boundary. |
| `stabilization` | Hardens behavior, contracts, diagnostics, or evidence without broadening product scope. |
| `release-gate` | Proves the track under representative or release scenarios. |
| `maintenance` | Keeps workflow, tests, docs, or guardrails aligned with the track. |

A sprint may name one primary track and, when needed, secondary tracks. The
primary track owns dependency ordering. Secondary tracks are context only unless
a package migrates or explicitly attaches there.

## Required Fields

Each track should keep these fields current:

```text
Track type:
Release consumers:
Proven pattern:
Local divergence:
Target invariant:
Gate or acceptance proof:
Current evidence:
Owner boundaries:
Likely files:
Sprint membership:
Entry condition:
Exit condition:
Next package:
```

## Update Rules

Update a track when:

1. A package on that track closes, migrates, or records a narrower blocker.
2. Representative evidence changes the owner boundary or next action for the
   track.
3. The proven pattern, target invariant, or gate/acceptance proof changes.
4. The track becomes optional, blocked, or out of scope for a consuming release,
   roadmap concern, or stabilization program.

Do not use track files as status mirrors for every package edit. Package-level
proof stays in the package. Sprint-level status stays in the sprint.
