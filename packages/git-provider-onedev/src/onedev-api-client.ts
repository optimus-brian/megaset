import type { Issue, IssueComment, IssueState } from "@superset/git-provider-core";

export interface OnedevCredentials {
	/** Base URL without trailing slash, e.g. "https://onedev.example.com". */
	readonly url: string;
	/** Personal access token. */
	readonly token: string;
}

interface RawOnedevProject {
	id: number;
	name: string;
	path: string;
	key: string | null;
	issueManagement: boolean;
}

interface RawOnedevIssue {
	id: number;
	number: number;
	title: string;
	description: string | null;
	state: string;
	stateOrdinal: number;
	submitDate: string;
	projectId: number;
	submitterId: number;
	lastActivity?: { date: string };
	confidential: boolean;
	commentCount: number;
}

interface RawOnedevComment {
	id: number;
	content: string;
	date: string;
	user: { name?: string; fullName?: string; email?: string } | null;
}

interface RawOnedevUser {
	id: number;
	name: string;
	fullName?: string;
	email?: string;
}

interface RawOnedevStateSpec {
	name: string;
	category?: "OPEN" | "CLOSED";
	color?: string;
}

/** Map a OneDev state name into one of the three normalized categories. */
function mapStateToCategory(
	state: string,
): "open" | "in_progress" | "closed" {
	const s = state.toLowerCase();
	if (s.includes("close") || s === "done" || s === "resolved") return "closed";
	if (
		s.includes("progress") ||
		s.includes("review") ||
		s === "triaged" ||
		s === "assigned"
	)
		return "in_progress";
	return "open";
}

/** Fallback state list if server state query fails. */
const DEFAULT_STATES: IssueState[] = [
	{ id: "Open", name: "Open", category: "open" },
	{ id: "In Progress", name: "In Progress", category: "in_progress" },
	{ id: "In Review", name: "In Review", category: "in_progress" },
	{ id: "Closed", name: "Closed", category: "closed" },
];

export function createOnedevClient(creds: OnedevCredentials) {
	const baseUrl = creds.url.replace(/\/+$/, "");
	const headers = {
		Authorization: `Bearer ${creds.token}`,
		"Content-Type": "application/json",
		Accept: "application/json",
	};

	async function apiGet<T>(path: string): Promise<T> {
		const res = await fetch(`${baseUrl}${path}`, { headers });
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`OneDev ${res.status} ${path}: ${text.slice(0, 200)}`);
		}
		return (await res.json()) as T;
	}

	async function getProjectByPath(
		projectPath: string,
	): Promise<RawOnedevProject | null> {
		const encoded = encodeURIComponent(`"Path" is "${projectPath}"`);
		const list = await apiGet<RawOnedevProject[]>(
			`/~api/projects?query=${encoded}&offset=0&count=1`,
		);
		return list[0] ?? null;
	}

	function issueUrl(projectPath: string, number: number): string {
		return `${baseUrl}/${projectPath}/~issues/${number}`;
	}

	async function getUserName(id: number): Promise<string> {
		try {
			const u = await apiGet<RawOnedevUser>(`/~api/users/${id}`);
			return u.fullName ?? u.name ?? `user${id}`;
		} catch {
			return `user${id}`;
		}
	}

	function mapIssue(raw: RawOnedevIssue, projectPath: string): Issue {
		const updatedAt = raw.lastActivity?.date ?? raw.submitDate;
		return {
			id: `onedev:${projectPath}#${raw.number}`,
			provider: "onedev",
			number: raw.number,
			title: raw.title,
			body: raw.description ?? undefined,
			state: mapStateToCategory(raw.state),
			stateId: raw.state,
			stateName: raw.state,
			labels: [],
			assignees: [],
			url: issueUrl(projectPath, raw.number),
			createdAt: raw.submitDate,
			updatedAt,
		};
	}

	function mapComment(raw: RawOnedevComment): IssueComment {
		return {
			id: `${raw.id}`,
			author: raw.user?.fullName ?? raw.user?.name ?? "unknown",
			body: raw.content,
			createdAt: raw.date,
			updatedAt: raw.date,
		};
	}

	return {
		async ping(): Promise<boolean> {
			try {
				await apiGet<unknown>("/~api/users/me");
				return true;
			} catch {
				return false;
			}
		},

		async listIssues(
			projectPath: string,
			state: "open" | "closed" | "all" = "open",
		): Promise<Issue[]> {
			const project = await getProjectByPath(projectPath);
			if (!project) return [];
			const parts: string[] = [`"Project" is "${projectPath}"`];
			if (state === "open") parts.push('"State" is "Open"');
			else if (state === "closed") parts.push('"State" is "Closed"');
			const query = encodeURIComponent(parts.join(" and "));
			const raw = await apiGet<RawOnedevIssue[]>(
				`/~api/issues?query=${query}&offset=0&count=200`,
			);
			return raw.map((i) => mapIssue(i, projectPath));
		},

		async getIssue(
			projectPath: string,
			issueNumber: number,
		): Promise<Issue | null> {
			const project = await getProjectByPath(projectPath);
			if (!project) return null;
			const query = encodeURIComponent(
				`"Project" is "${projectPath}" and "Number" is "${issueNumber}"`,
			);
			const list = await apiGet<RawOnedevIssue[]>(
				`/~api/issues?query=${query}&offset=0&count=1`,
			);
			const raw = list[0];
			return raw ? mapIssue(raw, projectPath) : null;
		},

		async listIssueComments(
			projectPath: string,
			issueNumber: number,
		): Promise<IssueComment[]> {
			const query = encodeURIComponent(
				`"Project" is "${projectPath}" and "Number" is "${issueNumber}"`,
			);
			const list = await apiGet<RawOnedevIssue[]>(
				`/~api/issues?query=${query}&offset=0&count=1`,
			);
			const issueId = list[0]?.id;
			if (!issueId) return [];
			const rawComments = await apiGet<RawOnedevComment[]>(
				`/~api/issues/${issueId}/comments`,
			);
			return rawComments.map(mapComment);
		},

		async listIssueStates(): Promise<IssueState[]> {
			try {
				const raw = await apiGet<RawOnedevStateSpec[]>(
					"/~api/issue-setting/state-specs",
				);
				if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_STATES;
				return raw.map((s) => ({
					id: s.name,
					name: s.name,
					category:
						s.category === "CLOSED"
							? ("closed" as const)
							: mapStateToCategory(s.name),
					...(s.color ? { color: s.color } : {}),
				}));
			} catch {
				return DEFAULT_STATES;
			}
		},

		async listProjects(): Promise<
			{ path: string; name: string; hasIssues: boolean }[]
		> {
			const list = await apiGet<RawOnedevProject[]>(
				"/~api/projects?offset=0&count=500",
			);
			return list.map((p) => ({
				path: p.path,
				name: p.name,
				hasIssues: p.issueManagement,
			}));
		},
	};
}

export type OnedevClient = ReturnType<typeof createOnedevClient>;
