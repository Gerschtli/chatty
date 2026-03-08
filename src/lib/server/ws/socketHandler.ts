/* eslint-disable @typescript-eslint/no-explicit-any */
import { requestSchema, type ClientMessage } from '$lib/ws-events';
import type { Peer } from '@sveltejs/kit';
import * as devalue from 'devalue';
import { Readable } from 'node:stream';
import { loadEventsAfter } from '../events';
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
			this.#send(peer, {
				type: 'event',
				eventType: 'error',
				data: { code: 'PARSE_ERROR', message: 'Invalid message', timestamp: Date.now() },
			});
		}
	}

	#handleRequest(peer: Peer, request: any) {
		const { id, method, params } = request;
		this.#log(`Handling request ${id}: ${method}`);

		switch (method) {
			case 'last_processed':
				this.#send(peer, { type: 'response', id, result: { status: 'ok' } });
				break;
			case 'subscribe':
				this.#send(peer, { type: 'response', id, result: { status: 'ok' } });
				break;
			case 'send_chat_message':
				const serverId = Date.now().toString();
				this.#send(peer, { type: 'response', id, result: { serverMessageId: serverId } });
				// Broadcast to all connected clients
				this.#broadcast({
					type: 'event',
					eventType: 'chat_message',
					data: {
						id: serverId,
						chatId: params.chatId,
						senderId: this.userId,
						content: params.content,
						timestamp: params.timestamp,
					},
				});
				break;
			case 'heartbeat':
				this.#send(peer, { type: 'response', id, result: { status: 'ok' } });
				break;
			default:
				this.#send(peer, {
					type: 'response',
					id,
					error: { code: 'UNKNOWN_METHOD', message: `Unknown method: ${method}` },
				});
		}
	}

	#send(peer: Peer, message: any) {
		peer.send(devalue.stringify(message));
	}

	#broadcast(message: any) {
		// Broadcast to all connected peers except self
		const handlers = getAllSocketHandlers();
		for (const handler of handlers) {
			if (handler !== this && handler.#peer) {
				handler.#send(handler.#peer, message);
			}
		}
		this.#log('Broadcasting:', message);
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
		return { type: event.type, id: event.id, data: event.data };
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
