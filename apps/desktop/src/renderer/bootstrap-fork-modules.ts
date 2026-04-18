/**
 * Central bootstrap that imports all fork module registration files for
 * side-effects (settings sections, etc.). Import this once from the renderer
 * entry before the app mounts.
 *
 * Each fork module owns its own `register-settings-sections` file and pushes
 * into the shared registry at import time. Upstream settings pages only need
 * to render whatever is in the registry.
 */

import "fork/claude-sdk/renderer/register-settings-sections";
import "fork/forgejo-integration/renderer/register-settings-sections";
import "fork/github-integration/renderer/register-settings-sections";
import "fork/onedev-integration/renderer/register-settings-sections";
