import type { Events } from '$lib/sse-events';
import * as devalue from 'devalue';

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

export function broadcastEvent<T extends keyof Events>(event: T, data: Events[T]) {
	const payload = `event: ${event}\ndata: ${devalue.stringify(data)}\n\n`;

	for (const subsciber of subscribers.values()) {
		safeEnqueue(subsciber, payload);
	}
}

// Send a lightweight ping to keep connections alive when idle
setInterval(() => broadcastEvent('ping', 'ping'), 2_000);

function safeEnqueue(subsciber: Subscriber, payload: string) {
	try {
		subsciber.controller.enqueue(payload);
	} catch (err) {
		console.error('Failed to enqueue to subscriber', err);
		// remove subscriber on error
		subscribers.delete(subsciber.id);
	}
}
