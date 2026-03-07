import type { PluginRuntime } from "openclaw/plugin-sdk";

export interface LineAccount {
	accountId: string;
	enabled: boolean;
	channelAccessToken?: string;
	channelSecret?: string;
	webhookPath?: string;
	allowFrom?: string[];
	dmPolicy?: string;
	groupPolicy?: string;
	config: Record<string, unknown>;
}

export interface WebhookTarget {
	accountId: string;
	channelAccessToken: string;
	channelSecret: string;
	allowFrom?: string[];
	path: string;
	config: any;
	runtime: any;
	statusSink?: (patch: StatusPatch) => void;
}

export interface StatusPatch {
	lastInboundAt?: number;
	lastOutboundAt?: number;
}

export interface LineWebhookBody {
	events: LineEvent[];
	destination?: string;
}

export interface LineEvent {
	type: string;
	replyToken?: string;
	timestamp: number;
	source: {
		type: string;
		userId?: string;
		groupId?: string;
		roomId?: string;
	};
	message?: {
		type: string;
		id: string;
		text?: string;
	};
}

export type { PluginRuntime };
