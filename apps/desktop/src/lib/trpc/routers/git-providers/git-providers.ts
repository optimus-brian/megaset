import {
	clearToken,
	gitProviderRegistry,
	loadToken,
	ProviderNameSchema,
	saveToken,
} from "@superset/git-provider-core";
import { primeForgejoHost } from "@superset/git-provider-forgejo";
import { primeOnedevHost } from "@superset/git-provider-onedev";
import { projects } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { execWithShellEnv } from "../workspaces/utils/shell-env";

async function ensureHostsPrimed(): Promise<void> {
	await Promise.all([
		primeOnedevHost().catch(() => {}),
		primeForgejoHost().catch(() => {}),
	]);
}

export const createGitProvidersRouter = () => {
	return router({
		listIssues: publicProcedure
			.input(
				z.object({
					remoteUrl: z.string(),
					state: z.enum(["open", "closed", "all"]).optional(),
				}),
			)
			.query(async ({ input }) => {
				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(
					input.remoteUrl,
				);
				if (!provider) return { issues: [], provider: null as string | null };
				const issues = await provider.listIssues({
					remoteUrl: input.remoteUrl,
					state: input.state,
				});
				return { issues, provider: provider.name };
			}),

		listIssuesForProject: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					state: z.enum(["open", "closed", "all"]).optional(),
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					return { issues: [], provider: null as string | null };
				}

				let remoteUrl: string;
				try {
					const { stdout } = await execWithShellEnv(
						"git",
						["remote", "get-url", "origin"],
						{ cwd: project.mainRepoPath, timeout: 5000 },
					);
					remoteUrl = stdout.trim();
				} catch {
					return { issues: [], provider: null };
				}

				if (!remoteUrl) return { issues: [], provider: null };

				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(remoteUrl);
				if (!provider) return { issues: [], provider: null };

				try {
					const issues = await provider.listIssues({
						remoteUrl,
						state: input.state,
					});
					return { issues, provider: provider.name };
				} catch (err) {
					console.warn(
						"[gitProviders/listIssuesForProject] listIssues failed:",
						err,
					);
					return { issues: [], provider: provider.name };
				}
			}),

		createIssue: publicProcedure
			.input(
				z.object({
					remoteUrl: z.string(),
					title: z.string().min(1),
					body: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(
					input.remoteUrl,
				);
				if (!provider) {
					throw new Error(`No git provider registered for ${input.remoteUrl}`);
				}
				return provider.createIssue(input);
			}),

		saveToken: publicProcedure
			.input(
				z.object({ provider: ProviderNameSchema, token: z.string().min(1) }),
			)
			.mutation(async ({ input }) => {
				await saveToken(input.provider, input.token);
				if (input.provider === "onedev") {
					await primeOnedevHost();
				}
				if (input.provider === "forgejo") {
					await primeForgejoHost();
				}
				return { success: true };
			}),

		clearToken: publicProcedure
			.input(z.object({ provider: ProviderNameSchema }))
			.mutation(async ({ input }) => {
				await clearToken(input.provider);
				if (input.provider === "onedev") {
					await primeOnedevHost();
				}
				if (input.provider === "forgejo") {
					await primeForgejoHost();
				}
				return { success: true };
			}),

		isConfigured: publicProcedure
			.input(z.object({ provider: ProviderNameSchema }))
			.query(async ({ input }) => (await loadToken(input.provider)) !== null),

		listConfigured: publicProcedure.query(() =>
			gitProviderRegistry.listConfigured(),
		),

		listRepositories: publicProcedure
			.input(
				z.object({
					provider: ProviderNameSchema,
					visibility: z.enum(["all", "public", "private"]).optional(),
				}),
			)
			.query(async ({ input }) => {
				const provider = gitProviderRegistry.getIssueProvider(input.provider);
				if (!provider?.listRepositories) {
					throw new Error(
						`Provider ${input.provider} does not support listRepositories`,
					);
				}
				return provider.listRepositories({ visibility: input.visibility });
			}),

		/**
		 * Aggregate repositories from ALL configured providers. Each provider is
		 * queried independently; errors for one provider don't affect the others.
		 * Only providers whose token is actually configured are queried — this
		 * avoids throwing "not configured" errors for providers the user hasn't
		 * set up yet.
		 */
		listAllRepositories: publicProcedure
			.input(
				z
					.object({
						visibility: z.enum(["all", "public", "private"]).optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				const registered = gitProviderRegistry.listConfigured();
				const results = await Promise.all(
					registered.map(async (name) => {
						const tokenPresent = (await loadToken(name)) !== null;
						if (!tokenPresent) {
							return { provider: name, repositories: [], error: null };
						}
						const provider = gitProviderRegistry.getIssueProvider(name);
						if (!provider?.listRepositories) {
							return { provider: name, repositories: [], error: null };
						}
						try {
							const repositories = await provider.listRepositories({
								visibility: input?.visibility,
							});
							return { provider: name, repositories, error: null };
						} catch (err) {
							const message = err instanceof Error ? err.message : String(err);
							console.warn(
								`[gitProviders/listAllRepositories] ${name} failed:`,
								err,
							);
							return {
								provider: name,
								repositories: [],
								error: message,
							};
						}
					}),
				);
				return { groups: results };
			}),

		listSubIssuesForProject: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					number: z.number().int().positive(),
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					return { subIssues: [], provider: null as string | null };
				}

				let remoteUrl: string;
				try {
					const { stdout } = await execWithShellEnv(
						"git",
						["remote", "get-url", "origin"],
						{ cwd: project.mainRepoPath, timeout: 5000 },
					);
					remoteUrl = stdout.trim();
				} catch {
					return { subIssues: [], provider: null };
				}
				if (!remoteUrl) return { subIssues: [], provider: null };

				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(remoteUrl);
				if (!provider?.listSubIssues) {
					return { subIssues: [], provider: null };
				}
				try {
					const subIssues = await provider.listSubIssues({
						remoteUrl,
						number: input.number,
					});
					return { subIssues, provider: provider.name };
				} catch (err) {
					console.warn("[gitProviders/listSubIssuesForProject] failed:", err);
					return { subIssues: [], provider: provider.name };
				}
			}),

		getIssueForProject: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					number: z.number().int().positive(),
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) return { issue: null, provider: null as string | null };

				let remoteUrl: string;
				try {
					const { stdout } = await execWithShellEnv(
						"git",
						["remote", "get-url", "origin"],
						{ cwd: project.mainRepoPath, timeout: 5000 },
					);
					remoteUrl = stdout.trim();
				} catch {
					return { issue: null, provider: null };
				}
				if (!remoteUrl) return { issue: null, provider: null };

				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(remoteUrl);
				if (!provider) return { issue: null, provider: null };
				try {
					const issue = await provider.getIssue({
						remoteUrl,
						number: input.number,
					});
					return { issue, provider: provider.name };
				} catch (err) {
					console.warn(
						"[gitProviders/getIssueForProject] getIssue failed:",
						err,
					);
					return { issue: null, provider: provider.name };
				}
			}),

		listIssueStatesForProject: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) return { states: [], provider: null as string | null };

				let remoteUrl: string;
				try {
					const { stdout } = await execWithShellEnv(
						"git",
						["remote", "get-url", "origin"],
						{ cwd: project.mainRepoPath, timeout: 5000 },
					);
					remoteUrl = stdout.trim();
				} catch {
					return { states: [], provider: null };
				}
				if (!remoteUrl) return { states: [], provider: null };

				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(remoteUrl);
				if (!provider?.listIssueStates) {
					return { states: [], provider: provider?.name ?? null };
				}
				try {
					const states = await provider.listIssueStates({ remoteUrl });
					return { states, provider: provider.name };
				} catch (err) {
					console.warn("[gitProviders/listIssueStatesForProject] failed:", err);
					return { states: [], provider: provider.name };
				}
			}),

		setIssueStateForProject: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					number: z.number().int().positive(),
					targetState: z.enum(["open", "in_progress", "closed"]),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) throw new Error("Project not found");

				const { stdout } = await execWithShellEnv(
					"git",
					["remote", "get-url", "origin"],
					{ cwd: project.mainRepoPath, timeout: 5000 },
				);
				const remoteUrl = stdout.trim();
				if (!remoteUrl) throw new Error("No git remote configured");

				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(remoteUrl);
				if (!provider?.setIssueState) {
					throw new Error("Provider does not support state changes");
				}

				const IN_PROGRESS = "in progress";
				// GitHub-specific mapping:
				// open → state=open + remove "in progress" label
				// in_progress → state=open + add "in progress" label
				// closed → state=closed (label untouched)
				if (input.targetState === "closed") {
					return provider.setIssueState({
						remoteUrl,
						number: input.number,
						state: "closed",
					});
				}
				// Ensure issue is open first
				await provider.setIssueState({
					remoteUrl,
					number: input.number,
					state: "open",
				});
				if (input.targetState === "in_progress") {
					if (!provider.addIssueLabels) {
						throw new Error("Provider cannot add labels");
					}
					return provider.addIssueLabels({
						remoteUrl,
						number: input.number,
						labels: [IN_PROGRESS],
					});
				}
				// open: remove the in-progress label if present
				if (provider.removeIssueLabel) {
					return provider.removeIssueLabel({
						remoteUrl,
						number: input.number,
						label: IN_PROGRESS,
					});
				}
				// Fallback: return current state via getIssue
				return provider.getIssue({ remoteUrl, number: input.number });
			}),

		setIssueStateByIdForProject: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					number: z.number().int().positive(),
					stateId: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) throw new Error("Project not found");

				const { stdout } = await execWithShellEnv(
					"git",
					["remote", "get-url", "origin"],
					{ cwd: project.mainRepoPath, timeout: 5000 },
				);
				const remoteUrl = stdout.trim();
				if (!remoteUrl) throw new Error("No git remote configured");

				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(remoteUrl);
				if (!provider?.setIssueStateById) {
					throw new Error("Provider does not support setting state by id");
				}
				return provider.setIssueStateById({
					remoteUrl,
					number: input.number,
					stateId: input.stateId,
				});
			}),

		addIssueLabelsForProject: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					number: z.number().int().positive(),
					labels: z.array(z.string().min(1)).min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) throw new Error("Project not found");

				const { stdout } = await execWithShellEnv(
					"git",
					["remote", "get-url", "origin"],
					{ cwd: project.mainRepoPath, timeout: 5000 },
				);
				const remoteUrl = stdout.trim();
				if (!remoteUrl) throw new Error("No git remote configured");

				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(remoteUrl);
				if (!provider?.addIssueLabels) {
					throw new Error("Provider does not support labels");
				}
				return provider.addIssueLabels({
					remoteUrl,
					number: input.number,
					labels: input.labels,
				});
			}),

		createIssueCommentForProject: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					number: z.number().int().positive(),
					body: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) throw new Error("Project not found");

				const { stdout } = await execWithShellEnv(
					"git",
					["remote", "get-url", "origin"],
					{ cwd: project.mainRepoPath, timeout: 5000 },
				);
				const remoteUrl = stdout.trim();
				if (!remoteUrl) throw new Error("No git remote configured");

				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(remoteUrl);
				if (!provider?.createIssueComment) {
					throw new Error("Provider does not support comments");
				}
				return provider.createIssueComment({
					remoteUrl,
					number: input.number,
					body: input.body,
				});
			}),

		listIssueCommentsForProject: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					number: z.number().int().positive(),
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) return { comments: [], provider: null as string | null };

				let remoteUrl: string;
				try {
					const { stdout } = await execWithShellEnv(
						"git",
						["remote", "get-url", "origin"],
						{ cwd: project.mainRepoPath, timeout: 5000 },
					);
					remoteUrl = stdout.trim();
				} catch {
					return { comments: [], provider: null };
				}
				if (!remoteUrl) return { comments: [], provider: null };

				await ensureHostsPrimed();
				const provider = gitProviderRegistry.detectFromRemoteUrl(remoteUrl);
				if (!provider?.listIssueComments)
					return { comments: [], provider: null };

				try {
					const comments = await provider.listIssueComments({
						remoteUrl,
						number: input.number,
					});
					return { comments, provider: provider.name };
				} catch (err) {
					console.warn(
						"[gitProviders/listIssueCommentsForProject] failed:",
						err,
					);
					return { comments: [], provider: provider.name };
				}
			}),
	});
};

export type GitProvidersRouter = ReturnType<typeof createGitProvidersRouter>;
