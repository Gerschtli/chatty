import { requireLogin } from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getAllSubscribers } from '$lib/server/registry';
import type { Events } from '$lib/sse-events';
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
			broadcastEvent('error', 'error');

			return;
		}

		const message = {
			id: randomUUID(),
			userId: user.id,
			content,
			createdAt: new Date()
		};
		await db.insert(table.message).values(message);

		broadcastEvent('messageSent', { ...message, user: { username: user.username } });
	}
};

// TODO: replace with transactional outbox pattern and separate outbox handler job
function broadcastEvent<T extends keyof Events>(event: T, data: Events[T]) {
	for (const subscriber of getAllSubscribers()) {
		subscriber.push({ id: randomUUID(), type: event, data });
	}
}
