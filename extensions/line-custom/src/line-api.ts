const BASE_URL = "https://api.line.me/v2/bot";

export interface SendResult {
	ok: boolean;
	error?: string;
}

export class LineAPI {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	private async request<T>(method: string, path: string, body?: any): Promise<T> {
		const headers: Record<string, string> = {
			"Authorization": `Bearer ${this.token}`,
			"Content-Type": "application/json",
		};
		const opts: RequestInit = { method, headers };
		if (body) opts.body = JSON.stringify(body);

		const res = await fetch(`${BASE_URL}${path}`, opts);
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`LINE API ${res.status}: ${text}`);
		}
		const contentType = res.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			return res.json() as Promise<T>;
		}
		return {} as T;
	}

	async replyMessage(replyToken: string, messages: any[]): Promise<SendResult> {
		try {
			await this.request("POST", "/message/reply", { replyToken, messages });
			return { ok: true };
		} catch (err) {
			return { ok: false, error: String(err) };
		}
	}

	async pushMessage(to: string, messages: any[]): Promise<SendResult> {
		try {
			await this.request("POST", "/message/push", { to, messages });
			return { ok: true };
		} catch (err) {
			return { ok: false, error: String(err) };
		}
	}

	async getBotInfo(): Promise<{ userId: string; displayName: string }> {
		return this.request("GET", "/info");
	}

	async showLoadingAnimation(chatId: string): Promise<void> {
		try {
			await this.request("POST", "/chat/loading/start", { chatId });
		} catch {
			// best-effort
		}
	}
}
