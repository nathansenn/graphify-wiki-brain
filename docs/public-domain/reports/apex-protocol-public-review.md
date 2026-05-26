# APEX Protocol Public Extract

Generated: 2026-05-26

Latest reviewed line: v2.1.6, source date 2026-05-17, package timestamp 2026-05-18.

This is not the identity protocol. It is a public operational extraction of reusable graph, verification, dispatch, and safety principles.

## Public Principles

- Use graph-indexed selective loading instead of loading every file into context.
- Map a task to the smallest relevant subsection set before acting.
- Separate creation, validation, deployment, and safety review roles.
- Prefer source-backed retrieval over assumption.
- Never fabricate retrieval results or pretend a missing source was found.
- Keep a single source of truth and reference it by stable id.
- Run numerical, logical, and evidence checks before sealing important work.
- Use read-only review agents for audit and integrity checks.
- Treat greater capability as a reason for stronger correction loops.

## Public Chains

- `task-intake -> graph-index lookup -> minimal context load -> specialist execution -> validator review -> deployment or archive`
- `claim -> type check -> reasoning check -> source evidence check -> contradiction check -> confidence label`
- `incident -> scope -> logs -> reproduction -> patch -> verification -> report`
