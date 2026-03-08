/* eslint-disable @typescript-eslint/no-explicit-any */
import * as devalue from 'devalue';

type Request = {
	type: 'request';
	id: string;
	method: string;
	params: any;
};

type Response = {
	type: 'response';
	id: string;
	result?: any;
	error?: any;
};

type Event = {
	type: 'event';
	eventType: string;
	data: any;
};

type ConnectionStatus = 'initializing' | 'connecting' | 'connected' | 'stale' | 'disconnected';

type Message = Request | Response | Event;

class WSClient {
	#socket: WebSocket | null = null;
	#pendingRequests: Map<
		string,
		{ resolve: (value: any) => void; reject: (reason: any) => void; timeout: NodeJS.Timeout }
	> = new Map();
	#eventListeners: Map<string, Set<(data: any) => void>> = new Map();
	#connectionStatus: ConnectionStatus = $state('disconnected');

	get connectionStatus() {
		return this.#connectionStatus;
	}

	connect(lastMessageId: number | undefined) {
		if (this.#socket) return;

		this.#socket = new WebSocket(`ws://${window.location.host}/base-ws/ws`);
		this.#connectionStatus = 'connecting';

		this.#socket.onopen = () => {
			this.#connectionStatus = 'connected';
			console.log('[ws-client] connected');
			// Send last_processed
			this.sendRequest('last_processed', { messageId: lastMessageId || '0' }).catch(console.error);
		};

		this.#socket.onmessage = (event) => {
			try {
				const message: Message = devalue.parse(event.data);
				console.log('[ws-client] received:', message);

				if (message.type === 'response') {
					const pending = this.#pendingRequests.get(message.id);
					if (pending) {
						clearTimeout(pending.timeout);
						this.#pendingRequests.delete(message.id);
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

	sendRequest(method: string, params: any): Promise<any> {
		return new Promise((resolve, reject) => {
			const id = Math.random().toString(36).substr(2, 9);
			const request: Request = { type: 'request', id, method, params };
			this.#socket?.send(devalue.stringify(request));

			const timeout = setTimeout(() => {
				this.#pendingRequests.delete(id);
				reject(new Error('Request timeout'));
			}, 10000);

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
