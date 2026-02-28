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

  mapfile -t report_pair < <(find_latest_two_reports "$report_dir" "$profile" || true)
  if [[ "${#report_pair[@]}" -lt 2 ]]; then
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
    def cdc_telemetry($scenario):
      obj(benchmark($scenario).cdcTelemetry);
    def cdc_summary($scenario):
      obj(cdc_telemetry($scenario).summary);
    def cdc_schema($scenario):
      obj(cdc_telemetry($scenario).schema);
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
    def fanout_line($tag; $scenario):
      benchmark($scenario) as $b
      | if ($b | length) == 0 then
          "fanout_contract[" + $tag + "]: unavailable"
        else
          "fanout_contract[" + $tag + "]: strict_mode=" +
            ((($b.strictMode // false) | tostring)) +
            ", opt_out=" +
            ((($b.strictFanoutOptOut // false) | tostring)) +
            ", cluster_candidates=" +
            (num($b.clusterCandidateLoadNodeCount) | tostring) +
            ", requested=" +
            (num($b.requestedSutLoadNodeCount) | tostring) +
            ", required=" +
            (num($b.requiredSutLoadNodeCount) | tostring) +
            ", explicit_required=" +
            (if $b.explicitRequiredSutLoadNodeCount == null then
              "null"
            else
              (num($b.explicitRequiredSutLoadNodeCount) | tostring)
            end) +
            (if ($b.strictFanoutOptOutReason // "") != "" then
              ", reason=" + ($b.strictFanoutOptOutReason | tostring)
            else
              ""
            end)
        end;
    def cdc_line($tag; $scenario):
      cdc_telemetry($scenario) as $cdc
      | cdc_summary($scenario) as $summary
      | cdc_schema($scenario) as $schema
      | if ($cdc | length) == 0 or ($summary | length) == 0 then
          "cdc_pressure[" + $tag + "]: unavailable"
        else
          "cdc_pressure[" + $tag + "]: schema_valid=" +
            ((($schema.valid // true) | tostring)) +
            ", total_subscribers=" +
            (num($summary.totalSubscriberCount) | tostring) +
            ", total_buffered_events=" +
            (num($summary.totalBufferedEvents) | tostring) +
            ", max_catchup_lag_events=" +
            (num($summary.maxCatchupLagEvents) | tostring) +
            ", avg_catchup_throughput_eps=" +
            ((num($summary.avgCatchupThroughputEventsPerSec) | f3) | tostring) +
            ", catchup_nodes=" +
            (num($summary.catchupNodeCount) | tostring) +
            ", steady_nodes=" +
            (num($summary.steadyNodeCount) | tostring)
        end;
    def scenario_details($scenario):
      obj($scenario.details);
    def failure($scenario):
      obj(details_root($scenario).failure) as $root_failure
      | if ($root_failure | length) > 0 then
          $root_failure
        else
          obj(scenario_details($scenario).diagnostics.failure)
        end;
    def pre_load_gate($scenario):
      obj(details_root($scenario).phaseArtifacts.pre_load_gate);
    def convergence($scenario):
      obj(failure($scenario).versionConvergence) as $failure_convergence
      | if ($failure_convergence | length) > 0 then
          $failure_convergence
        else
          obj(pre_load_gate($scenario).versionConvergence)
        end;
    def convergence_nodes($scenario):
      obj(convergence($scenario).nodes);
    def convergence_required($scenario):
      (convergence($scenario).requiredSchemaVersion // "unknown" | tostring);
    def convergence_node_count($scenario):
      (convergence_nodes($scenario) | keys | length);
    def convergence_lagging_count($scenario):
      (convergence_nodes($scenario)
       | to_entries
       | map(select(
           (arr(.value.unmetReasons) | length) > 0
         ))
       | length);
    def convergence_node_details($scenario):
      convergence($scenario) as $c
      | convergence_nodes($scenario)
      | to_entries
      | sort_by(.key)
      | map(
          .key + "=" +
          ((.value.observedSchemaVersion // "null") | tostring) +
          "->" +
          ((.value.requiredSchemaVersion // $c.requiredSchemaVersion // "null") | tostring) +
          ":" +
          (if (arr(.value.unmetReasons) | length) == 0 then
            "ok"
          else
            (arr(.value.unmetReasons) | join("|"))
          end)
        )
      | join(", ");
    def convergence_line($tag; $scenario):
      convergence($scenario) as $c
      | if ($c | length) == 0 then
          "convergence[" + $tag + "]: unavailable"
        else
          "convergence[" + $tag + "]: required_schema_version=" +
            convergence_required($scenario) +
            ", node_count=" +
            (convergence_node_count($scenario) | tostring) +
            ", lagging_nodes=" +
            (convergence_lagging_count($scenario) | tostring) +
            ", node_details=" +
            convergence_node_details($scenario)
        end;
    def convergence_delta_line($latest; $previous):
      "convergence_delta: lagging_nodes=" +
      (((convergence_lagging_count($latest) - convergence_lagging_count($previous)) |
        sgn)) +
      ", node_count=" +
      (((convergence_node_count($latest) - convergence_node_count($previous)) |
        sgn)) +
      ", required_changed=" +
      ((convergence_required($latest) != convergence_required($previous)) | tostring);
    def failure_reason_counts($scenario):
      obj(failure($scenario).reasonCounts);
    def failure_reason_total($scenario):
      (failure_reason_counts($scenario)
       | to_entries
       | map(.value // 0)
       | add // 0);
    def failure_reason_keys($scenario):
      (failure_reason_counts($scenario)
       | keys
       | sort
       | join("|"));
    def root_cause_bundle($scenario):
      obj(failure($scenario).rootCauseBundle) as $failure_bundle
      | if ($failure_bundle | length) > 0 then
          $failure_bundle
        else
          obj(details_root($scenario).rootCauseBundle) as $details_bundle
          | if ($details_bundle | length) > 0 then
              $details_bundle
            else
              obj(details_root($scenario).diagnostics.rootCauseBundle) as $details_diag_bundle
              | if ($details_diag_bundle | length) > 0 then
                  $details_diag_bundle
                else
                  obj(scenario_details($scenario).diagnostics.rootCauseBundle)
                end
            end
        end;
    def root_cause_code($scenario):
      (root_cause_bundle($scenario).rootCauseCode //
        failure($scenario).rootCauseCode //
        "unknown" | tostring);
    def root_cause_class($scenario):
      (root_cause_bundle($scenario).rootCauseClass //
        failure($scenario).rootCauseClass //
        "unknown" | tostring);
    def root_cause_snapshots($scenario):
      obj(root_cause_bundle($scenario).snapshotsByNodeId);
    def has_root_cause_snapshots($scenario):
      ((root_cause_snapshots($scenario) | length) > 0);
    def root_cause_snapshot_entries($scenario):
      (root_cause_snapshots($scenario) | to_entries | map(.value));
    def snapshot_missing_nodes($scenario):
      (root_cause_snapshot_entries($scenario)
       | map(select(
           (type == "object") and ((.missing | type) == "object")
         ))
       | length);
    def max_cache_staleness_ms($scenario):
      (root_cause_snapshot_entries($scenario)
       | map(.cacheFreshness.stalenessMs)
       | map(select(type == "number"))
       | if length == 0 then 0 else (max | floor) end);
    def max_cdc_retry_count($scenario):
      (root_cause_snapshot_entries($scenario)
       | map(.cdcHealth.retryCount)
       | map(select(type == "number"))
       | if length == 0 then 0 else (max | floor) end);
    def sys_postgres_wire_rows($scenario):
      (root_cause_snapshot_entries($scenario)
       | map(.rowCounts.sysPostgresWireServiceCount)
       | map(select(type == "number"))
       | map(floor)
       | add // 0);
    def root_cause_signal_line($tag; $scenario):
      if has_root_cause_snapshots($scenario) then
        "root_cause_signals[" + $tag + "]: snapshot_missing_nodes=" +
          (snapshot_missing_nodes($scenario) | tostring) +
          ", max_cache_staleness_ms=" +
          (max_cache_staleness_ms($scenario) | tostring) +
          ", max_cdc_retry_count=" +
          (max_cdc_retry_count($scenario) | tostring) +
          ", sys_postgres_wire_rows=" +
          (sys_postgres_wire_rows($scenario) | tostring)
      else
        "root_cause_signals[" + $tag + "]: unavailable"
      end;
    def root_cause_signal_delta_line($latest; $previous):
      if has_root_cause_snapshots($latest) and has_root_cause_snapshots($previous) then
        "root_cause_key_deltas: snapshot_missing_nodes=" +
          (((snapshot_missing_nodes($latest) -
            snapshot_missing_nodes($previous)) | sgn)) +
          ", max_cache_staleness_ms=" +
          (((max_cache_staleness_ms($latest) -
            max_cache_staleness_ms($previous)) | sgn)) +
          ", max_cdc_retry_count=" +
          (((max_cdc_retry_count($latest) -
            max_cdc_retry_count($previous)) | sgn)) +
          ", sys_postgres_wire_rows=" +
          (((sys_postgres_wire_rows($latest) -
            sys_postgres_wire_rows($previous)) | sgn))
      else
        "root_cause_key_deltas: unavailable"
      end;
    def root_cause_line($tag; $scenario):
      failure($scenario) as $f
      | if ($f | length) == 0 and (root_cause_bundle($scenario) | length) == 0 then
          "root_cause[" + $tag + "]: unavailable"
        else
          "root_cause[" + $tag + "]: code=" +
            root_cause_code($scenario) +
            ", class=" + root_cause_class($scenario) +
            ", phase=" + (($f.phase // "unknown") | tostring) +
            ", affected_nodes=" + ((arr($f.affectedNodeIds) | length) | tostring) +
            ", reason_total=" + (failure_reason_total($scenario) | tostring) +
            ", reason_keys=" + failure_reason_keys($scenario)
        end;
    def dominant_reason($scenario):
      (failure($scenario).dominantReason // null) as $explicit
      | if $explicit != null and (($explicit | tostring) != "") then
          ($explicit | tostring)
        else
          (failure_reason_counts($scenario)
           | to_entries
           | sort_by((-(.value // 0)), .key)
           | .[0].key // "unknown")
        end;
    def dominant_reason_line($tag; $scenario):
      "dominant_reason[" + $tag + "]: " + dominant_reason($scenario);
    def dominant_reason_delta_line($latest; $previous):
      "dominant_reason_delta: changed=" +
      ((dominant_reason($latest) != dominant_reason($previous)) | tostring) +
      ", previous=" + dominant_reason($previous) +
      ", latest=" + dominant_reason($latest);
    def saturation($scenario):
      obj(failure($scenario).saturation) as $failure_saturation
      | if ($failure_saturation | length) > 0 then
          $failure_saturation
        else
          obj(benchmark($scenario).saturation)
        end;
    def saturation_line($tag; $scenario):
      saturation($scenario) as $s
      | "saturation[" + $tag + "]: cdc_forward_timeouts=" +
          (num($s.cdcForwardTimeoutCount) | tostring) +
          ", system_table_query_timeouts=" +
          (num($s.systemTableQueryTimeoutCount) | tostring) +
          ", snapshot_collection_errors=" +
          (num($s.snapshotCollectionErrorCount) | tostring);
    def saturation_delta_line($latest; $previous):
      "saturation_delta: cdc_forward_timeouts=" +
      (((num(saturation($latest).cdcForwardTimeoutCount) -
        num(saturation($previous).cdcForwardTimeoutCount)) | sgn)) +
      ", system_table_query_timeouts=" +
      (((num(saturation($latest).systemTableQueryTimeoutCount) -
        num(saturation($previous).systemTableQueryTimeoutCount)) | sgn)) +
      ", snapshot_collection_errors=" +
      (((num(saturation($latest).snapshotCollectionErrorCount) -
        num(saturation($previous).snapshotCollectionErrorCount)) | sgn));

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
      "fanout contract:",
      "  " + fanout_line("previous"; $previous),
      "  " + fanout_line("latest"; $latest),
      "  fanout_delta: strict_mode_changed=\(((benchmark($previous).strictMode // false) != (benchmark($latest).strictMode // false))), opt_out_changed=\(((benchmark($previous).strictFanoutOptOut // false) != (benchmark($latest).strictFanoutOptOut // false))), required=\(((num(benchmark($latest).requiredSutLoadNodeCount) - num(benchmark($previous).requiredSutLoadNodeCount)) | sgn))",
      "cdc pressure:",
      "  " + cdc_line("previous"; $previous),
      "  " + cdc_line("latest"; $latest),
      "  deltas: total_buffered_events=\(((num(cdc_summary($latest).totalBufferedEvents) - num(cdc_summary($previous).totalBufferedEvents)) | sgn)), max_catchup_lag_events=\(((num(cdc_summary($latest).maxCatchupLagEvents) - num(cdc_summary($previous).maxCatchupLagEvents)) | sgn)), avg_catchup_throughput_eps=\(((num(cdc_summary($latest).avgCatchupThroughputEventsPerSec) - num(cdc_summary($previous).avgCatchupThroughputEventsPerSec)) | f3 | sgn))",
      "channels:",
      "  errors previous(load/control/probe/snapshot): \(num(channel_metrics($previous).load.errors))/\(num(channel_metrics($previous).control.errors))/\(num(channel_metrics($previous).probe.errors))/\(num(channel_metrics($previous).snapshot.errors))",
      "  errors latest(load/control/probe/snapshot): \(num(channel_metrics($latest).load.errors))/\(num(channel_metrics($latest).control.errors))/\(num(channel_metrics($latest).probe.errors))/\(num(channel_metrics($latest).snapshot.errors))",
      "errors:",
      "  previous: \(short($previous.error; 220))",
      "  latest:   \(short($latest.error; 220))",
      "root_cause:",
      "  " + root_cause_line("previous"; $previous),
      "  " + root_cause_line("latest"; $latest),
      "  root_cause_delta: code_changed=\((root_cause_code($previous) != root_cause_code($latest))), class_changed=\((root_cause_class($previous) != root_cause_class($latest))), reason_total=\(((failure_reason_total($latest) - failure_reason_total($previous)) | sgn)), affected_nodes=\((((arr(failure($latest).affectedNodeIds) | length) - (arr(failure($previous).affectedNodeIds) | length)) | sgn))",
      "  " + root_cause_signal_line("previous"; $previous),
      "  " + root_cause_signal_line("latest"; $latest),
      "  " + root_cause_signal_delta_line($latest; $previous),
      "dominant_reason:",
      "  " + dominant_reason_line("previous"; $previous),
      "  " + dominant_reason_line("latest"; $latest),
      "  " + dominant_reason_delta_line($latest; $previous),
      "saturation:",
      "  " + saturation_line("previous"; $previous),
      "  " + saturation_line("latest"; $latest),
      "  " + saturation_delta_line($latest; $previous),
      "convergence:",
      "  " + convergence_line("previous"; $previous),
      "  " + convergence_line("latest"; $latest),
      "  " + convergence_delta_line($latest; $previous),
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
