<script lang="ts">
	import { getSseClient, initSseClient } from '$lib/client-management';
	import { untrack } from 'svelte';

	let { children, data } = $props();

	initSseClient(untrack(() => data.lastEventId));

	const sseClient = $derived(getSseClient());

	// ensures that the SSE connection is closed when the user navigates away from the (app) layout (e.g. to the login page).
	$effect(() => {
		return () => sseClient?.close();
	});
</script>

{@render children()}
