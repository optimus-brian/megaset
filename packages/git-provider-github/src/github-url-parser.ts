export function parseGitHubRemote(
	url: string,
): { owner: string; repo: string } | null {
	const patterns = [
		/^git@github\.com:([^/\s]+?)\/([^/\s]+?)(?:\.git)?$/i,
		/^ssh:\/\/git@github\.com\/([^/\s]+?)\/([^/\s]+?)(?:\.git)?$/i,
		/^https?:\/\/(?:[^/@\s]+@)?github\.com\/([^/\s]+?)\/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$/i,
	];
	for (const re of patterns) {
		const m = url.match(re);
		if (m?.[1] && m[2]) return { owner: m[1], repo: m[2] };
	}
	return null;
}

export function canHandleGitHubUrl(url: string): boolean {
	return parseGitHubRemote(url) !== null;
}
