const LINE_TEXT_LIMIT = 5000;

export function truncateForLine(text: string): string {
	if (text.length <= LINE_TEXT_LIMIT) return text;
	return text.slice(0, LINE_TEXT_LIMIT - 3) + "...";
}

export function chunkText(text: string, limit: number = LINE_TEXT_LIMIT): string[] {
	if (text.length <= limit) return [text];
	const chunks: string[] = [];
	let remaining = text;
	while (remaining.length > 0) {
		if (remaining.length <= limit) {
			chunks.push(remaining);
			break;
		}
		let splitAt = remaining.lastIndexOf("\n", limit);
		if (splitAt < limit * 0.3) splitAt = limit;
		chunks.push(remaining.slice(0, splitAt));
		remaining = remaining.slice(splitAt).trimStart();
	}
	return chunks;
}
