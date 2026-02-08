import type { Events } from '$lib/sse-events';
import * as devalue from 'devalue';
import { asc, gt } from 'drizzle-orm';
import { db } from './db';
import * as table from './db/schema';

type Subscriber = {
	controller: ReadableStreamDefaultController<string>;
	id: string;
};

const subscribers = new Map<string, Subscriber>();
let nextId = 0;

export async function subscribe(lastEventId: string | null) {
	const id = String(++nextId);

	const stream = new ReadableStream<string>({
		start(controller) {
			subscribers.set(id, { controller, id });
			// Send a comment to establish the stream
			controller.enqueue(': connected\n\n');
		},
		cancel() {
			subscribers.delete(id);
		}
	});

	const { controller } = subscribers.get(id)!;

	while (true) {
		const events = await fetchAllEvents(lastEventId);

		if (events.length === 0) break;

		for (const { id, type, data } of events) {
			controller.enqueue(`id: ${id}\nevent: ${type}\ndata: ${data}\n\n`);
			lastEventId = `${id}`;
		}
	}

	return { id, stream };
}

async function fetchAllEvents(lastEventId: string | null) {
	if (!lastEventId) {
		return await db.select().from(table.event).orderBy(asc(table.event.id));
	}

	return await db
		.select()
		.from(table.event)
		.where(gt(table.event.id, lastEventId))
		.orderBy(asc(table.event.id));
}

export async function broadcastEvent<T extends keyof Events>(type: T, dataObject: Events[T]) {
	const data = devalue.stringify(dataObject);
	const [{ id }] = await db
		.insert(table.event)
		.values({ type, data })
		.returning({ id: table.event.id });

	const payload = `id: ${id}\nevent: ${type}\ndata: ${data}\n\n`;

	sendToAllSubscribers(payload);
}

// Send a lightweight ping to keep connections alive when idle
setInterval(() => sendPing(), 2_000);

function sendPing() {
	sendToAllSubscribers(`event: ping\ndata: ${devalue.stringify(null)}\n\n`);
}

function sendToAllSubscribers(payload: string) {
	for (const subscriber of subscribers.values()) {
		safeEnqueue(subscriber, payload);
	}
}

function safeEnqueue(subscriber: Subscriber, payload: string) {
	try {
		subscriber.controller.enqueue(payload);
	} catch (err) {
		console.error('Failed to enqueue to subscriber', err);
		subscriber.controller.close();
		// remove subscriber on error
		subscribers.delete(subscriber.id);
	}
}
