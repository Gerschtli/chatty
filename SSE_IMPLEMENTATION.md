# Server-Sent Events (SSE) Implementation Summary

## Overview

This implementation provides a robust, user-isolated SSE system with exactly-once delivery guarantees using the transactional outbox pattern. All events are persisted and users can retrieve events they missed between page render and client connection.

## Key Components

### 1. Database Schema (src/lib/server/db/schema.ts)

**New Tables:**

- `event`: Stores all events with auto-incrementing ID
  - `id`: Auto-incrementing integer (primary key)
  - `userId`: References the user who triggered the event
  - `type`: Event type string (e.g., 'messageSent', 'error')
  - `data`: Serialized event payload (devalue format)
  - `createdAt`: Timestamp

- `outbox`: Transactional outbox for reliable delivery
  - `id`: Auto-incrementing integer (primary key)
  - `eventId`: References the event
  - `published`: Boolean flag (false = needs broadcast, true = sent to subscribers)
  - `createdAt`: Timestamp

### 2. Event Persistence Functions (src/lib/server/events.ts)

**`persistEvent(userId, type, data)`**

- Persists an event within a database transaction
- Creates both event and outbox entry atomically
- Only succeeds if transaction commits
- Returns the created event with its ID

**`markEventAsPublished(eventId)`**

- Marks an outbox entry as published after successful broadcast
- Called by the SSE broadcaster

**`getUnpublishedEvents()`**

- Retrieves all events awaiting broadcast

**`getLastEventId(userId)`**

- Fetches the highest event ID for a user
- Used during page load to determine what events to request on client connection

**`getEventsAfter(userId, afterEventId)`**

- Gets all events for a user after a specific ID
- If afterEventId is null, returns all events
- Used to send missed events when SSE connection is established

### 3. Enhanced SSE Server (src/lib/server/sse.ts)

**`subscribe(userId, lastEventId)`**

- Creates a new subscriber entry scoped to a specific user
- Tracks lastEventId to avoid resending events
- Returns a ReadableStream for the response

**`broadcastEvent(eventId, userId, event, data)`**

- Broadcasts events only to subscribers of that user
- Only sends to subscribers who haven't seen the event (based on lastEventId)
- Calls `markEventAsPublished()` if sent to at least one subscriber
- Includes automatic ping every 2 seconds to keep connections alive

### 4. API Endpoint (src/routes/chat-sse/api/+server.ts)

**GET /chat-sse/api**

- Accepts optional `lastEventId` query parameter
- Fetches all missed events from the database
- Sends missed events immediately before establishing the live SSE stream
- Sends proper SSE headers

**Event Flow:**

1. Client connects with optional lastEventId
2. Endpoint fetches missed events from DB
3. Missed events are sent immediately with their IDs
4. Live SSE stream is piped to continue for real-time updates
5. Client receives all events in correct order with IDs

### 5. Page Server (src/routes/chat-sse/+page.server.ts)

**`load()` action**

- Fetches the user's last event ID via `getLastEventId()`
- Returns it to the client for use in SSE connection

**`sendMessage` action**

- Uses `persistEvent()` to store the event in a transaction
- Calls `broadcastEvent()` with the returned event ID
- Ensures only committed events are broadcast

### 6. Client-Side Page (src/routes/chat-sse/+page.svelte)

- Receives `lastEventId` from page load
- Passes it to SSE connection via `lastEventId` query parameter
- Client-side SSE connection automatically receives:
  - Missed events (sent immediately)
  - Live events (streamed continuously)

## Exactly-Once Delivery Guarantee

The implementation achieves exactly-once semantics through:

1. **Transactional Outbox Pattern:**
   - Event creation and outbox entry are atomic
   - No event is published if the transaction fails

2. **Event ID Tracking:**
   - Each event has a unique, incrementing ID
   - Subscribers track their lastEventId
   - Events are only sent to subscribers with lower IDs

3. **Published Flag:**
   - Outbox entries track whether they've been published
   - Unpublished entries could be used for recovery

4. **Missed Event Retrieval:**
   - Clients can query all events after a specific ID
   - Events are stored permanently in the database
   - No events are lost even if connection is interrupted

## Multi-User & Multi-Client Support

- Events are user-scoped (each event has a userId)
- Each user can have multiple connected clients
- The broadcastEvent function filters subscribers by userId
- Every subscriber receives the same event (no duplicate delivery per client)
- Each client independently tracks its lastEventId

## Usage Example

### Server-side: Creating an event with transactional guarantees

```typescript
const persistedEvent = await persistEvent(user.id, 'messageSent', {
	id: message.id,
	userId: user.id,
	content: message.content,
	createdAt: message.createdAt,
	user: { username: user.username }
});

broadcastEvent(persistedEvent.id, user.id, 'messageSent', {
	id: message.id,
	userId: user.id,
	content: message.content,
	createdAt: message.createdAt,
	user: { username: user.username }
});
```

### Client-side: Connecting with missed event recovery

```typescript
const url = new URL('/chat-sse/api', window.location.href);
if (data.lastEventId !== null) {
	url.searchParams.set('lastEventId', String(data.lastEventId));
}

const sseClient = new SseClient(url.toString(), errorHandler);
sseClient.addHandler('messageSent', (payload) => {
	messages.push(payload);
});
```

## Database Migrations Required

Create the following tables in your Drizzle migration:

```sql
CREATE TABLE event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES event(id)
);

CREATE INDEX idx_outbox_published ON outbox(published);
CREATE INDEX idx_event_user_id ON event(user_id);
```
