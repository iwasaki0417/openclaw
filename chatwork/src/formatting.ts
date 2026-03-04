/**
 * Markdown → Chatwork native formatting converter.
 *
 * Chatwork tags: [info], [title], [/info], [code], [/code], [hr]
 * ref: https://qiita.com/m6mmsf/items/8b2b6ccd1526301dc6dd
 */
export function markdownToChatwork(text: string): string {
	let result = text;

	result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
		`[code]${code.trimEnd()}[/code]`,
	);

	result = result.replace(
		/^(\|.+\|)\n\|[-:\s|]+\|\n((?:\|.+\|\n?)*)/gm,
		(_m, header: string, body: string) => {
			const hCols = header.split("|").filter((c: string) => c.trim()).map((c: string) => c.trim());
			const rows = body.trim().split("\n").map((r: string) =>
				r.split("|").filter((c: string) => c.trim()).map((c: string) => c.trim()),
			);
			let table = `[info]${hCols.join(" ｜ ")}\n`;
			for (const row of rows) {
				table += `${row.join(" ｜ ")}\n`;
			}
			return table.trimEnd() + "\n[/info]";
		},
	);

	result = result.replace(
		/^##\s+(.+)\n([\s\S]*?)(?=^##\s|\n$|$)/gm,
		(_m, title: string, body: string) => {
			const cleaned = body.trim();
			if (!cleaned) return `■ ${title}\n`;
			return `[info][title]${title}[/title]\n${cleaned}\n[/info]\n`;
		},
	);
	result = result.replace(/^###\s+(.+)$/gm, "■ $1");
	result = result.replace(/^#\s+(.+)$/gm, "【$1】");

	result = result.replace(/`([^`]+)`/g, " $1 ");
	result = result.replace(/\*\*(.+?)\*\*/g, "【$1】");
	result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1");
	result = result.replace(/__(.+?)__/g, "$1");
	result = result.replace(/~~(.+?)~~/g, "$1");
	result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
	result = result.replace(/^>\s?(.*)$/gm, "＞$1");
	result = result.replace(/^---+$/gm, "[hr]");
	result = result.replace(/^\s*[-*+]\s/gm, "・");
	result = result.replace(/^\s*(\d+)\.\s/gm, "$1. ");

	result = result.replace(/\n{3,}/g, "\n\n");

	return result.trim();
}
