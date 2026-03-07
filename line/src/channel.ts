import type { LineAccount } from "./types.js";
import { LineAPI } from "./line-api.js";
import { registerLineWebhookTarget } from "./webhook.js";
import { chunkText } from "./formatting.js";

function resolveLineAccount(cfg: any, accountId?: string): LineAccount {
	const section = cfg.channels?.line;
	if (!section) {
		return { accountId: accountId ?? "default", enabled: false, config: {} };
	}

	return {
		accountId: accountId ?? "default",
		enabled: true,
		channelAccessToken: section.channelAccessToken,
		channelSecret: section.channelSecret,
		webhookPath: "/line/webhook",
		allowFrom: section.allowFrom,
		dmPolicy: section.dmPolicy ?? "allowlist",
		groupPolicy: section.groupPolicy ?? "disabled",
		config: section,
	};
}

export const lineCustomPlugin = {
	id: "line-custom",

	meta: {
		id: "line-custom",
		label: "LINE (Custom)",
		selectionLabel: "LINE Messaging API (Custom Webhook)",
		docsPath: "/channels/line",
		blurb: "Custom LINE channel plugin using registerHttpHandler.",
		aliases: ["lc"],
	},

	capabilities: {
		chatTypes: ["direct", "channel"] as const,
		reactions: false,
		threads: false,
		media: false,
		nativeCommands: false,
	},

	reload: { configPrefixes: ["channels.line"] },

	config: {
		listAccountIds: (_cfg: any): string[] => ["default"],
		resolveAccount: (cfg: any, accountId?: string) =>
			resolveLineAccount(cfg, accountId),
		defaultAccountId: () => "default",
		isConfigured: (account: LineAccount) =>
			Boolean(account.channelAccessToken && account.channelSecret),
		describeAccount: (account: LineAccount) => ({
			accountId: account.accountId,
			enabled: account.enabled,
			configured: Boolean(account.channelAccessToken && account.channelSecret),
		}),
		setAccountEnabled: ({ cfg, enabled }: any) => {
			const base = cfg.channels?.line ?? {};
			return {
				...cfg,
				channels: {
					...cfg.channels,
					line: { ...base, enabled },
				},
			};
		},
		deleteAccount: ({ cfg }: any) => {
			const next = { ...cfg };
			delete next.channels?.line;
			return next;
		},
	},

	security: {
		resolveDmPolicy: (args: { cfg: any }) => {
			const section = args.cfg.channels?.line;
			const allowFrom = section?.allowFrom ?? [];
			return {
				policy: (section?.dmPolicy ?? "allowlist") as "allowlist" | "open",
				allowFrom,
				allowFromPath: "channels.line.allowFrom",
			};
		},
	},

	groups: {
		resolveRequireMention: () => true,
	},

	messaging: {
		normalizeTarget: (target: string) => ({
			target: target.replace(/^(line-custom|line|lc):/i, "").trim(),
		}),
		targetResolver: {
			looksLikeId: (id: string) => /^U[0-9a-f]{32}$/.test(id) || /^C[0-9a-f]{32}$/.test(id),
			hint: "<userId or groupId>",
		},
	},

	outbound: {
		deliveryMode: "direct" as const,
		chunker: null,
		textChunkLimit: 5000,
		sendText: async ({ to, text, cfg, accountId }: any) => {
			const account = resolveLineAccount(cfg, accountId);
			if (!account.channelAccessToken) return { ok: false, error: "missing channelAccessToken" };
			const api = new LineAPI(account.channelAccessToken);
			const chunks = chunkText(text);
			for (const chunk of chunks) {
				const result = await api.pushMessage(to, [{ type: "text", text: chunk }]);
				if (!result.ok) return { channel: "line", ...result };
			}
			return { channel: "line", ok: true };
		},
	},

	status: {
		defaultRuntime: {
			accountId: "default",
			running: false,
			lastStartAt: null,
			lastStopAt: null,
			lastError: null,
		},
		probeAccount: async ({ account }: { account: LineAccount }) => {
			if (!account.channelAccessToken) return { ok: false, error: "missing channelAccessToken" };
			try {
				const api = new LineAPI(account.channelAccessToken);
				const info = await api.getBotInfo();
				return { ok: true, info: { name: info.displayName, id: info.userId } };
			} catch (err) {
				return { ok: false, error: String(err) };
			}
		},
		buildAccountSnapshot: ({ account, runtime, probe }: any) => ({
			accountId: account.accountId,
			enabled: account.enabled,
			configured: Boolean(account.channelAccessToken && account.channelSecret),
			running: runtime?.running ?? false,
			lastStartAt: runtime?.lastStartAt ?? null,
			lastStopAt: runtime?.lastStopAt ?? null,
			lastError: runtime?.lastError ?? null,
			probe,
		}),
	},

	gateway: {
		startAccount: async (ctx: any) => {
			const account = resolveLineAccount(ctx.cfg, ctx.account?.accountId);
			const webhookPath = account.webhookPath ?? "/line-custom/webhook";

			if (!account.channelAccessToken || !account.channelSecret) {
				ctx.log?.error?.("[line-custom] missing channelAccessToken or channelSecret");
				return;
			}

			let botName = "LINE Bot";
			try {
				const api = new LineAPI(account.channelAccessToken);
				const info = await api.getBotInfo();
				botName = info.displayName;
				ctx.log?.info?.(`[line-custom] bot=${info.displayName} (${info.userId})`);
			} catch (err) {
				ctx.log?.warn?.(`[line-custom] getBotInfo failed: ${err}`);
			}

			ctx.log?.info?.(`[line-custom] webhook at ${webhookPath} (${botName})`);

			const unregister = registerLineWebhookTarget({
				accountId: account.accountId,
				channelAccessToken: account.channelAccessToken,
				channelSecret: account.channelSecret,
				allowFrom: account.allowFrom,
				path: webhookPath,
				config: ctx.cfg,
				runtime: ctx.runtime,
				statusSink: (patch) => ctx.setStatus?.({ accountId: account.accountId, ...patch }),
			});

			await new Promise<void>((resolve) => {
				ctx.abortSignal?.addEventListener("abort", () => {
					unregister();
					resolve();
				}, { once: true });
			});
		},
	},

	setup: {
		resolveAccountId: ({ accountId }: { accountId?: string }) => accountId ?? "default",
		validateInput: ({ input }: { input: any }) => {
			if (!input.channelAccessToken) return "LINE requires --channel-access-token.";
			if (!input.channelSecret) return "LINE requires --channel-secret.";
			return null;
		},
		applyAccountConfig: ({ cfg, input }: any) => {
			const tokenPatch = input.channelAccessToken ? { channelAccessToken: input.channelAccessToken } : {};
			const secretPatch = input.channelSecret ? { channelSecret: input.channelSecret } : {};
			return {
				...cfg,
				channels: {
					...cfg.channels,
					line: { ...cfg.channels?.line, enabled: true, ...tokenPatch, ...secretPatch },
				},
			};
		},
	},
};
