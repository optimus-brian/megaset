import { describe, expect, it } from "bun:test";
import {
	canHandleForgejoUrl,
	parseForgejoRemote,
} from "./forgejo-url-parser";

describe("parseForgejoRemote", () => {
	const host = "forgejo.example.com";

	it("parses HTTPS URL with owner/repo", () => {
		expect(
			parseForgejoRemote("https://forgejo.example.com/octo/cat", host),
		).toEqual({ owner: "octo", repo: "cat" });
	});

	it("strips .git suffix", () => {
		expect(
			parseForgejoRemote("https://forgejo.example.com/foo/bar.git", host),
		).toEqual({ owner: "foo", repo: "bar" });
	});

	it("parses SSH URL", () => {
		expect(
			parseForgejoRemote("git@forgejo.example.com:team/project.git", host),
		).toEqual({ owner: "team", repo: "project" });
	});

	it("parses ssh:// URL with port", () => {
		expect(
			parseForgejoRemote("ssh://git@forgejo.example.com:22/foo/bar", host),
		).toEqual({ owner: "foo", repo: "bar" });
	});

	it("parses HTTPS URL with port", () => {
		expect(
			parseForgejoRemote("https://forgejo.example.com:3000/foo/bar", host),
		).toEqual({ owner: "foo", repo: "bar" });
	});

	it("ignores trailing query string", () => {
		expect(
			parseForgejoRemote(
				"https://forgejo.example.com/foo/bar?ref=main",
				host,
			),
		).toEqual({ owner: "foo", repo: "bar" });
	});

	it("is case-insensitive on host", () => {
		expect(
			parseForgejoRemote("https://Forgejo.Example.Com/foo/bar", host),
		).toEqual({ owner: "foo", repo: "bar" });
	});

	it("accepts host given with https:// prefix", () => {
		expect(
			parseForgejoRemote(
				"https://forgejo.example.com/foo/bar",
				"https://forgejo.example.com",
			),
		).toEqual({ owner: "foo", repo: "bar" });
	});

	it("rejects different host", () => {
		expect(
			parseForgejoRemote("https://github.com/foo/bar", host),
		).toBeNull();
	});

	it("rejects when host is empty", () => {
		expect(
			parseForgejoRemote("https://forgejo.example.com/foo/bar", ""),
		).toBeNull();
	});

	it("rejects single-segment path (Forgejo requires owner/repo)", () => {
		expect(
			parseForgejoRemote("https://forgejo.example.com/onlyone", host),
		).toBeNull();
	});
});

describe("canHandleForgejoUrl", () => {
	it("returns true for matching host", () => {
		expect(
			canHandleForgejoUrl(
				"https://forgejo.example.com/foo/bar",
				"forgejo.example.com",
			),
		).toBe(true);
	});

	it("returns false for non-matching host", () => {
		expect(
			canHandleForgejoUrl(
				"https://github.com/foo/bar",
				"forgejo.example.com",
			),
		).toBe(false);
	});
});
