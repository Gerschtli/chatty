import * as devalue from 'devalue';
import { config } from './config';
import { events, type Events } from './sse-events';

export class SseClient {
	#eventSource: EventSource;
	#errorHandler: (err: unknown) => void;
	#handlers: Partial<{ [K in keyof Events]: ((data: Events[K], lastEventId: string) => void)[] }> =
		{};

	#connectionStatus: 'connecting' | 'connected' | 'stale' | 'closed' = $state('connecting');
	#staleTimeout: NodeJS.Timeout | undefined = undefined;

	constructor(url: string, errorHandler: (err: unknown) => void) {
		this.#eventSource = new EventSource(url);
		this.#errorHandler = errorHandler;

		this.#eventSource.onopen = () => {
			this.#connectionStatus = 'connected';
		};

		this.#eventSource.onerror = (event) => {
			if (this.#eventSource.readyState === EventSource.CLOSED) {
				this.#connectionStatus = 'closed';
			} else if (this.#eventSource.readyState === EventSource.CONNECTING) {
				this.#connectionStatus = 'connecting';
			}

			this.#errorHandler(new Error(`SSE connection error: ${JSON.stringify(event)}`));
		};

		this.addHandler('ping', () => {});

		this.#restartStaleTimeout();
	}

	#restartStaleTimeout() {
		clearTimeout(this.#staleTimeout);

		if (this.#connectionStatus === 'stale') {
			this.#connectionStatus = 'connected';
		}

		this.#staleTimeout = setTimeout(() => {
			if (this.#connectionStatus === 'connected') {
				this.#connectionStatus = 'stale';
			}
		}, config.client.connectionStaleTimeoutMs);
	}

	get connectionStatus() {
		return this.#connectionStatus;
	}

	addHandler<T extends keyof Events>(
		type: T,
		handler: (data: Events[T], lastEventId: string) => void
	) {
		if (this.#handlers[type]) {
			this.#handlers[type].push(handler);
			return;
		}

		this.#handlers[type] = [];
		this.#handlers[type].push(handler);

		this.#eventSource.addEventListener(type, (event: MessageEvent<string>) => {
			this.#restartStaleTimeout();

			try {
				const devalued = devalue.parse(event.data);
				const payload = events[type].parse(devalued) as Events[typeof type];

				for (const handler of this.#handlers[type] || []) {
					handler(payload, event.lastEventId);
				}
			} catch (err) {
				this.#errorHandler(err);
			}
		});
	}

	close() {
		this.#eventSource.close();
	}
}
