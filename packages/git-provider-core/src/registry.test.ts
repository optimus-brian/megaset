import { beforeEach, expect, test } from "bun:test";
import { gitProviderRegistry } from "./registry";
import type { Issue, IssueProvider } from "./types";

beforeEach(() => gitProviderRegistry.clear());

test("registry stores, retrieves, detects, and lists providers", () => {
	const fake: IssueProvider = {
		name: "github",
		canHandle: (url) => url.includes("github"),
		listIssues: async () => [],
		getIssue: async () => ({}) as Issue,
		createIssue: async () => ({}) as Issue,
	};
	gitProviderRegistry.registerIssueProvider(fake);
	expect(gitProviderRegistry.getIssueProvider("github")).toBe(fake);
	expect(
		gitProviderRegistry.detectFromRemoteUrl("https://github.com/a/b"),
	).toBe(fake);
	expect(gitProviderRegistry.listConfigured()).toContain("github");
});
