<script lang="ts">
	import { getSseClientInBrowser, initSseClient } from '$lib/client-management';
	import { untrack } from 'svelte';

	let { children, data } = $props();

	initSseClient(untrack(() => data.lastEventId));

	// ensures that the SSE connection is closed when the user navigates away from the (app) layout (e.g. to the login page).
	$effect(() => {
		console.log('Setting up SSE client connection in app layout');
		const sseClient = getSseClientInBrowser();

		return () => sseClient.close();
	});
</script>

{@render children()}
