class WebsocketClient {
	#socket: WebSocket | null = null;

	connect() {
		this.#socket = new WebSocket(new URL(`/ws`, window.location.href));

		this.#socket.onopen = () => {
			console.log('[ws-client] connection opened');
		};

		this.#socket.onmessage = (event) => {
			console.log('[ws-client] received message:', event.data);
		};

		this.#socket.onclose = () => {
			console.log('[ws-client] connection closed');
		};

		this.#socket.onerror = (error) => {
			console.error('[ws-client] error:', error);
		};
	}

	send(message: string) {
		if (this.#socket && this.#socket.readyState === WebSocket.OPEN) {
			this.#socket.send(message);
		} else {
			console.warn('[ws-client] cannot send message, socket is not open');
		}
	}

	close() {
		this.#socket?.close();
	}
}

export const wsClient = new WebsocketClient();
