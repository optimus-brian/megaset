import { z } from "zod";

export const ProviderNameSchema = z.enum(["github", "onedev", "forgejo"]);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

/** Normalized state category used for Kanban sorting and workspace logic. */
export const IssueStateCategorySchema = z.enum([
	"open",
	"in_progress",
	"closed",
]);
export type IssueStateCategory = z.infer<typeof IssueStateCategorySchema>;

/** A state the provider supports for an issue. */
export const IssueStateSchema = z.object({
	/** Provider-internal identifier (e.g. "open" on GitHub, OneDev state UUID). */
	id: z.string(),
	/** Display name, e.g. "In Review". */
	name: z.string(),
	/** Normalized category for sort/placement. */
	category: IssueStateCategorySchema,
	/** Optional hex color for UI hinting. */
	color: z.string().optional(),
});
export type IssueState = z.infer<typeof IssueStateSchema>;

export const IssueSchema = z.object({
	id: z.string(), // e.g. "gh:owner/repo#42"
	provider: ProviderNameSchema,
	number: z.number(),
	title: z.string(),
	body: z.string().optional(),
	state: IssueStateCategorySchema,
	/** Provider-raw state id (optional, falls back to state category). */
	stateId: z.string().optional(),
	/** Provider-raw state display name (optional). */
	stateName: z.string().optional(),
	labels: z.array(z.string()),
	assignees: z.array(z.string()),
	url: z.string().url(),
	createdAt: z.string(),
	updatedAt: z.string(),
	/** Parent issue number if this issue is a sub-issue of another. */
	parentIssueNumber: z.number().optional(),
	/** Progress summary when this issue has sub-issues. */
	subIssuesSummary: z
		.object({ total: z.number(), completed: z.number() })
		.optional(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const IssueCommentSchema = z.object({
	id: z.string(),
	author: z.string(),
	authorAvatarUrl: z.string().optional(),
	body: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	url: z.string().optional(),
});
export type IssueComment = z.infer<typeof IssueCommentSchema>;

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
	/** Optional: list comments for an issue. */
	listIssueComments?(opts: {
		remoteUrl: string;
		number: number;
	}): Promise<IssueComment[]>;
	/** Optional: post a comment on an issue. */
	createIssueComment?(opts: {
		remoteUrl: string;
		number: number;
		body: string;
	}): Promise<IssueComment>;
	/** Optional: add labels to an issue (creates labels that don't exist). */
	addIssueLabels?(opts: {
		remoteUrl: string;
		number: number;
		labels: string[];
	}): Promise<Issue>;
	/** Optional: remove a label from an issue. */
	removeIssueLabel?(opts: {
		remoteUrl: string;
		number: number;
		label: string;
	}): Promise<Issue>;
	/** Optional: set issue open/closed state. */
	setIssueState?(opts: {
		remoteUrl: string;
		number: number;
		state: "open" | "closed";
	}): Promise<Issue>;
	/** Optional: list sub-issues of a parent issue. */
	listSubIssues?(opts: { remoteUrl: string; number: number }): Promise<Issue[]>;
	/** Optional: list the full set of states available for this repo. */
	listIssueStates?(opts: { remoteUrl: string }): Promise<IssueState[]>;
	/** Optional: set an issue to a specific provider state by id. */
	setIssueStateById?(opts: {
		remoteUrl: string;
		number: number;
		stateId: string;
	}): Promise<Issue>;
}

export interface AuthProvider {
	readonly name: ProviderName;
	isConfigured(): Promise<boolean>;
	getToken(): Promise<string | null>;
	setToken(token: string): Promise<void>;
	clearToken(): Promise<void>;
}
