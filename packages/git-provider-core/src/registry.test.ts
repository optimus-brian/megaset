import { expect, test } from "bun:test";
import { gitProviderRegistry } from "./registry";
import type { Issue, IssueProvider } from "./types";

test("registry stores and retrieves providers", () => {
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
});
