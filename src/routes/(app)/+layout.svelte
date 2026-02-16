<script lang="ts">
	import { setSseClient, SseClient } from '$lib/sse.svelte';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	let sseClient = $state<SseClient>();
	setSseClient(() => sseClient);

	onMount(() => {
		const url = new URL(`/sse`, window.location.href);
		if (data.lastEventId) {
			url.searchParams.append('lastEventId', String(data.lastEventId));
		}

		sseClient = new SseClient(url.toString(), (err) => {
			console.error('SSE error:', err);
		});
		sseClient.addHandler('error', () => {
			console.error('Received error from server');
			throw new Error('SSE Error received from server');
		});

		return () => sseClient?.close();
	});
</script>

{@render children()}
