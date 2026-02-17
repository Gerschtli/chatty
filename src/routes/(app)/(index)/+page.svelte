<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { buildChatSlug } from '$lib/chat';

	let { data } = $props();
</script>

<ul class="list">
	{#each data.chats as chat (chat.id)}
		<li class="list-row flex items-center">
			<a class="link" href={resolve(`/chat/${buildChatSlug(chat)}`)}>{chat.name}</a>

			{#if chat.members.length === 0}
				<form action="?/joinChat" method="POST" use:enhance>
					<input type="hidden" name="chatId" value={chat.id} />
					<input type="submit" class="btn btn-success" value="Join" />
				</form>
			{:else}
				<form action="?/leaveChat" method="POST" use:enhance>
					<input type="hidden" name="chatId" value={chat.id} />
					<input type="submit" class="btn btn-error" value="Leave" />
				</form>
			{/if}
		</li>
	{/each}
</ul>

<form method="POST" action="?/createChat" use:enhance>
	<label class="label">
		<span>Chat Name:</span>
		<input type="text" class="input" name="name" required />
	</label>
	<input type="submit" class="btn" value="Create Chat" />
</form>
