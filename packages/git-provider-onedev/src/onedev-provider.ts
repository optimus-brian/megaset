import { loadToken } from "@superset/git-provider-core";
import type { IssueProvider } from "@superset/git-provider-core";
import { createOnedevClient, type OnedevCredentials } from "./onedev-api-client";
import { canHandleOnedevUrl, parseOnedevRemote } from "./onedev-url-parser";

/**
 * OneDev credentials are stored as a JSON string under the `onedev` slot
 * of the shared encrypted token store: `{"url": "...", "token": "..."}`.
 */
async function loadCredentials(): Promise<OnedevCredentials | null> {
	const raw = await loadToken("onedev");
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<OnedevCredentials>;
		if (parsed.url && parsed.token) {
			return { url: parsed.url, token: parsed.token };
		}
	} catch {}
	return null;
}

async function requireCredentials(): Promise<OnedevCredentials> {
	const creds = await loadCredentials();
	if (!creds) {
		throw new Error(
			"OneDev provider not configured — add URL and PAT in Settings → Git Providers",
		);
	}
	return creds;
}

async function getAuthedClient() {
	const creds = await requireCredentials();
	return { client: createOnedevClient(creds), host: extractHost(creds.url) };
}

function extractHost(url: string): string {
	return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

async function projectFromRemote(remoteUrl: string): Promise<string> {
	const creds = await requireCredentials();
	const parsed = parseOnedevRemote(remoteUrl, extractHost(creds.url));
	if (!parsed) throw new Error(`Not a OneDev URL: ${remoteUrl}`);
	return parsed.projectPath;
}

export const onedevProvider: IssueProvider = {
	name: "onedev",
	canHandle: (remoteUrl) => {
		// Synchronous check: best-effort using the host parsed from the
		// last-loaded credentials. The registry does an async config check
		// elsewhere; this just ensures we don't grab GitHub URLs by mistake.
		// Without configured credentials we can't claim any URL.
		return canHandleOnedevUrlSync(remoteUrl);
	},

	async listIssues({ remoteUrl, state = "open" }) {
		const projectPath = await projectFromRemote(remoteUrl);
		const { client } = await getAuthedClient();
		return client.listIssues(projectPath, state);
	},

	async getIssue({ remoteUrl, number }) {
		const projectPath = await projectFromRemote(remoteUrl);
		const { client } = await getAuthedClient();
		const issue = await client.getIssue(projectPath, number);
		if (!issue) throw new Error(`OneDev issue ${projectPath}#${number} not found`);
		return issue;
	},

	async createIssue() {
		throw new Error(
			"OneDev createIssue not yet implemented in the new provider package",
		);
	},

	async listIssueComments({ remoteUrl, number }) {
		const projectPath = await projectFromRemote(remoteUrl);
		const { client } = await getAuthedClient();
		return client.listIssueComments(projectPath, number);
	},

	async listIssueStates() {
		const { client } = await getAuthedClient();
		return client.listIssueStates();
	},

	async listRepositories() {
		const { client } = await getAuthedClient();
		const projects = await client.listProjects();
		const baseUrl = (await requireCredentials()).url.replace(/\/+$/, "");
		const host = extractHost(baseUrl);
		return projects.map((p) => ({
			id: `onedev:${p.path}`,
			provider: "onedev" as const,
			fullName: p.path,
			name: p.name,
			owner: p.path.includes("/") ? p.path.split("/")[0]! : "",
			cloneUrl: `${baseUrl}/${p.path}.git`,
			sshUrl: `git@${host}:${p.path}.git`,
			htmlUrl: `${baseUrl}/${p.path}`,
			isPrivate: false,
			isFork: false,
			isArchived: false,
			defaultBranch: "main",
			stars: 0,
			updatedAt: new Date().toISOString(),
		}));
	},
};

/**
 * Synchronous URL check used by the registry. Reads the cached host
 * captured by the most recent async credential load. If no host is known
 * yet, falls back to false — caller can still try to load issues, but
 * router-level dispatch won't pick OneDev for arbitrary URLs.
 */
let cachedHost: string | null = null;

export async function primeOnedevHost(): Promise<void> {
	const creds = await loadCredentials();
	cachedHost = creds ? extractHost(creds.url) : null;
}

function canHandleOnedevUrlSync(url: string): boolean {
	if (!cachedHost) return false;
	return canHandleOnedevUrl(url, cachedHost);
}
