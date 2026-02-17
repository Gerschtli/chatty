import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { Events } from '$lib/sse-events';
import { error, redirect } from '@sveltejs/kit';
import * as devalue from 'devalue';
import { asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export async function load() {
	const user = requireLogin();

	const lastEventId = await getLastEventId(user.id);

	const messages = await db.query.message.findMany({
		orderBy: asc(table.message.createdAt),
		with: {
			user: {
				columns: { username: true }
			}
		}
	});

	return { messages, userId: user.id, lastEventId };
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

		await persistEvent(user.id, 'messageSent', {
			...message,
			user: { username: user.username }
		});
	}
};

async function getLastEventId(userId: string) {
	const result = await db.query.event.findFirst({
		where: eq(table.event.userId, userId),
		orderBy: desc(table.event.id),
		columns: { id: true }
	});

	return result?.id ?? -1;
}

async function persistEvent<T extends keyof Events>(userId: string, type: T, data: Events[T]) {
	const serializedData = devalue.stringify(data);
	const now = new Date();

	const [{ id: eventId }] = await db
		.insert(table.event)
		.values({
			userId,
			type,
			data: serializedData,
			createdAt: now
		})
		.returning({ id: table.event.id });

	await db.insert(table.outbox).values({
		eventId,
		published: false,
		createdAt: now
	});
}

function requireLogin() {
	const { locals } = getRequestEvent();

	if (!locals.user) redirect(302, '/demo/lucia/login');

	return locals.user;
}
