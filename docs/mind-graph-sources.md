# Mind Graph Sources

This repo now includes two local archive-derived source bundles under `public/sources/`.

## Pattern of Mind

- Source file: `public/sources/pattern-of-mind-nodes.json`
- Original local source: `/Users/commander/Studio7/AGI/LUCY/workspace/pattern-of-mind-nodes.json`
- Source document described by the mining report: `The Pattern of Mind: A Cognitive Architecture for Artificial Intelligence Based on Correct Reasoning, Not Reward Optimization`
- Mining report: `/Users/commander/Studio7/AGI/ALEXANDREA/library/catalog/projects/gold/architecture/pattern-of-mind-mining-report.md`

The graph imports all 131 extracted Pattern of Mind nodes, including the 11-stage cognitive pipeline, verification chain, certainty spectrum, soul architecture, core values, techniques, warnings, and validation nodes.

## State of Mind

- Source file: `public/sources/state-of-mind.json`
- Original local source: `/Users/commander/Studio7/AGI/senn-archive/src/app/api/brain/metacognitive-journal/route.ts`
- Reference source: `/Users/commander/Studio7/AGI/senn-archive-reference/src/app/api/brain/metacognitive-journal/route.ts`

The graph adds the State of Mind model from the metacognitive journal API: overall brain metrics, recent acquisitions, well-worn paths, areas of focus, center of gravity, and knowledge distribution.

## Graph Links

The imported mind layer is connected into the existing public brain through:

- `home -> pattern-of-mind`
- `home -> state-of-mind`
- `graphify -> pattern-of-mind`
- `brain-json -> pattern-of-mind`
- `brain-json -> state-of-mind`
- `three-scene -> pattern-of-mind`
- `three-scene -> state-of-mind`
- `pattern-of-mind -> state-of-mind`
- `stage-reflect -> metacognitive-journal`
