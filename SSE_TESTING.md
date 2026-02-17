# SSE Implementation Testing & Verification Guide

## Testing Checklist

### 1. Database Setup

- [ ] Run Drizzle migrations to create `event` and `outbox` tables
- [ ] Verify tables exist: `SELECT * FROM sqlite_master WHERE type='table' AND name IN ('event', 'outbox');`

### 2. Transactional Outbox Pattern

Test that events are only persisted if the transaction succeeds:

```typescript
// Should create event and outbox entry atomically
const event = await persistEvent(userId, 'messageSent', {
	id: 'test-id',
	userId,
	content: 'test',
	createdAt: new Date(),
	user: { username: 'testuser' }
});

// Verify in database
const eventInDb = await db.query.event.findFirst({
	where: (event, { eq }) => eq(event.id, event.id)
});
```

### 3. Single User Event Isolation

Test that events are only sent to the correct user:

```
Setup:
- User A has client connected
- User B has client connected
- User A sends a message

Expected:
- User A receives event
- User B does NOT receive event
```

### 4. Multiple Clients Per User

Test that a user with multiple connected clients all receive events:

```
Setup:
- User A has 2 clients connected
- Send event for User A

Expected:
- Both clients receive the same event
- Only once per client (no duplicates)
```

### 5. Missed Event Recovery

Test that clients can recover events they missed between page load and connection:

```
Setup:
- Page loads, fetches lastEventId = 5
- Page render happens
- Event #6 is created while page is rendering
- Client connects with lastEventId=5

Expected:
- Client immediately receives event #6
- No gap in events
```

### 6. Event ID Continuity

Test that event IDs are sequential and never skipped:

```
- Create event for user -> ID 1
- Create event for user -> ID 2
- Create event for different user -> ID 3 (same sequence)
- Query events: should be 1, 2, 3 (no gaps)
```

### 7. Exactly-Once Delivery

Test that no event is delivered twice:

```
Setup:
- Client connected
- Event sent while client is connected

Expected:
- Event received exactly once
- ID tracking prevents duplicate send to same client
```

### 8. Concurrent Events

Test that multiple events can be created and broadcast concurrently:

```
Setup:
- 3 clients connected
- Create 5 events rapidly

Expected:
- All 5 events delivered to all 3 clients
- No events lost
- Proper ordering maintained
```

### 9. Connection Restoration

Test client reconnection with event recovery:

```
Setup:
- Client connects, receives events 1-5
- Client disconnects
- Events 6-8 are created
- Client reconnects with lastEventId=5

Expected:
- Client receives events 6-8 on reconnection
- Client doesn't receive 1-5 again
```

### 10. Ping Keep-Alive

Test that connections stay alive with regular pings:

```
Setup:
- Client connected
- No events for 30+ seconds
- Observe network tab

Expected:
- Ping event sent every 2 seconds
- Connection remains open
```

## Manual Testing Scenarios

### Scenario 1: Basic Message Flow

1. Open chat page (User A)
2. Note the `lastEventId` from page data
3. Send a message
4. Verify in browser console that `messageSent` event received
5. Check database for new event and outbox entry

### Scenario 2: Multiple Browser Windows

1. Open chat page in two windows (same user)
2. Send message from window 1
3. Verify message appears in window 2 via SSE
4. Check browser DevTools that both clients received the event

### Scenario 3: Page Refresh During Activity

1. Open chat page
2. Start typing (no submit yet)
3. In another tab: create a message (different user if possible)
4. Refresh the first tab before sending
5. Verify the newly created message appears after refresh

### Scenario 4: Network Simulation

1. Open chat page
2. Open DevTools Network tab
3. Set throttling to "Slow 3G"
4. Send a message
5. Verify message still arrives (may take longer)

### Scenario 5: Error State

1. Open chat page
2. Send "error" as message (triggers error event)
3. Verify error event received in browser
4. Verify error event in database

## Database Verification Queries

### Check all events for a user

```sql
SELECT * FROM event WHERE user_id = 'USER_ID' ORDER BY id;
```

### Check unpublished events

```sql
SELECT e.*, o.published
FROM event e
JOIN outbox o ON e.id = o.event_id
WHERE o.published = 0
ORDER BY e.id;
```

### Verify event integrity

```sql
-- Check for orphaned outbox entries
SELECT * FROM outbox WHERE event_id NOT IN (SELECT id FROM event);

-- Check event count matches outbox count
SELECT COUNT(*) as event_count FROM event;
SELECT COUNT(*) as outbox_count FROM outbox;
```

### Check subscriber activity (server logs)

```
Monitor console.log output for:
- "Failed to enqueue to subscriber"
- "Failed to mark event as published"
- Active subscriber count
```

## Performance Testing

### Load Test: Many Events

```typescript
// Generate 1000 events rapidly
for (let i = 0; i < 1000; i++) {
	await persistEvent(userId, 'messageSent', {
		id: `test-${i}`,
		userId,
		content: `Test message ${i}`,
		createdAt: new Date(),
		user: { username: 'testuser' }
	});
}

// Measure query time
console.time('fetch-1000-events');
const events = await getEventsAfter(userId, null);
console.timeEnd('fetch-1000-events');
```

### Concurrent Connections

```typescript
// Simulate 50 concurrent SSE connections
const connections = Array(50)
	.fill(0)
	.map(() => fetch('/chat-sse/api'));

// All should succeed and stay open
```

## Monitoring & Debugging

### Enable Debug Logging

Add to `src/lib/server/sse.ts`:

```typescript
console.debug(`[SSE] Broadcasting event ${eventId} to user ${userId}`);
console.debug(`[SSE] Sent to ${sentToAtLeastOne ? 'at least one' : 'zero'} subscribers`);
```

### Check Memory Usage

Monitor for subscriber leaks:

```typescript
console.log(`[SSE] Active subscribers: ${subscribers.size}`);
setInterval(() => {
	console.log(`[SSE] Subscriber count: ${subscribers.size}`);
}, 30000);
```

### Event Throughput

```typescript
let eventCount = 0;
setInterval(() => {
	console.log(`[SSE] Events/minute: ${eventCount}`);
	eventCount = 0;
}, 60000);

// In broadcastEvent:
eventCount++;
```

## Expected Behavior Summary

| Scenario             | Expected Outcome                                       |
| -------------------- | ------------------------------------------------------ |
| New message sent     | Event stored atomically, broadcast to all user clients |
| Client reconnects    | Receives all missed events in order                    |
| Error triggered      | Error event stored and broadcast                       |
| Concurrent clients   | All receive same event once                            |
| Connection idle      | Ping sent every 2 seconds                              |
| DB transaction fails | Event not created, not broadcast                       |
| Client disconnects   | Subscriber removed, no memory leak                     |
| Event ID skips       | Should never happen                                    |
| Duplicate delivery   | Should never happen                                    |

## Troubleshooting

### Events not appearing on client

1. Check network tab for SSE connection
2. Verify user ID matches
3. Check database for event record
4. Check browser console for errors
5. Verify `addHandler` was called before event sent

### High memory usage

1. Check subscriber count growth
2. Look for client disconnect issues
3. Verify error handling in `safeEnqueue`
4. Check for event listener leaks

### Missed events not recovered

1. Verify `lastEventId` query parameter sent
2. Check `getEventsAfter` returns correct events
3. Verify event IDs in database are sequential
4. Check endpoint authentication (redirect happens?)

### Events delivered twice

1. Check subscriber lastEventId tracking
2. Verify broadcastEvent ID check logic
3. Check for multiple subscribe calls per client
