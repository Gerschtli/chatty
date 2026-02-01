<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();

	function formatTime(created: Date) {
		return created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="m-4 flex h-100 flex-col justify-between rounded-lg border-2 border-slate-400">
	<div class="overflow-auto p-4">
		{#each data.messages as message}
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
		<input class="input grow" type="text" name="content" placeholder="Type a message..." />
		<input class="btn btn-primary" type="submit" value="Send" />
	</form>
</div>
