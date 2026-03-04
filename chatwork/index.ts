import { chatworkPlugin } from "./src/channel.js";
import { handleChatworkWebhookRequest } from "./src/webhook.js";
import { setChatworkRuntime } from "./src/runtime.js";

export const id = "chatwork";
export const name = "Chatwork Channel";

export default function register(api: any) {
	setChatworkRuntime(api.runtime);
	api.registerChannel({ plugin: chatworkPlugin });
	api.registerHttpHandler(handleChatworkWebhookRequest);
	api.logger?.info?.("[chatwork] plugin registered");
}
