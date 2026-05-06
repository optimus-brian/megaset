import type { IssueProvider } from "@superset/git-provider-core";
import { loadToken } from "@superset/git-provider-core";
import {
	createForgejoClient,
	type ForgejoCredentials,
} from "./forgejo-api-client";
import { canHandleForgejoUrl, parseForgejoRemote } from "./forgejo-url-parser";

/**
 * Forgejo credentials are stored as a JSON string under the `forgejo` slot
 * of the shared encrypted token store: `{"url": "...", "token": "..."}`.
 */
async function loadCredentials(): Promise<ForgejoCredentials | null> {
	const raw = await loadToken("forgejo");
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<ForgejoCredentials>;
		if (parsed.url && parsed.token) {
			return { url: parsed.url, token: parsed.token };
		}
	} catch {}
	return null;
}

async function requireCredentials(): Promise<ForgejoCredentials> {
	const creds = await loadCredentials();
	if (!creds) {
		throw new Error(
			"Forgejo provider not configured — add URL and PAT in Settings → Git Providers",
		);
	}
	return creds;
}

async function getAuthedClient() {
	const creds = await requireCredentials();
	return { client: createForgejoClient(creds), host: extractHost(creds.url) };
}

function extractHost(url: string): string {
	return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

async function repoFromRemote(
	remoteUrl: string,
): Promise<{ owner: string; repo: string }> {
	const creds = await requireCredentials();
	const parsed = parseForgejoRemote(remoteUrl, extractHost(creds.url));
	if (!parsed) throw new Error(`Not a Forgejo URL: ${remoteUrl}`);
	return parsed;
}

export const forgejoProvider: IssueProvider = {
	name: "forgejo",
	canHandle: (remoteUrl) => {
		// Synchronous check using the cached host captured at last credential
		// load. Without configured credentials we can't claim any URL.
		return canHandleForgejoUrlSync(remoteUrl);
	},

	async listIssues({ remoteUrl, state = "open" }) {
		const { owner, repo } = await repoFromRemote(remoteUrl);
		const { client } = await getAuthedClient();
		return client.listIssues(owner, repo, state);
	},

	async getIssue({ remoteUrl, number }) {
		const { owner, repo } = await repoFromRemote(remoteUrl);
		const { client } = await getAuthedClient();
		const issue = await client.getIssue(owner, repo, number);
		if (!issue)
			throw new Error(`Forgejo issue ${owner}/${repo}#${number} not found`);
		return issue;
	},

	async createIssue({ remoteUrl, title, body }) {
		const { owner, repo } = await repoFromRemote(remoteUrl);
		const { client } = await getAuthedClient();
		return client.createIssue(owner, repo, title, body);
	},

	async listIssueComments({ remoteUrl, number }) {
		const { owner, repo } = await repoFromRemote(remoteUrl);
		const { client } = await getAuthedClient();
		return client.listIssueComments(owner, repo, number);
	},

	async createIssueComment({ remoteUrl, number, body }) {
		const { owner, repo } = await repoFromRemote(remoteUrl);
		const { client } = await getAuthedClient();
		return client.createIssueComment(owner, repo, number, body);
	},

	async setIssueState({ remoteUrl, number, state }) {
		const { owner, repo } = await repoFromRemote(remoteUrl);
		const { client } = await getAuthedClient();
		return client.setIssueState(owner, repo, number, state);
	},

	async listIssueStates() {
		const { client } = await getAuthedClient();
		return client.listIssueStates();
	},

	async listRepositories() {
		const { client } = await getAuthedClient();
		return client.listRepositories();
	},
};

/**
 * Synchronous URL check used by the registry. Reads the cached host
 * captured by the most recent async credential load. If no host is known
 * yet, falls back to false.
 */
let cachedHost: string | null = null;

export async function primeForgejoHost(): Promise<void> {
	const creds = await loadCredentials();
	cachedHost = creds ? extractHost(creds.url) : null;
}

function canHandleForgejoUrlSync(url: string): boolean {
	if (!cachedHost) return false;
	return canHandleForgejoUrl(url, cachedHost);
}
