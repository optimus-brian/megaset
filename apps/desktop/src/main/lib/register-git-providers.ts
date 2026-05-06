import { gitProviderRegistry } from "@superset/git-provider-core";
import {
	forgejoProvider,
	primeForgejoHost,
} from "@superset/git-provider-forgejo";
import { githubProvider } from "@superset/git-provider-github";
import { onedevProvider, primeOnedevHost } from "@superset/git-provider-onedev";

/**
 * Registers built-in git providers in the global registry.
 * Called once at main process boot. Registry is in-memory, so safe
 * to call before `app.whenReady()`.
 *
 * OneDev and Forgejo are self-hosted, so we prime their cached hosts
 * from saved credentials so the synchronous canHandle checks work.
 * Best-effort: failures are silent — the providers are still registered.
 */
export function registerGitProviders(): void {
	gitProviderRegistry.registerIssueProvider(githubProvider);
	gitProviderRegistry.registerIssueProvider(onedevProvider);
	gitProviderRegistry.registerIssueProvider(forgejoProvider);
	void primeOnedevHost().catch(() => {});
	void primeForgejoHost().catch(() => {});
}
