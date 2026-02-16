import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { Events } from '$lib/sse-events';
import * as devalue from 'devalue';
import { and, desc, eq, gt, SQL } from 'drizzle-orm';

export async function getLastEventId(userId: string) {
	return await db.query.event.findFirst({
		where: eq(table.event.userId, userId),
		orderBy: desc(table.event.id),
		columns: { id: true }
	});
}

export async function loadEventsAfter(userId: string, lastEventId: string | null) {
	console.log('loading events after:', lastEventId);

	let where: SQL<unknown> | undefined = eq(table.event.userId, userId);
	if (lastEventId) {
		const lastEventIdNumber = parseInt(lastEventId);
		if (!isNaN(lastEventIdNumber)) {
			where = and(where, gt(table.event.id, lastEventIdNumber));
		}
	}

	return await db.query.event.findMany({
		where,
		orderBy: desc(table.event.id),
		columns: { id: true, type: true, data: true }
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
