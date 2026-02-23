import * as devalue from 'devalue';
import { config } from './config';
import type { ClientMessages } from './ws-events';

// TODO: handle (re-)connection with lastEventId replay
// TODO: handle different message types (e.g. chat messages, system messages, etc.)
// TODO: send ping pong messages to keep the connection alive
class WebsocketClient {
	#socket: WebSocket | null = null;

	connect(lastEventId: number | undefined) {
		this.#socket = new WebSocket(new URL(`/ws`, window.location.href));

		this.#socket.addEventListener('open', () => {
			console.log('[ws-client] connection opened');
			this.send('replay', { lastEventId });
		});

		this.#socket.addEventListener('message', (event) => {
			const [type, idString, dataRaw] = event.data.split(config.ws.delimiter, 3);
			const id = parseInt(idString);
			console.log(
				`[ws-client] received server message of type ${type} (id=${id}):`,
				devalue.parse(dataRaw),
			);
		});

		this.#socket.addEventListener('close', () => {
			console.log('[ws-client] connection closed');
		});

		this.#socket.addEventListener('error', (error) => {
			console.error('[ws-client] error:', error);
		});
	}

	send<T extends keyof ClientMessages>(type: T, message: ClientMessages[T]) {
		if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
			console.warn('[ws-client] cannot send message, socket is not open');
			return;
		}

		this.#socket.send([type, devalue.stringify(message)].join(config.ws.delimiter));
	}

	close() {
		this.#socket?.close();
	}
}

export const wsClient = new WebsocketClient();
