import {
	clearToken,
	gitProviderRegistry,
	loadToken,
	ProviderNameSchema,
	saveToken,
} from "@superset/git-provider-core";
import { projects } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { execWithShellEnv } from "../workspaces/utils/shell-env";

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
				return { success: true };
			}),

		clearToken: publicProcedure
			.input(z.object({ provider: ProviderNameSchema }))
			.mutation(async ({ input }) => {
				await clearToken(input.provider);
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
	});
};

export type GitProvidersRouter = ReturnType<typeof createGitProvidersRouter>;
