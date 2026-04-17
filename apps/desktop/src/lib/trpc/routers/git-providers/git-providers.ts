import {
	clearToken,
	gitProviderRegistry,
	loadToken,
	ProviderNameSchema,
	saveToken,
} from "@superset/git-provider-core";
import { z } from "zod";
import { publicProcedure, router } from "../..";

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
	});
};

export type GitProvidersRouter = ReturnType<typeof createGitProvidersRouter>;
