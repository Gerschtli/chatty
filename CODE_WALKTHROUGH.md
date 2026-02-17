# Code Walkthrough: SSE Implementation

This document provides a detailed walkthrough of how the SSE system works by following a message from creation to delivery.

## Complete Message Flow Example

### Step 1: User Sends a Message

**File:** `src/routes/chat-sse/+page.svelte`

```typescript
// User submits form
// <form method="POST" action="?/sendMessage">
```

### Step 2: Server Action Receives Request

**File:** `src/routes/chat-sse/+page.server.ts`

```typescript
export const actions = {
	sendMessage: async ({ request }) => {
		// 1. Check authentication
		const user = requireLogin();

		// 2. Get form data
		const formData = await request.formData();
		const content = formData.get('content') as string;

		// 3. Validate
		if (!content) error(400, 'Message content cannot be empty');

		// Special case: error test
		if (content === 'error') {
			const errorEvent = await persistEvent(user.id, 'error', 'error');
			broadcastEvent(errorEvent.id, user.id, 'error', 'error');
			return;
		}

		// 4. Create message object
		const message = {
			id: randomUUID(),
			userId: user.id,
			content,
			createdAt: new Date()
		};

		// 5. Save message to database
		await db.insert(table.message).values(message);
		// ✓ Message is now persisted

		// 6. Create and persist event (atomic transaction)
		// THIS IS THE KEY PART - Transactional outbox pattern
		const persistedEvent = await persistEvent(user.id, 'messageSent', {
			...message,
			user: { username: user.username }
		});
		// ✓ Event is now in database
		// ✓ Outbox entry created (published: false)

		// 7. Broadcast event to all connected clients
		broadcastEvent(persistedEvent.id, user.id, 'messageSent', {
			...message,
			user: { username: user.username }
		});
		// ✓ Event sent to all subscribers
		// ✓ Outbox marked as published (best-effort)
	}
};
```

### Step 3: Event Persistence with Transactional Guarantee

**File:** `src/lib/server/events.ts`

```typescript
export async function persistEvent<T extends keyof Events>(
	userId: string,
	type: T,
	data: Events[T]
): Promise<tables.Event> {
	const now = new Date();
	const serializedData = devalue.stringify(data); // Serialize to string

	// ATOMIC TRANSACTION
	const result = await db.transaction(async (tx) => {
		// Step 1: Insert event record
		const insertedEvent = await tx
			.insert(tables.event)
			.values({
				userId, // "user123"
				type, // "messageSent"
				data: serializedData, // "{...JSON...}"
				createdAt: now // Now timestamp
			})
			.returning(); // Get the inserted row

		const eventId = insertedEvent[0].id; // Auto-incremented ID: 42

		// Step 2: Insert outbox entry
		// This marks the event as unpublished
		await tx.insert(tables.outbox).values({
			eventId, // 42
			published: false, // Not yet broadcast
			createdAt: now
		});

		return insertedEvent[0];
	});

	// ✓ If we get here, BOTH inserts succeeded
	// ✓ If anything failed, ROLLBACK happened (no partial state)
	return result;
	// Returns: { id: 42, userId: "user123", type: "messageSent", data: "{...}", createdAt: ... }
}
```

**Database State After Step 3:**

```sql
-- event table
┌────┬─────────┬──────────────┬───────────────┬────────────────┐
│ id │ user_id │ type         │ data          │ created_at     │
├────┼─────────┼──────────────┼───────────────┼────────────────┤
│ 42 │ user123 │ messageSent  │ {...payload...} │ 2024-01-01... │
└────┴─────────┴──────────────┴───────────────┴────────────────┘

-- outbox table
┌────┬──────────┬───────────┬────────────────┐
│ id │ event_id │ published │ created_at     │
├────┼──────────┼───────────┼────────────────┤
│ 15 │ 42       │ false     │ 2024-01-01...  │
└────┴──────────┴───────────┴────────────────┘
```

### Step 4: Broadcasting to Connected Clients

**File:** `src/lib/server/sse.ts`

```typescript
export function broadcastEvent<T extends keyof Events>(
	eventId: number, // 42
	userId: string, // "user123"
	event: T, // "messageSent"
	data: Events[T] // { id, userId, content, user, createdAt }
) {
	// Create SSE payload
	const payload = `event: messageSent\ndata: {...serialized data...}\n\n`;

	let sentToAtLeastOne = false;

	// Iterate through all connected subscribers
	for (const subscriber of subscribers.values()) {
		// subscriber = {
		//   controller: ReadableStreamDefaultController,
		//   id: "sub_1",
		//   userId: "user123",
		//   lastEventId: 41
		// }

		// FILTER 1: Only send to subscribers of this user
		if (subscriber.userId !== userId) {
			continue; // Skip this subscriber (wrong user)
		}

		// FILTER 2: Only send to subscribers who haven't seen this event
		// This prevents duplicate delivery
		if (subscriber.lastEventId >= eventId) {
			continue; // Skip (they already have this event)
		}

		// This subscriber gets the event
		safeEnqueue(subscriber, eventId, payload);
		sentToAtLeastOne = true;
	}

	// Mark as published if we sent to at least one subscriber
	if (sentToAtLeastOne) {
		markEventAsPublished(eventId).catch((err) => {
			console.error('Failed to mark event as published:', err);
		});
	}
}

function safeEnqueue(subscriber: Subscriber, eventId: number, payload: string) {
	try {
		// Update subscriber's lastEventId to prevent duplicate delivery
		subscriber.lastEventId = Math.max(subscriber.lastEventId, eventId);

		// Format SSE message with ID
		// Format: id: 42\nevent: messageSent\ndata: {...}\n\n
		subscriber.controller.enqueue(`id: ${subscriber.lastEventId}\n${payload}`);
		// ✓ Message sent to browser via SSE
	} catch (err) {
		console.error('Failed to enqueue to subscriber', err);
		// If send fails, remove this subscriber
		subscribers.delete(subscriber.id);
	}
}
```

**What Each Subscriber Receives:**

```
id: 42
event: messageSent
data: {"id":"msg-uuid","userId":"user123","content":"Hello","user":{"username":"alice"},"createdAt":"2024-01-01T12:00:00Z"}

```

### Step 5: Browser Receives SSE Event

**File:** `src/lib/sse.svelte.ts`

```typescript
export class SseClient {
	constructor(url: string, errorHandler: (err: unknown) => void) {
		// Create EventSource connection
		this.#eventSource = new EventSource(url);
		// Opens connection to /chat-sse/api

		this.#eventSource.onopen = () => {
			this.#connectionStatus = 'connected';
		};

		this.#errorHandler = errorHandler;
	}

	addHandler<T extends keyof Events>(eventName: T, handler: (data: Events[T]) => void) {
		// Register handler for "messageSent" events
		this.#eventSource.addEventListener(eventName, (event: MessageEvent<string>) => {
			// Browser fires this when SSE message received
			// event.data = "{...JSON string...}"
			// event.lastEventId = "42"

			try {
				// Parse devalue JSON
				const devalued = devalue.parse(event.data);

				// Validate with Zod schema
				const payload = events[eventName].parse(devalued);
				// payload = { id: "...", userId: "...", content: "...", user: {...}, createdAt: Date }

				// Execute all handlers for this event
				for (const handler of this.#handlers[eventName] || []) {
					handler(payload);
					// ✓ Handler called with typed data
				}
			} catch (err) {
				this.#errorHandler(err);
			}
		});
	}
}
```

**Step 5 in Component File:** `src/routes/chat-sse/+page.svelte`

```typescript
onMount(() => {
	messages = data.messages.slice(); // Initial messages from load()

	// Create SSE client with missed event recovery
	const url = new URL('/chat-sse/api', window.location.href);
	if (data.lastEventId !== null) {
		// Pass the last known event ID so server can send missed events
		url.searchParams.set('lastEventId', String(data.lastEventId));
	}

	sseClient = new SseClient(url.toString(), (err) => {
		console.error('SSE error:', err);
	});

	// Register handler for new messages
	sseClient.addHandler('messageSent', (payload) => {
		console.info('Received messageSent from server: ', payload);
		// payload is type-safe: { id, userId, content, user, createdAt }
		messages.push(payload); // ✓ Add to messages array
		// Svelte reactivity automatically updates DOM
	});

	sseClient.addHandler('ping', () => {
		console.info('Received ping from server'); // Keep-alive
	});

	sseClient.addHandler('error', () => {
		console.error('Received error from server');
		throw new Error('SSE Error received from server');
	});

	return () => sseClient?.close(); // Cleanup on unmount
});
```

### Step 6: DOM Updates Automatically

The message appears in the UI because:

1. `messages` is a Svelte state variable
2. `messages.push(payload)` updates the state
3. Svelte's reactivity automatically updates the DOM
4. User sees the new message appear in the chat

## Missed Event Recovery Flow

When a client reconnects, here's what happens:

### Step 1: Page Load

**File:** `src/routes/chat-sse/+page.server.ts`

```typescript
export async function load() {
	const user = requireLogin();

	// Get all historical messages
	const messages = await db.query.message.findMany({
		orderBy: (message, { asc }) => [asc(message.createdAt)],
		with: {
			user: { columns: { username: true } }
		}
	});

	// GET THE LAST EVENT ID
	// This tells us: "events up to ID 42 have been shown to the user"
	const lastEventId = await getLastEventId(user.id);
	// Returns: 42 (or null if no events yet)

	return { messages, userId: user.id, lastEventId };
}
```

### Step 2: API Endpoint Receives Connection

**File:** `src/routes/chat-sse/api/+server.ts`

```typescript
export async function GET({ url }) {
	const { locals } = getRequestEvent();

	// Check auth
	if (!locals.user) redirect(302, '/demo/lucia/login');

	// Extract lastEventId from query parameter
	// ?lastEventId=42
	const lastEventIdParam = url.searchParams.get('lastEventId');
	const lastEventId = lastEventIdParam ? parseInt(lastEventIdParam, 10) : null;

	// CRITICAL: Fetch missed events
	// "Give me all events for user123 where id > 42"
	const missedEvents = await getEventsAfter(locals.user.id, lastEventId);
	// Returns: [ event 43, event 44, event 45, ... ]

	// Create live subscription
	const { stream } = subscribe(locals.user.id, lastEventId);

	// Combine missed events + live stream
	const combinedStream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				// FIRST: Send all missed events immediately
				for (const event of missedEvents) {
					const payload = `id: ${event.id}\nevent: ${event.type}\ndata: ${event.data}\n\n`;
					// event.data is already serialized (from database)
					controller.enqueue(encoder.encode(payload));
				}

				// SECOND: Pipe live stream
				const reader = stream.getReader();
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						controller.enqueue(new TextEncoder().encode(value));
					}
				} finally {
					reader.releaseLock();
				}

				controller.close();
			} catch (err) {
				controller.error(err);
			}
		}
	});

	return new Response(combinedStream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
```

### Step 3: Client Receives All Events in Order

Browser SSE stream:

```
id: 43
event: messageSent
data: {"id":"msg2",...}

id: 44
event: messageSent
data: {"id":"msg3",...}

id: 45
event: messageSent
data: {"id":"msg4",...}

id: -1
event: ping
data: "ping"
```

Client handler fires for each event:

```typescript
sseClient.addHandler('messageSent', (payload) => {
	messages.push(payload); // Add events 43, 44, 45
});
```

Result: **No gap in events, no duplicates**

## Exactly-Once Guarantee in Action

### Scenario: Client has 2 browser tabs open

```
Browser Tab A:
├─ Subscribes with lastEventId=42
├─ subscribers['sub_1'] = { userId: 'user123', lastEventId: 42 }

Browser Tab B:
├─ Subscribes with lastEventId=42
├─ subscribers['sub_2'] = { userId: 'user123', lastEventId: 42 }

Server creates event 43:
├─ persistEvent() → event.id = 43
├─ broadcastEvent(43, 'user123', ...)
│  ├─ Check sub_1: 42 >= 43? NO → SEND, set sub_1.lastEventId=43
│  └─ Check sub_2: 42 >= 43? NO → SEND, set sub_2.lastEventId=43

Server creates event 44:
├─ persistEvent() → event.id = 44
├─ broadcastEvent(44, 'user123', ...)
│  ├─ Check sub_1: 43 >= 44? NO → SEND, set sub_1.lastEventId=44
│  └─ Check sub_2: 43 >= 44? NO → SEND, set sub_2.lastEventId=44

Tab A closes and reconnects:
├─ New connection with lastEventId=44
├─ getEventsAfter('user123', 44) → [] (no events after 44)
├─ subscribers['sub_3'] = { userId: 'user123', lastEventId: 44 }

Tab B still connected:
├─ subscribers['sub_2'] = { userId: 'user123', lastEventId: 44 }

Server creates event 45:
├─ persistEvent() → event.id = 45
├─ broadcastEvent(45, 'user123', ...)
│  ├─ Check sub_2: 44 >= 45? NO → SEND, set sub_2.lastEventId=45
│  └─ Check sub_3: 44 >= 45? NO → SEND, set sub_3.lastEventId=45

Result:
✓ Tab A: Received 43, 44 on first load, then 45 on reconnect
✓ Tab B: Received 43, 44 on first load, then 45 continuously
✓ Tab A (reconnected): Did NOT receive 43, 44 again
✓ Each event received exactly once per tab
✓ No event loss, no duplicates
```

## Summary

The implementation ensures:

1. **Atomic Storage**: Event and outbox entry created together
2. **User Isolation**: Events filtered by userId
3. **No Duplicates**: Subscriber lastEventId prevents resends
4. **No Loss**: Database persistence + recovery mechanism
5. **Multi-Client**: Each client tracked separately
6. **Exactly-Once**: Combination of all above

This is achieved through:

- Transactional database operations
- In-memory subscriber tracking with event IDs
- Missed event recovery via query parameter
- Serialized event data for persistence
- Type-safe event handling with Zod
