import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";

/**
 * File-backed, synchronously-persisted map of `paneId -> resumeSessionId`.
 *
 * Lives in the main process so writes hit disk immediately on every change —
 * unlike renderer localStorage, which Chromium flushes lazily and loses when
 * the app is killed (e.g. during app updates).
 */

interface ResumeStoreShape {
	version: 1;
	sessions: Record<string, string>;
}

let cache: ResumeStoreShape | null = null;

function storePath(): string {
	return join(app.getPath("userData"), "claude-sdk-sessions.json");
}

function load(): ResumeStoreShape {
	if (cache) return cache;
	const p = storePath();
	if (!existsSync(p)) {
		cache = { version: 1, sessions: {} };
		return cache;
	}
	try {
		const raw = readFileSync(p, "utf-8");
		const parsed = JSON.parse(raw) as ResumeStoreShape;
		cache =
			parsed && typeof parsed === "object" && parsed.sessions
				? parsed
				: { version: 1, sessions: {} };
	} catch (err) {
		console.warn("[claude-sdk/resume-store] failed to load:", err);
		cache = { version: 1, sessions: {} };
	}
	return cache;
}

function persist(): void {
	if (!cache) return;
	const p = storePath();
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, JSON.stringify(cache, null, 2), "utf-8");
}

export function getResumeSessionId(paneId: string): string | null {
	return load().sessions[paneId] ?? null;
}

export function setResumeSessionId(
	paneId: string,
	sessionId: string | null,
): void {
	const store = load();
	if (sessionId) {
		store.sessions[paneId] = sessionId;
	} else {
		delete store.sessions[paneId];
	}
	persist();
}
