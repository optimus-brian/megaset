import { observable } from "@trpc/server/observable";
import { getClaudeSdkManager } from "fork/claude-sdk/main/manager";
import {
	getResumeSessionId,
	setResumeSessionId,
} from "fork/claude-sdk/main/resume-store";
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
					effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
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
				z
					.object({
						sessionId: z.string().min(1),
						text: z.string(),
						attachments: z
							.array(
								z.object({
									mediaType: z.string().min(1),
									data: z.string().min(1),
								}),
							)
							.optional(),
					})
					.refine(
						(v) => v.text.trim().length > 0 || (v.attachments?.length ?? 0) > 0,
						{ message: "Message must contain text or attachments" },
					),
			)
			.mutation(({ input }) => {
				const session = getClaudeSdkManager().get(input.sessionId);
				if (!session) throw new Error("Session not found");
				session.sendUserMessage(input.text, input.attachments);
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

		setPermissionMode: publicProcedure
			.input(
				z.object({
					sessionId: z.string().min(1),
					mode: z.enum(["default", "acceptEdits", "bypassPermissions", "plan"]),
				}),
			)
			.mutation(async ({ input }) => {
				const session = getClaudeSdkManager().get(input.sessionId);
				if (!session) throw new Error("Session not found");
				const ok = await session.setPermissionMode(input.mode);
				return { ok };
			}),

		getResumeId: publicProcedure
			.input(z.object({ paneId: z.string().min(1) }))
			.query(({ input }) => {
				return { resumeSessionId: getResumeSessionId(input.paneId) };
			}),

		setResumeId: publicProcedure
			.input(
				z.object({
					paneId: z.string().min(1),
					resumeSessionId: z.string().nullable(),
				}),
			)
			.mutation(({ input }) => {
				setResumeSessionId(input.paneId, input.resumeSessionId);
				return { ok: true };
			}),

		getSessionState: publicProcedure
			.input(z.object({ sessionId: z.string().min(1) }))
			.query(({ input }) => {
				const session = getClaudeSdkManager().get(input.sessionId);
				if (!session) return { exists: false as const };
				return { exists: true as const, inFlight: session.inFlight };
			}),

		events: publicProcedure
			.input(
				z.object({
					sessionId: z.string().min(1),
					// Only replay events the renderer hasn't seen yet. Every event
					// carries a monotonically increasing `seq`; the renderer sends
					// the highest one it's applied so we can pick up from there.
					// Defaults to 0, which replays everything.
					sinceSeq: z.number().int().nonnegative().optional(),
				}),
			)
			.subscription(({ input }) => {
				return observable<RuntimeEvent>((emit) => {
					const session = getClaudeSdkManager().get(input.sessionId);
					if (!session) {
						emit.next({
							type: "error",
							seq: 0,
							message: `Session ${input.sessionId} not found`,
						});
						emit.complete();
						return () => {};
					}
					const since = input.sinceSeq ?? 0;
					for (const event of session.replayEvents()) {
						if (event.seq > since) emit.next(event);
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
