import type { Issue, Repository } from "@superset/git-provider-core";

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

type RawRepository = {
	id: number;
	full_name: string;
	name: string;
	owner: { login: string };
	description: string | null;
	clone_url: string;
	ssh_url: string;
	html_url: string;
	private: boolean;
	fork: boolean;
	archived: boolean;
	default_branch: string;
	stargazers_count: number;
	updated_at: string;
};

function mapRepository(r: RawRepository): Repository {
	return {
		id: `gh:${r.full_name}`,
		provider: "github",
		fullName: r.full_name,
		name: r.name,
		owner: r.owner.login,
		description: r.description ?? undefined,
		cloneUrl: r.clone_url,
		sshUrl: r.ssh_url,
		htmlUrl: r.html_url,
		isPrivate: r.private,
		isFork: r.fork,
		isArchived: r.archived,
		defaultBranch: r.default_branch,
		stars: r.stargazers_count,
		updatedAt: r.updated_at,
	};
}

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

		async listRepositories(
			visibility: "all" | "public" | "private" = "all",
		): Promise<Repository[]> {
			const collected: RawRepository[] = [];
			let page = 1;
			while (page <= 10) {
				const res = await fetch(
					`${API}/user/repos?visibility=${visibility}&per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
					{ headers },
				);
				if (!res.ok) {
					throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
				}
				const batch = (await res.json()) as RawRepository[];
				collected.push(...batch);
				if (batch.length < 100) break;
				page += 1;
			}
			return collected.map(mapRepository);
		},
	};
}
