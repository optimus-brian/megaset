import { z } from "zod";

export const ProviderNameSchema = z.enum(["github", "onedev", "forgejo"]);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

export const IssueSchema = z.object({
	id: z.string(), // e.g. "gh:owner/repo#42"
	provider: ProviderNameSchema,
	number: z.number(),
	title: z.string(),
	body: z.string().optional(),
	state: z.enum(["open", "in_progress", "closed"]),
	labels: z.array(z.string()),
	assignees: z.array(z.string()),
	url: z.string().url(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const RepositorySchema = z.object({
	id: z.string(), // e.g. "gh:owner/repo"
	provider: ProviderNameSchema,
	fullName: z.string(), // "owner/repo"
	name: z.string(),
	owner: z.string(),
	description: z.string().optional(),
	cloneUrl: z.string(), // HTTPS clone URL
	sshUrl: z.string(),
	htmlUrl: z.string(),
	isPrivate: z.boolean(),
	isFork: z.boolean(),
	isArchived: z.boolean(),
	defaultBranch: z.string(),
	stars: z.number(),
	updatedAt: z.string(),
});
export type Repository = z.infer<typeof RepositorySchema>;

export interface IssueProvider {
	readonly name: ProviderName;
	canHandle(remoteUrl: string): boolean;
	listIssues(opts: {
		remoteUrl: string;
		state?: "open" | "closed" | "all";
	}): Promise<Issue[]>;
	getIssue(opts: { remoteUrl: string; number: number }): Promise<Issue>;
	createIssue(opts: {
		remoteUrl: string;
		title: string;
		body?: string;
	}): Promise<Issue>;
	/** Optional: list repositories accessible to the configured account. */
	listRepositories?(opts?: {
		visibility?: "all" | "public" | "private";
	}): Promise<Repository[]>;
}

export interface AuthProvider {
	readonly name: ProviderName;
	isConfigured(): Promise<boolean>;
	getToken(): Promise<string | null>;
	setToken(token: string): Promise<void>;
	clearToken(): Promise<void>;
}
