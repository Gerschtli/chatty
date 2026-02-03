<script lang="ts">
	import Chat from '$lib/Chat.svelte';
	import { SseClient } from '$lib/sse';
	import type { Message } from '$lib/sse-events';
	import { onMount } from 'svelte';

	let { data } = $props();

	let isConnected = $state(false);
	let messages = $state<Message[]>([]);

	onMount(() => {
		messages = data.messages.slice();

		const sseClient = new SseClient('/chat-sse/api', (err) => {
			console.error('SSE error:', err);
		});

		sseClient.addHandler('message', async (payload) => {
			messages.push(payload);
		});

		sseClient.addHandler('ping', async () => {
			console.info('Received ping from server');
		});

		sseClient.addHandler('error', async () => {
			console.error('Received error from server');
			throw new Error('SSE Error received from server');
		});

		return () => sseClient.close();
	});
</script>

<Chat {isConnected} {messages} userId={data.userId} />
