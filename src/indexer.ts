import { App, TFile } from "obsidian";

export interface IndexedNote {
	path: string;
	title: string;
	folder: string;
	noteType: string;
	cat: string;
	tags: string[];
	embedText: string;
	sha256: string;
	links: string[]; // resolved vault-relative paths
	frontmatter: Record<string, string>; // all frontmatter fields as strings
}

export interface IndexerConfig {
	globs: string[];
	excludeGlobs: string[];
	maxNotes: number;
	embedFields: string[];
	embedIncludeTags: boolean;
	filterIncludeTags: string[];
	filterExcludeTags: string[];
	filterIncludeFolders: string[];
	filterExcludeFolders: string[];
	filterRequireProperty: string;
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

export function matchesGlob(path: string, pattern: string): boolean {
	// Simple glob matching: supports * and **
	const re = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*/g, "§§")
		.replace(/\*/g, "[^/]*")
		.replace(/§§/g, ".*");
	return new RegExp("^" + re + "$").test(path);
}

function stringifyVal(val: unknown): string {
	if (Array.isArray(val)) return val.map(String).join(", ");
	return String(val);
}

export async function indexVault(
	app: App,
	config: IndexerConfig
): Promise<IndexedNote[]> {
	const vault = app.vault;
	const files = vault.getMarkdownFiles();

	// Build basename → path lookup for wikilink resolution
	const byBasename = new Map<string, string>();
	for (const f of files) {
		const bn = f.basename.toLowerCase();
		byBasename.set(bn, f.path);
	}

	// Filter by include globs, then remove exclude matches
	let matched: TFile[] = [];
	for (const f of files) {
		let included = false;
		for (const g of config.globs) {
			if (matchesGlob(f.path, g)) { included = true; break; }
		}
		if (!included) continue;
		let excluded = false;
		for (const g of config.excludeGlobs) {
			if (matchesGlob(f.path, g)) { excluded = true; break; }
		}
		if (!excluded) matched.push(f);
	}

	// Apply folder filters (include then exclude) before safety cap
	if (config.filterIncludeFolders.length > 0) {
		const inc = new Set(config.filterIncludeFolders.map(s => s.toLowerCase()));
		matched = matched.filter(f => {
			const folder = f.path.includes("/") ? f.path.split("/")[0].toLowerCase() : "";
			return inc.has(folder);
		});
	}
	if (config.filterExcludeFolders.length > 0) {
		const exc = new Set(config.filterExcludeFolders.map(s => s.toLowerCase()));
		matched = matched.filter(f => {
			const folder = f.path.includes("/") ? f.path.split("/")[0].toLowerCase() : "";
			return !exc.has(folder);
		});
	}

	// Safety cap
	if (matched.length > config.maxNotes) {
		matched = matched.slice(0, config.maxNotes);
	}

	// Build set of matched paths for link resolution
	const matchedPaths = new Set(matched.map((f) => f.path));

	const results: IndexedNote[] = [];

	// Parse property filter config
	let requirePropKey = "";
	let requirePropVal = "";
	if (config.filterRequireProperty) {
		const colonIdx = config.filterRequireProperty.indexOf(":");
		if (colonIdx >= 0) {
			requirePropKey = config.filterRequireProperty.slice(0, colonIdx).trim();
			requirePropVal = config.filterRequireProperty.slice(colonIdx + 1).trim();
		} else {
			requirePropKey = config.filterRequireProperty.trim();
		}
	}

	for (const file of matched) {
		const content = await vault.read(file);

		// Use Obsidian's metadataCache for frontmatter instead of custom parsing
		const cached = app.metadataCache.getFileCache(file);
		const fm: Record<string, unknown> = cached?.frontmatter ? { ...cached.frontmatter } : {};
		// metadataCache adds a "position" key — remove it
		delete fm.position;

		const title = fm.title ? stringifyVal(fm.title) : file.basename;
		const type = fm.type ? stringifyVal(fm.type) : "";
		const cat = fm.cat ? stringifyVal(fm.cat) : "";
		const body = stripFrontmatter(content).slice(0, 12000);

		// Extract tags from frontmatter and inline #tags
		const tags: string[] = [];
		const fmTags = fm.tags;
		if (Array.isArray(fmTags)) {
			for (const t of fmTags) tags.push(String(t).replace(/^#/, ""));
		} else if (typeof fmTags === "string" && fmTags) {
			tags.push(fmTags.replace(/^#/, ""));
		}
		const inlineTagRe = /(?:^|\s)#([a-zA-Z][\w/-]*)/g;
		let tagMatch: RegExpExecArray | null;
		while ((tagMatch = inlineTagRe.exec(body)) !== null) {
			tags.push(tagMatch[1]);
		}
		const uniqueTags = [...new Set(tags)];

		// Apply tag filters
		if (config.filterIncludeTags.length > 0) {
			const inc = new Set(config.filterIncludeTags.map(s => s.toLowerCase()));
			if (!uniqueTags.some(t => inc.has(t.toLowerCase()))) continue;
		}
		if (config.filterExcludeTags.length > 0) {
			const exc = new Set(config.filterExcludeTags.map(s => s.toLowerCase()));
			if (uniqueTags.some(t => exc.has(t.toLowerCase()))) continue;
		}

		// Apply property filter
		if (requirePropKey) {
			const propVal = fm[requirePropKey];
			if (propVal == null || propVal === "") continue;
			if (requirePropVal && stringifyVal(propVal).toLowerCase() !== requirePropVal.toLowerCase()) continue;
		}

		// Build embedText dynamically from config.embedFields
		const parts: string[] = [];
		for (const field of config.embedFields) {
			if (field === "title") {
				if (title) parts.push(`title: ${title}`);
			} else {
				const val = fm[field];
				if (val) parts.push(`${field}: ${stringifyVal(val)}`);
			}
		}
		if (config.embedIncludeTags && uniqueTags.length) {
			parts.push(`tags: ${uniqueTags.join(", ")}`);
		}
		parts.push("");
		parts.push(body);
		const embedText = parts.join("\n");

		const sha256 = await sha256Hex(embedText);

		// Extract wikilinks
		const links: string[] = [];
		let m: RegExpExecArray | null;
		const linkRe = new RegExp(WIKILINK_RE.source, "g");
		while ((m = linkRe.exec(content)) !== null) {
			const target = m[1].trim().toLowerCase();
			const resolved = byBasename.get(target);
			if (resolved && matchedPaths.has(resolved)) {
				links.push(resolved);
			}
		}

		const folder = file.path.includes("/")
			? file.path.split("/")[0]
			: "";

		// Build frontmatter string map
		const frontmatter: Record<string, string> = {};
		for (const [k, v] of Object.entries(fm)) {
			frontmatter[k] = stringifyVal(v);
		}

		results.push({
			path: file.path,
			title,
			folder,
			noteType: type,
			cat,
			tags: uniqueTags,
			embedText,
			sha256,
			links: [...new Set(links)],
			frontmatter,
		});
	}

	return results;
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

async function sha256Hex(text: string): Promise<string> {
	const data = new TextEncoder().encode(text);
	const hash = await crypto.subtle.digest("SHA-256", data);
	const bytes = new Uint8Array(hash);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
