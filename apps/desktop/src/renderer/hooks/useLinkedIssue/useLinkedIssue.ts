import { useCallback, useSyncExternalStore } from "react";

export interface LinkedIssue {
	projectId: string;
	issueNumber: number;
	issueTitle?: string;
	issueUrl?: string;
}

const STORAGE_KEY = "superset.linked-issues";
const EVENT = "superset:linked-issues-changed";

type LinkedIssueMap = Record<string, LinkedIssue>;

let cachedRaw: string | null = null;
let cachedValue: LinkedIssueMap = {};

function read(): LinkedIssueMap {
	if (typeof window === "undefined") return {};
	const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
	if (raw === cachedRaw) return cachedValue;
	cachedRaw = raw;
	if (!raw) {
		cachedValue = {};
		return cachedValue;
	}
	try {
		cachedValue = JSON.parse(raw) as LinkedIssueMap;
	} catch {
		cachedValue = {};
	}
	return cachedValue;
}

function write(map: LinkedIssueMap) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
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

const EMPTY: LinkedIssueMap = {};

export function useLinkedIssue(workspaceId: string | undefined | null) {
	const map = useSyncExternalStore(subscribe, read, () => EMPTY);
	const issue = workspaceId ? map[workspaceId] : undefined;

	const link = useCallback((wsId: string, value: LinkedIssue) => {
		write({ ...read(), [wsId]: value });
	}, []);

	const unlink = useCallback((wsId: string) => {
		const current = read();
		if (!(wsId in current)) return;
		const { [wsId]: _removed, ...rest } = current;
		write(rest);
	}, []);

	return { issue, link, unlink };
}
