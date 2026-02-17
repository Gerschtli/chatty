<script lang="ts">
	import { setSseClient, SseClient } from '$lib/sse.svelte';
	import { onMount, untrack } from 'svelte';

	let { children, data } = $props();

	let sseClient = $state<SseClient>();
	setSseClient(() => sseClient);

	// prevent reactive updates on e.g. form submissions
	const lastEventId = untrack(() => data.lastEventId);

	function buildSseUrl() {
		const url = new URL(`/sse`, window.location.href);
		if (lastEventId) {
			url.searchParams.append('lastEventId', String(lastEventId));
		}

		return url.toString();
	}

	onMount(() => {
		sseClient = new SseClient(buildSseUrl(), (err) => {
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
