import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { createReplyPrefixOptions } from "openclaw/plugin-sdk";
import type { WebhookTarget, LineWebhookBody, LineEvent } from "./types.js";
import { getLineRuntime } from "./runtime.js";
import { LineAPI } from "./line-api.js";
import { chunkText } from "./formatting.js";

const targets = new Map<string, WebhookTarget>();

export function registerLineWebhookTarget(target: WebhookTarget): () => void {
	targets.set(target.path, target);
	return () => { targets.delete(target.path); };
}

function resolveTarget(pathname: string): WebhookTarget | undefined {
	const normalized = pathname.replace(/\/+$/, "");
	for (const [path, t] of targets) {
		if (normalized === path || normalized === path.replace(/\/+$/, "")) {
			return t;
		}
	}
	return undefined;
}

function verifySignature(body: string, secret: string, signature: string): boolean {
	try {
		const expected = crypto
			.createHmac("SHA256", secret)
			.update(body)
			.digest("base64");
		return crypto.timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expected),
		);
	} catch {
		return false;
	}
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		const MAX = 1024 * 1024;
		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX) { req.destroy(); reject(new Error("body too large")); return; }
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
		req.on("error", reject);
	});
}

export async function handleLineWebhookRequest(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<boolean> {
	const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
	const target = resolveTarget(url.pathname);
	if (!target) return false;

	if (req.method === "GET") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok" }));
		return true;
	}

	if (req.method !== "POST") {
		res.writeHead(405, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Method Not Allowed" }));
		return true;
	}

	try {
		const rawBody = await readBody(req);
		const signature = String(req.headers["x-line-signature"] ?? "");

		if (!signature) {
			let parsed: any;
			try { parsed = JSON.parse(rawBody); } catch { parsed = null; }
			if (parsed?.events && parsed.events.length === 0) {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ status: "ok" }));
				return true;
			}
			res.writeHead(400, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Missing X-Line-Signature" }));
			return true;
		}

		if (!verifySignature(rawBody, target.channelSecret, signature)) {
			console.error("[line-custom] signature verification failed");
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Invalid signature" }));
			return true;
		}

		const body: LineWebhookBody = JSON.parse(rawBody);

		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok" }));

		if (body.events && body.events.length > 0) {
			console.log(`[line-custom] received ${body.events.length} webhook event(s)`);
			for (const event of body.events) {
				dispatchEvent(event, target).catch((err) => {
					console.error("[line-custom] event handling error:", err);
				});
			}
		}
	} catch (err) {
		console.error("[line-custom] webhook error:", err);
		res.writeHead(500, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Internal error" }));
	}

	return true;
}

async function dispatchEvent(event: LineEvent, target: WebhookTarget) {
	if (event.type !== "message" || event.message?.type !== "text") return;

	const userId = event.source.userId;
	if (!userId) return;

	if (target.allowFrom && target.allowFrom.length > 0) {
		if (!target.allowFrom.includes(userId)) {
			console.log(`[line-custom] ignoring message from non-allowed user: ${userId}`);
			return;
		}
	}

	const isGroup = event.source.type === "group" || event.source.type === "room";
	const peerId = event.source.groupId ?? event.source.roomId ?? userId;
	const text = event.message!.text ?? "";

	target.statusSink?.({ lastInboundAt: Date.now() });

	const api = new LineAPI(target.channelAccessToken);
	if (!isGroup) {
		api.showLoadingAnimation(userId).catch(() => {});
	}

	console.log(`[line-custom] message from ${userId}: ${text.substring(0, 60)}`);

	const core = getLineRuntime();

	const route = core.channel.routing.resolveAgentRoute({
		cfg: target.config,
		channel: "line",
		accountId: target.accountId,
		peer: { kind: isGroup ? "group" : "dm", id: peerId },
	});

	const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(target.config);
	const body = core.channel.reply.formatAgentEnvelope({
		channel: "LINE",
		from: `user:${userId}`,
		timestamp: event.timestamp,
		envelope: envelopeOptions,
		body: text,
	});

	const ctxPayload = core.channel.reply.finalizeInboundContext({
		Body: body,
		BodyForAgent: text,
		RawBody: text,
		CommandBody: text,
		From: `line:${userId}`,
		To: `line:${peerId}`,
		SessionKey: route.sessionKey,
		AccountId: target.accountId,
		ChatType: isGroup ? "channel" : "direct",
		ConversationLabel: isGroup ? `group:${peerId}` : `dm:${userId}`,
		SenderId: userId,
		Provider: "line",
		Surface: "line",
		MessageSid: event.message!.id,
		MessageSidFull: event.message!.id,
		ReplyToId: event.message!.id,
		WasMentioned: true,
		OriginatingChannel: "line",
		OriginatingTo: `line:${peerId}`,
	});

	const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
		cfg: target.config,
		agentId: route.agentId,
		channel: "line",
		accountId: target.accountId,
	});

	let replyTokenUsed = false;

	await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
		ctx: ctxPayload,
		cfg: target.config,
		dispatcherOptions: {
			...prefixOptions,
			deliver: async (replyPayload: any) => {
				const replyText = replyPayload?.text ?? "";
				if (!replyText.trim()) return;

				const chunks = chunkText(replyText);

				if (!replyTokenUsed && event.replyToken) {
					const messages = chunks.slice(0, 5).map((c) => ({ type: "text" as const, text: c }));
					const result = await api.replyMessage(event.replyToken, messages);
					if (result.ok) {
						replyTokenUsed = true;
						target.statusSink?.({ lastOutboundAt: Date.now() });
						return;
					}
					console.log("[line-custom] reply token failed, falling back to push");
				}

				for (const chunk of chunks) {
					await api.pushMessage(peerId, [{ type: "text", text: chunk }]);
				}
				target.statusSink?.({ lastOutboundAt: Date.now() });
			},
			onError: (err: any, info: any) => {
				console.error(`[line-custom] ${info?.kind ?? "reply"} error:`, err);
			},
		},
		replyOptions: { onModelSelected },
	});
}
