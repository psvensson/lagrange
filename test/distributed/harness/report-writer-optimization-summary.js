function createOptimizationSummaryComputer({
  COMPONENT_UNKNOWN,
  OPTIMIZATION_SUMMARY_TOP_COMPONENT_LIMIT,
  OPTIMIZATION_SUMMARY_TOP_PARTITION_LIMIT,
  PRIORITY_LOW,
  ZERO,
  normalizeFiniteNumber,
}) {
  function computePartitionHotspotSummary(scenarios) {
    const byPartition = new Map();
    for (const scenario of scenarios) {
      const hotspots = Array.isArray(scenario?.partitionHotspots) ?
        scenario.partitionHotspots :
        [];
      for (const hotspot of hotspots) {
        const partitionId = String(hotspot?.partitionId || COMPONENT_UNKNOWN);
        if (!byPartition.has(partitionId)) {
          byPartition.set(partitionId, {
            partitionId,
            count: ZERO,
            highestScore: ZERO,
            maxOverTargetMs: ZERO,
            scenarios: new Set(),
          });
        }
        const aggregate = byPartition.get(partitionId);
        aggregate.count++;
        aggregate.scenarios.add(String(scenario?.scenario || COMPONENT_UNKNOWN));
        const score = normalizeFiniteNumber(hotspot?.hotspotScore) || ZERO;
        const overTargetMs = normalizeFiniteNumber(hotspot?.overTargetMs) || ZERO;
        if (score > aggregate.highestScore) {
          aggregate.highestScore = score;
        }
        if (overTargetMs > aggregate.maxOverTargetMs) {
          aggregate.maxOverTargetMs = overTargetMs;
        }
      }
    }

    return [...byPartition.values()]
      .map((entry) => ({
        partitionId: entry.partitionId,
        count: entry.count,
        highestScore: entry.highestScore,
        maxOverTargetMs: entry.maxOverTargetMs,
        scenarios: [...entry.scenarios].sort(),
      }))
      .sort((left, right) => {
        if (left.highestScore !== right.highestScore) {
          return right.highestScore - left.highestScore;
        }
        if (left.count !== right.count) {
          return right.count - left.count;
        }
        return left.partitionId.localeCompare(right.partitionId);
      })
      .slice(ZERO, OPTIMIZATION_SUMMARY_TOP_PARTITION_LIMIT);
  }

  return function computeOptimizationSummary(scenarios) {
    const items = [];
    for (const scenario of scenarios) {
      const priorities = Array.isArray(scenario?.optimizationPriorities) ?
        scenario.optimizationPriorities :
        [];
      for (const priority of priorities) {
        items.push({
          scenario: scenario.scenario || null,
          ...priority,
        });
      }
    }

    const byComponent = new Map();
    for (const item of items) {
      const component = String(item?.component || COMPONENT_UNKNOWN);
      if (!byComponent.has(component)) {
        byComponent.set(component, {
          component,
          count: ZERO,
          highestPriority: PRIORITY_LOW,
          highestScore: ZERO,
        });
      }
      const aggregate = byComponent.get(component);
      aggregate.count++;
      const itemScore = normalizeFiniteNumber(item?.score) || ZERO;
      if (itemScore > aggregate.highestScore) {
        aggregate.highestScore = itemScore;
        aggregate.highestPriority = item?.priority || PRIORITY_LOW;
      }
    }

    const topComponents = [...byComponent.values()]
      .sort((left, right) => {
        if (left.highestScore !== right.highestScore) {
          return right.highestScore - left.highestScore;
        }
        if (left.count !== right.count) {
          return right.count - left.count;
        }
        return left.component.localeCompare(right.component);
      })
      .slice(ZERO, OPTIMIZATION_SUMMARY_TOP_COMPONENT_LIMIT);

    return {
      totalPriorityItems: items.length,
      scenariosWithPriorities: new Set(items.map((item) =>
        String(item.scenario || COMPONENT_UNKNOWN))).size,
      topComponents,
      topPartitions: computePartitionHotspotSummary(scenarios),
    };
  };
}

export {createOptimizationSummaryComputer};
