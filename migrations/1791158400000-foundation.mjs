export const up = (pgm) =>
	pgm.sql(`
CREATE SCHEMA gulchdale;
CREATE FUNCTION gulchdale.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable % records cannot be changed', TG_TABLE_NAME; END $$;
CREATE TABLE gulchdale.source_snapshots (
 id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'), kind text NOT NULL,
 source_path text NOT NULL, content bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_sources BEFORE UPDATE OR DELETE ON gulchdale.source_snapshots
 FOR EACH ROW EXECUTE FUNCTION gulchdale.reject_mutation();
CREATE TABLE gulchdale.workspaces (
 id text PRIMARY KEY, payload jsonb NOT NULL, sealed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION gulchdale.guard_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.sealed THEN RAISE EXCEPTION 'sealed workspace cannot be changed'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sealed_workspace BEFORE UPDATE OR DELETE ON gulchdale.workspaces
 FOR EACH ROW EXECUTE FUNCTION gulchdale.guard_workspace();
CREATE TABLE gulchdale.workspace_sources (
 workspace_id text REFERENCES gulchdale.workspaces(id), source_id text REFERENCES gulchdale.source_snapshots(id),
 PRIMARY KEY (workspace_id, source_id)
);
CREATE TABLE gulchdale.cards (
 workspace_id text REFERENCES gulchdale.workspaces(id), id text NOT NULL, name text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY (workspace_id,id)
);
CREATE TABLE gulchdale.printings (
 workspace_id text NOT NULL, id text NOT NULL, card_id text NOT NULL, set_code text NOT NULL, collector_number text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY (workspace_id,id), FOREIGN KEY(workspace_id,card_id) REFERENCES gulchdale.cards(workspace_id,id)
);
CREATE TABLE gulchdale.pool_entries (
 workspace_id text NOT NULL, id text NOT NULL, card_id text NOT NULL, printing_id text,
 quantity integer NOT NULL CHECK (quantity>0), sheets text[] NOT NULL, tags text[] NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,card_id) REFERENCES gulchdale.cards(workspace_id,id),
 FOREIGN KEY(workspace_id,printing_id) REFERENCES gulchdale.printings(workspace_id,id)
);
CREATE TABLE gulchdale.commanders (
 workspace_id text NOT NULL, card_id text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(workspace_id,card_id), FOREIGN KEY(workspace_id,card_id) REFERENCES gulchdale.cards(workspace_id,id)
);
CREATE TABLE gulchdale.personal_injections (
 workspace_id text NOT NULL, id text NOT NULL, card_id text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,card_id) REFERENCES gulchdale.cards(workspace_id,id)
);
CREATE TABLE gulchdale.supply_policies (
 workspace_id text REFERENCES gulchdale.workspaces(id), id text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE gulchdale.archetypes (
 workspace_id text REFERENCES gulchdale.workspaces(id), id text NOT NULL,
 capacity numeric CHECK(capacity>=0), data jsonb NOT NULL, PRIMARY KEY(workspace_id,id)
);
CREATE TABLE gulchdale.tribes (
 workspace_id text REFERENCES gulchdale.workspaces(id), id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(workspace_id,id)
);
CREATE TABLE gulchdale.world_tags (
 workspace_id text REFERENCES gulchdale.workspaces(id), id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(workspace_id,id)
);
CREATE TABLE gulchdale.card_affinities (
 workspace_id text NOT NULL, card_id text NOT NULL, archetype_id text NOT NULL,
 score numeric NOT NULL CHECK(score BETWEEN 0 AND 1), PRIMARY KEY(workspace_id,card_id,archetype_id),
 FOREIGN KEY(workspace_id,card_id) REFERENCES gulchdale.cards(workspace_id,id),
 FOREIGN KEY(workspace_id,archetype_id) REFERENCES gulchdale.archetypes(workspace_id,id)
);
CREATE FUNCTION gulchdale.guard_staging() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid text;
BEGIN
 IF TG_OP='DELETE' THEN wid=OLD.workspace_id; ELSE wid=NEW.workspace_id; END IF;
 IF (SELECT sealed FROM gulchdale.workspaces WHERE id=wid) THEN RAISE EXCEPTION 'sealed staging data cannot be changed'; END IF;
 IF TG_OP='UPDATE' AND (SELECT sealed FROM gulchdale.workspaces WHERE id=OLD.workspace_id) THEN RAISE EXCEPTION 'sealed staging data cannot be moved'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['workspace_sources','cards','printings','pool_entries','commanders','personal_injections','supply_policies','archetypes','tribes','world_tags','card_affinities'] LOOP
 EXECUTE format('CREATE TRIGGER guard_staging BEFORE INSERT OR UPDATE OR DELETE ON gulchdale.%I FOR EACH ROW EXECUTE FUNCTION gulchdale.guard_staging()',t);
 END LOOP;
END $$;
-- Deliberately outside imported staging: source refresh cannot overwrite curation.
CREATE TABLE gulchdale.human_overrides (
 card_id text NOT NULL, field text NOT NULL CHECK(field ~ '^[a-zA-Z][a-zA-Z0-9_.-]*$'),
 value jsonb NOT NULL, PRIMARY KEY(card_id,field)
);
CREATE TABLE gulchdale.releases (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'), kind text NOT NULL CHECK(kind IN ('pool','metadata','rules','engine','environment')),
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(hash,kind)
);
CREATE TRIGGER immutable_releases BEFORE UPDATE OR DELETE ON gulchdale.releases
 FOR EACH ROW EXECUTE FUNCTION gulchdale.reject_mutation();
CREATE TABLE gulchdale.environment_refs (
 hash text PRIMARY KEY REFERENCES gulchdale.releases(hash),
 pool_hash text NOT NULL, pool_kind text NOT NULL DEFAULT 'pool' CHECK(pool_kind='pool'),
 metadata_hash text NOT NULL, metadata_kind text NOT NULL DEFAULT 'metadata' CHECK(metadata_kind='metadata'),
 rules_hash text NOT NULL, rules_kind text NOT NULL DEFAULT 'rules' CHECK(rules_kind='rules'),
 engine_hash text NOT NULL, engine_kind text NOT NULL DEFAULT 'engine' CHECK(engine_kind='engine'),
 FOREIGN KEY(pool_hash,pool_kind) REFERENCES gulchdale.releases(hash,kind),
 FOREIGN KEY(metadata_hash,metadata_kind) REFERENCES gulchdale.releases(hash,kind),
 FOREIGN KEY(rules_hash,rules_kind) REFERENCES gulchdale.releases(hash,kind),
 FOREIGN KEY(engine_hash,engine_kind) REFERENCES gulchdale.releases(hash,kind)
);
CREATE TRIGGER immutable_environment_refs BEFORE UPDATE OR DELETE ON gulchdale.environment_refs
 FOR EACH ROW EXECUTE FUNCTION gulchdale.reject_mutation();
CREATE TABLE gulchdale.import_diffs (
 digest text PRIMARY KEY, workspace_id text NOT NULL REFERENCES gulchdale.workspaces(id),
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_diffs BEFORE UPDATE OR DELETE ON gulchdale.import_diffs
 FOR EACH ROW EXECUTE FUNCTION gulchdale.reject_mutation();
CREATE TABLE gulchdale.live_release (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 environment_hash text NOT NULL REFERENCES gulchdale.environment_refs(hash), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gulchdale.promotions (
 id bigserial PRIMARY KEY, environment_hash text NOT NULL REFERENCES gulchdale.environment_refs(hash),
 reviewed_digest text NOT NULL REFERENCES gulchdale.import_diffs(digest), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_promotions BEFORE UPDATE OR DELETE ON gulchdale.promotions
 FOR EACH ROW EXECUTE FUNCTION gulchdale.reject_mutation();
`);
export const down = () => {
	throw new Error(
		"Foundation migration is intentionally non-destructive; restore a reviewed application DB backup instead"
	);
};
