<script lang="ts">
	import { sseClient } from '$lib/client.svelte';
	import { untrack } from 'svelte';

	let { children, data } = $props();

	// ensures that the SSE connection is closed when the user navigates away from the (app) layout (e.g. to the login page).
	$effect(() => {
		untrack(() => sseClient.connect(data.lastEventId));

		return () => sseClient.close();
	});
</script>

{@render children()}
