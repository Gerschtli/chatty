<script lang="ts">
	import Chat from '$lib/Chat.svelte';
	import type { Message } from '$lib/sse-events';
	import { SseClient } from '$lib/sse.svelte.js';
	import { onMount } from 'svelte';

	let { data } = $props();

	let messages = $state<Message[]>([]);
	let sseClient: SseClient | null = $state(null);

	onMount(() => {
		messages = data.messages.slice();

		sseClient = new SseClient('/chat-sse/api', (err) => {
			console.error('SSE error:', err);
		});

		sseClient.addHandler('messageSent', (payload) => {
			console.info('Received messageSent from server: ', payload);
			messages.push(payload);
		});

		sseClient.addHandler('ping', () => {
			console.info('Received ping from server');
		});

		sseClient.addHandler('error', () => {
			console.error('Received error from server');
			throw new Error('SSE Error received from server');
		});

		return () => sseClient?.close();
	});
</script>

<Chat connectionStatus={sseClient?.connectionStatus} {messages} userId={data.userId} />
