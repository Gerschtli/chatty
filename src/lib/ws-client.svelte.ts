import * as devalue from 'devalue';
import { config } from './config';
import type { EventEnvelope } from './sse-client.svelte';
import { events, type ClientMessages, type Events } from './ws-events';

const regex = new RegExp(`^([A-Za-z]+)${config.ws.delimiter}(\\d+)${config.ws.delimiter}(.+)$`);

type SubscribeOptions<T extends keyof Events> = {
	eventType: T;
	lastEventId: number | undefined;
	handleEvent: (msg: Events[T], id: number) => void;
};

// TODO: handle (re-)connection with lastEventId replay
// TODO: handle different message types (e.g. chat messages, system messages, etc.)
// TODO: send ping pong messages to keep the connection alive
class WebsocketClient {
	#socket: WebSocket | null = null;

	#events: { [T in keyof Events]?: EventEnvelope<T>[] } = {};
	#listeners: { [T in keyof Events]?: Set<(event: EventEnvelope<T>) => void> } = {};

	#lastEventId: number | undefined;

	connect(lastEventId: number | undefined) {
		this.#socket = new WebSocket(new URL(`/ws`, window.location.href));

		this.#socket.addEventListener('open', () => {
			console.log('[ws-client] connection opened');
			this.send('replay', { lastEventId });
		});

		this.#socket.addEventListener('message', (event) => {
			const match = event.data.match(regex);
			if (!match) {
				console.log(`received malformed message:`, event.data);
				throw new Error(`malformed message: ${event.data}`);
			}

			const [_, type, idString, dataRaw] = match;
			const id = parseInt(idString);

			console.log(
				`[ws-client] received server message of type ${type} (id=${id}):`,
				devalue.parse(dataRaw),
			);

			const payload = events[type].parse(devalue.parse(dataRaw)) as Events[T];

			const e = { id: parseInt(event.lastEventId), payload };
			console.log(`Received SSE data for event type ${eventType}:`, e.id);

			if (e.id <= (this.#lastEventId ?? 0)) {
				console.warn(
					`Received event with id ${e.id} which is not greater than lastEventId ${this.#lastEventId}. Ignoring event.`,
					{ eventType, payload },
				);
				return;
			}

			this.#lastEventId = e.id;

			this.#events[eventType]!.push(e);
			if (this.#events[eventType]!.length > config.client.maxStoredEventsPerType) {
				this.#events[eventType]!.shift();
			}

			for (const l of this.#listeners[eventType] || []) l(e);
		});

		this.#socket.addEventListener('close', () => {
			console.log('[ws-client] connection closed');
		});

		this.#socket.addEventListener('error', (error) => {
			console.error('[ws-client] error:', error);
		});
	}

	send<T extends keyof ClientMessages>(type: T, message: ClientMessages[T]) {
		if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
			console.warn('[ws-client] cannot send message, socket is not open');
			return;
		}

		this.#socket.send([type, devalue.stringify(message)].join(config.ws.delimiter));
	}

	subscribe<T extends keyof Events>({ eventType, lastEventId, handleEvent }: SubscribeOptions<T>) {
		console.log('Starting catchup with lastEventId:', lastEventId);

		this.connect(lastEventId);

		const replay = this.#replayAfter(eventType, lastEventId);

		for (const ev of replay) {
			// console.log(`Replaying event with id ${ev.id} and payload:`, ev.payload);
			handleEvent(ev.payload, ev.id);
		}

		const unsubsribe = this.#subscribe(eventType, (ev) => {
			// console.log(`Received live event with id ${ev.id} and payload:`, ev.payload);
			handleEvent(ev.payload, ev.id);
		});

		return { unsubsribe };
	}

	#replayAfter<T extends keyof Events>(eventType: T, lastEventId: number | undefined) {
		// console.log('Fetching events to replay after id', lastId, 'Current messages:', this.#messages);

		const events = this.#events[eventType];
		if (!events) throw new Error(`Not listening for event type ${eventType}`);

		if (lastEventId === undefined) return [...events];

		return events.filter((e) => e.id > lastEventId);
	}

	#subscribe<T extends keyof Events>(eventType: T, fn: (event: EventEnvelope<T>) => void) {
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
