/**
 * OneDev URL parsing.
 *
 * OneDev is self-hosted, so there is no fixed hostname. The caller must
 * supply the configured host (from saved credentials) — without it we
 * cannot tell a OneDev remote apart from any other self-hosted Git.
 *
 * Project paths can be nested (e.g. "team/subteam/project"), so we
 * return the full path rather than owner/repo.
 */

function normalizeHost(input: string): string {
	return input
		.replace(/^https?:\/\//i, "")
		.replace(/\/+$/, "")
		.toLowerCase();
}

export function parseOnedevRemote(
	url: string,
	host: string,
): { projectPath: string } | null {
	const h = normalizeHost(host);
	if (!h) return null;
	const escapedHost = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	const patterns: RegExp[] = [
		new RegExp(`^git@${escapedHost}:([^\\s]+?)(?:\\.git)?$`, "i"),
		new RegExp(
			`^ssh://git@${escapedHost}(?::\\d+)?/([^\\s]+?)(?:\\.git)?$`,
			"i",
		),
		new RegExp(
			`^https?://(?:[^/@\\s]+@)?${escapedHost}(?::\\d+)?/([^\\s?#]+?)(?:\\.git)?(?:[?#].*)?$`,
			"i",
		),
	];
	for (const re of patterns) {
		const m = url.match(re);
		if (m?.[1]) {
			const projectPath = m[1].replace(/\/+$/, "");
			if (projectPath) return { projectPath };
		}
	}
	return null;
}

export function canHandleOnedevUrl(url: string, host: string): boolean {
	return parseOnedevRemote(url, host) !== null;
}
