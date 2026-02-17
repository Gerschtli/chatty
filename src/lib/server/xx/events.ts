import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { Events } from '$lib/sse-events';
import * as devalue from 'devalue';
import { and, asc, desc, eq, gt } from 'drizzle-orm';

/**
 * Persists an event to the database with transactional outbox pattern.
 * This ensures exactly-once delivery semantics - the event is only stored once
 * the transaction succeeds.
 *
 * @param userId - The user ID for this event
 * @param type - The event type (key from Events)
 * @param data - The event data payload
 * @returns The created event with its ID
 */
export async function persistEvent<T extends keyof Events>(
	userId: string,
	type: T,
	data: Events[T]
): Promise<table.Event> {
	const now = new Date();
	const serializedData = devalue.stringify(data);

	const result = await db.transaction(async (tx) => {
		// Insert the event
		const insertedEvent = await tx
			.insert(table.event)
			.values({
				userId,
				type,
				data: serializedData,
				createdAt: now
			})
			.returning();

		const eventId = insertedEvent[0].id;

		// Insert the outbox entry to track that this event needs to be published
		await tx.insert(table.outbox).values({
			eventId,
			published: false,
			createdAt: now
		});

		return insertedEvent[0];
	});

	return result;
}

/**
 * Marks an outbox entry as published.
 * This is called after the event has been successfully broadcast to all subscribers.
 */
export async function markEventAsPublished(eventId: number): Promise<void> {
	await db.update(table.outbox).set({ published: true }).where(eq(table.outbox.eventId, eventId));
}

/**
 * Gets all unpublished events from the outbox.
 * These are events that need to be broadcast.
 */
export async function getUnpublishedEvents(): Promise<
	Array<{
		event: table.Event;
		outboxId: number;
	}>
> {
	const results = await db.query.outbox.findMany({
		where: (outbox, { eq }) => eq(outbox.published, false),
		with: {
			event: true
		}
	});

	return results.map((result) => ({
		event: result.event,
		outboxId: result.id
	}));
}

/**
 * Gets the last event ID for a user.
 * This is used by clients to request only events after this ID.
 */
export async function getLastEventId(userId: string) {
	const result = await db.query.event.findFirst({
		where: eq(table.event.userId, userId),
		orderBy: desc(table.event.id),
		columns: { id: true }
	});

	return result?.id ?? null;
}

/**
 * Gets events for a user after a specific event ID.
 * Used by clients to fetch events they may have missed.
 */
export async function getEventsAfter(userId: string, afterEventId: number) {
	return db.query.event.findMany({
		where: and(eq(table.event.userId, userId), gt(table.event.id, afterEventId)),
		orderBy: asc(table.event.id)
	});
}
