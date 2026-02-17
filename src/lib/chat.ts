export function buildChatSlug(chat: { id: number; name: string }) {
	return `${chat.id}-${chat.name.toLowerCase().replace(/\s+/g, '-')}`;
}

export function extractChatId(params: { slug: string }) {
	return parseInt(params.slug.split('-')[0]);
}
