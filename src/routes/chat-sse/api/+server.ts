import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, gt } from 'drizzle-orm';

type SseEvent = {
	id: number;
	type: string;
	data: string;
};

let nextSubscriberId = 0;

class Client {
	id: number;
	controller: ReadableStreamDefaultController<SseEvent>;
	stream: ReadableStream<SseEvent>;

	constructor(private readonly userId: string) {
		this.id = nextSubscriberId++;

		let controller: ReadableStreamDefaultController<SseEvent> | undefined = undefined;
		this.stream = new ReadableStream<SseEvent>({
			start(controller1) {
				controller = controller1;
			}
		});

		if (!controller) throw new Error('controller not defined');
		this.controller = controller!;
	}
}

const connections = new Map<string, Map<number, Client>>();

export async function GET({ url, request, locals }) {
	if (!locals.user) redirect(302, '/demo/lucia/login');
	const userId = locals.user.id;

	const lastEventIdParam =
		request.headers.get('Last-Event-ID') ?? url.searchParams.get('lastEventId');
	const lastEventId = lastEventIdParam ? parseInt(lastEventIdParam, 10) : -1;

	const client = new Client(userId);

	if (!connections.has(userId)) connections.set(userId, new Map());
	connections.get(userId)!.set(client.id, client);

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();

			// setup ping — safely enqueue and clean up on failure
			const ping = setInterval(() => {
				try {
					controller.enqueue(encoder.encode('event: ping\ndata: ping\n\n'));
				} catch (err) {
					console.warn('ping enqueue failed, cleaning up', client, err);
					clearInterval(ping);
					connections.get(userId)?.delete(client.id);
					client.stream.cancel().catch(() => {});
				}
			}, 15000);

			const cleanup = () => {
				console.log('running cleanup for', client);
				clearInterval(ping);
				connections.get(userId)?.delete(client.id);
				client.stream.cancel().catch(() => {});
			};
			// unregister client on abort
			// stop ping on abort
			request.signal.addEventListener('abort', cleanup);

			// send missed events
			const missed = await getEventsAfter(userId, lastEventId);
			for (const { id, type, data } of missed) {
				const payload = `id: ${id}\nevent: ${type}\ndata: ${data}\n\n`;
				try {
					controller.enqueue(encoder.encode(payload));
				} catch (err) {
					console.warn('enqueue missed event failed, aborting', client, err);
					cleanup();
					return;
				}
			}

			// pass through live stream
			const reader = client.stream.getReader();

			try {
				while (true) {
					const { done, value } = await reader.read();

					if (done) {
						console.log('stream done', client);

						cleanup();
						controller.close();
						break;
					}

					const { id, type, data } = value;
					const payload = `id: ${id}\nevent: ${type}\ndata: ${data}\n\n`;
					controller.enqueue(encoder.encode(payload));
				}
			} catch (err) {
				console.log('stream error', client, err);
				controller.error(err);
			} finally {
				console.log('stream finally', client);
				cleanup();
				reader.releaseLock();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}

async function getEventsAfter(userId: string, afterEventId: number) {
	return await db.query.event.findMany({
		where: and(eq(table.event.userId, userId), gt(table.event.id, afterEventId)),
		orderBy: asc(table.event.id)
	});
}

function dispatchToUser(userId: string, event: SseEvent) {
	const clients = connections.get(userId);
	if (!clients || clients.size === 0) return;

	for (const client of clients.values()) {
		try {
			client.controller.enqueue(event);
		} catch {
			// broken connection
			clients.delete(client.id);
		}
	}
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

async function startOutboxWorker() {
	while (true) {
		try {
			const outbox = await db.query.outbox.findMany({
				where: eq(table.outbox.published, false),
				orderBy: asc(table.outbox.id),
				limit: 100,
				with: { event: true }
			});

			for (const { id, event } of outbox) {
				try {
					dispatchToUser(event.userId, {
						id: event.id,
						type: event.type,
						data: event.data
					});

					await db
						.update(table.outbox)
						.set({
							published: true
						})
						.where(eq(table.outbox.id, id));
				} catch (err) {
					console.error('dispatch failed', err);
				}
			}
		} catch (err) {
			console.error('outbox worker error', err);
		}

		await sleep(200);
	}
}

startOutboxWorker();
