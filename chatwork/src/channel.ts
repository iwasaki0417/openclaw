import type { ChatworkAccount } from "./types.js";
import { ChatworkAPI } from "./chatwork-api.js";
import { registerChatworkWebhookTarget } from "./webhook.js";

function resolveChatworkAccount(cfg: any, accountId?: string): ChatworkAccount {
	const section = cfg.channels?.chatwork;
	if (!section) {
		return { accountId: accountId ?? "default", enabled: false, config: {} };
	}

	const acct = section.accounts?.[accountId ?? "default"];
	const merged = acct ?? section;

	return {
		accountId: accountId ?? "default",
		enabled: merged.enabled ?? section.enabled ?? false,
		apiToken: merged.apiToken ?? section.apiToken,
		webhookSecret: merged.webhookSecret ?? section.webhookSecret,
		webhookPath: merged.webhookPath ?? section.webhookPath ?? "/chatwork/webhook",
		rooms: merged.rooms ?? section.rooms,
		config: merged,
	};
}

export const chatworkPlugin = {
	id: "chatwork",

	meta: {
		id: "chatwork",
		label: "Chatwork",
		selectionLabel: "Chatwork (Webhook + REST API)",
		docsPath: "/channels/chatwork",
		blurb: "Chatwork messaging via Webhook receiver and REST API.",
		aliases: ["cw"],
	},

	capabilities: {
		chatTypes: ["direct", "channel"] as const,
		reactions: false,
		threads: true,
		media: false,
		nativeCommands: false,
	},

	reload: { configPrefixes: ["channels.chatwork"] },

	config: {
		listAccountIds: (cfg: any): string[] => {
			const accounts = cfg.channels?.chatwork?.accounts;
			return accounts ? Object.keys(accounts) : ["default"];
		},
		resolveAccount: (cfg: any, accountId?: string) =>
			resolveChatworkAccount(cfg, accountId),
		defaultAccountId: () => "default",
		isConfigured: (account: ChatworkAccount) => Boolean(account.apiToken),
		describeAccount: (account: ChatworkAccount) => ({
			accountId: account.accountId,
			enabled: account.enabled,
			configured: Boolean(account.apiToken),
			hasWebhookSecret: Boolean(account.webhookSecret),
		}),
		setAccountEnabled: ({ cfg, accountId, enabled }: any) => {
			const id = accountId ?? "default";
			const base = cfg.channels?.chatwork ?? {};
			if (id === "default") {
				return { ...cfg, channels: { ...cfg.channels, chatwork: { ...base, enabled } } };
			}
			return {
				...cfg,
				channels: {
					...cfg.channels,
					chatwork: {
						...base,
						accounts: { ...base.accounts, [id]: { ...base.accounts?.[id], enabled } },
					},
				},
			};
		},
		deleteAccount: ({ cfg, accountId }: any) => {
			const next = { ...cfg };
			if (accountId === "default" || !accountId) {
				delete next.channels?.chatwork;
			} else {
				delete next.channels?.chatwork?.accounts?.[accountId];
			}
			return next;
		},
	},

	security: {
		resolveDmPolicy: () => ({
			policy: "open" as const,
			allowFrom: ["*"],
			allowFromPath: "channels.chatwork.allowFrom",
		}),
	},

	groups: {
		resolveRequireMention: ({ cfg, groupId }: { cfg: any; groupId: string }) => {
			return cfg.channels?.chatwork?.rooms?.[groupId]?.requireMention ?? true;
		},
	},

	threading: {
		resolveReplyToMode: () => "thread",
		allowExplicitReplyTagsWhenOff: false,
	},

	messaging: {
		normalizeTarget: (target: string) => ({
			target: target.replace(/^(chatwork|cw|room):/i, "").trim(),
		}),
		targetResolver: {
			looksLikeId: (id: string) => /^\d+$/.test(id),
			hint: "<roomId>",
		},
	},

	outbound: {
		deliveryMode: "direct" as const,
		chunker: null,
		textChunkLimit: 5000,
		sendText: async ({ to, text, cfg, accountId }: any) => {
			const account = resolveChatworkAccount(cfg, accountId);
			if (!account.apiToken) return { ok: false, error: "missing apiToken" };
			const api = new ChatworkAPI(account.apiToken);
			const result = await api.sendMessage(to, text);
			return { channel: "chatwork", ...result };
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
		probeAccount: async ({ account }: { account: ChatworkAccount }) => {
			if (!account.apiToken) return { ok: false, error: "missing apiToken" };
			try {
				const api = new ChatworkAPI(account.apiToken);
				const me = await api.getMe();
				return { ok: true, info: { name: me.name, id: me.account_id } };
			} catch (err) {
				return { ok: false, error: String(err) };
			}
		},
		buildAccountSnapshot: ({ account, runtime, probe }: any) => ({
			accountId: account.accountId,
			enabled: account.enabled,
			configured: Boolean(account.apiToken),
			running: runtime?.running ?? false,
			lastStartAt: runtime?.lastStartAt ?? null,
			lastStopAt: runtime?.lastStopAt ?? null,
			lastError: runtime?.lastError ?? null,
			probe,
		}),
	},

	gateway: {
		startAccount: async (ctx: any) => {
			const account = resolveChatworkAccount(ctx.cfg, ctx.account?.accountId);
			const webhookPath = account.webhookPath ?? "/chatwork/webhook";

			let botAccountId: number | undefined;
			if (account.apiToken) {
				try {
					const api = new ChatworkAPI(account.apiToken);
					const me = await api.getMe();
					botAccountId = me.account_id;
					ctx.log?.info?.(`[chatwork:${account.accountId}] bot=${me.name} (${botAccountId})`);
				} catch (err) {
					ctx.log?.warn?.(`[chatwork:${account.accountId}] getMe failed: ${err}`);
				}
			}

			ctx.log?.info?.(`[chatwork:${account.accountId}] webhook at ${webhookPath}`);

			const unregister = registerChatworkWebhookTarget({
				accountId: account.accountId,
				apiToken: account.apiToken ?? "",
				webhookSecret: account.webhookSecret,
				rooms: account.rooms,
				path: webhookPath,
				config: ctx.cfg,
				runtime: ctx.runtime,
				statusSink: (patch) => ctx.setStatus?.({ accountId: account.accountId, ...patch }),
				botAccountId,
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
			return input.apiToken ? null : "Chatwork requires --api-token.";
		},
		applyAccountConfig: ({ cfg, accountId, input }: any) => {
			const tokenPatch = input.apiToken ? { apiToken: input.apiToken } : {};
			const secretPatch = input.webhookSecret ? { webhookSecret: input.webhookSecret } : {};

			if (accountId === "default" || !accountId) {
				return {
					...cfg,
					channels: {
						...cfg.channels,
						chatwork: { ...cfg.channels?.chatwork, enabled: true, ...tokenPatch, ...secretPatch },
					},
				};
			}
			const base = cfg.channels?.chatwork ?? {};
			return {
				...cfg,
				channels: {
					...cfg.channels,
					chatwork: {
						...base,
						enabled: true,
						accounts: {
							...base.accounts,
							[accountId]: { ...base.accounts?.[accountId], enabled: true, ...tokenPatch, ...secretPatch },
						},
					},
				},
			};
		},
	},
};
