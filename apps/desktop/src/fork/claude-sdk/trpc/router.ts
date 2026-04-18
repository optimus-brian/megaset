import { observable } from "@trpc/server/observable";
import { getClaudeSdkManager } from "fork/claude-sdk/main/manager";
import type {
	ApprovalDecision,
	RuntimeEvent,
} from "fork/claude-sdk/main/types";
import { publicProcedure, router } from "lib/trpc";
import { z } from "zod";

const PermissionModeSchema = z
	.enum(["default", "acceptEdits", "bypassPermissions", "plan"])
	.optional();

export const createClaudeSdkRouter = () => {
	return router({
		startSession: publicProcedure
			.input(
				z.object({
					workspaceId: z.string().min(1),
					cwd: z.string().min(1),
					systemPrompt: z.string().optional(),
					model: z.string().optional(),
					effort: z
						.enum(["low", "medium", "high", "xhigh", "max"])
						.optional(),
					permissionMode: PermissionModeSchema,
					resumeSessionId: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				const manager = getClaudeSdkManager();
				const session = manager.create(input);
				return { sessionId: session.id };
			}),

		sendMessage: publicProcedure
			.input(
				z.object({
					sessionId: z.string().min(1),
					text: z.string().min(1),
				}),
			)
			.mutation(({ input }) => {
				const session = getClaudeSdkManager().get(input.sessionId);
				if (!session) throw new Error("Session not found");
				session.sendUserMessage(input.text);
				return { ok: true };
			}),

		approveTool: publicProcedure
			.input(
				z.object({
					sessionId: z.string().min(1),
					approvalId: z.string().min(1),
					decision: z.discriminatedUnion("behavior", [
						z.object({
							behavior: z.literal("allow"),
							updatedInput: z.record(z.string(), z.unknown()).optional(),
						}),
						z.object({
							behavior: z.literal("deny"),
							message: z.string(),
						}),
					]),
				}),
			)
			.mutation(({ input }) => {
				const session = getClaudeSdkManager().get(input.sessionId);
				if (!session) throw new Error("Session not found");
				const ok = session.resolveApproval(
					input.approvalId,
					input.decision as ApprovalDecision,
				);
				return { ok };
			}),

		stopSession: publicProcedure
			.input(z.object({ sessionId: z.string().min(1) }))
			.mutation(({ input }) => {
				const ok = getClaudeSdkManager().stop(input.sessionId);
				return { ok };
			}),

		events: publicProcedure
			.input(z.object({ sessionId: z.string().min(1) }))
			.subscription(({ input }) => {
				return observable<RuntimeEvent>((emit) => {
					const session = getClaudeSdkManager().get(input.sessionId);
					if (!session) {
						emit.next({
							type: "error",
							message: `Session ${input.sessionId} not found`,
						});
						emit.complete();
						return () => {};
					}
					// Replay history so late subscribers don't miss events
					for (const event of session.replayEvents()) {
						emit.next(event);
					}
					const handler = (event: RuntimeEvent) => {
						emit.next(event);
						if (event.type === "session.ended") emit.complete();
					};
					session.on("event", handler);
					return () => {
						session.off("event", handler);
					};
				});
			}),
	});
};
