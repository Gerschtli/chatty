import { extractChatId } from '$lib/chat';
import { requireLogin } from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getLastEventId, persistEventForUserList } from '$lib/server/events';
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export async function load({ params }) {
	const user = requireLogin();
	const chatId = extractChatId(params);

	const lastEventId = await getLastEventId(user.id);
	const chat = await db.query.chat.findFirst({
		where: eq(table.chat.id, chatId),
		columns: { id: true, name: true },
		with: {
			members: {
				columns: {},
				with: {
					user: {
						columns: { id: true, username: true },
					},
				},
			},
			messages: {
				columns: { id: true, chatId: true, userId: true, content: true, createdAt: true },
				orderBy: asc(table.message.createdAt),
				with: {
					user: {
						columns: { username: true },
					},
				},
			},
		},
	});

	if (!chat) error(404, 'Chat not found');

	return { chat, userId: user.id, lastEventId };
}

export const actions = {
	sendMessage: async ({ request, params }) => {
		const user = requireLogin();
		const chatId = extractChatId(params);

		const formData = await request.formData();
		const content = formData.get('content') as string;

		if (!content) error(400, 'Message content cannot be empty');

		const chat = await db.query.chat.findFirst({
			where: eq(table.chat.id, chatId),
			columns: {},
			with: {
				members: {
					columns: {},
					with: {
						user: {
							columns: { id: true },
						},
					},
				},
			},
		});

		if (!chat) error(404, 'Chat not found');

		if (content === 'error') {
			await persistEventForUserList(
				chat.members.map((m) => m.user.id),
				'customError',
				'error',
			);

			return;
		}

		const message = {
			id: randomUUID(),
			chatId,
			userId: user.id,
			content,
			createdAt: new Date(),
		};
		await db.insert(table.message).values(message);

		await persistEventForUserList(
			chat.members.map((m) => m.user.id),
			'messageSent',
			{ ...message, user: { username: user.username } },
		);
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
	},

	leaveChat: async ({ request }) => {
		const user = requireLogin();

		const formData = await request.formData();
		const chatId = parseInt(formData.get('chatId') as string);

		await db
			.delete(table.chatMember)
			.where(and(eq(table.chatMember.chatId, chatId), eq(table.chatMember.userId, user.id)));
	},
};
