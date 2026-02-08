import * as devalue from 'devalue';
import { events, type Events } from './sse-events';

const CONNECTION_STALE_TIMEOUT_MS = 3_000;

export class SseClient {
	#eventSource: EventSource;
	#errorHandler: (err: unknown) => void;
	#handlers: Partial<{ [K in keyof Events]: ((data: Events[K]) => void)[] }> = {};

	#connectionStatus: 'connecting' | 'connected' | 'stale' | 'closed' = $state('connecting');
	#staleTimeout: NodeJS.Timeout | null = $state(null);

	constructor(url: string, errorHandler: (err: unknown) => void) {
		this.#eventSource = new EventSource(url);
		this.#errorHandler = errorHandler;

		this.#eventSource.onopen = () => {
			this.#connectionStatus = 'connected';
		};

		this.#eventSource.onerror = (event) => {
			console.log('readyState', this.#eventSource.readyState);
			this.#connectionStatus =
				this.#eventSource.readyState === EventSource.CLOSED ? 'closed' : 'connecting';

			this.#errorHandler(new Error(`SSE connection error: ${JSON.stringify(event)}`));
		};

		this.#eventSource.addEventListener('message', (event) => {
			console.log('received', event);
			this.#restartStaleTimeout();
		});

		this.addHandler("ping", () => {})

		this.#restartStaleTimeout();
	}

	#restartStaleTimeout() {
		if (this.#staleTimeout) clearTimeout(this.#staleTimeout);

		if (this.#connectionStatus === 'stale') {
			this.#connectionStatus = 'connected';
		}

		this.#staleTimeout = setTimeout(() => {
			if (this.#connectionStatus === 'connected') {
				this.#connectionStatus = 'stale';
			}
		}, CONNECTION_STALE_TIMEOUT_MS);
	}

	get connectionStatus() {
		return this.#connectionStatus;
	}

	// TODO: what happens if event handlers are added after message received? can messages be missed?
	// what happens between message fetch on load and SSE connection established? updates could be missed
	// check out ID and Last-Event-ID header/lastEventId query param
	addHandler<T extends keyof Events>(type: T, handler: (data: Events[T]) => void) {
		if (this.#handlers[type]) {
			this.#handlers[type].push(handler);
			return;
		}

		this.#handlers[type] = [];
		this.#handlers[type].push(handler);

		this.#eventSource.addEventListener(type, (event: MessageEvent<string>) => {
			this.#restartStaleTimeout();

			console.log(devalue.stringify('ping'));

			try {
				const devalued = devalue.parse(event.data);
				const payload = events[type].parse(devalued) as Events[typeof type];

				for (const handler of this.#handlers[type] || []) {
					handler(payload);
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
