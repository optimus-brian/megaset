/**
 * Registers the Issues sidebar nav entry.
 *
 * Imported for side effects from `sidebar-entries.ts`. Visibility follows
 * the `issues` flag from `useModuleVisibility`, so the user can hide the
 * entry via the Behavior settings page.
 */
import { HiOutlineRectangleStack } from "react-icons/hi2";
import { useModuleVisibility } from "renderer/hooks/useModuleVisibility";
import { registerSidebarEntry } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/sidebar-entry-registry";

registerSidebarEntry({
	id: "issues",
	label: "Issues",
	icon: HiOutlineRectangleStack,
	to: "/issues",
	placement: "after-upstream",
	useIsVisible: () => useModuleVisibility().visibility.issues,
});
