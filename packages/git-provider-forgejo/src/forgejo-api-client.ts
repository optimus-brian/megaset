import type {
	Issue,
	IssueComment,
	IssueState,
	Repository,
} from "@superset/git-provider-core";

export interface ForgejoCredentials {
	/** Base URL without trailing slash, e.g. "https://forgejo.example.com". */
	readonly url: string;
	/** Personal access token. */
	readonly token: string;
}

interface RawForgejoUser {
	id: number;
	login: string;
	full_name?: string;
	avatar_url?: string;
	email?: string;
}

interface RawForgejoLabel {
	id: number;
	name: string;
	color?: string;
}

interface RawForgejoIssue {
	id: number;
	number: number;
	title: string;
	body: string | null;
	state: "open" | "closed";
	user: RawForgejoUser | null;
	assignees: RawForgejoUser[] | null;
	labels: RawForgejoLabel[] | null;
	html_url: string;
	created_at: string;
	updated_at: string;
	comments: number;
}

interface RawForgejoComment {
	id: number;
	user: RawForgejoUser | null;
	body: string;
	html_url?: string;
	created_at: string;
	updated_at: string;
}

interface RawForgejoRepo {
	id: number;
	name: string;
	full_name: string;
	description?: string;
	owner: RawForgejoUser;
	html_url: string;
	clone_url: string;
	ssh_url: string;
	private: boolean;
	fork: boolean;
	archived: boolean;
	default_branch: string;
	stars_count: number;
	updated_at: string;
}

interface RawForgejoRepoSearchResponse {
	data: RawForgejoRepo[];
	ok: boolean;
}

/** Forgejo only ships open/closed; we expose the same two normalized states. */
const DEFAULT_STATES: IssueState[] = [
	{ id: "open", name: "Open", category: "open" },
	{ id: "closed", name: "Closed", category: "closed" },
];

export function createForgejoClient(creds: ForgejoCredentials) {
	const baseUrl = creds.url.replace(/\/+$/, "");
	const headers = {
		Authorization: `token ${creds.token}`,
		"Content-Type": "application/json",
		Accept: "application/json",
	};

	async function apiGet<T>(path: string): Promise<T> {
		const res = await fetch(`${baseUrl}/api/v1${path}`, { headers });
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`Forgejo ${res.status} ${path}: ${text.slice(0, 200)}`);
		}
		return (await res.json()) as T;
	}

	async function apiSend<T>(
		method: "POST" | "PATCH",
		path: string,
		body: unknown,
	): Promise<T> {
		const res = await fetch(`${baseUrl}/api/v1${path}`, {
			method,
			headers,
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`Forgejo ${res.status} ${path}: ${text.slice(0, 200)}`);
		}
		const raw = await res.text();
		return raw ? (JSON.parse(raw) as T) : (undefined as unknown as T);
	}

	function mapIssue(
		raw: RawForgejoIssue,
		owner: string,
		repo: string,
	): Issue {
		return {
			id: `forgejo:${owner}/${repo}#${raw.number}`,
			provider: "forgejo",
			number: raw.number,
			title: raw.title,
			body: raw.body ?? undefined,
			state: raw.state === "closed" ? "closed" : "open",
			stateId: raw.state,
			stateName: raw.state === "closed" ? "Closed" : "Open",
			labels: (raw.labels ?? []).map((l) => l.name),
			assignees: (raw.assignees ?? []).map((u) => u.login),
			url: raw.html_url,
			createdAt: raw.created_at,
			updatedAt: raw.updated_at,
		};
	}

	function mapComment(raw: RawForgejoComment): IssueComment {
		return {
			id: `${raw.id}`,
			author: raw.user?.full_name ?? raw.user?.login ?? "unknown",
			authorAvatarUrl: raw.user?.avatar_url,
			body: raw.body,
			createdAt: raw.created_at,
			updatedAt: raw.updated_at,
			url: raw.html_url,
		};
	}

	function mapRepo(raw: RawForgejoRepo): Repository {
		return {
			id: `forgejo:${raw.full_name}`,
			provider: "forgejo",
			fullName: raw.full_name,
			name: raw.name,
			owner: raw.owner.login,
			description: raw.description,
			cloneUrl: raw.clone_url,
			sshUrl: raw.ssh_url,
			htmlUrl: raw.html_url,
			isPrivate: raw.private,
			isFork: raw.fork,
			isArchived: raw.archived,
			defaultBranch: raw.default_branch,
			stars: raw.stars_count,
			updatedAt: raw.updated_at,
		};
	}

	return {
		async ping(): Promise<boolean> {
			try {
				await apiGet<unknown>("/version");
				return true;
			} catch {
				return false;
			}
		},

		async listIssues(
			owner: string,
			repo: string,
			state: "open" | "closed" | "all" = "open",
		): Promise<Issue[]> {
			const params = new URLSearchParams({
				state,
				type: "issues",
				limit: "50",
			});
			const raw = await apiGet<RawForgejoIssue[]>(
				`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${params.toString()}`,
			);
			return raw.map((i) => mapIssue(i, owner, repo));
		},

		async getIssue(
			owner: string,
			repo: string,
			issueNumber: number,
		): Promise<Issue | null> {
			try {
				const raw = await apiGet<RawForgejoIssue>(
					`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
				);
				return mapIssue(raw, owner, repo);
			} catch {
				return null;
			}
		},

		async listIssueComments(
			owner: string,
			repo: string,
			issueNumber: number,
		): Promise<IssueComment[]> {
			const raw = await apiGet<RawForgejoComment[]>(
				`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
			);
			return raw.map(mapComment);
		},

		async listIssueStates(): Promise<IssueState[]> {
			return DEFAULT_STATES;
		},

		async listRepositories(): Promise<Repository[]> {
			// Forgejo's /repos/search supports paging; for the first cut we just
			// pull the first 50 repos accessible to the authenticated user.
			const params = new URLSearchParams({ limit: "50" });
			const data = await apiGet<RawForgejoRepoSearchResponse>(
				`/repos/search?${params.toString()}`,
			);
			return (data.data ?? []).map(mapRepo);
		},

		async createIssue(
			owner: string,
			repo: string,
			title: string,
			body: string | undefined,
		): Promise<Issue> {
			const raw = await apiSend<RawForgejoIssue>(
				"POST",
				`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
				{ title, body: body ?? "" },
			);
			return mapIssue(raw, owner, repo);
		},

		async createIssueComment(
			owner: string,
			repo: string,
			issueNumber: number,
			body: string,
		): Promise<IssueComment> {
			const raw = await apiSend<RawForgejoComment>(
				"POST",
				`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
				{ body },
			);
			return mapComment(raw);
		},

		async setIssueState(
			owner: string,
			repo: string,
			issueNumber: number,
			state: "open" | "closed",
		): Promise<Issue> {
			const raw = await apiSend<RawForgejoIssue>(
				"PATCH",
				`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
				{ state },
			);
			return mapIssue(raw, owner, repo);
		},
	};
}

export type ForgejoClient = ReturnType<typeof createForgejoClient>;
