/**
 * Chatwork message parsing: mention detection and body sanitisation.
 */

export interface ParsedMessage {
	cleanBody: string;
	wasMentioned: boolean;
}

const TO_TAG = /\[To:\d+\][^\n]*/g;
const RP_TAG = /\[rp[^\]]*\][^\n]*/g;
const REPLY_TAG = /\[返信[^\]]*\][^\n]*/g;

export function parseInboundMessage(rawBody: string, botAccountId?: number): ParsedMessage {
	const botId = botAccountId ? String(botAccountId) : "";

	const wasMentioned = botId
		? rawBody.includes(`[To:${botId}]`) || rawBody.includes(`aid=${botId}`)
		: false;

	const cleanBody = rawBody
		.replace(TO_TAG, "")
		.replace(RP_TAG, "")
		.replace(REPLY_TAG, "")
		.trim();

	return { cleanBody, wasMentioned };
}

export function isSelfMessage(senderAccountId: number | string, botAccountId?: number): boolean {
	if (!botAccountId) return false;
	return String(senderAccountId) === String(botAccountId);
}
