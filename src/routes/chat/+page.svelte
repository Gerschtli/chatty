<script lang="ts">
	import { enhance } from '$app/forms';
	import { SseClient } from '$lib/sse';
	import { onMount } from 'svelte';

	let { data } = $props();

	let scrollContainer: HTMLElement | null = null;
	let messages = $state<
		{
			id: string;
			userId: string;
			content: string;
			createdAt: Date | string;
			user: {
				username: string;
			};
		}[]
	>([]);

	onMount(() => {
		messages = data.messages.slice();

		scrollToBottom('instant');

		const sseClient = new SseClient('/chat/api', (err) => {
			console.error('SSE error:', err);
		});

		sseClient.addHandler('message', async (payload) => {
			messages.push(payload);
			scrollToBottom();
		});

		return () => sseClient.close();
	});

	function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
		setTimeout(() => scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior }), 0);
	}

	function formatTime(created: string | Date) {
		const d = typeof created === 'string' ? new Date(created) : created;

		return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="m-4 flex h-100 flex-col justify-between rounded-lg border-2 border-slate-400">
	<div bind:this={scrollContainer} class="overflow-auto p-4">
		{#each messages as message (message.id)}
			<div class="chat {message.userId === data.userId ? 'chat-end' : 'chat-start'}">
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

	<form method="post" action="?/sendMessage" use:enhance class="flex gap-4 p-4">
		<input class="input grow" type="text" name="content" placeholder="Type a message..." required />
		<input class="btn btn-primary" type="submit" value="Send" />
	</form>
</div>
