import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { Events } from '$lib/sse-events';
import * as devalue from 'devalue';
import { desc, eq } from 'drizzle-orm';

export async function getLastEventId(userId: string) {
	return await db.query.event.findFirst({
		where: eq(table.event.userId, userId),
		orderBy: desc(table.event.id),
		columns: { id: true }
	});
}

// TODO: persist for all relevant users (e.g. all in chat room)
export async function persistEvent<T extends keyof Events>(
	userId: string,
	type: T,
	data: Events[T]
) {
	const [{ id: eventId }] = await db
		.insert(table.event)
		.values({
			userId,
			type,
			data: devalue.stringify(data),
			createdAt: new Date()
		})
		.returning({ id: table.event.id });

	await db.insert(table.outbox).values({
		eventId,
		createdAt: new Date()
	});
}
