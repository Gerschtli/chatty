import { browser } from '$app/environment';
import { createContext } from 'svelte';
import { SseClient } from './client.svelte';

const [get, set] = createContext<{
	lastEventId?: number;
	sseClient?: SseClient;
}>();

export function initSseClient(lastEventId: number | undefined) {
	set({ lastEventId });
}

export function getSseClient() {
	if (!browser) return undefined;

	const { lastEventId, sseClient } = get();

	if (sseClient) return sseClient;

	const newSseClient = new SseClient(lastEventId);
	set({ sseClient: newSseClient });

	return newSseClient;
}
