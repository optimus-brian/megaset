/**
 * Sidebar entry registry for the workspace sidebar header.
 *
 * Feature modules (issues, repos, dashboard, …) register a nav entry by
 * calling {@link registerSidebarEntry} from their module-level `register.ts`.
 * This keeps `WorkspaceSidebarHeader.tsx` upstream-close: the header only
 * renders the shared upstream entries (Workspaces, Tasks) and a map over the
 * registry for fork/feature entries.
 *
 * Hook-rules note: `useSidebarEntries` calls each entry's `useIsVisible` hook
 * in a stable order. Registrations must happen at module import time (not
 * conditionally or after first render) so the call order never changes.
 */
import type { IconType } from "react-icons";

/**
 * Where the entry is rendered relative to the upstream entries.
 * - `before-upstream`: before the Workspaces button (e.g. Dashboard).
 * - `after-upstream`: after the Tasks button (e.g. Issues, Repos).
 */
export type SidebarEntryPlacement = "before-upstream" | "after-upstream";

export interface SidebarEntry {
	/** Stable id, used as React key and de-dupe guard. */
	id: string;
	/** Human-readable label (tooltip in collapsed mode, text in expanded). */
	label: string;
	/** Icon component rendered inside the button. */
	icon: IconType;
	/** Tanstack-router path this entry navigates to. */
	to: string;
	/** Rendering position relative to the upstream Workspaces/Tasks block. */
	placement: SidebarEntryPlacement;
	/**
	 * Hook that returns whether the entry is currently visible.
	 * Must obey the rules of hooks — called unconditionally on every render
	 * of the header.
	 */
	useIsVisible: () => boolean;
}

const entries: SidebarEntry[] = [];
const registered = new Set<string>();

export function registerSidebarEntry(entry: SidebarEntry): void {
	if (registered.has(entry.id)) return;
	registered.add(entry.id);
	entries.push(entry);
}

/**
 * Returns the registered sidebar entries for a given placement, together
 * with their visibility flag (computed by calling each entry's
 * `useIsVisible` hook in stable registration order).
 */
export function useSidebarEntries(
	placement: SidebarEntryPlacement,
): Array<SidebarEntry & { visible: boolean }> {
	// All hooks for ALL registered entries are called every render in stable
	// order; we filter by placement afterwards so hook order stays stable even
	// if a caller renders only a subset.
	const resolved = entries.map((entry) => ({
		...entry,
		// biome-ignore lint/correctness/useHookAtTopLevel: stable order, see file header.
		visible: entry.useIsVisible(),
	}));
	return resolved.filter((entry) => entry.placement === placement);
}
