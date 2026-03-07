import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setLineRuntime(next: PluginRuntime) {
	runtime = next;
}

export function getLineRuntime(): PluginRuntime {
	if (!runtime) {
		throw new Error("LINE custom runtime not initialized");
	}
	return runtime;
}
