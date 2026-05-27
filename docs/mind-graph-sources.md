# Mind Graph Sources

This repository includes public-domain source bundles under `public/sources/` and a complete public-domain release package under `public/public-domain/`.

## Pattern of Mind

- Public source file: `public/sources/pattern-of-mind-nodes.json`
- Public-domain complete source index: `public/public-domain/sources/pattern-of-mind.public.json`
- Public review PDF: `public/public-domain/pdf/pattern-of-mind-public-review.pdf`

The graph imports 131 sanitized Pattern of Mind nodes, including the 11-stage cognitive pipeline, verification chain, certainty spectrum, reasoning techniques, warnings, validation nodes, and implementation nodes.

## Full Public Books

Full book copies are stored under `public/books/` and indexed by `public/books/books.manifest.json`.

- Pattern of Mind full HTML: `public/books/pattern-of-mind/The-Pattern-of-Mind-BOOK.html`
- The Witness full HTML: `public/books/the-witness/the-witness.html`
- The Examined Mind original DOCX: `public/books/the-examined-mind/The_Examined_Mind.docx`
- The Examined Mind generated reader HTML and TXT: `public/books/the-examined-mind/the-examined-mind.html`, `public/books/the-examined-mind/the-examined-mind.txt`

Run `npm run map:books` after public package regeneration to reattach the full book manifest, book nodes, section headings, and concept mappings to `public/brain.json`.

## Static API

The static API layer is generated under `public/api/`.

- API discovery: `public/api/index.json`
- Complete graph: `public/api/brain.json`
- Full book manifest: `public/api/books.json`
- Compact counts: `public/api/summary.json`

The frontend loads graph data through `src/api/brainApi.ts`, which calls `api/brain.json` and falls back to `brain.json` if needed.

## State of Mind

- Public source file: `public/sources/state-of-mind.json`
- Public-domain complete source index: `public/public-domain/sources/state-of-mind.public.json`
- Public review PDF: `public/public-domain/pdf/state-of-mind-public-review.pdf`

The graph adds the State of Mind model as a public metacognitive index: overall graph metrics, recent acquisitions, well-worn paths, focus areas, center of gravity, and knowledge distribution.

## Brain Design, APEX Protocol, And Reasoning Assembly

- Brain design PDF: `public/public-domain/pdf/brain-design-public.pdf`
- APEX public extract PDF: `public/public-domain/pdf/apex-protocol-public-review.pdf`
- Reasoning assembly PDF: `public/public-domain/pdf/reasoning-assembly-public.pdf`
- Combined package PDF: `public/public-domain/pdf/public-domain-brain-package.pdf`

## Graph Links

The public-domain package is connected into `public/brain.json` through the `public-domain-package` node and document nodes for each generated PDF.
