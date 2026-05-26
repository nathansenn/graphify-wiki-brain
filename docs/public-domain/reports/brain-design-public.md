# Brain Design Public Core

Generated: 2026-05-26

The brain is a source index, ranking layer, traversal engine, and maintenance system. It is not the source of truth.

## Core Contracts

- `SourceRef`
- `BrainNode`
- `RelationEdge`
- `GoalSpec`
- `PipelineTrace`
- `GuardianFinding`

## Ranking Signals

- intent fit
- source authority
- relationship fit
- evidence strength
- freshness
- successful usage
- centrality
- access fit
- corruption risk
- staleness penalty

## Relation Rule

Multiple edges between the same two nodes are allowed when each edge has a different relationship reason and score.

## Maintenance Rule

Reanimate from source registry, compare with current graph, quarantine bad paths, preserve audit history, then regenerate exports.
