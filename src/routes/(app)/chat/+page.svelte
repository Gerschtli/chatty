<script lang="ts">
	import Chat from '$lib/Chat.svelte';
	import type { Message } from '$lib/sse-events';
	import { getSseClient } from '$lib/sse.svelte';
	import { onMount } from 'svelte';

	let { data } = $props();

	const sseClient = getSseClient();
	let messages = $state<Message[]>([]);

	onMount(() => {
		messages = data.messages.slice();

		// TODO: handle missed events during during SSR
		// TODO: removeHandler on component destroy
		sseClient()?.addHandler('messageSent', (payload) => {
			console.info('Received messageSent from server: ', payload);
			messages.push(payload);
		});
	});
</script>

<Chat connectionStatus={sseClient()?.connectionStatus} {messages} userId={data.userId} />
