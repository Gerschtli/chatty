<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	import { browser } from '$app/environment';
	import * as devalue from 'devalue';
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	let socket: WebSocket | null = null;
	let messages: string[] = [];
	let inputMessage = '';
	let isConnected = false;
	let pendingRequests: Map<
		string,
		{ resolve: (value: any) => void; reject: (reason: any) => void; timeout: NodeJS.Timeout }
	> = new SvelteMap();

	function generateId() {
		return Math.random().toString(36).substr(2, 9);
	}

	function sendRequest(method: string, params: any): Promise<any> {
		return new Promise((resolve, reject) => {
			const id = generateId();
			const request = { type: 'request', id, method, params };
			socket?.send(devalue.stringify(request));

			const timeout = setTimeout(() => {
				pendingRequests.delete(id);
				reject(new Error('Request timeout'));
			}, 10000);

			pendingRequests.set(id, { resolve, reject, timeout });
		});
	}

	function handleMessage(event: MessageEvent) {
		const data = devalue.parse(event.data);
		if (data.type === 'response') {
			const pending = pendingRequests.get(data.id);
			if (pending) {
				clearTimeout(pending.timeout);
				pendingRequests.delete(data.id);
				if (data.error) {
					pending.reject(data.error);
				} else {
					pending.resolve(data.result);
				}
			}
		} else if (data.type === 'event') {
			if (data.eventType === 'chat_message') {
				messages = [...messages, `${data.data.senderId}: ${data.data.content}`];
			} else if (data.eventType === 'error') {
				messages = [...messages, `Error: ${data.data.message}`];
			}
		}
	}

	async function connect() {
		if (!browser) return;
		socket = new WebSocket(`ws://${window.location.host}/base-ws/ws`);

		socket.onopen = async () => {
			isConnected = true;
			messages = [...messages, 'Connected'];

			try {
				await sendRequest('last_processed', { messageId: '0' });
				await sendRequest('subscribe', { channels: [{ name: 'chat:general' }] });
			} catch (e: any) {
				messages = [...messages, `Init error: ${e.message}`];
			}
		};

		socket.onmessage = handleMessage;

		socket.onclose = () => {
			isConnected = false;
			messages = [...messages, 'Disconnected'];
		};

		socket.onerror = (error) => {
			messages = [...messages, `WebSocket error: ${error}`];
		};
	}

	async function sendMessage() {
		if (!inputMessage.trim()) return;
		try {
			const clientId = generateId();
			await sendRequest('send_chat_message', {
				clientMessageId: clientId,
				chatId: 'general',
				content: inputMessage,
				timestamp: Date.now(),
			});
			inputMessage = '';
		} catch (e: any) {
			messages = [...messages, `Send failed: ${e.message}`];
		}
	}

	onMount(() => {
		connect();
	});

	onDestroy(() => {
		socket?.close();
	});
</script>

<h1>WebSocket Example</h1>
<p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>

<div>
	<input
		bind:value={inputMessage}
		placeholder="Type a message"
		on:keydown={(e) => e.key === 'Enter' && sendMessage()}
	/>
	<button on:click={sendMessage} disabled={!isConnected}>Send</button>
</div>

<ul>
	{#each messages as msg, i (i)}
		<li>{msg}</li>
	{/each}
</ul>
