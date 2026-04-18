/**
 * Registers the Repos sidebar nav entry.
 *
 * Imported for side effects from `sidebar-entries.ts`. Visibility follows
 * the `repos` flag from `useModuleVisibility`, so the user can hide the
 * entry via the Behavior settings page.
 */
import { HiOutlineCircleStack } from "react-icons/hi2";
import { useModuleVisibility } from "renderer/hooks/useModuleVisibility";
import { registerSidebarEntry } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/sidebar-entry-registry";

registerSidebarEntry({
	id: "repos",
	label: "Repos",
	icon: HiOutlineCircleStack,
	to: "/repos",
	placement: "after-upstream",
	useIsVisible: () => useModuleVisibility().visibility.repos,
});
