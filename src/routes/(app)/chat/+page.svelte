<script lang="ts">
	import Chat from '$lib/Chat.svelte';
	import type { Message } from '$lib/sse-events';
	import { getSseClient } from '$lib/sse.svelte';
	import { untrack } from 'svelte';

	let { data } = $props();

	const sseClient = getSseClient();

	// TODO: take copy on mount or take advantage of SSR updates of messages array?
	// let messages = $derived(data.messages);
	// svelte-ignore state_referenced_locally
	let messages = $state<Message[]>(data.messages);

	$effect(() => {
		// TODO: handle missed events during during SSR
		// TODO: removeHandler on component destroy
		sseClient()?.addHandler('messageSent', (payload) => {
			console.info('Received messageSent from server: ', payload);
			untrack(() => messages).push(payload);
		});
	});
</script>

<Chat connectionStatus={sseClient()?.connectionStatus} {messages} userId={data.userId} />
