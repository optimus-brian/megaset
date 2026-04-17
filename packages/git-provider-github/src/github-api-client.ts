import type {
	Issue,
	IssueComment,
	Repository,
} from "@superset/git-provider-core";

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
	parent_issue_url?: string | null;
	sub_issues_summary?: {
		total: number;
		completed: number;
		percent_completed?: number;
	};
};

function parentNumberFromUrl(url: string | null | undefined): number | undefined {
	if (!url) return undefined;
	const match = url.match(/\/issues\/(\d+)$/);
	if (!match) return undefined;
	const parsed = Number.parseInt(match[1]!, 10);
	return Number.isNaN(parsed) ? undefined : parsed;
}

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

const IN_PROGRESS_LABEL_RE = /^(in[\s-]?progress|wip|working)$/i;

function mapIssue(owner: string, repo: string, i: RawIssue): Issue {
	const labels = i.labels.map((l) => l.name);
	const hasInProgressLabel = labels.some((l) => IN_PROGRESS_LABEL_RE.test(l));
	const state: Issue["state"] =
		i.state === "closed"
			? "closed"
			: hasInProgressLabel
				? "in_progress"
				: "open";
	const stateName =
		state === "closed" ? "Closed" : state === "in_progress" ? "In Progress" : "Open";
	return {
		id: `gh:${owner}/${repo}#${i.number}`,
		provider: "github",
		number: i.number,
		title: i.title,
		body: i.body ?? undefined,
		state,
		stateId: state,
		stateName,
		labels,
		assignees: i.assignees.map((a) => a.login),
		url: i.html_url,
		createdAt: i.created_at,
		updatedAt: i.updated_at,
		parentIssueNumber: parentNumberFromUrl(i.parent_issue_url),
		subIssuesSummary:
			i.sub_issues_summary && i.sub_issues_summary.total > 0
				? {
						total: i.sub_issues_summary.total,
						completed: i.sub_issues_summary.completed,
					}
				: undefined,
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

		async listIssueComments(
			owner: string,
			repo: string,
			number: number,
		): Promise<IssueComment[]> {
			const res = await fetch(
				`${API}/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`,
				{ headers },
			);
			if (!res.ok) {
				throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
			}
			const comments = (await res.json()) as Array<{
				id: number;
				user: { login: string; avatar_url: string | null } | null;
				body: string | null;
				created_at: string;
				updated_at: string;
				html_url: string;
			}>;
			return comments.map((c) => ({
				id: `gh:${owner}/${repo}#${number}/comment/${c.id}`,
				author: c.user?.login ?? "unknown",
				authorAvatarUrl: c.user?.avatar_url ?? undefined,
				body: c.body ?? "",
				createdAt: c.created_at,
				updatedAt: c.updated_at,
				url: c.html_url,
			}));
		},

		async addIssueLabels(
			owner: string,
			repo: string,
			number: number,
			labels: string[],
		): Promise<Issue> {
			const res = await fetch(
				`${API}/repos/${owner}/${repo}/issues/${number}/labels`,
				{
					method: "POST",
					headers: { ...headers, "Content-Type": "application/json" },
					body: JSON.stringify({ labels }),
				},
			);
			if (!res.ok) {
				throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
			}
			// Response is the list of labels; we re-fetch the issue for the full shape.
			const issueRes = await fetch(
				`${API}/repos/${owner}/${repo}/issues/${number}`,
				{ headers },
			);
			if (!issueRes.ok) {
				throw new Error(`GitHub API ${issueRes.status}`);
			}
			return mapIssue(owner, repo, (await issueRes.json()) as RawIssue);
		},

		async listSubIssues(
			owner: string,
			repo: string,
			number: number,
		): Promise<Issue[]> {
			const res = await fetch(
				`${API}/repos/${owner}/${repo}/issues/${number}/sub_issues?per_page=100`,
				{ headers },
			);
			if (!res.ok) {
				throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
			}
			const subs = (await res.json()) as RawIssue[];
			return subs.map((i) => mapIssue(owner, repo, i));
		},

		async removeIssueLabel(
			owner: string,
			repo: string,
			number: number,
			label: string,
		): Promise<Issue> {
			const res = await fetch(
				`${API}/repos/${owner}/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`,
				{ method: "DELETE", headers },
			);
			// GitHub returns 404 if the label isn't on the issue — treat as no-op.
			if (!res.ok && res.status !== 404) {
				throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
			}
			const issueRes = await fetch(
				`${API}/repos/${owner}/${repo}/issues/${number}`,
				{ headers },
			);
			if (!issueRes.ok) {
				throw new Error(`GitHub API ${issueRes.status}`);
			}
			return mapIssue(owner, repo, (await issueRes.json()) as RawIssue);
		},

		async setIssueState(
			owner: string,
			repo: string,
			number: number,
			state: "open" | "closed",
		): Promise<Issue> {
			const res = await fetch(
				`${API}/repos/${owner}/${repo}/issues/${number}`,
				{
					method: "PATCH",
					headers: { ...headers, "Content-Type": "application/json" },
					body: JSON.stringify({ state }),
				},
			);
			if (!res.ok) {
				throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
			}
			return mapIssue(owner, repo, (await res.json()) as RawIssue);
		},

		async createIssueComment(
			owner: string,
			repo: string,
			number: number,
			body: string,
		): Promise<IssueComment> {
			const res = await fetch(
				`${API}/repos/${owner}/${repo}/issues/${number}/comments`,
				{
					method: "POST",
					headers: { ...headers, "Content-Type": "application/json" },
					body: JSON.stringify({ body }),
				},
			);
			if (!res.ok) {
				throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
			}
			const c = (await res.json()) as {
				id: number;
				user: { login: string; avatar_url: string | null } | null;
				body: string | null;
				created_at: string;
				updated_at: string;
				html_url: string;
			};
			return {
				id: `gh:${owner}/${repo}#${number}/comment/${c.id}`,
				author: c.user?.login ?? "unknown",
				authorAvatarUrl: c.user?.avatar_url ?? undefined,
				body: c.body ?? "",
				createdAt: c.created_at,
				updatedAt: c.updated_at,
				url: c.html_url,
			};
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
