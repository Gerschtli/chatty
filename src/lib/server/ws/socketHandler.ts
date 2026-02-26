import { config } from '$lib/config';
import { clientMessages, type ClientMessages } from '$lib/ws-events';
import type { Peer } from '@sveltejs/kit';
import * as devalue from 'devalue';
import { Readable } from 'node:stream';
import { loadEventsAfter } from '../events';

type Event = {
	id?: number;
	type: string;
	data: string;
};

const regex = new RegExp(`^([A-Za-z]+)${config.ws.delimiter}(.+)$`);

let nextSocketHandlerId = 1;

export class SocketHandler {
	readonly id: string;

	#stream: Readable;

	constructor(readonly userId: string) {
		this.id = (nextSocketHandlerId++).toString().padStart(4, '0');
		this.#stream = new Readable({
			objectMode: true,
			read() {},
		});
	}

	onOpen(peer: Peer) {
		console.log(`[ws] opened connection with peer ${peer}`);
		// TODO: send initial message?
		// TODO: init ping pong
	}

	async onClientMessage(peer: Peer, message: string) {
		const match = message.match(regex);
		if (!match) {
			this.#log(`received malformed message:`, message);
			throw new Error(`malformed message: ${message}`);
		}

		const [_, type, dataRaw] = match;
		this.#log(`received client message of type ${type}:`, devalue.parse(dataRaw));

		// TODO: how to handle unknown types?
		if (!this.#isClientMessageType(type)) {
			throw new Error(`unknown type in client message: ${type}`);
		}

		// TODO: how to handle validation errors?
		switch (type) {
			case 'replay': {
				await this.#handleReplay(peer, clientMessages[type].parse(devalue.parse(dataRaw)));
				break;
			}
			case 'messageSent': {
				break;
			}
			default: {
				const _exhaustiveCheck: never = type;
				throw new Error(`unknown client message type: ${type}`);
			}
		}
	}

	async #handleReplay(peer: Peer, message: ClientMessages['replay']) {
		const events = await loadEventsAfter(this.userId, message.lastEventId ?? null);

		this.#log('sending initial events...');
		for (const event of events) {
			this.#log('sending previous event', event.id);
			peer.send(this.#convertEventToPayload(event));
		}

		this.#log('waiting for live events...');
		for await (const event of this.#stream) {
			this.#log('forwarding live event', event.id);
			peer.send(this.#convertEventToPayload(event as Event));
		}
	}

	#isClientMessageType(type: string): type is keyof typeof clientMessages {
		return type in clientMessages;
	}

	#convertEventToPayload(event: Event) {
		return [event.type, event.id, event.data].join(config.ws.delimiter);
	}

	push(event: Event) {
		this.#stream.push(event);
	}

	close() {
		this.#log(`closing`);
		this.#stream.destroy();
	}

	#log(...args: unknown[]) {
		console.log(`[SocketHandler ${this.id}]`, ...args);
	}
}
