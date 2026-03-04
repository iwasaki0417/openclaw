import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setChatworkRuntime(next: PluginRuntime) {
	runtime = next;
}

export function getChatworkRuntime(): PluginRuntime {
	if (!runtime) {
		throw new Error("Chatwork runtime not initialized");
	}
	return runtime;
}
