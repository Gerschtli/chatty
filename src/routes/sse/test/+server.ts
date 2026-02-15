import { Readable } from 'node:stream';

type Subscriber = {
	controller: ReadableStreamDefaultController<string>;
	stream: Readable;
	id: string;
};

type Event = {
	id?: number;
	type: string;
	data: string;
};

const subscribers = new Map<string, Subscriber>();
let nextId = 0;

export async function GET() {
	const id = String(++nextId);

	let intervalLive: NodeJS.Timeout | undefined = undefined;
	let intervalPing: NodeJS.Timeout | undefined = undefined;

	const stream = new Readable({
		objectMode: true,
		read() {}
	});

	function close(type: 'error' | 'cancel', reason: unknown) {
		console.log(`closing because of ${type}: ${reason}`);
		clearInterval(intervalLive);
		clearInterval(intervalPing);
		subscribers.get(id)?.controller.close();
		subscribers.delete(id);
		stream.destroy();
	}

	function safeEnqueue(controller: ReadableStreamDefaultController<string>, event: Event) {
		const payload = `${event.id ? `id: ${event.id}\n` : ''}event: ${event.type}\ndata: ${event.data}\n\n`;

		console.log(`enqueueing event ${event.id} to subscriber ${id}`);
		controller.enqueue(payload);
	}

	let intervalEventId = 3;
	intervalLive = setInterval(() => {
		const eventId = ++intervalEventId;
		stream.push({ id: eventId, type: 'live', data: `live${eventId - 3}` });

		if (eventId > 6) clearInterval(intervalLive);
	}, 500);

	const previousEvents = [
		{ id: 1, type: 'previous', data: 'prev1' },
		{ id: 2, type: 'previous', data: 'prev2' },
		{ id: 3, type: 'previous', data: 'prev3' }
	];

	const streamWeb = new ReadableStream<string>({
		async start(controller) {
			try {
				console.log(`running start for subscriber ${id}`);
				const subscriber = { controller, id, stream };
				subscribers.set(id, subscriber);

				controller.enqueue(': connected\n\n');

				console.log('start ping');

				intervalPing = setInterval(
					() => safeEnqueue(controller, { type: 'ping', data: '' }),
					3_000
				);

				console.log('wait [load previous events]');
				await sleep(1000);

				for (const event of previousEvents) {
					console.log('sending previous event');
					safeEnqueue(controller, event);
					await sleep(200);
				}

				console.log('waiting for live events...');
				for await (const event of stream) {
					console.log('forwarding live event');
					safeEnqueue(controller, event as Event);
				}
			} catch (e) {
				close('error', e);
			}
		},
		cancel(reason: unknown) {
			close('cancel', reason);
		}
	});

	return new Response(streamWeb.pipeThrough(new TextEncoderStream()), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}

async function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

function broadcastEvent(event: Event) {
	console.log('broadcasting', event);
	for (const subsciber of subscribers.values()) {
		subsciber.stream.push(event);
	}
}
