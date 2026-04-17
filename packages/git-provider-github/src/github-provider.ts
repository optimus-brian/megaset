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
};
