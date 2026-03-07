import { lineCustomPlugin } from "./src/channel.js";
import { handleLineWebhookRequest } from "./src/webhook.js";
import { setLineRuntime } from "./src/runtime.js";

const plugin = {
	id: "line-custom",
	name: "LINE (Custom)",
	description: "Custom LINE channel plugin using registerHttpRoute to bypass stock plugin bugs",
	register(api: any) {
		setLineRuntime(api.runtime);
		api.registerChannel({ plugin: lineCustomPlugin });
		api.registerHttpRoute({
			path: "/line/webhook",
			handler: handleLineWebhookRequest,
			auth: "plugin",
			replaceExisting: true,
		});
		api.logger?.info?.("[line-custom] plugin registered with custom webhook handler");
	},
};

export default plugin;
