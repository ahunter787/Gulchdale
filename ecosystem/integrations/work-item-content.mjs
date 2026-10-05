// A deliberately small Markdown dialect for the repository-owned execution catalog.
// No raw HTML, images, nested lists or general-purpose Markdown dependency is needed.
import path from "node:path";
export const CATALOG_PATH = "docs/WORK_ITEMS.md";
export const CONTENT_HEADINGS = [
	"Purpose",
	"Expected outcome",
	"Current state",
	"Open questions",
	"Completion criteria",
	"Related reading",
	"Engineering notes",
];
export const escapeHTML = (text) =>
	String(text)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

export function parseCatalog(text, expectedKeys) {
	const entries = new Map();
	let current;
	for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
		if (line.startsWith("## ")) {
			const match = /^## (GD-\d{3}(?:-\d{3})?|phase-\d{2}) — (.+)$/.exec(line);
			if (!match) throw new Error("Invalid catalog heading: " + line);
			if (entries.has(match[1])) throw new Error("Duplicate catalog key " + match[1]);
			current = { key: match[1], title: match[2], lines: [] };
			entries.set(current.key, current);
		} else if (current) current.lines.push(line);
	}
	const expected = new Set(expectedKeys);
	for (const key of entries.keys()) if (!expected.has(key)) throw new Error("Unknown catalog key " + key);
	for (const key of expected) if (!entries.has(key)) throw new Error("Missing catalog description " + key);
	for (const entry of entries.values()) {
		entry.markdown = entry.lines.join("\n").trim();
		const headings = [...entry.markdown.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
		if (headings.join("|") !== CONTENT_HEADINGS.join("|"))
			throw new Error("Required human-first headings/order missing for " + entry.key);
		const sections = entry.markdown.split(/^### .+$/m).slice(1);
		if (sections.some((s) => !s.trim())) throw new Error("Empty catalog section for " + entry.key);
		delete entry.lines;
	}
	return entries;
}

export function safeLink(target) {
	if (!target || /[\s\u0000-\u001f\\]/.test(target)) throw new Error("Unsafe link target");
	if (/^https?:\/\//i.test(target)) {
		const url = new URL(target);
		if (url.username || url.password) throw new Error("Credentials are not allowed in links");
		return { external: target };
	}
	if (/^#[a-zA-Z0-9_-]+$/.test(target)) return { external: target };
	// Only repository Markdown links are supported, not arbitrary relative URLs.
	if (!/^[a-zA-Z0-9_./-]+\.md(?:#[a-zA-Z0-9_-]+)?$/.test(target) || target.startsWith("/"))
		throw new Error("Unsafe or unsupported link target: " + target);
	const [file, fragment = ""] = target.split("#");
	const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(CATALOG_PATH), file));
	if (resolved.startsWith("../")) throw new Error("Link escapes the repository");
	return { file: resolved, fragment: fragment ? "#" + fragment : "" };
}

function inline(text, resolveLink) {
	const tokens = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\n]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
	let result = "",
		offset = 0;
	for (const match of text.matchAll(tokens)) {
		result += escapeHTML(text.slice(offset, match.index));
		if (match[1] !== undefined) result += "<code>" + escapeHTML(match[1]) + "</code>";
		else if (match[2] !== undefined) {
			const parsed = safeLink(match[3]);
			const href = resolveLink ? resolveLink(parsed) : (parsed.external ?? parsed.file + parsed.fragment);
			safeLink(href); // Resolvers cannot introduce active or credential-bearing URLs.
			result += '<a href="' + escapeHTML(href) + '">' + escapeHTML(match[2]) + "</a>";
		} else if (match[4] !== undefined) result += "<strong>" + escapeHTML(match[4]) + "</strong>";
		else result += "<em>" + escapeHTML(match[5]) + "</em>";
		offset = match.index + match[0].length;
	}
	return result + escapeHTML(text.slice(offset));
}

export function renderMarkdown(markdown, resolveLink) {
	let html = "",
		paragraph = [],
		list = null,
		code = null;
	const flush = () => {
		if (paragraph.length) html += "<p>" + inline(paragraph.join(" "), resolveLink) + "</p>";
		paragraph = [];
		if (list) html += "</" + list + ">";
		list = null;
	};
	for (const raw of markdown.split("\n")) {
		if (raw.startsWith("```")) {
			if (code !== null) {
				html += "<pre><code>" + escapeHTML(code.join("\n")) + "</code></pre>";
				code = null;
			} else {
				flush();
				code = [];
			}
			continue;
		}
		if (code !== null) {
			code.push(raw);
			continue;
		}
		if (/^\s+\S/.test(raw)) throw new Error("Indented/nested Markdown is unsupported");
		const line = raw.trim();
		if (!line) {
			flush();
			continue;
		}
		const heading = /^(#{3,4}) (.+)$/.exec(line);
		if (heading) {
			flush();
			html += "<h" + heading[1].length + ">" + inline(heading[2], resolveLink) + "</h" + heading[1].length + ">";
			continue;
		}
		const item = /^(?:- |\d+\. )(.+)$/.exec(line);
		if (item) {
			const kind = line.startsWith("- ") ? "ul" : "ol";
			if (list !== kind) {
				flush();
				html += "<" + kind + ">";
				list = kind;
			}
			html += "<li>" + inline(item[1], resolveLink) + "</li>";
		} else {
			if (list) flush();
			paragraph.push(line);
		}
	}
	if (code !== null) throw new Error("Unclosed code block");
	flush();
	return html;
}

export function renderDescription(entry, metadata, resolveLink) {
	// The last catalog section is Engineering notes; machine metadata is appended there.
	return renderMarkdown(entry.markdown, resolveLink) + "<p>" + escapeHTML(metadata) + "</p>";
}

const decodeEntities = (s) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
		if (entity.startsWith("#"))
			return String.fromCodePoint(
				entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
			);
		return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[entity.toLowerCase()];
	});

export function plainDescription(html) {
	return decodeEntities(
		html
			.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, "$2 — $1")
			.replace(/<li>/g, "- ")
			.replace(/<\/(?:h[34]|p|pre|li)>/g, "\n\n")
			.replace(/<[^>]*>/g, "")
	)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function normalizedHTML(value) {
	// Ignore editor chrome, but keep text, link destinations and meaningful structure.
	return (value ?? "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<\/?(?:div|span)\b[^>]*>/gi, "")
		.replace(/<([a-z][a-z0-9]*)\b([^>]*)>/gi, (_, rawTag, attributes) => {
			const tag = rawTag.toLowerCase();
			const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
			if (tag === "a") return '<a href="' + escapeHTML(decodeEntities(href?.[1] ?? href?.[2] ?? "")) + '">';
			return "<" + (tag === "b" ? "strong" : tag === "i" ? "em" : tag) + ">";
		})
		.replace(/<\/(b|i)>/gi, (_, tag) => "</" + (tag.toLowerCase() === "b" ? "strong" : "em") + ">")
		.replace(/<li><p>([\s\S]*?)<\/p><\/li>/g, "<li>$1</li>")
		.replace(/>([^<]*)</g, (_, text) => ">" + escapeHTML(decodeEntities(text).replace(/\s+/g, " ")) + "<")
		.replace(/>\s+</g, "><")
		.trim();
}
