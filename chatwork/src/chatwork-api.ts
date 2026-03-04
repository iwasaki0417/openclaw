const BASE_URL = "https://api.chatwork.com/v2";

export interface ChatworkMessage {
	message_id: string;
	account: {
		account_id: number;
		name: string;
		avatar_image_url: string;
	};
	body: string;
	send_time: number;
	update_time: number;
}

export interface ChatworkRoom {
	room_id: number;
	name: string;
	type: string;
	role: string;
	icon_path: string;
}

export interface SendResult {
	ok: boolean;
	message_id?: string;
	error?: string;
}

export class ChatworkAPI {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	private async request<T>(
		method: string,
		path: string,
		body?: Record<string, string>,
	): Promise<T> {
		const headers: Record<string, string> = {
			"X-ChatWorkToken": this.token,
		};
		const opts: RequestInit = { method, headers };

		if (body) {
			headers["Content-Type"] = "application/x-www-form-urlencoded";
			opts.body = new URLSearchParams(body).toString();
		}

		const res = await fetch(`${BASE_URL}${path}`, opts);
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`Chatwork API ${res.status}: ${text}`);
		}
		return res.json() as Promise<T>;
	}

	async sendMessage(roomId: string, body: string): Promise<SendResult> {
		try {
			const data = await this.request<{ message_id: string }>(
				"POST",
				`/rooms/${roomId}/messages`,
				{ body },
			);
			return { ok: true, message_id: data.message_id };
		} catch (err) {
			return { ok: false, error: String(err) };
		}
	}

	async sendReply(
		roomId: string,
		body: string,
		replyToMessageId: string,
		replyToAccountId: string,
		replyToName: string,
	): Promise<SendResult> {
		const replyBody = `[rp aid=${replyToAccountId} to=${roomId}-${replyToMessageId}]${replyToName}\n${body}`;
		return this.sendMessage(roomId, replyBody);
	}

	async getMe(): Promise<{ account_id: number; name: string }> {
		return this.request("GET", "/me");
	}

	async getRooms(): Promise<ChatworkRoom[]> {
		return this.request("GET", "/rooms");
	}

	async getRoomMessages(
		roomId: string,
		force?: boolean,
	): Promise<ChatworkMessage[]> {
		const params = force ? "?force=1" : "";
		return this.request("GET", `/rooms/${roomId}/messages${params}`);
	}
}
