<script lang="ts">
	import { wsClient } from '$lib/ws-client.svelte';
	import { untrack } from 'svelte';

	let { children, data } = $props();

	let message = $state('');

	/* disable SSE for WS testing
	// ensures that the SSE connection is closed when the user navigates away from the (app) layout (e.g. to the login page).
	$effect(() => {
		untrack(() => sseClient.connect(data.lastEventId));

		return () => sseClient.close();
	});
	*/

	$effect(() => {
		untrack(() => wsClient.connect(data.lastEventId));

		return () => wsClient.close();
	});
</script>

<input bind:value={message} />
<button onclick={() => wsClient.send(message)}>Send</button>

{@render children()}
