<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Chat from '$lib/Chat.svelte';

	const { data } = $props();

	type Message = {
		id: string;
		chatId: number;
		userId: string;
		user: {
			username: string;
		};
		content: string;
		createdAt: Date;
	};

	// const chatId = $derived(data.chat.id);
	let messages = $state<Message[]>([]);

	// $effect(() => {
	// 	// re-run the effect when the user navigates to a different chat
	// 	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	// 	chatId;
	// 	// console.log('Setting up WS subscription for chat with id', chatId);

	// 	messages = untrack(() => data.chat.messages);

	// 	const { unsubsribe } = untrack(() =>
	// 		wsClient.subscribe({
	// 			eventType: 'messageSent',
	// 			lastEventId: data.lastEventId,
	// 			handleEvent(payload) {
	// 				console.log(`Handling WS data for event type messageSent:`, payload.id);
	// 				if (payload.data.chatId === chatId) {
	// 					messages.push(payload.data);
	// 				}
	// 			},
	// 		}),
	// 	);

	// 	return () => unsubsribe();
	// });

	// $effect(() => {
	// 	const { unsubsribe } = untrack(() =>
	// 		wsClient.subscribe({
	// 			eventType: 'error',
	// 			lastEventId: data.lastEventId,
	// 			handleEvent({ id }) {
	// 				console.log(`Handling WS data for event type error:`, id);
	// 				throw new Error('An error occurred in the WS connection');
	// 			},
	// 		}),
	// 	);

	// 	return () => unsubsribe();
	// });
</script>

<a href={resolve('/base-ws/chat/[slug]', { slug: '1' })}>1</a>
<a href={resolve('/base-ws/chat/[slug]', { slug: '2' })}>2</a>

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

<Chat connectionStatus="closed" {messages} userId={data.userId} chatName={data.chat.name}>
	<!-- TODO: add optimistic UI: show message after submit before WS is received (idea: match via client generated UUID) -->
	<form method="post" action="?/sendMessage" use:enhance class="flex gap-4 p-4">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="input grow"
			type="text"
			name="content"
			placeholder="Type a message..."
			autocomplete="off"
			autofocus
			required
		/>
		<input class="btn btn-primary" type="submit" value="Send" />
	</form>
</Chat>
