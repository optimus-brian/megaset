import type { IssueProvider, ProviderName } from "./types";

class GitProviderRegistry {
	private issueProviders = new Map<ProviderName, IssueProvider>();

	registerIssueProvider(provider: IssueProvider) {
		this.issueProviders.set(provider.name, provider);
	}

	getIssueProvider(name: ProviderName): IssueProvider | undefined {
		return this.issueProviders.get(name);
	}

	detectFromRemoteUrl(url: string): IssueProvider | undefined {
		for (const p of this.issueProviders.values()) {
			if (p.canHandle(url)) return p;
		}
		return undefined;
	}

	listConfigured(): ProviderName[] {
		return Array.from(this.issueProviders.keys());
	}

	/** Reset state. Intended for test setup; not for production use. */
	clear() {
		this.issueProviders.clear();
	}
}

/**
 * Module-level singleton. Tests that register fakes should call
 * `gitProviderRegistry.clear()` in `beforeEach` to avoid cross-file state leakage.
 */
export const gitProviderRegistry = new GitProviderRegistry();
