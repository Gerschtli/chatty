import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

export async function load() {
	const user = requireLogin();

	const messages = await db.query.message.findMany({
		orderBy: (message, { asc }) => [asc(message.createdAt)],
		with: {
			user: {
				columns: { username: true },
			},
		},
	});

	return { messages, userId: user.id };
}

export const actions = {
	sendMessage: async ({ request }) => {
		const user = requireLogin();

		const formData = await request.formData();
		const content = formData.get('content') as string;

		if (!content) error(400, 'Message content cannot be empty');

		const message = {
			id: randomUUID(),
			chatId: 1,
			userId: user.id,
			content,
			createdAt: new Date(),
		};
		await db.insert(table.message).values(message);

		//broadcastEvent('message', { ...message, user: { username: user.username } });
	},
};
function requireLogin() {
	const { locals } = getRequestEvent();

	if (!locals.user) redirect(302, '/login');

	return locals.user;
}
