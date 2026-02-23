import type { ChorographiaSettings } from "./settings";
import type { PluginCache } from "./cache";

export interface MapSnapshot {
	version: 1;
	name: string;
	timestamp: number;
	settings: Partial<ChorographiaSettings>;
	cache: PluginCache;
}

const SETTINGS_KEYS: (keyof ChorographiaSettings)[] = [
	"zoneGranularity", "zoneStyle", "colorMode", "activeTheme",
	"worldmapSeaLevel", "worldmapUnity", "worldmapRuggedness",
	"mapLocked", "showZones", "showSubZones",
	"zoneLabelSize", "zoneLabelOpacity", "noteTitleSize", "noteTitleOpacity",
	"labelOutline", "labelOutlineWidth",
];

export function serializeSnapshot(
	name: string,
	settings: ChorographiaSettings,
	cache: PluginCache,
): MapSnapshot {
	const subset: Partial<ChorographiaSettings> = {};
	for (const key of SETTINGS_KEYS) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic key copy across matching types
		(subset as Record<string, unknown>)[key] = settings[key];
	}
	return {
		version: 1,
		name,
		timestamp: Date.now(),
		settings: subset,
		cache: JSON.parse(JSON.stringify(cache)),
	};
}

export function deserializeSnapshot(data: unknown): MapSnapshot | null {
	if (!data || typeof data !== "object") return null;
	const obj = data as Record<string, unknown>;
	if (obj.version !== 1 || !obj.name || !obj.cache) return null;
	const cache = obj.cache as Record<string, unknown>;
	if (!cache.notes) return null;
	return obj as unknown as MapSnapshot;
}
