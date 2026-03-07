declare module "openclaw/plugin-sdk" {
	export interface PluginRuntime {
		channel: {
			routing: {
				resolveAgentRoute(args: {
					cfg: any;
					channel: string;
					accountId: string;
					peer: { kind: string; id: string };
				}): { agentId: string; sessionKey: string };
			};
			reply: {
				resolveEnvelopeFormatOptions(cfg: any): any;
				formatAgentEnvelope(args: {
					channel: string;
					from: string;
					timestamp?: number;
					envelope: any;
					body: string;
				}): string;
				finalizeInboundContext(ctx: Record<string, any>): any;
				dispatchReplyWithBufferedBlockDispatcher(args: {
					ctx: any;
					cfg: any;
					dispatcherOptions: {
						deliver: (payload: any) => Promise<void>;
						onError: (err: any, info: any) => void;
						[key: string]: any;
					};
					replyOptions: { onModelSelected?: any };
				}): Promise<{ queuedFinal?: boolean }>;
			};
		};
	}

	export function createReplyPrefixOptions(args: {
		cfg: any;
		agentId: string;
		channel: string;
		accountId: string;
	}): { onModelSelected?: any; [key: string]: any };
}
