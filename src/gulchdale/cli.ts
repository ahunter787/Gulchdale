import { loadCommittedWorkspace, validateWorkspace } from "./import.js";
import { applicationPool } from "./database.js";
import { FoundationRepository } from "./repositories.js";

async function main() {
	const [command, id, reviewed, ...extra] = process.argv.slice(2);
	if (extra.length) throw new Error("Too many arguments");
	if (command === "validate" && !id) {
		const w = loadCommittedWorkspace();
		validateWorkspace(w);
		console.log(JSON.stringify({ workspace: w.id, counts: w.counts, provenance: w.provenance }, null, 2));
		return;
	}
	if (!["import", "validate", "diff", "promote", "catalog", "release", "compare"].includes(command ?? ""))
		throw new Error(
			"Commands: import; validate [workspace]; diff workspace; promote workspace reviewed-digest; catalog workspace; release hash; compare"
		);
	const db = applicationPool(),
		repo = new FoundationRepository(db);
	try {
		let result: unknown;
		switch (command) {
			case "import":
				if (id) throw new Error("Import accepts only committed inputs");
				result = { workspace: await repo.import(loadCommittedWorkspace()) };
				break;
			case "validate":
				if (!id) throw new Error("Workspace required");
				validateWorkspace(await repo.workspace(id));
				result = { workspace: id, valid: true };
				break;
			case "diff":
				if (!id) throw new Error("Workspace required");
				result = await repo.diff(id);
				break;
			case "promote":
				if (!id || !reviewed) throw new Error("Workspace and reviewed diff digest required");
				result = { environment: await repo.promote(id, reviewed) };
				break;
			case "catalog":
				if (!id) throw new Error("Workspace required");
				result = await repo.catalog(id);
				break;
			case "release":
				if (!id) throw new Error("Release hash required");
				result = await repo.release(id);
				break;
			case "compare":
				result = await repo.compareLegacy(loadCommittedWorkspace());
				break;
		}
		console.log(JSON.stringify(result, null, 2));
	} finally {
		await db.end();
	}
}
main().catch((error: unknown) => {
	const reason = error instanceof Error ? error.message : "Unknown error";
	const safe = process.env.GULCHDALE_DATABASE_URL
		? reason.replaceAll(process.env.GULCHDALE_DATABASE_URL, "[database URL]")
		: reason;
	console.error(safe);
	console.error(
		"Foundation command failed. Check committed input validation, application DB connectivity and the review digest. No legacy environment was changed."
	);
	process.exitCode = 1;
});
