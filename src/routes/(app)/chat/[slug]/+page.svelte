<script lang="ts">
	import { enhance } from '$app/forms';
	import Chat from '$lib/Chat.svelte';
	import { type ConnectionStatus, getSseClientInBrowser, subscribe } from '$lib/client';
	import type { Message } from '$lib/sse-events';
	import { untrack } from 'svelte';

	let { data } = $props();

	let chatId = $derived(data.chat.id);
	let messages = $state<Message[]>([]);
	let connectionStatus = $state<ConnectionStatus>();

	$effect(() => {
		// TODO: use reactive statements for this
		getSseClientInBrowser().subscribeConnectionStatus((status) => {
			untrack(() => (connectionStatus = status));
		});
	});

	$effect(() => {
		chatId; // re-run the effect when the user navigates to a different chat
		// console.log('Setting up SSE subscription for chat with id', chatId);

		messages = untrack(() => data.chat.messages);

		const { unsubsribe } = untrack(() =>
			subscribe({
				eventType: 'messageSent',
				lastEventId: data.lastEventId,
				handleEvent(payload, id) {
					console.log(`Handling SSE data for event type messageSent:`, id);
					if (payload.chatId === chatId) {
						messages.push(payload);
					}
				}
			})
		);

		return () => unsubsribe();
	});
</script>

<a href="/chat/1">1</a>
<a href="/chat/2">2</a>

<div class="m-4 flex items-center gap-4">
	<a href="/" class="btn btn-primary">Home</a>
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
		{#each data.chat.members as { user }, i (user.id)}
			{#if i > 0}
				,
			{/if}
			{user.username}
			{user.id === data.userId ? '(you)' : ''}
		{/each}
	</p>
</div>

<Chat {connectionStatus} {messages} userId={data.userId} />
