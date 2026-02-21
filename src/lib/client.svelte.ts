import * as devalue from 'devalue';
import { SvelteSet, SvelteURL } from 'svelte/reactivity';
import { config } from './config';
import { events, type Events } from './sse-events';

type EventEnvelope<T extends keyof Events> = {
	id: number;
	payload: Events[T];
};

type ConnectionStatus = 'connecting' | 'connected' | 'stale' | 'closed';

export class SseClient {
	#eventSource: EventSource;

	#connectionStatus: ConnectionStatus = $state('connecting');
	#staleTimeout: NodeJS.Timeout | undefined = undefined;

	#events: { [T in keyof Events]?: EventEnvelope<T>[] } = {};
	#listeners: { [T in keyof Events]?: Set<(event: EventEnvelope<T>) => void> } = {};

	#lastEventId: number | undefined;

	constructor(lastEventId: number | undefined) {
		console.log('Creating new SseClient with lastEventId:', lastEventId);
		this.#lastEventId = lastEventId;
		this.#eventSource = new EventSource(this.#buildSseUrl(lastEventId));

		this.#setupLifecycleHandlers();

		for (const eventType of Object.keys(events)) {
			this.#setupEventListener(eventType as keyof Events);
		}
	}

	#buildSseUrl(lastEventId: number | undefined) {
		const url = new SvelteURL(`/sse`, window.location.href);
		if (lastEventId !== undefined) {
			url.searchParams.append('lastEventId', String(lastEventId));
		}

		return url.toString();
	}

	#setupLifecycleHandlers() {
		this.#eventSource.onopen = () => (this.#connectionStatus = 'connected');

		// TODO: verify that this error handling logic works as expected in different scenarios
		this.#eventSource.onerror = (event) => {
			if (this.#eventSource.readyState === EventSource.CLOSED) {
				this.#connectionStatus = 'closed';
			} else if (this.#eventSource.readyState === EventSource.CONNECTING) {
				this.#connectionStatus = 'connecting';
			}

			console.log(`SSE connection error:`, this.#eventSource.readyState, event);
		};

		this.#eventSource.addEventListener('ping', () => this.#restartStaleTimeout());
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

	get connectionStatus() {
		return this.#connectionStatus;
	}

	#setupEventListener<T extends keyof Events>(eventType: T) {
		this.#events[eventType] = [];
		this.#eventSource.addEventListener(eventType, (event: MessageEvent<string>) => {
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

	replayAfter<T extends keyof Events>(eventType: T, lastEventId: number | undefined) {
		// console.log('Fetching events to replay after id', lastId, 'Current messages:', this.#messages);

		const events = this.#events[eventType];
		if (!events) throw new Error(`Not listening for event type ${eventType}`);

		if (lastEventId === undefined) return [...events];

		return events.filter((e) => e.id > lastEventId);
	}

	subscribe<T extends keyof Events>(eventType: T, fn: (event: EventEnvelope<T>) => void) {
		if (!this.#listeners[eventType]) {
			this.#listeners[eventType] = new SvelteSet<never>();
		}
		this.#listeners[eventType]!.add(fn);

		return () => this.#listeners[eventType]!.delete(fn);
	}

	close() {
		console.log('Closing SSE connection');
		this.#eventSource.close();
	}
}

type SubscribeOptions<T extends keyof Events> = {
	sseClient: SseClient;
	eventType: T;
	lastEventId: number | undefined;
	handleEvent: (msg: Events[T], id: number) => void;
};

export function subscribe<T extends keyof Events>({
	sseClient,
	eventType,
	lastEventId,
	handleEvent,
}: SubscribeOptions<T>) {
	console.log('Starting catchup with lastEventId:', lastEventId);

	const replay = sseClient.replayAfter(eventType, lastEventId);

	for (const ev of replay) {
		// console.log(`Replaying event with id ${ev.id} and payload:`, ev.payload);
		handleEvent(ev.payload, ev.id);
	}

	const unsubsribe = sseClient.subscribe(eventType, (ev) => {
		// console.log(`Received live event with id ${ev.id} and payload:`, ev.payload);
		handleEvent(ev.payload, ev.id);
	});

	return { unsubsribe };
}
