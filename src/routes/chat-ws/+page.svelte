<script lang="ts">
	import Chat from '$lib/Chat.svelte';
	import type { Message } from '$lib/sse-events';
	import { onMount } from 'svelte';

	let { data } = $props();

	let messages = $state<Message[]>([]);

	onMount(() => {
		messages = data.messages.slice();

		const socket = new WebSocket(`/chat/websocket`);

		socket.addEventListener('open', () => {
			socket.send('Hello Server!');
		});

		socket.addEventListener('message', (event) => {
			console.log('Message from server ', event.data);
		});

		return () => socket.close();
	});
</script>

<Chat connectionStatus="closed" {messages} userId={data.userId} />
