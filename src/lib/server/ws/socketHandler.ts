import { config } from '$lib/config';
import { schemaClientMessage, type ClientMessage } from '$lib/ws-events';
import type { Peer } from '@sveltejs/kit';
import * as devalue from 'devalue';
import { Readable } from 'node:stream';
import { loadEventsAfter } from '../events';

type Event = {
	id?: number;
	type: string;
	data: string;
};

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
		// TODO: how to handle validation errors?
		const clientMessage = schemaClientMessage.parse(devalue.parse(message));
		this.#log(`received client message of type ${clientMessage.type}:`, clientMessage);

		switch (clientMessage.type) {
			case 'replay': {
				await this.#handleReplay(peer, clientMessage);
				break;
			}
			case 'messageSent': {
				break;
			}
			default: {
				const _exhaustiveCheck: never = clientMessage;
				throw new Error(`unknown client message type: ${(clientMessage as ClientMessage).type}`);
			}
		}
	}

	async #handleReplay(peer: Peer, message: Extract<ClientMessage, { type: 'replay' }>) {
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
