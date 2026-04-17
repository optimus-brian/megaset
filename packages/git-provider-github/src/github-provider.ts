import { loadToken } from "@superset/git-provider-core";
import type { IssueProvider } from "@superset/git-provider-core";
import { createGitHubClient } from "./github-api-client";
import { canHandleGitHubUrl, parseGitHubRemote } from "./github-url-parser";

async function getAuthedClient() {
	const token = await loadToken("github");
	if (!token) {
		throw new Error(
			"GitHub provider not configured — add a PAT in Settings → Git Providers",
		);
	}
	return createGitHubClient(token);
}

function requireParsed(remoteUrl: string) {
	const parsed = parseGitHubRemote(remoteUrl);
	if (!parsed) throw new Error(`Not a GitHub URL: ${remoteUrl}`);
	return parsed;
}

export const githubProvider: IssueProvider = {
	name: "github",
	canHandle: canHandleGitHubUrl,

	async listIssues({ remoteUrl, state = "open" }) {
		const { owner, repo } = requireParsed(remoteUrl);
		const client = await getAuthedClient();
		return client.listIssues(owner, repo, state);
	},

	async getIssue({ remoteUrl, number }) {
		const { owner, repo } = requireParsed(remoteUrl);
		const client = await getAuthedClient();
		return client.getIssue(owner, repo, number);
	},

	async createIssue({ remoteUrl, title, body }) {
		const { owner, repo } = requireParsed(remoteUrl);
		const client = await getAuthedClient();
		return client.createIssue(owner, repo, title, body);
	},

	async listRepositories({ visibility = "all" } = {}) {
		const client = await getAuthedClient();
		return client.listRepositories(visibility);
	},

	async listIssueComments({ remoteUrl, number }) {
		const { owner, repo } = requireParsed(remoteUrl);
		const client = await getAuthedClient();
		return client.listIssueComments(owner, repo, number);
	},

	async createIssueComment({ remoteUrl, number, body }) {
		const { owner, repo } = requireParsed(remoteUrl);
		const client = await getAuthedClient();
		return client.createIssueComment(owner, repo, number, body);
	},

	async addIssueLabels({ remoteUrl, number, labels }) {
		const { owner, repo } = requireParsed(remoteUrl);
		const client = await getAuthedClient();
		return client.addIssueLabels(owner, repo, number, labels);
	},

	async removeIssueLabel({ remoteUrl, number, label }) {
		const { owner, repo } = requireParsed(remoteUrl);
		const client = await getAuthedClient();
		return client.removeIssueLabel(owner, repo, number, label);
	},

	async setIssueState({ remoteUrl, number, state }) {
		const { owner, repo } = requireParsed(remoteUrl);
		const client = await getAuthedClient();
		return client.setIssueState(owner, repo, number, state);
	},

	async listSubIssues({ remoteUrl, number }) {
		const { owner, repo } = requireParsed(remoteUrl);
		const client = await getAuthedClient();
		return client.listSubIssues(owner, repo, number);
	},

	async listIssueStates() {
		// GitHub has fixed open/closed states; we expose the superset fork's three
		// logical states so the UI always has something to render.
		return [
			{ id: "open", name: "Open", category: "open" as const },
			{
				id: "in_progress",
				name: "In Progress",
				category: "in_progress" as const,
			},
			{ id: "closed", name: "Closed", category: "closed" as const },
		];
	},
};
