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
}

export const gitProviderRegistry = new GitProviderRegistry();
