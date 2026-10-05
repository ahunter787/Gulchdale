# ADR-0002: isolated application database and runtime modes

Status: Accepted. Ticket: GD-100-001 / GD-100-002.

PostgreSQL is Gulchdale's application database, owned by the application Compose project
with its own service and volume. Never use Plane or Outline databases or networks as
application infrastructure. File persistence remains unchanged for the legacy engine.

Runtime modes are legacy (default), shadow (best-effort read-only comparison, legacy drafts),
and orchestrated (refused until a future acceptance gate explicitly enables it).
Shadow connection/import failures must not block startup or any legacy draft.
No Phase 0/1 public route or socket changes. Read-only foundation inspection is an operator CLI.
Database migrations are checked in, transactional and explicitly invoked; no automatic
startup migration or promotion. Back up the application DB separately from legacy state.

Consequence: two independent persistence systems temporarily coexist. This is deliberate
rollback isolation, not a mandate to convert Draftmancer session objects into relational rows.
