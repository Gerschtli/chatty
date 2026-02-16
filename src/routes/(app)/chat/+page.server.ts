import { requireLogin } from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { persistEvent } from '$lib/server/events';
import { error } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

export async function load() {
	const user = requireLogin();

	const messages = await db.query.message.findMany({
		orderBy: (message, { asc }) => [asc(message.createdAt)],
		with: {
			user: {
				columns: { username: true }
			}
		}
	});

	return { messages, userId: user.id };
}

export const actions = {
	sendMessage: async ({ request }) => {
		const user = requireLogin();

		const formData = await request.formData();
		const content = formData.get('content') as string;

		if (!content) error(400, 'Message content cannot be empty');

		if (content === 'error') {
			await persistEvent(user.id, 'error', 'error');

			return;
		}

		const message = {
			id: randomUUID(),
			userId: user.id,
			content,
			createdAt: new Date()
		};
		await db.insert(table.message).values(message);

		await persistEvent(user.id, 'messageSent', { ...message, user: { username: user.username } });
	}
};
