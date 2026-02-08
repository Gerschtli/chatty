import * as table from '$lib/server/db/schema';
import type { Events } from '$lib/sse-events';
import * as devalue from 'devalue';
import { db } from './db';

type Subscriber = {
	controller: ReadableStreamDefaultController<string>;
	id: string;
};

const subscribers = new Map<string, Subscriber>();
let nextId = 0;

export function subscribe() {
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

	return { id, stream };
}

export async function broadcastEvent<T extends keyof Events>(type: T, data: Events[T]) {
	const payload = `event: ${type}\ndata: ${devalue.stringify(data)}\n\n`;

	await db.insert(table.event).values({ type, payload });
}

function broadcastEventSimple(type: string, data: string, id?: number) {
	const payload = `${id ? `ìd: ${id}\n` : ''}event: ${type}\ndata: ${data}\n\n`;

	for (const subsciber of subscribers.values()) {
		safeEnqueue(subsciber, payload);
	}
}

// Send a lightweight ping to keep connections alive when idle
setInterval(() => sendPing(), 2_000);

function sendPing() {
	broadcastEventSimple(`ping`, devalue.stringify('ping'));
}

function safeEnqueue(subsciber: Subscriber, payload: string) {
	try {
		subsciber.controller.enqueue(payload);
	} catch (err) {
		console.error('Failed to enqueue to subscriber', err);
		// remove subscriber on error
		subscribers.delete(subsciber.id);
	}
}
