import * as devalue from 'devalue';

// TODO: handle (re-)connection with lastEventId replay
// TODO: handle different message types (e.g. chat messages, system messages, etc.)
// TODO: send ping pong messages to keep the connection alive
class WebsocketClient {
	#socket: WebSocket | null = null;

	connect() {
		this.#socket = new WebSocket(new URL(`/ws`, window.location.href));

		this.#socket.addEventListener('open', () => {
			console.log('[ws-client] connection opened');
			this.send('Hello, server!');
		});

		this.#socket.addEventListener('message', (event) => {
			console.log('[ws-client] received message:', devalue.parse(event.data));
		});

		this.#socket.addEventListener('close', () => {
			console.log('[ws-client] connection closed');
		});

		this.#socket.addEventListener('error', (error) => {
			console.error('[ws-client] error:', error);
		});
	}

	send(message: string) {
		if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
			console.warn('[ws-client] cannot send message, socket is not open');
			return;
		}

		this.#socket.send(devalue.stringify({ message }));
	}

	close() {
		this.#socket?.close();
	}
}

export const wsClient = new WebsocketClient();
