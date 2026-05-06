import { describe, expect, it } from "bun:test";
import { canHandleOnedevUrl, parseOnedevRemote } from "./onedev-url-parser";

describe("parseOnedevRemote", () => {
	const host = "onedev.example.com";

	it("parses HTTPS URL with simple project", () => {
		expect(
			parseOnedevRemote("https://onedev.example.com/myproj", host),
		).toEqual({ projectPath: "myproj" });
	});

	it("parses HTTPS URL with nested project path", () => {
		expect(
			parseOnedevRemote("https://onedev.example.com/team/subteam/proj", host),
		).toEqual({ projectPath: "team/subteam/proj" });
	});

	it("strips .git suffix", () => {
		expect(
			parseOnedevRemote("https://onedev.example.com/foo/bar.git", host),
		).toEqual({ projectPath: "foo/bar" });
	});

	it("parses SSH URL", () => {
		expect(
			parseOnedevRemote("git@onedev.example.com:team/project.git", host),
		).toEqual({ projectPath: "team/project" });
	});

	it("parses ssh:// URL with port", () => {
		expect(
			parseOnedevRemote("ssh://git@onedev.example.com:22/foo/bar", host),
		).toEqual({ projectPath: "foo/bar" });
	});

	it("is case-insensitive on host", () => {
		expect(parseOnedevRemote("https://OneDev.Example.Com/foo", host)).toEqual({
			projectPath: "foo",
		});
	});

	it("accepts host given with https:// prefix", () => {
		expect(
			parseOnedevRemote(
				"https://onedev.example.com/foo",
				"https://onedev.example.com",
			),
		).toEqual({ projectPath: "foo" });
	});

	it("rejects different host", () => {
		expect(parseOnedevRemote("https://github.com/foo/bar", host)).toBeNull();
	});

	it("rejects when host is empty", () => {
		expect(parseOnedevRemote("https://onedev.example.com/foo", "")).toBeNull();
	});
});

describe("canHandleOnedevUrl", () => {
	it("returns true for matching host", () => {
		expect(
			canHandleOnedevUrl(
				"https://onedev.example.com/foo",
				"onedev.example.com",
			),
		).toBe(true);
	});

	it("returns false for non-matching host", () => {
		expect(
			canHandleOnedevUrl("https://github.com/foo/bar", "onedev.example.com"),
		).toBe(false);
	});
});
