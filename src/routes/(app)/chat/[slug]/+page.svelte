<script lang="ts">
	import { enhance } from '$app/forms';
	import Chat from '$lib/Chat.svelte';
	import type { Message } from '$lib/sse-events';
	import { getSseClient } from '$lib/sse.svelte';
	import { untrack } from 'svelte';

	let { data } = $props();

	const sseClient = getSseClient();

	// TODO: take copy on mount or take advantage of SSR updates of messages array?
	// let messages = $derived(data.messages);
	// svelte-ignore state_referenced_locally
	let messages = $state<Message[]>(data.chat.messages);

	$effect(() => {
		// TODO: handle missed events during during SSR
		// TODO: removeHandler on component destroy
		sseClient()?.addHandler('messageSent', (payload) => {
			console.info('Received messageSent from server: ', payload);
			untrack(() => messages).push(payload);
		});
	});
</script>

<div class="m-4 flex items-center gap-4">
	{#if data.chat.members.some((member) => member.user.id === data.userId)}
		<form action="?/leaveChat" method="POST" use:enhance>
			<input type="hidden" name="chatId" value={data.chat.id} />
			<input type="submit" class="btn btn-error" value="Leave" />
		</form>
	{:else}
		<form action="?/joinChat" method="POST" use:enhance>
			<input type="hidden" name="chatId" value={data.chat.id} />
			<input type="submit" class="btn btn-success" value="Join" />
		</form>
	{/if}

	<p>
		{#each data.chat.members as { user }, i}
			{#if i > 0}
				,
			{/if}
			{user.username}
			{user.id === data.userId ? '(you)' : ''}
		{/each}
	</p>
</div>

<Chat connectionStatus={sseClient()?.connectionStatus} {messages} userId={data.userId} />
