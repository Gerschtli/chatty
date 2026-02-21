<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Chat from '$lib/Chat.svelte';
	import { getSseClient } from '$lib/client-management';
	import { subscribe } from '$lib/client.svelte';
	import type { Message } from '$lib/sse-events';
	import { untrack } from 'svelte';

	const { data } = $props();

	const chatId = $derived(data.chat.id);
	let messages = $state<Message[]>([]);
	const sseClient = $derived(getSseClient());

	$effect(() => {
		// re-run the effect when the user navigates to a different chat
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		chatId;
		// console.log('Setting up SSE subscription for chat with id', chatId);

		messages = untrack(() => data.chat.messages);

		const { unsubsribe } = untrack(() =>
			subscribe({
				sseClient: sseClient!,
				eventType: 'messageSent',
				lastEventId: data.lastEventId,
				handleEvent(payload, id) {
					console.log(`Handling SSE data for event type messageSent:`, id);
					if (payload.chatId === chatId) {
						messages.push(payload);
					}
				},
			}),
		);

		return () => unsubsribe();
	});

	$effect(() => {
		const { unsubsribe } = untrack(() =>
			subscribe({
				sseClient: sseClient!,
				eventType: 'customError',
				lastEventId: data.lastEventId,
				handleEvent(_, id) {
					console.log(`Handling SSE data for event type customError:`, id);
					throw new Error('A custom error occurred in the SSE connection');
				},
			}),
		);

		return () => unsubsribe();
	});
</script>

<a href={resolve('/(app)/chat/[slug]', { slug: '1' })}>1</a>
<a href={resolve('/(app)/chat/[slug]', { slug: '2' })}>2</a>

<div class="m-4 flex items-center gap-4">
	<a href={resolve('/')} class="btn btn-primary">Home</a>
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

<Chat
	connectionStatus={sseClient?.connectionStatus}
	{messages}
	userId={data.userId}
	chatName={data.chat.name}
/>
