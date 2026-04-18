/**
 * Forgejo URL parsing.
 *
 * Forgejo (and Gitea) is self-hosted, so there is no fixed hostname. The
 * caller must supply the configured host (from saved credentials) — without
 * it we cannot tell a Forgejo remote apart from any other self-hosted Git.
 *
 * Forgejo enforces a 2-level path of `{owner}/{repo}` (no nested groups
 * like OneDev), so we return owner + repo separately.
 */

function normalizeHost(input: string): string {
	return input
		.replace(/^https?:\/\//i, "")
		.replace(/\/+$/, "")
		.toLowerCase();
}

export function parseForgejoRemote(
	url: string,
	host: string,
): { owner: string; repo: string } | null {
	const h = normalizeHost(host);
	if (!h) return null;
	const escapedHost = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	const patterns: RegExp[] = [
		new RegExp(
			`^git@${escapedHost}:([^/\\s]+)/([^/\\s]+?)(?:\\.git)?$`,
			"i",
		),
		new RegExp(
			`^ssh://git@${escapedHost}(?::\\d+)?/([^/\\s]+)/([^/\\s]+?)(?:\\.git)?$`,
			"i",
		),
		new RegExp(
			`^https?://${escapedHost}(?::\\d+)?/([^/\\s?#]+)/([^/\\s?#]+?)(?:\\.git)?(?:[?#].*)?$`,
			"i",
		),
	];
	for (const re of patterns) {
		const m = url.match(re);
		if (m?.[1] && m[2]) {
			const owner = m[1];
			const repo = m[2].replace(/\/+$/, "");
			if (owner && repo) return { owner, repo };
		}
	}
	return null;
}

export function canHandleForgejoUrl(url: string, host: string): boolean {
	return parseForgejoRemote(url, host) !== null;
}
