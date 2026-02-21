import { browser } from '$app/environment';
import { createContext } from 'svelte';
import { SseClient } from './client.svelte';

const [get, set] = createContext<{
	lastEventId: number | undefined;
	sseClient: SseClient | undefined;
}>();

export function initSseClient(lastEventId: number | undefined) {
	console.log('Initializing SSE client with lastEventId:', lastEventId, browser);

	set({ lastEventId, sseClient: undefined });
}

export function getSseClient() {
	if (!browser) return undefined;

	const { lastEventId, sseClient } = get();

	if (sseClient) return sseClient;

	const newSseClient = new SseClient(lastEventId);
	set({ lastEventId, sseClient: newSseClient });

	return newSseClient;
}
