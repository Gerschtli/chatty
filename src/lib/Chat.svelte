<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import type { Message } from './sse-events';

	interface Props {
		connectionStatus: 'connecting' | 'connected' | 'stale' | 'closed' | undefined;
		messages: Message[];
		userId: string;
	}

	let { connectionStatus, messages, userId }: Props = $props();

	let scrollContainer: HTMLElement | null = null;

	onMount(() => scrollToBottom('instant'));

	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		messages.length;
		scrollToBottom();
	});

	function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
		setTimeout(() => scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior }), 0);
	}

	function formatTime(created: Date) {
		return created.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="mx-6 mt-2 text-right text-xs">
	<span class="text-slate-400">status:</span>
	{connectionStatus ?? 'connecting'}
</div>

<div class="m-4 flex h-100 flex-col justify-between rounded-lg border-2 border-slate-400">
	<div bind:this={scrollContainer} class="overflow-auto p-4">
		{#each messages as message (message.id)}
			<div class="chat {message.userId === userId ? 'chat-end' : 'chat-start'}">
				<div class="avatar chat-image">
					<div class="w-10 rounded-full">
						<img
							alt="User avatar"
							src="https://ui-avatars.com/api/?name={encodeURIComponent(
								message.user.username
							)}&background=random"
						/>
					</div>
				</div>
				<div class="chat-header">
					{message.user.username}
					<time class="text-xs opacity-50">{formatTime(message.createdAt)}</time>
				</div>
				<div class="chat-bubble">{message.content}</div>
				<div class="chat-footer opacity-50">Sent</div>
			</div>
		{/each}
	</div>

	<!-- TODO: add optimistic UI: show message after submit before SSE is received (idea: match via client generated UUID) -->
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
</div>
