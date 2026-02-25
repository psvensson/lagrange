#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

REPORT_DIR_DEFAULT='test-output/reports'
SCENARIO_DEFAULT='postgres-baseline-comparison'
PROFILE_THREE_NODE='3node'
PROFILE_SEVEN_NODE='7node'

usage() {
  cat <<'EOF'
Usage:
  scripts/compare-latest-baseline-runs.sh [--report-dir <dir>] [--scenario <name>]

Defaults:
  --report-dir test-output/reports
  --scenario   postgres-baseline-comparison
EOF
}

require_dependency() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Error: required command not found: %s\n' "$command_name" >&2
    exit 1
  fi
}

find_latest_two_reports() {
  local report_dir="$1"
  local profile="$2"
  local candidate_reports=()
  local sorted_reports=()

  shopt -s nullglob
  candidate_reports=(
    "$report_dir"/postgres-baseline-"$profile"-*.report.json
  )
  shopt -u nullglob

  if [[ "${#candidate_reports[@]}" -lt 2 ]]; then
    return 1
  fi

  mapfile -t sorted_reports < <(ls -1t "${candidate_reports[@]}")
  printf '%s\n' "${sorted_reports[0]}" "${sorted_reports[1]}"
}

report_has_scenario() {
  local report_path="$1"
  local scenario_name="$2"
  jq -e --arg scenario "$scenario_name" \
    '.scenarios[]? | select(.scenario == $scenario)' \
    "$report_path" >/dev/null
}

compare_profile() {
  local report_dir="$1"
  local profile="$2"
  local scenario_name="$3"
  local report_pair=()
  local latest_report
  local previous_report

  if ! mapfile -t report_pair < <(find_latest_two_reports "$report_dir" "$profile"); then
    printf '[%s] skipped: fewer than 2 matching reports in %s\n\n' \
      "$profile" "$report_dir"
    return 0
  fi

  latest_report="${report_pair[0]}"
  previous_report="${report_pair[1]}"

  if ! report_has_scenario "$latest_report" "$scenario_name"; then
    printf '[%s] skipped: latest report missing scenario "%s": %s\n\n' \
      "$profile" "$scenario_name" "$(basename "$latest_report")"
    return 0
  fi
  if ! report_has_scenario "$previous_report" "$scenario_name"; then
    printf '[%s] skipped: previous report missing scenario "%s": %s\n\n' \
      "$profile" "$scenario_name" "$(basename "$previous_report")"
    return 0
  fi

  printf '=== %s baseline (%s) ===\n' "$profile" "$scenario_name"
  jq -sr \
    --arg scenario "$scenario_name" \
    --arg latest_file "$(basename "$latest_report")" \
    --arg previous_file "$(basename "$previous_report")" \
    '
    def num($v): ($v // 0);
    def f2: ((.*100 | round) / 100);
    def f3: ((.*1000 | round) / 1000);
    def arr($v): if ($v | type) == "array" then $v else [] end;
    def obj($v): if ($v | type) == "object" then $v else {} end;
    def short($text; $max):
      ($text // "" | tostring) as $s
      | if ($s | length) <= $max then $s else ($s[0:$max] + "...") end;
    def sgn:
      if . > 0 then "+" + (.|tostring)
      else (.|tostring)
      end;
    def pct($new; $old):
      if $old == 0 then "n/a"
      else ((((($new - $old) / $old) * 100) | f2) | tostring) + "%"
      end;
    def details_root($scenario):
      obj($scenario.details.details // $scenario.details // {});
    def comparison($scenario):
      obj(details_root($scenario).comparison);
    def parity($scenario):
      obj(details_root($scenario).parity);
    def benchmark($scenario):
      obj(details_root($scenario).benchmark);
    def channel_metrics($scenario):
      obj(details_root($scenario).channelMetrics);
    def phase_map($scenario):
      (arr(details_root($scenario).phaseTimeline)
       | map({key: .phase, value: (.durationMs // 0)})
       | from_entries);
    def parity_reason_codes($parity_obj):
      (arr($parity_obj.reasons)
       | map(.code // "unknown")
       | unique
       | sort
       | join("|"));
    def sut_vs_pg_line($tag; $scenario):
      comparison($scenario) as $c
      | if ($c | length) == 0 then
          "sut_vs_pg[" + $tag + "]: unavailable"
        else
          "sut_vs_pg[" + $tag + "]: sut_ops_per_sec=" +
            ((num($c.sutOpsPerSec) | f3) | tostring) +
            ", pg_tps=" + ((num($c.baselineTps) | f3) | tostring) +
            ", throughput_ratio=" +
            ((num($c.throughputRatioSutToBaseline) | f3) | tostring) +
            ", sut_p99_ms=" + (num($c.sutP99LatencyMs) | tostring) +
            ", pg_avg_latency_ms=" +
            ((num($c.baselineLatencyAvgMs) | f3) | tostring) +
            ", p99_vs_pg_avg_ratio=" +
            ((num($c.p99LatencyRatioSutToBaselineAvg) | f3) | tostring)
        end;
    def parity_line($tag; $scenario):
      parity($scenario) as $p
      | if ($p | length) == 0 then
          "load_parity[" + $tag + "]: unavailable"
        else
          "load_parity[" + $tag + "]: status=" +
            (($p.status // "unknown") | tostring) +
            ", reason_codes=" + parity_reason_codes($p) +
            ", sut_load_nodes=" + (num($p.effective.sutLoadNodeCount) | tostring) +
            ", pg_load_nodes=" +
            (num($p.effective.baselineLoadNodeCount) | tostring) +
            ", sut_node_budget=" + (num($p.effective.sutPerNodeBudget) | tostring) +
            ", pg_node_budget=" +
            (num($p.effective.baselinePerNodeBudget) | tostring)
        end;
    def discovery_line($tag; $scenario):
      benchmark($scenario).sutLoadDiscovery as $d
      | if ($d | type) != "object" then
          "sut_discovery[" + $tag + "]: unavailable"
        else
          "sut_discovery[" + $tag + "]: attempts=" +
            (num($d.attempts) | tostring) +
            ", timedOut=" + (($d.timedOut // false) | tostring) +
            ", discovered_nodes=" + ((arr($d.discoveredNodeIds) | length) | tostring) +
            ", reachable_nodes=" + ((arr($d.reachableNodeIds) | length) | tostring) +
            ", source_discovered=" +
            ((arr($d.sourceResults) |
              map(select(.status == "discovered")) |
              length) | tostring) +
            ", source_errors=" +
            ((arr($d.sourceResults) |
              map(select(.status == "error")) |
              length) | tostring)
        end;

    .[0] as $latest_report
    | .[1] as $previous_report
    | ($latest_report.scenarios[] | select(.scenario == $scenario)) as $latest
    | ($previous_report.scenarios[] | select(.scenario == $scenario)) as $previous
    | (phase_map($latest)) as $latest_phases
    | (phase_map($previous)) as $previous_phases
    | ((($latest_phases | keys_unsorted) + ($previous_phases | keys_unsorted))
        | unique
        | sort) as $all_phases
    | "files:",
      "  previous: \($previous_file)",
      "  latest:   \($latest_file)",
      "status:",
      "  passed: \((($previous.passed // false) | tostring)) -> \((($latest.passed // false) | tostring))",
      "  duration_ms: \(num($previous_report.summary.duration)) -> \(num($latest_report.summary.duration)) (Δ \(((num($latest_report.summary.duration) - num($previous_report.summary.duration)) | sgn)))",
      "  benchmark_gate: previous(enabled=\((($previous_report.benchmarkRegressionGate.enabled // false) | tostring)), status=\(($previous_report.benchmarkRegressionGate.status // "n/a"))); latest(enabled=\((($latest_report.benchmarkRegressionGate.enabled // false) | tostring)), status=\(($latest_report.benchmarkRegressionGate.status // "n/a")))",
      "load (previous -> latest):",
      "  failed/errors: \(num($previous.loadMetrics.failed))/\(num($previous.loadMetrics.errors)) -> \(num($latest.loadMetrics.failed))/\(num($latest.loadMetrics.errors))",
      "  ops_per_sec: \((num($previous.loadMetrics.opsPerSec) | f3)) -> \((num($latest.loadMetrics.opsPerSec) | f3)) (Δ \(((num($latest.loadMetrics.opsPerSec) - num($previous.loadMetrics.opsPerSec)) | f3 | sgn)), \((pct(num($latest.loadMetrics.opsPerSec); num($previous.loadMetrics.opsPerSec)))))",
      "  total_ops: \(num($previous.loadMetrics.total)) -> \(num($latest.loadMetrics.total)) (Δ \(((num($latest.loadMetrics.total) - num($previous.loadMetrics.total)) | sgn)))",
      "  attempt_errors: \(num($previous.loadMetrics.attemptErrors)) -> \(num($latest.loadMetrics.attemptErrors))",
      "  dispatched_ops: \(num($previous.loadMetrics.dispatchedOperations)) -> \(num($latest.loadMetrics.dispatchedOperations))",
      "  undispatched_ops: \(num($previous.loadMetrics.undispatchedOperations)) -> \(num($latest.loadMetrics.undispatchedOperations))",
      "latency (previous -> latest):",
      "  latency_ms(avg/p50/p95/p99): \((num($previous.loadMetrics.latency.avg) | f2))/\(num($previous.loadMetrics.latency.p50))/\(num($previous.loadMetrics.latency.p95))/\(num($previous.loadMetrics.latency.p99)) -> \((num($latest.loadMetrics.latency.avg) | f2))/\(num($latest.loadMetrics.latency.p50))/\(num($latest.loadMetrics.latency.p95))/\(num($latest.loadMetrics.latency.p99))",
      "  queue_delay_ms(avg/p50/p95/p99/max): \((num($previous.loadMetrics.queueDelay.avg) | f2))/\((num($previous.loadMetrics.queueDelay.p50) | f2))/\((num($previous.loadMetrics.queueDelay.p95) | f2))/\((num($previous.loadMetrics.queueDelay.p99) | f2))/\((num($previous.loadMetrics.queueDelay.max) | f2)) -> \((num($latest.loadMetrics.queueDelay.avg) | f2))/\((num($latest.loadMetrics.queueDelay.p50) | f2))/\((num($latest.loadMetrics.queueDelay.p95) | f2))/\((num($latest.loadMetrics.queueDelay.p99) | f2))/\((num($latest.loadMetrics.queueDelay.max) | f2))",
      "sut_vs_pg (same-run):",
      "  " + sut_vs_pg_line("previous"; $previous),
      "  " + sut_vs_pg_line("latest"; $latest),
      "  ratio_delta: throughput_ratio=\(((num(comparison($latest).throughputRatioSutToBaseline) - num(comparison($previous).throughputRatioSutToBaseline)) | f3 | sgn)), p99_vs_pg_avg_ratio=\(((num(comparison($latest).p99LatencyRatioSutToBaselineAvg) - num(comparison($previous).p99LatencyRatioSutToBaselineAvg)) | f3 | sgn))",
      "load_parity:",
      "  " + parity_line("previous"; $previous),
      "  " + parity_line("latest"; $latest),
      "discovery:",
      "  " + discovery_line("previous"; $previous),
      "  " + discovery_line("latest"; $latest),
      "channels:",
      "  errors previous(load/control/probe/snapshot): \(num(channel_metrics($previous).load.errors))/\(num(channel_metrics($previous).control.errors))/\(num(channel_metrics($previous).probe.errors))/\(num(channel_metrics($previous).snapshot.errors))",
      "  errors latest(load/control/probe/snapshot): \(num(channel_metrics($latest).load.errors))/\(num(channel_metrics($latest).control.errors))/\(num(channel_metrics($latest).probe.errors))/\(num(channel_metrics($latest).snapshot.errors))",
      "errors:",
      "  previous: \(short($previous.error; 220))",
      "  latest:   \(short($latest.error; 220))",
      "phases duration_ms (previous -> latest):",
      ($all_phases[]
        | "  - \(.) : \((($previous_phases[.] // 0))) -> \((($latest_phases[.] // 0))) (Δ \((((($latest_phases[.] // 0) - ($previous_phases[.] // 0))) | sgn)))")
    ' "$latest_report" "$previous_report"
  printf '\n'
}

main() {
  local report_dir="$REPORT_DIR_DEFAULT"
  local scenario_name="$SCENARIO_DEFAULT"

  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --report-dir)
        report_dir="$2"
        shift 2
        ;;
      --scenario)
        scenario_name="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        printf 'Error: unknown argument: %s\n\n' "$1" >&2
        usage
        exit 1
        ;;
    esac
  done

  require_dependency jq

  compare_profile "$report_dir" "$PROFILE_THREE_NODE" "$scenario_name"
  compare_profile "$report_dir" "$PROFILE_SEVEN_NODE" "$scenario_name"
}

main "$@"
