import { gitProviderRegistry } from "@superset/git-provider-core";
import { githubProvider } from "@superset/git-provider-github";

/**
 * Registers built-in git providers in the global registry.
 * Called once at main process boot. Registry is in-memory, so safe
 * to call before `app.whenReady()`.
 */
export function registerGitProviders(): void {
	gitProviderRegistry.registerIssueProvider(githubProvider);
}
