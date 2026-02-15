import * as devalue from 'devalue';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

export type Event = {
	id?: string;
	type: string;
	data: unknown;
};

export class Subscriber {
	static readonly PING_INTERVAL_MS = 3_000;

	readonly id: string;

	#intervalPing: NodeJS.Timeout | undefined;
	#stream: Readable;

	#closeHandlers: (() => void)[] = [];
	#initialEvents: Event[] = [];

	constructor(readonly userId: string) {
		this.id = randomUUID();
		this.#stream = new Readable({
			objectMode: true,
			read() {}
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
			start: async (controller) => {
				try {
					console.info(`running start for subscriber ${this.id}`);
					controller.enqueue(': connected\n\n');

					this.#intervalPing = setInterval(
						() => this.#enqueue(controller, { type: 'ping', data: undefined }),
						Subscriber.PING_INTERVAL_MS
					);

					console.debug('sending initial events...');
					for (const event of this.#initialEvents) {
						console.debug('sending previous event');
						this.#enqueue(controller, event);
					}

					console.debug('waiting for live events...');
					for await (const event of this.#stream) {
						console.debug('forwarding live event');
						this.#enqueue(controller, event as Event);
					}
				} catch (e) {
					controller.close();
					this.#close('error', e);
				}
			},
			cancel: (reason: unknown) => this.#close('cancel', reason)
		});
	}

	#close(type: 'error' | 'cancel', reason: unknown) {
		console.error(`closing because of ${type}: ${reason}`);

		clearInterval(this.#intervalPing);

		this.#stream.destroy();

		for (const closeHandler of this.#closeHandlers) {
			closeHandler();
		}
	}

	#enqueue(controller: ReadableStreamDefaultController<string>, event: Event) {
		const payload =
			(event.id ? `id: ${event.id}\n` : '') +
			`event: ${event.type}\n` +
			`data: ${devalue.stringify(event.data)}\n\n`;

		controller.enqueue(payload);
	}
}
