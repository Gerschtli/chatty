import { config } from '$lib/config';
import { Readable } from 'node:stream';

type Event = {
	id?: string | number;
	type: string;
	data: string;
};

let nextSubscriberId = 1;

export class Subscriber {
	readonly id: string;

	#intervalPing: NodeJS.Timeout | undefined;
	#stream: Readable;

	#closeHandlers: (() => void)[] = [];
	#initialEvents: Event[] = [];

	constructor(readonly userId: string) {
		this.id = (nextSubscriberId++).toString().padStart(4, '0');
		this.#stream = new Readable({
			objectMode: true,
			read() {},
		});
	}

	onClose(handler: () => void) {
		this.#closeHandlers.push(handler);
	}

	setInitialEvents(initialEvents: Event[]) {
		this.#initialEvents = initialEvents;
	}

	push(event: Event) {
		this.#stream.push(event);
	}

	buildWebStream() {
		return new ReadableStream<string>({
			start: (controller) => this.#startWebStream(controller),
			cancel: (reason: unknown) => this.#close('cancel', reason),
		});
	}

	async #startWebStream(controller: ReadableStreamDefaultController<string>) {
		try {
			this.#log(`running start for subscriber`);
			controller.enqueue(
				`: connected\nretry: ${config.server.clientReconnectRetryIntervalsMs}\n\n`,
			);

			this.#intervalPing = setInterval(
				() => controller.enqueue(this.#convertEventToPayload({ type: 'ping', data: '' })),
				config.server.pingSendingIntervalMs,
			);

			this.#log('sending initial events...');
			for (const event of this.#initialEvents) {
				this.#log('sending previous event', event.id);
				controller.enqueue(this.#convertEventToPayload(event));
			}

			this.#log('waiting for live events...');
			for await (const event of this.#stream) {
				this.#log('forwarding live event', event.id);
				controller.enqueue(this.#convertEventToPayload(event as Event));
			}
		} catch (e) {
			controller.close();
			this.#close('error', e);
		}
	}

	#close(type: 'error' | 'cancel', reason: unknown) {
		this.#log(`closing because of ${type}: ${reason}`);

		clearInterval(this.#intervalPing);

		this.#stream.destroy();

		for (const closeHandler of this.#closeHandlers) {
			closeHandler();
		}
	}

	#convertEventToPayload(event: Event) {
		return `${event.id ? `id: ${event.id}\n` : ''}event: ${event.type}\ndata: ${event.data}\n\n`;
	}

	#log(...args: unknown[]) {
		console.log(`[Subscriber ${this.id}]`, ...args);
	}
}
