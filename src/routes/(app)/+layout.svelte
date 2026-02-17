<script lang="ts">
	import { setSseClient, SseClientWrapper } from '$lib/sse-wrapper.svelte';
	import { onMount, untrack } from 'svelte';

	let { children, data } = $props();

	let sseClientWrapper = $state<SseClientWrapper>();
	setSseClient(() => sseClientWrapper);

	onMount(() => {
		// prevent reactive updates on e.g. form submissions
		sseClientWrapper = new SseClientWrapper(
			untrack(() => (data.lastEventId ? String(data.lastEventId) : null))
		);

		return () => sseClientWrapper?.close();
	});
</script>

{@render children()}
