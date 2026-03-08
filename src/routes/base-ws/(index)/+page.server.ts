import { buildChatSlug } from '$lib/chat';
import { requireLogin } from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

export async function load() {
	const user = requireLogin();

	const chats = await db.query.chat.findMany({
		with: {
			members: {
				where: eq(table.chatMember.userId, user.id),
			},
		},
	});

	return { chats };
}

export const actions = {
	createChat: async ({ request }) => {
		const user = requireLogin();

		const formData = await request.formData();
		const name = formData.get('name') as string;

		if (!name) error(400, 'Chat name cannot be empty');

		const [{ chatId }] = await db
			.insert(table.chat)
			.values({ name })
			.returning({ chatId: table.chat.id });

		await db.insert(table.chatMember).values({ chatId, userId: user.id });

		redirect(303, `/chat/${buildChatSlug({ id: chatId, name })}`);
	},

	joinChat: async ({ request }) => {
		const user = requireLogin();

		const formData = await request.formData();
		const chatId = parseInt(formData.get('chatId') as string);

		const chat = await db.query.chat.findFirst({
			where: eq(table.chat.id, chatId),
			columns: { name: true },
		});
		if (!chat) error(404, 'Chat not found');

		await db.insert(table.chatMember).values({ chatId, userId: user.id });

		redirect(303, `/chat/${buildChatSlug({ id: chatId, name: chat.name })}`);
	},

	leaveChat: async ({ request }) => {
		const user = requireLogin();

		const formData = await request.formData();
		const chatId = parseInt(formData.get('chatId') as string);

		await db
			.delete(table.chatMember)
			.where(and(eq(table.chatMember.chatId, chatId), eq(table.chatMember.userId, user.id)));

		redirect(303, '/');
	},
};
