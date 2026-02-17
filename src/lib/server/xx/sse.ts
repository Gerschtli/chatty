import type { Events } from '$lib/sse-events';
import * as devalue from 'devalue';
import { markEventAsPublished } from './events';
import { addClient } from './registry';

type Subscriber = {
	controller: ReadableStreamDefaultController<string>;
	id: string;
	userId: string;
	lastEventId: number;
};

const subscribers = new Map<string, Subscriber>();
let nextSubscriberId = 0;

export function subscribe(userId: string, lastEventId: number) {
	const id = String(++nextSubscriberId);

	const stream = new ReadableStream<string>({
		start(controller) {
			subscribers.set(id, { controller, id, userId, lastEventId });
			addClient(userId, { controller });
			// Send a comment to establish the stream
			controller.enqueue(': connected\n\n');

			// heartbeat
			const heartbeat = setInterval(() => {
				controller.enqueue(encoder.encode(':keepalive\n\n'));
			}, 15000);

			request.signal.addEventListener('abort', () => {
				clearInterval(heartbeat);
				removeClient(userId, client);
			});
		},
		cancel() {
			subscribers.delete(id);
		}
	});

	return { id, stream };
}

export function broadcastEvent<T extends keyof Events>(
	eventId: number,
	userId: string,
	event: T,
	data: Events[T]
) {
	const payload = `event: ${event}\ndata: ${devalue.stringify(data)}\n\n`;

	let sentToAtLeastOne = false;

	for (const subscriber of subscribers.values()) {
		// Only send to subscribers of this user
		if (subscriber.userId !== userId) continue;

		// Only send to subscribers who haven't seen this event yet
		if (subscriber.lastEventId >= eventId) continue;

		safeEnqueue(subscriber, eventId, payload);
		sentToAtLeastOne = true;
	}

	// Mark as published if we sent to at least one subscriber
	// This is best-effort - in production you might want more sophisticated tracking
	if (sentToAtLeastOne) {
		markEventAsPublished(eventId).catch((err) => {
			console.error('Failed to mark event as published:', err);
		});
	}
}

// Send a lightweight ping to keep connections alive when idle
setInterval(() => {
	const payload = `event: ping\ndata: "ping"\n\n`;

	for (const subscriber of subscribers.values()) {
		safeEnqueue(subscriber, -1, payload);
	}
}, 2_000);

function safeEnqueue(subscriber: Subscriber, eventId: number, payload: string) {
	try {
		subscriber.lastEventId = Math.max(subscriber.lastEventId, eventId);
		subscriber.controller.enqueue(`id: ${subscriber.lastEventId}\n${payload}`);
	} catch (err) {
		console.error('Failed to enqueue to subscriber', err);
		// remove subscriber on error
		subscribers.delete(subscriber.id);
	}
}
