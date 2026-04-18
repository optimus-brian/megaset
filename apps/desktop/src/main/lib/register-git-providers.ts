import { gitProviderRegistry } from "@superset/git-provider-core";
import { githubProvider } from "@superset/git-provider-github";
import {
	onedevProvider,
	primeOnedevHost,
} from "@superset/git-provider-onedev";

/**
 * Registers built-in git providers in the global registry.
 * Called once at main process boot. Registry is in-memory, so safe
 * to call before `app.whenReady()`.
 *
 * OneDev's URL is dynamic (self-hosted), so we prime the cached host
 * from saved credentials so the synchronous canHandle check works.
 * Best-effort: failures are silent — the provider is still registered.
 */
export function registerGitProviders(): void {
	gitProviderRegistry.registerIssueProvider(githubProvider);
	gitProviderRegistry.registerIssueProvider(onedevProvider);
	void primeOnedevHost().catch(() => {});
}
