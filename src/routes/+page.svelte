<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>

<p>
	<a href={resolve('/chat')}>Chat</a>
</p>
<p>
	<a href={resolve('/login')}>Login</a>
</p>
