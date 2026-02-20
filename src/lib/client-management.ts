import { browser } from '$app/environment';
import { createContext } from 'svelte';
import { SseClient } from './client';

const [getSseClient, setSseClient] = createContext<{
	lastEventId: number | undefined;
}>();

let sseClient: SseClient | undefined = undefined;

export function initSseClient(lastEventId: number | undefined) {
	console.log('Initializing SSE client with lastEventId:', lastEventId, browser);
	setSseClient({ lastEventId });
}

export function getSseClientInBrowser() {
	if (!browser) throw new Error('getSseClientInBrowser called but not in a browser environment');

	if (sseClient) return sseClient;

	const { lastEventId } = getSseClient();

	sseClient = new SseClient(lastEventId);
	setSseClient({ lastEventId });

	return sseClient;
}
