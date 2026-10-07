# ADR-0006: repository-authoritative documentation and execution mirrors

Status: Accepted. Ticket: GD-000-001.

Repository Markdown is authoritative. The Charter is preserved from the shared
conversation; Systems Map Markdown governs its derived PDF. Explicit owner-approved
plan choices override recommendations in these source artifacts (including Outline
being called canonical in the original map). Recommendations remain test hypotheses.

Outline publishes tracked Markdown. Plane mirrors ten GD Modules, phase milestones,
executable work items and owner-decision tickets using external_source + external_id.
Each ticket belongs to exactly one module. Reruns must update rather than duplicate.
Never delete stale material automatically; report it for owner review.
Mailpit is an email sink for development, not a runtime drafting dependency.
Legacy Phase 1–3 docs keep their paths; old Phase 4 is superseded research.

Owner-authored research is a separate lane. The Outline collection **Gulchdale
Game Design and Balance** preserves handwritten curation and marketing/experience
intent. Never edit or overwrite its handwritten pages, including Gulchdale
Philosophy. Engineering mirrors publish only into the configured Gulchdale
collection. Link research inputs and manually record explicitly reviewed decisions
with provenance in repository Markdown; do not treat marketing wording as API
contracts or auto-ingest it as questionnaire approval. The owner may also write
ideas in Plane; this does not authorize modifying those handwritten sections.
See [ADR-0010](ADR-0010-experience-policy-and-commander-packages.md).
