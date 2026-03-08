<script lang="ts">
	import { wsClient } from '$lib/ws-client.svelte';
	import { untrack } from 'svelte';

	let { children, data } = $props();

	// ensures that the WS connection is closed when the user navigates away from the (app) layout (e.g. to the login page).
	$effect(() => {
		untrack(() => wsClient.connect(data.lastEventId));

		return () => wsClient.close();
	});
</script>

{@render children()}
