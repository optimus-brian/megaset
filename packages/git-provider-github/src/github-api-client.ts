import type { Issue } from "@superset/git-provider-core";

const API = "https://api.github.com";

type RawIssue = {
	number: number;
	title: string;
	body: string | null;
	state: string;
	labels: Array<{ name: string }>;
	assignees: Array<{ login: string }>;
	html_url: string;
	created_at: string;
	updated_at: string;
	pull_request?: unknown;
};

function mapIssue(owner: string, repo: string, i: RawIssue): Issue {
	return {
		id: `gh:${owner}/${repo}#${i.number}`,
		provider: "github",
		number: i.number,
		title: i.title,
		body: i.body ?? undefined,
		state: i.state === "open" ? "open" : "closed",
		labels: i.labels.map((l) => l.name),
		assignees: i.assignees.map((a) => a.login),
		url: i.html_url,
		createdAt: i.created_at,
		updatedAt: i.updated_at,
	};
}

export function createGitHubClient(token: string) {
	const headers = {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};

	return {
		async listIssues(
			owner: string,
			repo: string,
			state: "open" | "closed" | "all" = "open",
		): Promise<Issue[]> {
			const res = await fetch(
				`${API}/repos/${owner}/${repo}/issues?state=${state}&per_page=100`,
				{ headers },
			);
			if (!res.ok) {
				throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
			}
			const issues = (await res.json()) as RawIssue[];
			return issues
				.filter((i) => !i.pull_request)
				.map((i) => mapIssue(owner, repo, i));
		},

		async getIssue(
			owner: string,
			repo: string,
			number: number,
		): Promise<Issue> {
			const res = await fetch(
				`${API}/repos/${owner}/${repo}/issues/${number}`,
				{ headers },
			);
			if (!res.ok) {
				throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
			}
			return mapIssue(owner, repo, (await res.json()) as RawIssue);
		},

		async createIssue(
			owner: string,
			repo: string,
			title: string,
			body?: string,
		): Promise<Issue> {
			const res = await fetch(`${API}/repos/${owner}/${repo}/issues`, {
				method: "POST",
				headers: { ...headers, "Content-Type": "application/json" },
				body: JSON.stringify({ title, body }),
			});
			if (!res.ok) {
				throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
			}
			return mapIssue(owner, repo, (await res.json()) as RawIssue);
		},
	};
}
