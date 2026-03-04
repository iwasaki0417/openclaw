import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createReplyPrefixOptions } from "openclaw/plugin-sdk";
import type { WebhookTarget, ChatworkEvent } from "./types.js";
import { getChatworkRuntime } from "./runtime.js";
import { ChatworkAPI } from "./chatwork-api.js";
import { markdownToChatwork } from "./formatting.js";
import { parseInboundMessage, isSelfMessage } from "./message.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HALOHIKO_ROOT = resolve(__dirname, "../..");
const RAG_SCRIPT = resolve(HALOHIKO_ROOT, "viora-rag-search-v2.mjs");
const RAG_TIMEOUT_MS = 10_000;
const RAG_LIMIT = 5;

interface RAGResult {
	question: string;
	answer: string;
	similarity: number;
	room_name: string;
	resolved: boolean;
}

function searchRAG(query: string): Promise<RAGResult[]> {
	return new Promise((resolve) => {
		const child = execFile(
			"node",
			[RAG_SCRIPT, "--text", query, "--limit", String(RAG_LIMIT), "--format", "json"],
			{ cwd: HALOHIKO_ROOT, timeout: RAG_TIMEOUT_MS, maxBuffer: 512 * 1024 },
			(err, stdout) => {
				if (err) {
					console.error("[chatwork/rag] search failed:", err.message);
					resolve([]);
					return;
				}
				try {
					resolve(JSON.parse(stdout));
				} catch {
					resolve([]);
				}
			},
		);
	});
}

function formatRAGContext(results: RAGResult[]): string {
	if (results.length === 0) return "";
	const lines = ["---", "参考情報（過去の類似Q&A）:"];
	for (const r of results) {
		const pct = (r.similarity * 100).toFixed(0);
		const mark = r.resolved ? "✅" : "";
		lines.push(`\n[${pct}%${mark}] Q: ${r.question}`);
		if (r.answer) lines.push(`A: ${r.answer}`);
	}
	return lines.join("\n");
}

const targets = new Map<string, WebhookTarget>();

export function registerChatworkWebhookTarget(target: WebhookTarget): () => void {
	targets.set(target.path, target);
	return () => { targets.delete(target.path); };
}

function resolveTarget(pathname: string): WebhookTarget | undefined {
	for (const [path, t] of targets) {
		if (pathname === path || pathname === path.replace(/\/+$/, "")) {
			return t;
		}
	}
	return undefined;
}

function verifySignature(body: string, tokenBase64: string, signature: string): boolean {
	try {
		const key = Buffer.from(tokenBase64, "base64");
		const expected = crypto.createHmac("sha256", key).update(body).digest("base64");
		return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
	} catch {
		return false;
	}
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
		req.on("error", reject);
	});
}

export async function handleChatworkWebhookRequest(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<boolean> {
	const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
	const target = resolveTarget(url.pathname.replace(/\/+$/, ""));
	if (!target) return false;

	if (req.method !== "POST") {
		res.writeHead(405, { "Content-Type": "text/plain" });
		res.end("Method Not Allowed");
		return true;
	}

	const rawBody = await readBody(req);

	if (target.webhookSecret) {
		const sig =
			String(req.headers["x-chatworkwebhooksignature"] ?? "") ||
			(url.searchParams.get("chatwork_webhook_signature") ?? "");
		if (!sig || !verifySignature(rawBody, target.webhookSecret, sig)) {
			res.writeHead(401, { "Content-Type": "text/plain" });
			res.end("Unauthorized");
			return true;
		}
	}

	let payload: ChatworkEvent;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		res.writeHead(400, { "Content-Type": "text/plain" });
		res.end("Bad Request");
		return true;
	}

	res.writeHead(200, { "Content-Type": "text/plain" });
	res.end("OK");

	if (payload.webhook_event_type === "message_created") {
		dispatchMessage(payload, target).catch((err) => {
			console.error("[chatwork] message handling error:", err);
		});
	}

	return true;
}

async function dispatchMessage(payload: ChatworkEvent, target: WebhookTarget) {
	const event = payload.webhook_event;
	const roomId = String(event.room_id);
	const senderId = String(event.account_id);
	const messageId = String(event.message_id);

	if (isSelfMessage(event.account_id, target.botAccountId)) return;
	if (target.rooms && !target.rooms[roomId]?.allow) return;

	target.statusSink?.({ lastInboundAt: Date.now() });

	const { cleanBody, wasMentioned } = parseInboundMessage(event.body ?? "", target.botAccountId);

	const requireMention = target.rooms?.[roomId]?.requireMention ?? true;
	if (requireMention && !wasMentioned) return;

	const ragResults = await searchRAG(cleanBody);
	const ragContext = formatRAGContext(ragResults);
	const enrichedBody = ragContext ? `${cleanBody}\n\n${ragContext}` : cleanBody;

	if (ragResults.length > 0) {
		console.log(`[chatwork/rag] ${ragResults.length} results for: ${cleanBody.substring(0, 60)}`);
	}

	const core = getChatworkRuntime();

	const route = core.channel.routing.resolveAgentRoute({
		cfg: target.config,
		channel: "chatwork",
		accountId: target.accountId,
		peer: { kind: "group", id: roomId },
	});

	const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(target.config);
	const body = core.channel.reply.formatAgentEnvelope({
		channel: "Chatwork",
		from: `user:${senderId}`,
		timestamp: event.send_time ? event.send_time * 1000 : undefined,
		envelope: envelopeOptions,
		body: enrichedBody,
	});

	const ctxPayload = core.channel.reply.finalizeInboundContext({
		Body: body,
		BodyForAgent: enrichedBody,
		RawBody: event.body ?? "",
		CommandBody: cleanBody,
		From: `chatwork:${senderId}`,
		To: `chatwork:${roomId}`,
		SessionKey: route.sessionKey,
		AccountId: target.accountId,
		ChatType: "channel",
		ConversationLabel: `room:${roomId}`,
		SenderId: senderId,
		Provider: "chatwork",
		Surface: "chatwork",
		MessageSid: messageId,
		MessageSidFull: messageId,
		ReplyToId: messageId,
		WasMentioned: wasMentioned,
		OriginatingChannel: "chatwork",
		OriginatingTo: `chatwork:${roomId}`,
	});

	const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
		cfg: target.config,
		agentId: route.agentId,
		channel: "chatwork",
		accountId: target.accountId,
	});

	const api = new ChatworkAPI(target.apiToken);

	await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
		ctx: ctxPayload,
		cfg: target.config,
		dispatcherOptions: {
			...prefixOptions,
			deliver: async (replyPayload: any) => {
				const text = markdownToChatwork(replyPayload?.text ?? "");
				if (!text.trim()) return;
				await api.sendMessage(roomId, text);
				target.statusSink?.({ lastOutboundAt: Date.now() });
			},
			onError: (err: any, info: any) => {
				console.error(`[chatwork] ${info?.kind ?? "reply"} error:`, err);
			},
		},
		replyOptions: { onModelSelected },
	});
}
