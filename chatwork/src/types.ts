import type { PluginRuntime } from "openclaw/plugin-sdk";

export interface ChatworkAccount {
	accountId: string;
	enabled: boolean;
	apiToken?: string;
	webhookSecret?: string;
	webhookPath?: string;
	rooms?: Record<string, ChatworkRoomConfig>;
	config: Record<string, unknown>;
}

export interface ChatworkRoomConfig {
	allow?: boolean;
	requireMention?: boolean;
}

export interface WebhookTarget {
	accountId: string;
	apiToken: string;
	webhookSecret?: string;
	rooms?: Record<string, ChatworkRoomConfig>;
	path: string;
	config: any;
	runtime: any;
	statusSink?: (patch: StatusPatch) => void;
	botAccountId?: number;
}

export interface StatusPatch {
	lastInboundAt?: number;
	lastOutboundAt?: number;
}

export interface ChatworkEvent {
	webhook_event_type: string;
	webhook_event: {
		room_id: number;
		account_id: number;
		message_id: string;
		body: string;
		send_time?: number;
	};
}

export type { PluginRuntime };
