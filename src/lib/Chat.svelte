<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Message } from './sse-events';

	interface Props {
		connectionStatus: 'initializing' | 'connecting' | 'connected' | 'stale' | 'closed';
		messages: Message[];
		userId: string;
		chatName: string;
	}

	let { connectionStatus, messages, userId, chatName }: Props = $props();

	let scrollContainer = $state<HTMLElement>();

	onMount(() => scrollToBottom('instant'));
	afterNavigate(() => scrollToBottom('instant'));

	$effect.pre(() => {
		if (!scrollContainer || messages.length === 0) return;

		const scrollableDistance = scrollContainer.scrollHeight - scrollContainer.offsetHeight;
		const autoscroll = scrollContainer.scrollTop > scrollableDistance - 100; // 100px threshold

		if (autoscroll) queueMicrotask(() => scrollToBottom('smooth'));
	});

	function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
		scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior });
	}

	function formatTime(created: Date) {
		return created.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="mx-6 mt-4 flex items-center justify-between gap-2">
	<div class="flex items-center gap-2 text-lg font-semibold">
		<span
			class={[
				'inline-block size-4 rounded-full',
				connectionStatus === 'initializing' && 'animate-pulse bg-orange-500',
				connectionStatus === 'connecting' && 'animate-pulse bg-orange-500',
				connectionStatus === 'connected' && 'bg-green-500',
				connectionStatus === 'stale' && 'animate-pulse bg-yellow-500',
				connectionStatus === 'closed' && 'bg-red-500',
			]}
		></span>
		<span>{chatName}</span>
	</div>
	<div class="text-xs">
		<span class="text-slate-400">status:</span>
		<span> {connectionStatus}</span>
	</div>
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
								message.user.username,
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
