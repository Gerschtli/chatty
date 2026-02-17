import { createContext } from 'svelte';
import type { Events } from './sse-events';
import { SseClient } from './sse.svelte';

const [getSseClient, setSseClient] = createContext<() => SseClientWrapper | undefined>();

export { getSseClient, setSseClient };

export class SseClientWrapper {
	#sseClient: SseClient;
	#messages = $state<{ id: string; message: Events['messageSent'] }[]>([]);

	constructor(lastEventId: string | null) {
		this.#sseClient = new SseClient(this.#buildSseUrl(lastEventId), (err) => {
			console.error('SSE error:', err);
		});

		this.#sseClient.addHandler('error', () => {
			console.error('Received error from server');
			throw new Error('SSE Error received from server');
		});

		this.#sseClient.addHandler('messageSent', (payload, lastEventId) => {
			this.#messages.push({ id: lastEventId, message: payload });
		});
	}

	get messages() {
		return this.#messages;
	}

	close() {
		this.#sseClient.close();
	}

	#buildSseUrl(lastEventId: string | null) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const url = new URL(`/sse`, window.location.href);
		if (lastEventId) {
			url.searchParams.append('lastEventId', String(lastEventId));
		}

		return url.toString();
	}
}
