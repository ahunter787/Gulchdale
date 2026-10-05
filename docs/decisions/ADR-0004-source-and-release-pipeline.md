# ADR-0004: immutable inputs and reviewed releases

Status: Accepted. Ticket: GD-200-001 / GD-100-003.

External data follows snapshot → parse → validate → diff → review → promote.
Source refresh is never live editing. Persist exact input bytes, hashes, provenance
and import diffs. Human overrides are separately stored and applied last; imported
values can never upsert or delete overrides.

Pool, Metadata and Rules releases are immutable, content-addressed components.
Environment identity references their immutable hashes plus the immutable Engine revision.
The live pointer is movable only by explicit reviewed promotion; drafts remain pinned.
Staging workspaces are not live content. Promotion verifies the reviewed diff digest
inside a database transaction; stale review requires another diff.

Cards use normalized logical-name identity (not printing ID) until reliable oracle IDs
are available. Printings retain exact set/collector references. Do not fabricate missing
Scryfall oracle IDs: the committed cache contains limited/minimal records.
Zero-point-five is neutral affinity; missing entries mean neutral. Human values win.
Initial supply preserves imported quantities, explicitly labeled legacy snapshot.
Future scalable virtual supply requires GD-300-901, not guessed formulas.

No running draft depends on live Cube Cobra, Scryfall or EDHREC. No automatic rebalancing.
