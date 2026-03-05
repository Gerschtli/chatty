import * as devalue from 'devalue';
import { config } from './config';
import { schemaServerMessage, type ClientMessage, type ServerMessage } from './ws-events';

type ServerMessageEnvelope<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

type SubscribeOptions<T extends ServerMessage['type']> = {
	eventType: T;
	lastEventId: number | undefined;
	handleEvent: (msg: ServerMessageEnvelope<T>) => void;
};

// TODO: handle (re-)connection with lastEventId replay
// TODO: handle different message types (e.g. chat messages, system messages, etc.)
// TODO: send ping pong messages to keep the connection alive
class WebsocketClient {
	#socket: WebSocket | null = null;

	#events: { [T in ServerMessage['type']]?: ServerMessageEnvelope<T>[] } = {};
	#listeners: { [T in ServerMessage['type']]?: Set<(event: ServerMessageEnvelope<T>) => void> } =
		{};

	#lastEventId: number | undefined;

	connect(lastEventId: number | undefined) {
		this.#socket = new WebSocket(new URL(`/ws`, window.location.href));

		this.#socket.addEventListener('open', () => {
			console.log('[ws-client] connection opened');
			this.send({ type: 'replay', lastEventId });
		});

		this.#socket.addEventListener('message', (event) => {
			// TODO: how to handle errors?
			const serverMessage = schemaServerMessage.parse(devalue.parse(event.data));

			console.log(
				`[ws-client] received server message of type ${serverMessage.type} (id=${serverMessage.id}):`,
				serverMessage,
			);
			console.log('lastEventId:', event.lastEventId);

			if (serverMessage.id <= (this.#lastEventId ?? 0)) {
				console.warn(
					`Received server message with id ${serverMessage.id} which is not greater than lastEventId ${this.#lastEventId}. Ignoring event.`,
					{ serverMessage },
				);
				return;
			}

			this.#lastEventId = serverMessage.id;

			// TODO: remove any
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.#events[serverMessage.type]!.push(serverMessage as any);
			if (this.#events[serverMessage.type]!.length > config.client.maxStoredEventsPerType) {
				this.#events[serverMessage.type]!.shift();
			}

			// TODO: remove any
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			for (const l of this.#listeners[serverMessage.type] || []) l(serverMessage as any);
		});

		this.#socket.addEventListener('close', () => {
			console.log('[ws-client] connection closed');
		});

		this.#socket.addEventListener('error', (error) => {
			console.error('[ws-client] error:', error);
		});
	}

	send(message: ClientMessage) {
		if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
			console.warn('[ws-client] cannot send message, socket is not open');
			return;
		}

		this.#socket.send(devalue.stringify(message));
	}

	subscribe<T extends ServerMessage['type']>({
		eventType,
		lastEventId,
		handleEvent,
	}: SubscribeOptions<T>) {
		console.log('Starting catchup with lastEventId:', lastEventId);

		this.connect(lastEventId);

		const replay = this.#replayAfter(eventType, lastEventId);

		for (const serverMessage of replay) {
			// console.log(`Replaying event with id ${ev.id} and payload:`, ev.payload);
			handleEvent(serverMessage);
		}

		const unsubsribe = this.#subscribe(eventType, (serverMessage) => {
			// console.log(`Received live event with id ${ev.id} and payload:`, ev.payload);
			handleEvent(serverMessage);
		});

		return { unsubsribe };
	}

	#replayAfter<T extends ServerMessage['type']>(eventType: T, lastEventId: number | undefined) {
		// console.log('Fetching events to replay after id', lastId, 'Current messages:', this.#messages);

		const events = this.#events[eventType];
		if (!events) throw new Error(`Not listening for event type ${eventType}`);

		if (lastEventId === undefined) return [...events];

		return events.filter((e) => e.id > lastEventId);
	}

	#subscribe<T extends ServerMessage['type']>(
		eventType: T,
		fn: (event: ServerMessageEnvelope<T>) => void,
	) {
		if (!this.#listeners[eventType]) {
			this.#listeners[eventType] = new Set<never>();
		}
		this.#listeners[eventType]!.add(fn);

		return () => this.#listeners[eventType]!.delete(fn);
	}

	close() {
		this.#socket?.close();
	}
}

export const wsClient = new WebsocketClient();
