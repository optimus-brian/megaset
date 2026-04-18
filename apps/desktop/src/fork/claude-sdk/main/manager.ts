import { ClaudeSdkSession } from "./session";
import type { ClaudeSdkSessionId, StartSessionInput } from "./types";

class ClaudeSdkManager {
	private readonly sessions = new Map<ClaudeSdkSessionId, ClaudeSdkSession>();

	create(input: StartSessionInput): ClaudeSdkSession {
		const session = new ClaudeSdkSession(input);
		this.sessions.set(session.id, session);
		session.once("event", () => {});
		session.start(input);
		return session;
	}

	get(id: ClaudeSdkSessionId): ClaudeSdkSession | undefined {
		return this.sessions.get(id);
	}

	stop(id: ClaudeSdkSessionId): boolean {
		const s = this.sessions.get(id);
		if (!s) return false;
		s.stop();
		this.sessions.delete(id);
		return true;
	}

	stopAll(): void {
		for (const s of this.sessions.values()) s.stop();
		this.sessions.clear();
	}
}

let instance: ClaudeSdkManager | null = null;
export function getClaudeSdkManager(): ClaudeSdkManager {
	if (!instance) instance = new ClaudeSdkManager();
	return instance;
}
