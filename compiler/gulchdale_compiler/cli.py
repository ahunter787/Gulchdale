from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .core import (
    CompilerError,
    compile_environment,
    environment_summary,
    fetch_csv,
    load_config,
    manifest_for,
    promote_candidate,
    sha256_file,
    source_summary,
    sync_metadata,
    utc_now,
    verify_candidate,
    write_candidate,
)


def repository_root() -> Path:
    return Path(__file__).resolve().parents[2]


def paths(root: Path) -> dict[str, Path]:
    return {
        "config": root / "compiler/config/gulchdale.yml",
        "work": root / ".gulchdale/work",
        "active_environment": root / "data/cubes/gulchdale.txt",
        "active_manifest": root / "data/cubes/gulchdale.manifest.json",
        "active_source": root / "data/compiler/source/gulchdale.csv",
        "active_metadata": root / "data/compiler/source/scryfall.json",
    }


def sync(root: Path) -> tuple[Path, Path, str]:
    p = paths(root)
    config = load_config(p["config"])
    source = p["work"] / "gulchdale.csv"
    metadata = p["work"] / "scryfall.json"
    fetched_at = fetch_csv(str(config["cube"]["csv_url"]), source)
    sync_metadata(source, metadata, p["active_metadata"], p["config"])
    print(f"Synchronized {source} ({sha256_file(source)})")
    return source, metadata, fetched_at


def compile_candidate(root: Path, source: Path, metadata: Path, fetched_at: str, recovered: bool = False) -> Path:
    p = paths(root)
    config = load_config(p["config"])
    result = compile_environment(source, metadata, p["config"])
    manifest = manifest_for(
        result,
        str(config["cube"]["id"]),
        fetched_at,
        recovered=recovered,
        profile=config.get("profile"),
    )
    candidate = write_candidate(root, result, source, metadata, manifest)
    print(f"Compiled {result.version}: {result.environment_sha256}")
    for warning in result.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    return candidate


def candidate_path(root: Path, version: str) -> Path:
    return root / ".gulchdale/build" / version


def build_diff_report(root: Path, version: str) -> dict[str, Any]:
    p = paths(root)
    candidate = candidate_path(root, version)
    if not (candidate / "manifest.json").exists():
        raise CompilerError(f"Candidate {version} does not exist.")
    manifest = json.loads((candidate / "manifest.json").read_text(encoding="utf-8"))
    active_manifest: dict[str, Any] = {}
    if p["active_manifest"].exists():
        active_manifest = json.loads(p["active_manifest"].read_text(encoding="utf-8"))
    active_environment = environment_summary(p["active_environment"])
    candidate_environment = environment_summary(candidate / "gulchdale.txt")
    active_customs = set(active_environment.pop("customCardNames"))
    candidate_customs = set(candidate_environment.pop("customCardNames"))
    active_effects = dict(active_environment.pop("effectSignatures"))
    candidate_effects = dict(candidate_environment.pop("effectSignatures"))
    active_sheets = dict(active_environment.pop("sheetCards"))
    candidate_sheets = dict(candidate_environment.pop("sheetCards"))
    active_source = source_summary(p["active_source"])
    candidate_source = source_summary(candidate / "gulchdale.csv")
    active_source_cards = set(active_source.pop("cards"))
    candidate_source_cards = set(candidate_source.pop("cards"))
    active_profile = active_manifest.get("environmentProfile", {})
    candidate_profile = manifest.get("environmentProfile", {})
    return {
        "activeVersion": active_manifest.get("version", "unversioned-phase1"),
        "candidateVersion": version,
        "sourceChanged": active_manifest.get("cube", {}).get("sourceSha256") != manifest["cube"]["sourceSha256"],
        "environmentChanged": sha256_file(p["active_environment"]) != manifest["environmentSha256"],
        "source": {
            "active": active_source,
            "candidate": candidate_source,
            "cardsAdded": sorted(candidate_source_cards - active_source_cards),
            "cardsRemoved": sorted(active_source_cards - candidate_source_cards),
        },
        "environment": {"active": active_environment, "candidate": candidate_environment},
        "sheets": {
            name: {
                "added": sorted(set(candidate_sheets[name]) - set(active_sheets[name])),
                "removed": sorted(set(active_sheets[name]) - set(candidate_sheets[name])),
            }
            for name in active_sheets
        },
        "customCards": {
            "added": sorted(candidate_customs - active_customs),
            "removed": sorted(active_customs - candidate_customs),
        },
        "effects": {
            "changed": sorted(
                name
                for name in set(active_effects) | set(candidate_effects)
                if active_effects.get(name) != candidate_effects.get(name)
            )
        },
        "profile": {
            "changed": active_profile != candidate_profile,
            "active": active_profile,
            "candidate": candidate_profile,
        },
        "warnings": manifest.get("warnings", []),
    }


def _markdown_list(values: list[str], empty: str = "None") -> str:
    return "\n".join(f"- {value}" for value in values) if values else f"- {empty}"


def markdown_diff(report: dict[str, Any]) -> str:
    source = report["source"]
    environment = report["environment"]
    active_source = source["active"]
    candidate_source = source["candidate"]
    active_environment = environment["active"]
    candidate_environment = environment["candidate"]
    lines = [
        f"# Gulchdale promotion report: {report['candidateVersion']}",
        "",
        "## Provenance",
        "",
        "| Field | Active | Candidate |",
        "| --- | --- | --- |",
        f"| Version | `{report['activeVersion']}` | `{report['candidateVersion']}` |",
        f"| Source SHA-256 | `{active_source['sha256']}` | `{candidate_source['sha256']}` |",
        f"| Environment SHA-256 | `{active_environment['sha256']}` | `{candidate_environment['sha256']}` |",
        f"| Source rows | {active_source['rows']} | {candidate_source['rows']} |",
        f"| Custom cards | {active_environment['customCards']} | {candidate_environment['customCards']} |",
        f"| Draft effects | {active_environment['draftEffects']} | {candidate_environment['draftEffects']} |",
        "",
        "## Source cards added",
        "",
        _markdown_list(source["cardsAdded"]),
        "",
        "## Source cards removed",
        "",
        _markdown_list(source["cardsRemoved"]),
        "",
        "## Sheet changes",
        "",
    ]
    for name, changes in report["sheets"].items():
        lines.extend(
            [
                f"### {name}",
                "",
                "Added:",
                "",
                _markdown_list(changes["added"]),
                "",
                "Removed:",
                "",
                _markdown_list(changes["removed"]),
                "",
            ]
        )
    lines.extend(
        [
            "## Custom cards added",
            "",
            _markdown_list(report["customCards"]["added"]),
            "",
            "## Custom cards removed",
            "",
            _markdown_list(report["customCards"]["removed"]),
            "",
            "## Effects changed",
            "",
            _markdown_list(report["effects"]["changed"]),
            "",
            "## Environment profile",
            "",
            f"Changed: {'yes' if report['profile']['changed'] else 'no'}",
            "",
            "```json",
            json.dumps(report["profile"]["candidate"], indent=2, sort_keys=True),
            "```",
            "",
            "## Validation warnings",
            "",
            _markdown_list(report["warnings"]),
            "",
        ]
    )
    return "\n".join(lines)


def show_diff(root: Path, version: str, output_format: str = "json", output: Path | None = None) -> None:
    report = build_diff_report(root, version)
    rendered = (
        markdown_diff(report) if output_format == "markdown" else json.dumps(report, indent=2, sort_keys=True) + "\n"
    )
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
        print(output)
    else:
        print(rendered, end="")


def status(root: Path, remote: bool) -> None:
    p = paths(root)
    manifest = json.loads(p["active_manifest"].read_text(encoding="utf-8"))
    report: dict[str, Any] = {
        "version": manifest["version"],
        "environmentSha256": manifest["environmentSha256"],
        "activeSourceSha256": manifest["cube"]["sourceSha256"],
    }
    if remote:
        config = load_config(p["config"])
        target = p["work"] / "status.csv"
        fetch_csv(str(config["cube"]["csv_url"]), target)
        report["remoteSourceSha256"] = sha256_file(target)
        report["state"] = (
            "current" if report["remoteSourceSha256"] == report["activeSourceSha256"] else "update_available"
        )
        target.unlink(missing_ok=True)
    print(json.dumps(report, indent=2, sort_keys=True))


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="gulchdale-compiler")
    result.add_argument("--root", type=Path, default=repository_root())
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("sync")
    compile_parser = commands.add_parser("compile")
    compile_parser.add_argument("--source", type=Path)
    compile_parser.add_argument("--metadata", type=Path)
    compile_parser.add_argument("--fetched-at", default="")
    compile_parser.add_argument("--recovered-phase1", action="store_true")
    validate_parser = commands.add_parser("validate")
    validate_parser.add_argument("--version", required=True)
    commands.add_parser("build")
    diff_parser = commands.add_parser("diff")
    diff_parser.add_argument("--version", required=True)
    diff_parser.add_argument("--format", choices=("json", "markdown"), default="json")
    diff_parser.add_argument("--output", type=Path)
    status_parser = commands.add_parser("status")
    status_parser.add_argument("--offline", action="store_true")
    promote_parser = commands.add_parser("promote")
    promote_parser.add_argument("--version", required=True)
    return result


def main() -> None:
    args = parser().parse_args()
    root = args.root.resolve()
    p = paths(root)
    try:
        if args.command == "sync":
            sync(root)
        elif args.command == "compile":
            source = args.source or p["work"] / "gulchdale.csv"
            metadata = args.metadata or p["work"] / "scryfall.json"
            candidate = compile_candidate(
                root, source, metadata, args.fetched_at or utc_now(), recovered=args.recovered_phase1
            )
            print(candidate)
        elif args.command == "validate":
            verify_candidate(root, args.version)
            print(f"Validated {args.version} with Draftmancer.")
        elif args.command == "build":
            source, metadata, fetched_at = sync(root)
            candidate = compile_candidate(root, source, metadata, fetched_at)
            verify_candidate(root, candidate.name)
            print(candidate)
        elif args.command == "diff":
            show_diff(root, args.version, args.format, args.output)
        elif args.command == "status":
            status(root, not args.offline)
        elif args.command == "promote":
            show_diff(root, args.version)
            promote_candidate(root, args.version)
            print(f"Promoted {args.version}. Rebuild Gulchdale to activate it.")
    except (CompilerError, OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
