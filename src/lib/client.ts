import { browser } from '$app/environment';
import * as devalue from 'devalue';
import { createContext } from 'svelte';
import { events, type Events } from './sse-events';

const [getSseClient, setSseClient] = createContext<{
	lastEventId: number | undefined;
	sseClient: SseClient | undefined;
}>();

export function initSseClient(lastEventId: number | undefined) {
	console.log('Initializing SSE client with lastEventId:', lastEventId, browser);
	setSseClient({ lastEventId, sseClient: undefined });
}

export function getSseClientInBrowser() {
	if (!browser) throw new Error('getSseClientInBrowser called but not in a browser environment');

	const { lastEventId, sseClient } = getSseClient();

	if (sseClient) return sseClient;

	const sseClientNew = new SseClient(lastEventId);
	setSseClient({ lastEventId, sseClient: sseClientNew });

	return sseClientNew;
}

export class SseClient {
	#eventSource: EventSource;
	#messages: { id: number; payload: Events['messageSent'] }[] = [];
	#listeners = new Set<(msg: { id: number; payload: Events['messageSent'] }) => void>();

	constructor(lastEventId: number | undefined) {
		console.log('Creating new SseClient with lastEventId:', lastEventId);
		this.#eventSource = new EventSource(this.#buildSseUrl(lastEventId));

		const eventType = 'messageSent';
		this.#eventSource.addEventListener(eventType, (event: MessageEvent<string>) => {
			const devalued = devalue.parse(event.data);
			const payload = events[eventType].parse(devalued) as Events[typeof eventType];

			const e = { id: parseInt(event.lastEventId), payload };
			console.log(`Received SSE data for event type ${eventType}:`, e.id);
			// TODO: add deduplication logic?
			// TODO: consider limiting the number of stored messages to avoid memory issues in long-running sessions
			this.#messages.push(e);

			for (const l of this.#listeners) l(e);
		});
	}

	replayAfter(lastId: number | undefined) {
		// console.log('Fetching events to replay after id', lastId, 'Current messages:', this.#messages);

		if (lastId === undefined) return [...this.#messages];

		return this.#messages.filter((e) => e.id > lastId);
	}

	subscribe(fn: (msg: { id: number; payload: Events['messageSent'] }) => void) {
		this.#listeners.add(fn);

		return () => this.#listeners.delete(fn);
	}

	close() {
		console.log('Closing SSE connection');
		this.#eventSource.close();
	}

	#buildSseUrl(lastEventId: number | undefined) {
		const url = new URL(`/sse`, window.location.href);
		if (lastEventId !== undefined) {
			url.searchParams.append('lastEventId', String(lastEventId));
		}

		return url.toString();
	}
}

type CatchupOpts = {
	lastEventId: number | undefined;
	handleEvent: (msg: Events['messageSent'], id: number) => void;
};

export function subscribe({ lastEventId, handleEvent }: CatchupOpts) {
	console.log('Starting catchup with lastEventId:', lastEventId);

	const sseClient = getSseClientInBrowser();
	const replay = sseClient.replayAfter(lastEventId);

	for (const ev of replay) {
		// console.log(`Replaying event with id ${ev.id} and payload:`, ev.payload);
		handleEvent(ev.payload, ev.id);
	}

	const unsubsribe = sseClient.subscribe((ev) => {
		// console.log(`Received live event with id ${ev.id} and payload:`, ev.payload);
		handleEvent(ev.payload, ev.id);
	});

	return { unsubsribe };
}
