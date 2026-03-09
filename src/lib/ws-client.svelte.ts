/* eslint-disable @typescript-eslint/no-explicit-any */
import * as devalue from 'devalue';
import { serverMessageSchema, type Operations, type Request } from './ws-events';

export type ConnectionStatus =
	| 'initializing'
	| 'connecting'
	| 'connected'
	| 'stale'
	| 'disconnected';

class WSClient {
	#socket: WebSocket | null = null;
	#pendingRequests: Map<
		number,
		{
			resolve(value: unknown): void;
			reject(reason: unknown): void;
			timeout: NodeJS.Timeout;
		}
	> = new Map();
	#eventListeners: Map<string, Set<(data: any) => void>> = new Map();
	#connectionStatus: ConnectionStatus = $state('disconnected');
	#nextRequestId = 0;

	get connectionStatus() {
		return this.#connectionStatus;
	}

	connect(_lastMessageId: number | undefined) {
		if (this.#socket) return;

		this.#socket = new WebSocket(`ws://${window.location.host}/base-ws/ws`);
		this.#connectionStatus = 'connecting';

		this.#socket.onopen = () => {
			this.#connectionStatus = 'connected';
			console.log('[ws-client] connected');
			// Send last_processed
			//	this.sendRequest('last_processed', { messageId: lastMessageId || '0' }).catch(console.error);
		};

		this.#socket.onmessage = (event) => {
			try {
				const message = serverMessageSchema.parse(devalue.parse(event.data));
				console.log('[ws-client] received:', message);

				if (message.type === 'response') {
					const pending = this.#pendingRequests.get(message.requestId);
					if (pending) {
						clearTimeout(pending.timeout);
						this.#pendingRequests.delete(message.requestId);
						if (message.error) {
							pending.reject(message.error);
						} else {
							pending.resolve(message.result);
						}
					}
				} else if (message.type === 'event') {
					this.#emitEvent(message.eventType, message.data);
				}
			} catch (e) {
				console.error('[ws-client] parse error:', e);
			}
		};

		this.#socket.onclose = () => {
			this.#connectionStatus = 'disconnected';
			console.log('[ws-client] disconnected');
			this.#socket = null;
		};

		this.#socket.onerror = (error) => {
			console.error('[ws-client] error:', error);
		};
	}

	close() {
		if (this.#socket) {
			this.#socket.close();
			this.#socket = null;
		}
		this.#connectionStatus = 'disconnected';
	}

	sendRequest<T extends keyof Operations>(method: T, params: Operations[T]['request']) {
		return new Promise<Operations[T]['response']>((resolve, reject) => {
			const id = this.#nextRequestId++;
			const request = { type: 'request', id, method, params } satisfies Request<T>;
			// TODO: queue if socket not open yet
			this.#socket?.send(devalue.stringify(request));

			const timeout = setTimeout(() => {
				this.#pendingRequests.delete(id);
				reject(new Error('Request timeout'));
			}, 10_000);

			this.#pendingRequests.set(id, { resolve, reject, timeout });
		});
	}

	on(eventType: string, callback: (data: any) => void) {
		if (!this.#eventListeners.has(eventType)) {
			this.#eventListeners.set(eventType, new Set());
		}
		this.#eventListeners.get(eventType)!.add(callback);
	}

	off(eventType: string, callback: (data: any) => void) {
		this.#eventListeners.get(eventType)?.delete(callback);
	}

	#emitEvent(eventType: string, data: any) {
		this.#eventListeners.get(eventType)?.forEach((callback) => callback(data));
	}
}

export const wsClient = new WSClient();
