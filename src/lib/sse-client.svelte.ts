import * as devalue from 'devalue';
import { config } from './config';
import { events, type Events } from './sse-events';

type EventEnvelope<T extends keyof Events> = {
	id: number;
	payload: Events[T];
};

type ConnectionStatus = 'initializing' | 'connecting' | 'connected' | 'stale' | 'closed';

type SubscribeOptions<T extends keyof Events> = {
	eventType: T;
	lastEventId: number | undefined;
	handleEvent: (msg: Events[T], id: number) => void;
};

class SseClient {
	#eventSource: EventSource | undefined = undefined;

	#connectionStatus: ConnectionStatus = $state('initializing');
	#staleTimeout: NodeJS.Timeout | undefined = undefined;

	#events: { [T in keyof Events]?: EventEnvelope<T>[] } = {};
	#listeners: { [T in keyof Events]?: Set<(event: EventEnvelope<T>) => void> } = {};

	#lastEventId: number | undefined;

	connect(lastEventId: number | undefined) {
		if (this.#connectionStatus !== 'initializing') return;

		this.#connectionStatus = 'connecting';

		console.log('Creating new SseClient with lastEventId:', lastEventId);
		this.#lastEventId = lastEventId;
		this.#eventSource = new EventSource(this.#buildSseUrl(lastEventId));

		this.#setupLifecycleHandlers(this.#eventSource);

		for (const eventType of Object.keys(events)) {
			this.#setupEventListener(this.#eventSource, eventType as keyof Events);
		}
	}

	#buildSseUrl(lastEventId: number | undefined) {
		const url = new URL(`/sse`, window.location.href);
		if (lastEventId !== undefined) {
			url.searchParams.append('lastEventId', String(lastEventId));
		}

		return url.toString();
	}

	#setupLifecycleHandlers(eventSource: EventSource) {
		eventSource.addEventListener('open', () => (this.#connectionStatus = 'connected'));

		eventSource.addEventListener('error', (event) => {
			if (eventSource.readyState === EventSource.CLOSED) {
				this.#connectionStatus = 'closed';
			} else if (eventSource.readyState === EventSource.CONNECTING) {
				this.#connectionStatus = 'connecting';
			}

			console.log(`SSE connection error:`, eventSource.readyState, event);
		});

		eventSource.addEventListener('ping', () => this.#restartStaleTimeout());
		this.#restartStaleTimeout();
	}

	#restartStaleTimeout() {
		clearTimeout(this.#staleTimeout);

		if (this.#connectionStatus === 'stale') {
			this.#connectionStatus = 'connected';
		}

		this.#staleTimeout = setTimeout(() => {
			if (this.#connectionStatus === 'connected') {
				this.#connectionStatus = 'stale';
			}
		}, config.client.connectionStaleTimeoutMs);
	}

	#setupEventListener<T extends keyof Events>(eventSource: EventSource, eventType: T) {
		this.#events[eventType] = [];
		eventSource.addEventListener(eventType, (event: MessageEvent<string>) => {
			const devalued = devalue.parse(event.data);
			const payload = events[eventType].parse(devalued) as Events[T];

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
		if (this.#connectionStatus !== 'initializing') return;

		console.log('Closing SSE connection');
		this.#eventSource?.close();
		this.#eventSource = undefined;

		this.#connectionStatus = 'initializing';
		clearTimeout(this.#staleTimeout);
		this.#staleTimeout = undefined;

		this.#events = {};
		this.#listeners = {};

		this.#lastEventId = undefined;
	}

	get connectionStatus() {
		return this.#connectionStatus;
	}
}

export const sseClient = new SseClient();
