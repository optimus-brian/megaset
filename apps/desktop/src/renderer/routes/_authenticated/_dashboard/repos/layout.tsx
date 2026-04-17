import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/repos")({
	component: ReposLayout,
});

function ReposLayout() {
	return <Outlet />;
}
