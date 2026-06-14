#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPORT_GLOB="test-output/reports/*.report.json"
DEFAULT_SCENARIO_INDEX=0

usage() {
  cat <<'EOF'
Usage:
  scripts/summarize-distributed-failure-report.sh [--report <path>] [--scenario <name>]

Purpose:
  Print a single consolidated diagnostics view for a distributed harness report.
  This script aggregates the jq extracts used for:
  - report/scenario summary
  - failed phase and reason counts
  - load/channel metrics
  - consistency mismatches
  - playback warnings
  - cluster stage timing from events.ndjson

When to use:
  - Immediately after a distributed run fails.
  - Before writing a fix, to identify dominant failure class and affected nodes.
  - During repeated harness runs, to compare whether failure signatures change.

Examples:
  scripts/summarize-distributed-failure-report.sh
  scripts/summarize-distributed-failure-report.sh --report test-output/reports/my-run.report.json
  scripts/summarize-distributed-failure-report.sh --report test-output/reports/my-run.report.json --scenario seven-node-postgres-baseline-partition-split
EOF
}

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

latest_report_path() {
  local latest
  latest="$(ls -1t $DEFAULT_REPORT_GLOB 2>/dev/null | head -n 1 || true)"
  if [[ -z "$latest" ]]; then
    echo "No report found under $DEFAULT_REPORT_GLOB" >&2
    exit 1
  fi
  echo "$latest"
}

print_section() {
  local title="$1"
  printf '\n== %s ==\n' "$title"
}

report_path=""
scenario_name=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report)
      if [[ $# -lt 2 ]]; then
        echo "--report requires a value" >&2
        exit 1
      fi
      report_path="$2"
      shift 2
      ;;
    --scenario)
      if [[ $# -lt 2 ]]; then
        echo "--scenario requires a value" >&2
        exit 1
      fi
      scenario_name="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd jq

if [[ -z "$report_path" ]]; then
  report_path="$(latest_report_path)"
fi

if [[ ! -f "$report_path" ]]; then
  echo "Report not found: $report_path" >&2
  exit 1
fi

# Report-shape normalization. Two report shapes reach this analyzer:
#   (1) a full multi-scenario report (*.report.json) with a top-level .scenarios[] array;
#   (2) a single-scenario failure bundle (failure-bundle.json) whose scenario fields live
#       at top level (.scenario, .diagnostics, .playback) with no .scenarios[] wrapper.
# Shape (2) is what gets written under .playback/<run>/<scenario>/failure-bundle.json and
# is a natural thing to point this script at. Without normalization every .scenarios[$i]...
# extract below resolves to null and the whole report prints "n/a" silently — a trap.
# Detect shape (2) and wrap it into the canonical multi-scenario shape so the existing jq
# extracts work unchanged. The original path is still shown in the Report section.
display_path="$report_path"
if ! jq -e '(.scenarios | type) == "array"' "$report_path" >/dev/null 2>&1; then
  if jq -e '(.scenario | type) == "string" and has("diagnostics")' "$report_path" >/dev/null 2>&1; then
    normalized_report="$(mktemp)"
    trap 'rm -f "$normalized_report"' EXIT
    jq '{
      summary: (.reportSummary // .summary // {}),
      scenarios: [
        {
          scenario: .scenario,
          passed: (.summary.passed // .passed),
          duration: (.playback.durationMs // .duration),
          error: (.summary.error // .error),
          details: { diagnostics: (.diagnostics // {}) },
          playback: (.playback // {})
        }
      ]
    }' "$report_path" > "$normalized_report"
    report_path="$normalized_report"
  fi
fi

scenario_index="$DEFAULT_SCENARIO_INDEX"
if [[ -n "$scenario_name" ]]; then
  scenario_index="$(jq -er --arg name "$scenario_name" '
    .scenarios
    | map(.scenario == $name)
    | index(true)
  ' "$report_path")" || {
    echo "Scenario not found in report: $scenario_name" >&2
    exit 1
  }
fi

print_section "Report"
jq -r --argjson i "$scenario_index" --arg dpath "$display_path" '
  "path=\($dpath)",
  "summary.total=\(.summary.total // "n/a")",
  "summary.passed=\(.summary.passed // "n/a")",
  "summary.failed=\(.summary.failed // "n/a")",
  "summary.durationMs=\(.summary.duration // "n/a")",
  "scenario.index=\($i)",
  "scenario.name=\(.scenarios[$i].scenario // "n/a")",
  "scenario.passed=\(.scenarios[$i].passed // "n/a")",
  "scenario.durationMs=\(.scenarios[$i].duration // .scenarios[$i].playback.durationMs // "n/a")",
  "scenario.error=\(.scenarios[$i].error // "none")"
' "$report_path"

print_section "Failed Phase"
jq -r --argjson i "$scenario_index" '
  .scenarios[$i].details.diagnostics as $d |
  "phase=\($d.failedPhase.phase // "n/a")",
  "status=\($d.failedPhase.status // "n/a")",
  "durationMs=\($d.failedPhase.durationMs // "n/a")",
  "rootCauseClass=\($d.failure.rootCauseClass // "n/a")",
  "dominantReason=\($d.failure.dominantReason // "n/a")"
' "$report_path"

echo "reasonCounts:"
jq -r --argjson i "$scenario_index" '
  .scenarios[$i].details.diagnostics.failure.reasonCounts // {}
  | to_entries
  | if length == 0 then
      ["  (none)"]
    else
      map("  \(.key): \(.value)")
    end
  | .[]
' "$report_path"

print_section "Load Metrics"
jq -r --argjson i "$scenario_index" '
  .scenarios[$i].details.diagnostics.loadMetrics as $m |
  "total=\($m.total // "n/a")",
  "success=\($m.success // "n/a")",
  "failed=\($m.failed // "n/a")",
  "errors=\($m.errors // "n/a")",
  "attemptErrors=\($m.attemptErrors // "n/a")",
  "opsPerSec=\($m.opsPerSec // "n/a")",
  "targetOperations=\($m.targetOperations // "n/a")",
  "dispatchedOperations=\($m.dispatchedOperations // "n/a")",
  "undispatchedOperations=\($m.undispatchedOperations // "n/a")"
' "$report_path"

echo "perNode (sorted by attemptErrors desc):"
jq -r --argjson i "$scenario_index" '
  .scenarios[$i].details.diagnostics.loadMetrics.perNode // {}
  | to_entries
  | sort_by(.value.attemptErrors // 0)
  | reverse
  | if length == 0 then
      ["  (none)"]
    else
      map(
        "  \(.key): dispatched=\(.value.dispatched // 0), success=\(.value.success // 0), attemptErrors=\(.value.attemptErrors // 0), admissionSignals=\(.value.admissionSignals // 0), queuePressureSignals=\(.value.queuePressureSignals // 0)"
      )
    end
  | .[]
' "$report_path"

print_section "Channel Metrics"
jq -r --argjson i "$scenario_index" '
  .scenarios[$i].details.diagnostics.channelMetrics // {}
  | to_entries
  | if length == 0 then
      ["(none)"]
    else
      map(
        "\(.key): requests=\(.value.requests // 0), successes=\(.value.successes // 0), errors=\(.value.errors // 0), timeouts=\(.value.timeouts // 0), breakerOpens=\(.value.breakerOpens // 0), timeoutBudgetMismatches=\(.value.timeoutBudgetMismatches // 0)"
      )
    end
  | .[]
' "$report_path"

print_section "Consistency Mismatches"
jq -r --argjson i "$scenario_index" '
  .scenarios[$i].details.diagnostics.failedPhase.artifacts.mismatches // []
  | if length == 0 then
      ["(none)"]
    else
      map(
        "kind=\(.kind // "unknown"), partitionId=\(.partitionId // "unknown"), byNode=\(.byNode | tojson)"
      )
    end
  | .[]
' "$report_path"

print_section "Playback Warnings"
jq -r --argjson i "$scenario_index" '
  .scenarios[$i].playback.warnings // []
  | if length == 0 then
      ["(none)"]
    else
      map(
        "[\(.timestamp // "n/a")] node=\(.details.nodeId // "unknown") message=\(.message // "n/a")"
      )
    end
  | .[]
' "$report_path"

print_section "Internal Signal Messages (first 12)"
jq -r --argjson i "$scenario_index" '
  .scenarios[$i].details.diagnostics.failedPhase.artifacts.internalSignalCounts.messages // []
  | .[0:12]
  | if length == 0 then
      ["(none)"]
    else
      map("  - " + .)
    end
  | .[]
' "$report_path"

events_path="$(jq -r --argjson i "$scenario_index" '.scenarios[$i].playback.files.events // empty' "$report_path")"
if [[ -n "$events_path" && -f "$events_path" ]]; then
  print_section "Cluster Stage Timeline"
  jq -r '
    select(.type == "cluster.stage")
    | [
        .timestamp,
        .details.stage,
        (.details.attempts // ""),
        (.details.elapsedMs // ""),
        (.details.startupGateState // "")
      ]
    | @tsv
  ' "$events_path"

  print_section "Cluster Stage Durations"
  jq -rs '
    reduce .[] as $e (
      {
        seedStart: null,
        seedJoinReady: null,
        clusterWaitStart: null,
        clusterActive: null
      };
      if ($e.type == "cluster.stage" and $e.details.stage == "setup.seed.starting" and .seedStart == null) then
        .seedStart = $e.timestamp
      elif ($e.type == "cluster.stage" and $e.details.stage == "setup.seed.bootstrap.ready" and .seedJoinReady == null) then
        .seedJoinReady = $e.timestamp
      elif ($e.type == "cluster.stage" and $e.details.stage == "setup.cluster.waiting-active" and .clusterWaitStart == null) then
        .clusterWaitStart = $e.timestamp
      elif ($e.type == "cluster.stage" and $e.details.stage == "setup.cluster.active" and .clusterActive == null) then
        .clusterActive = $e.timestamp
      else
        .
      end
    )
    | {
        seedStartMs: .seedStart,
        seedJoinReadyMs: .seedJoinReady,
        clusterWaitStartMs: .clusterWaitStart,
        clusterActiveMs: .clusterActive,
        seedToJoinReadyMs: (if (.seedStart != null and .seedJoinReady != null) then (.seedJoinReady - .seedStart) else null end),
        clusterWaitToActiveMs: (if (.clusterWaitStart != null and .clusterActive != null) then (.clusterActive - .clusterWaitStart) else null end),
        seedToClusterActiveMs: (if (.seedStart != null and .clusterActive != null) then (.clusterActive - .seedStart) else null end)
      }
  ' "$events_path"
else
  print_section "Cluster Stage Timeline"
  echo "events file not found"
fi

logs_dir="$(dirname "$events_path")"
if [[ -n "$events_path" && -d "$logs_dir" && -n "$(compgen -G "$logs_dir/*.log" || true)" ]]; then
  print_section "Log Pattern Counts"
  printf 'query_timeout_5000ms=%s\n' "$(rg -n "Query timeout after 5000ms" "$logs_dir"/*.log | wc -l | tr -d ' ')"
  printf 'query_timeout_4000ms=%s\n' "$(rg -n "Query timeout after 4000ms" "$logs_dir"/*.log | wc -l | tr -d ' ')"
  printf 'failed_query_operations_table=%s\n' "$(rg -n "Failed to query operations from system table" "$logs_dir"/*.log | wc -l | tr -d ' ')"
  printf 'inflight_owner_pressure=%s\n' "$(rg -n "In-flight operation owner query indicates control-plane pressure" "$logs_dir"/*.log | wc -l | tr -d ' ')"
  printf 'heartbeat_failing_repeatedly=%s\n' "$(rg -n "Heartbeat failing repeatedly" "$logs_dir"/*.log | wc -l | tr -d ' ')"
  printf 'invalid_state_transition=%s\n' "$(rg -n "Invalid state transition attempted" "$logs_dir"/*.log | wc -l | tr -d ' ')"
fi
