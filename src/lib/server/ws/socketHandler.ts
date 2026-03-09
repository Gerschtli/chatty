import {
	requestSchema,
	type Events,
	type Operations,
	type Request,
	type RequestError,
} from '$lib/ws-events';
import type { Peer } from '@sveltejs/kit';
import * as devalue from 'devalue';
import { Readable } from 'node:stream';
import { getAllSocketHandlers } from './registry';

type Event = {
	id?: number;
	type: string;
	data: string;
};

let nextSocketHandlerId = 1;

export class SocketHandler {
	readonly id: string;

	#stream: Readable;
	#peer: Peer | null = null;

	constructor(readonly userId: string) {
		this.id = (nextSocketHandlerId++).toString().padStart(4, '0');
		this.#stream = new Readable({
			objectMode: true,
			read() {},
		});
	}

	onOpen(peer: Peer) {
		this.#peer = peer;
		console.log(`[ws] opened connection with peer ${peer}`);
	}

	async onClientMessage(peer: Peer, message: string) {
		try {
			const data = requestSchema.parse(devalue.parse(message));
			this.#log(`received client message:`, data);

			if (data.type === 'request') {
				this.#handleRequest(peer, data);
			} else {
				this.#log('Unknown message type:', data.type);
			}
		} catch (e) {
			this.#log('Error parsing message:', e);
			this.#sendEvent(peer, 1, 'error', { code: 'PARSE_ERROR', message: 'Invalid message' });
		}
	}

	#handleRequest<T extends keyof Operations>(peer: Peer, request: Request<T>) {
		this.#log(`Handling request ${request.id}: ${request.method}`);

		switch (request.method) {
			case 'chat.sendMessage': {
				const { id: requestId, method, params } = request as Request<'chat.sendMessage'>;
				const serverId = Date.now().toString();
				this.#sendResponseSuccess(peer, requestId, method, { messageId: serverId });
				this.#broadcast(42, 'chat.messageSent', {
					id: serverId,
					chatId: params.chatId,
					userId: this.userId,
					user: { username: 'username' },
					content: params.content,
					createdAt: new Date(),
				});
				break;
			}
			default: {
				this.#sendResponseError(peer, request.id, request.method, {
					code: 'UNKNOWN_METHOD',
					message: `Unknown method: ${request.method}`,
				});
				break;
			}
		}
	}

	#sendEvent<T extends keyof Events>(peer: Peer, id: number, eventType: T, data: Events[T]) {
		peer.send(devalue.stringify({ type: 'event', id, eventType, data }));
	}

	#sendResponseSuccess<T extends keyof Operations>(
		peer: Peer,
		requestId: number,
		method: T,
		result: Operations[T]['response'],
	) {
		peer.send(devalue.stringify({ type: 'response', requestId, method, result }));
	}

	#sendResponseError<T extends keyof Operations>(
		peer: Peer,
		requestId: number,
		method: T,
		error: RequestError,
	) {
		peer.send(devalue.stringify({ type: 'response', requestId, method, error }));
	}

	#broadcast<T extends keyof Events>(id: number, eventType: T, data: Events[T]) {
		this.#log('Broadcasting:', eventType, data);

		const handlers = getAllSocketHandlers();
		for (const handler of handlers) {
			if (handler.#peer) {
				handler.#sendEvent(handler.#peer, id, eventType, data);
			}
		}
	}

	// async #handleReplay(peer: Peer, message: Extract<ClientMessage, { type: 'replay' }>) {
	// 	const events = await loadEventsAfter(this.userId, message.lastEventId ?? null);

	// 	this.#log('sending initial events...');
	// 	for (const event of events) {
	// 		this.#log('sending previous event', event.id);
	// 		peer.send(this.#convertEventToPayload(event));
	// 	}

	// 	this.#log('waiting for live events...');
	// 	for await (const event of this.#stream) {
	// 		this.#log('forwarding live event', event.id);
	// 		peer.send(this.#convertEventToPayload(event as Event));
	// 	}
	// }

	// #convertEventToPayload(event: Event) {
	// 	return { type: event.type, id: event.id, data: event.data };
	// }

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
