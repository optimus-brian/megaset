import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Collapsible, CollapsibleContent } from "@superset/ui/collapsible";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import {
	type StatusBarVisibility,
	useClaudeSdkSettingsStore,
} from "fork/claude-sdk/settings-store";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { HiOutlineSparkles } from "react-icons/hi2";

const MODEL_OPTIONS = [
	{ value: "default", label: "Default (auto)" },
	{ value: "claude-opus-4-7", label: "Opus 4.7" },
	{ value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
	{ value: "claude-haiku-4-5", label: "Haiku 4.5" },
];
const EFFORT_OPTIONS = [
	{ value: "default", label: "Default" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "xhigh", label: "X-High" },
	{ value: "max", label: "Max" },
];
const PERMISSION_OPTIONS = [
	{ value: "default", label: "Ask" },
	{ value: "acceptEdits", label: "Accept edits" },
	{ value: "bypassPermissions", label: "Bypass" },
	{ value: "plan", label: "Plan mode" },
];

const STATUS_BAR_FIELDS: Array<{
	key: keyof StatusBarVisibility;
	label: string;
	hint: string;
}> = [
	{ key: "model", label: "Model selector", hint: "Pill to switch model" },
	{ key: "effort", label: "Effort selector", hint: "Pill to switch effort" },
	{
		key: "permission",
		label: "Permission selector",
		hint: "Pill to switch permission mode",
	},
	{
		key: "activeModel",
		label: "Active model name",
		hint: "Live model used by SDK",
	},
	{
		key: "contextRing",
		label: "Context ring",
		hint: "Color ring showing context fill",
	},
	{
		key: "contextDetail",
		label: "Context detail",
		hint: "Numeric tokens / context window",
	},
	{
		key: "totalTokens",
		label: "Total tokens (⇅)",
		hint: "Sum of input + output + cache",
	},
	{
		key: "outputTokens",
		label: "Output tokens (↓)",
		hint: "Output tokens this turn",
	},
	{
		key: "cacheTokens",
		label: "Cache read tokens (⊙)",
		hint: "Cached prefix tokens",
	},
	{ key: "cost", label: "Session cost ($)", hint: "Total USD spent" },
	{
		key: "duration",
		label: "Last turn duration",
		hint: "Wall-clock for last turn",
	},
	{ key: "turns", label: "Turn count", hint: "Number of turns in session" },
	{ key: "cwd", label: "Working directory", hint: "Current cwd path" },
];

export function ClaudeSdkAgentCard() {
	const [isOpen, setIsOpen] = useState(false);
	const {
		enabled,
		defaultModel,
		defaultEffort,
		defaultPermission,
		statusBar,
		setEnabled,
		setDefaultModel,
		setDefaultEffort,
		setDefaultPermission,
		setStatusBarField,
		resetStatusBar,
	} = useClaudeSdkSettingsStore();

	const contentId = "claude-sdk-settings";

	return (
		<Card>
			<Collapsible open={isOpen} onOpenChange={setIsOpen}>
				<CardHeader
					role="button"
					tabIndex={0}
					aria-expanded={isOpen}
					aria-controls={contentId}
					className="cursor-pointer gap-3 p-4 transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => setIsOpen((o) => !o)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setIsOpen((o) => !o);
						}
					}}
				>
					<div className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
								<HiOutlineSparkles className="size-4 text-amber-500" />
							</div>
							<div className="min-w-0">
								<CardTitle className="truncate">Claude SDK</CardTitle>
								<CardDescription className="mt-1">
									In-app Claude Agent SDK chat tab. Programmatic — no PTY,
									streaming events, tool approvals.
								</CardDescription>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<Switch
								checked={enabled}
								onCheckedChange={setEnabled}
								onClick={(e) => e.stopPropagation()}
								aria-label="Enable Claude SDK tab"
							/>
							<ChevronDownIcon
								className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
							/>
						</div>
					</div>
				</CardHeader>

				<CollapsibleContent>
					<CardContent
						id={contentId}
						className="space-y-6 px-4 pb-4 pt-0 border-t border-border"
					>
						{/* Defaults */}
						<section className="space-y-3 pt-4">
							<h4 className="text-sm font-medium">Default session settings</h4>
							<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
								<div className="space-y-1">
									<Label className="text-xs">Model</Label>
									<Select
										value={defaultModel}
										onValueChange={setDefaultModel}
										disabled={!enabled}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{MODEL_OPTIONS.map((m) => (
												<SelectItem
													key={m.value}
													value={m.value}
													className="text-xs"
												>
													{m.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label className="text-xs">Effort</Label>
									<Select
										value={defaultEffort}
										onValueChange={(v) =>
											setDefaultEffort(
												v as
													| "default"
													| "low"
													| "medium"
													| "high"
													| "xhigh"
													| "max",
											)
										}
										disabled={!enabled}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{EFFORT_OPTIONS.map((e) => (
												<SelectItem
													key={e.value}
													value={e.value}
													className="text-xs"
												>
													{e.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label className="text-xs">Permission mode</Label>
									<Select
										value={defaultPermission}
										onValueChange={(v) =>
											setDefaultPermission(
												v as
													| "default"
													| "acceptEdits"
													| "bypassPermissions"
													| "plan",
											)
										}
										disabled={!enabled}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{PERMISSION_OPTIONS.map((p) => (
												<SelectItem
													key={p.value}
													value={p.value}
													className="text-xs"
												>
													{p.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</section>

						{/* Status bar visibility */}
						<section className="space-y-3">
							<div className="flex items-center justify-between">
								<div>
									<h4 className="text-sm font-medium">Status bar fields</h4>
									<p className="text-xs text-muted-foreground mt-0.5">
										Toggle which fields appear in the status bar at the bottom
										of the SDK pane.
									</p>
								</div>
								<button
									type="button"
									onClick={resetStatusBar}
									className="text-xs text-muted-foreground hover:text-foreground"
								>
									Reset
								</button>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
								{STATUS_BAR_FIELDS.map((f) => (
									<div
										key={f.key}
										className="flex items-center justify-between gap-3 py-1.5 px-2 rounded hover:bg-muted/30"
									>
										<div className="min-w-0">
											<Label
												htmlFor={`statusbar-${f.key}`}
												className="text-xs cursor-pointer"
											>
												{f.label}
											</Label>
											<p className="text-[10px] text-muted-foreground truncate">
												{f.hint}
											</p>
										</div>
										<Switch
											id={`statusbar-${f.key}`}
											checked={statusBar[f.key]}
											onCheckedChange={(v) => setStatusBarField(f.key, v)}
											disabled={!enabled}
										/>
									</div>
								))}
							</div>
						</section>
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
