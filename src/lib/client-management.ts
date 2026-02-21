import { browser } from '$app/environment';
import { SseClient } from './client.svelte';

// TODO: is this global state the best way?
let lastEventId: number | undefined = undefined;
let sseClient: SseClient | undefined = undefined;

export function initSseClient(lastEventId_: number | undefined) {
	console.log('Initializing SSE client with lastEventId:', lastEventId_, browser);
	lastEventId = lastEventId_;
}

export function getSseClient() {
	if (!browser) return undefined;

	if (!sseClient) sseClient = new SseClient(lastEventId);

	return sseClient;
}
