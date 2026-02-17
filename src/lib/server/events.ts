import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { Events } from '$lib/sse-events';
import * as devalue from 'devalue';
import { and, asc, desc, eq, gt, SQL } from 'drizzle-orm';

export async function getLastEventId(userId: string) {
	const lastEvent = await db.query.event.findFirst({
		where: eq(table.event.userId, userId),
		orderBy: desc(table.event.id),
		columns: { id: true }
	});

	return lastEvent?.id;
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
		orderBy: asc(table.event.id),
		columns: { id: true, type: true, data: true }
	});
}

export async function persistEventForUserList<T extends keyof Events>(
	userIds: string[],
	type: T,
	data: Events[T]
) {
	for (const userId of userIds) {
		await persistEvent(userId, type, data);
	}
}

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
