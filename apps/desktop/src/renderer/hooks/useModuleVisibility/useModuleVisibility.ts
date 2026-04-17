import { useCallback, useSyncExternalStore } from "react";

export type ModuleKey = "tasks" | "issues" | "repos";

type ModuleVisibility = Record<ModuleKey, boolean>;

const DEFAULTS: ModuleVisibility = {
	tasks: true,
	issues: true,
	repos: true,
};

const STORAGE_KEY = "superset.module-visibility";
const EVENT = "superset:module-visibility-changed";

let cachedRaw: string | null = null;
let cachedValue: ModuleVisibility = DEFAULTS;

function read(): ModuleVisibility {
	if (typeof window === "undefined") return DEFAULTS;
	const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
	if (raw === cachedRaw) return cachedValue;
	cachedRaw = raw;
	if (!raw) {
		cachedValue = DEFAULTS;
		return cachedValue;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<ModuleVisibility>;
		cachedValue = { ...DEFAULTS, ...parsed };
	} catch {
		cachedValue = DEFAULTS;
	}
	return cachedValue;
}

function write(value: ModuleVisibility) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	window.addEventListener(EVENT, onChange);
	window.addEventListener("storage", onChange);
	return () => {
		window.removeEventListener(EVENT, onChange);
		window.removeEventListener("storage", onChange);
	};
}

export function useModuleVisibility() {
	const visibility = useSyncExternalStore(subscribe, read, () => DEFAULTS);

	const setModule = useCallback((key: ModuleKey, enabled: boolean) => {
		write({ ...read(), [key]: enabled });
	}, []);

	return { visibility, setModule };
}
