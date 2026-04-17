import { describe, expect, it } from "bun:test";
import { canHandleGitHubUrl, parseGitHubRemote } from "./github-url-parser";

describe("parseGitHubRemote", () => {
	it("parses SSH URL with .git suffix", () => {
		expect(
			parseGitHubRemote("git@github.com:optimus-brian/hyperset.git"),
		).toEqual({
			owner: "optimus-brian",
			repo: "hyperset",
		});
	});
	it("parses SSH URL without .git suffix", () => {
		expect(parseGitHubRemote("git@github.com:owner/repo")).toEqual({
			owner: "owner",
			repo: "repo",
		});
	});
	it("parses HTTPS URL", () => {
		expect(
			parseGitHubRemote("https://github.com/optimus-brian/hyperset"),
		).toEqual({
			owner: "optimus-brian",
			repo: "hyperset",
		});
	});
	it("parses HTTPS URL with .git", () => {
		expect(parseGitHubRemote("https://github.com/owner/repo.git")).toEqual({
			owner: "owner",
			repo: "repo",
		});
	});
	it("parses ssh:// URL", () => {
		expect(parseGitHubRemote("ssh://git@github.com/owner/repo.git")).toEqual({
			owner: "owner",
			repo: "repo",
		});
	});
	it("returns null for non-GitHub URL", () => {
		expect(parseGitHubRemote("https://onedev.rieth.io/hyperset.git")).toBeNull();
		expect(parseGitHubRemote("git@gitlab.com:x/y.git")).toBeNull();
	});
	it("parses repo names with dots", () => {
		expect(parseGitHubRemote("https://github.com/microsoft/vscode.dev")).toEqual({
			owner: "microsoft",
			repo: "vscode.dev",
		});
		expect(parseGitHubRemote("git@github.com:rails/rails.github.com.git")).toEqual({
			owner: "rails",
			repo: "rails.github.com",
		});
	});
	it("strips trailing URL segments", () => {
		expect(parseGitHubRemote("https://github.com/owner/repo/issues/42")).toEqual({
			owner: "owner",
			repo: "repo",
		});
		expect(parseGitHubRemote("https://github.com/owner/repo?tab=readme")).toEqual({
			owner: "owner",
			repo: "repo",
		});
		expect(parseGitHubRemote("https://github.com/owner/repo#section")).toEqual({
			owner: "owner",
			repo: "repo",
		});
	});
	it("handles case-insensitive host", () => {
		expect(parseGitHubRemote("https://GitHub.com/owner/repo")).toEqual({
			owner: "owner",
			repo: "repo",
		});
	});
	it("rejects whitespace in URL", () => {
		expect(parseGitHubRemote("https://github.com/owner/repo   ")).toBeNull();
		expect(parseGitHubRemote("https://github.com/own er/repo")).toBeNull();
	});
});

describe("canHandleGitHubUrl", () => {
	it("accepts GitHub URLs", () => {
		expect(canHandleGitHubUrl("git@github.com:x/y.git")).toBe(true);
		expect(canHandleGitHubUrl("https://github.com/x/y")).toBe(true);
	});
	it("rejects non-GitHub URLs", () => {
		expect(canHandleGitHubUrl("https://onedev.rieth.io/x.git")).toBe(false);
		expect(canHandleGitHubUrl("not-a-url")).toBe(false);
	});
});
