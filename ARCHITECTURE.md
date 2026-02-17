# SSE System Architecture Diagrams

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         SVELTEKIT APP                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Page Routes                             │  │
│  │  /chat-sse/+page.server.ts  │  /chat-sse/+page.svelte  │  │
│  │  ├─ load(): lastEventId      │  ├─ receive: lastEventId │  │
│  │  └─ actions.sendMessage()    │  └─ connect: SSE + lastId│  │
│  └──────────────┬───────────────────────────┬──────────────┘  │
│                 │                           │                   │
│  ┌──────────────▼────────────────────────────▼──────────────┐  │
│  │          API Endpoint & Functions                        │  │
│  │  /chat-sse/api/+server.ts (GET)                         │  │
│  │  ├─ Authentication (redirect if not logged in)          │  │
│  │  ├─ Parse lastEventId query param                       │  │
│  │  ├─ getEventsAfter(userId, lastEventId)                │  │
│  │  ├─ subscribe(userId, lastEventId)                      │  │
│  │  └─ Return combined stream (missed + live)             │  │
│  └──────────────┬───────────────────────────────────────┬──┘  │
│                 │                                       │       │
│  ┌──────────────▼───────────┐  ┌─────────────────────┬─▼────┐ │
│  │    SSE Server (sse.ts)   │  │  Events (events.ts) │ DB  │ │
│  │                          │  │                     │     │ │
│  │ subscribe()              │  │ persistEvent()      │     │ │
│  │ ├─ Creates subscriber    │  │ ├─ Insert event    │     │ │
│  │ ├─ Returns stream        │  │ ├─ Insert outbox   │     │ │
│  │ └─ Tracks lastEventId    │  │ └─ (ATOMIC)        │     │ │
│  │                          │  │                     │     │ │
│  │ broadcastEvent()         │  │ getEventsAfter()    │     │ │
│  │ ├─ Filter by userId      │  │ └─ Query by ID      │     │ │
│  │ ├─ Filter by lastEventId │  │                     │     │ │
│  │ ├─ Send to subscribers   │  │ getLastEventId()    │     │ │
│  │ └─ Mark as published     │  │ └─ Max ID for user  │     │ │
│  │                          │  │                     │     │ │
│  │ Ping (every 2s)          │  │ getUnpublishedEvents│     │ │
│  │ └─ Keep connections live │  │ └─ For recovery     │     │ │
│  └────────────┬─────────────┘  └─────────┬─────────┬─────┘ │
│               │                          │         │         │
│  ┌────────────▼──────────────────────────▼─────────▼────┐   │
│  │         In-Memory Subscribers Map                    │   │
│  │  Map<subscriberId, {controller, userId, lastId}>   │   │
│  └────────────┬──────────────────────────────────────┘   │
│               │                                             │
└───────────────┼─────────────────────────────────────────────┘
                │
        ┌───────▼────────┐
        │  Browser SSE   │
        │  Connection    │
        │  (EventSource) │
        └────────────────┘
```

## Event Flow Diagram

```
User Action: Send Message
        │
        ▼
sendMessage() server action
        │
        ├─ Validate input
        ├─ Create message object
        │
        ├─ db.insert(message)  ◄─ MAIN TRANSACTION START
        │
        ├─ persistEvent(userId, 'messageSent', messageData)
        │   ├─ db.insert(event)
        │   └─ db.insert(outbox) ← published: false
        │                         ◄─ MAIN TRANSACTION END
        │
        ├─ Event stored in DB ✓
        │
        ├─ broadcastEvent(eventId, userId, 'messageSent', data)
        │   │
        │   ├─ For each subscriber in subscribers.values()
        │   │   │
        │   │   ├─ Filter: if subscriber.userId != userId → SKIP
        │   │   ├─ Filter: if subscriber.lastEventId >= eventId → SKIP
        │   │   │
        │   │   ├─ safeEnqueue(subscriber, eventId, payload)
        │   │   │   └─ subscriber.controller.enqueue(SSE text)
        │   │   │       └─ subscriber.lastEventId = eventId
        │   │   │
        │   │   └─ sentToAtLeastOne = true
        │   │
        │   └─ markEventAsPublished(eventId) [async, best-effort]
        │       └─ UPDATE outbox SET published=true
        │
        ├─ Event broadcast to all user's clients ✓
        │
        ▼
Browser receives via EventSource:
        │
        ├─ id: 42
        ├─ event: messageSent
        ├─ data: {id, content, user, ...}
        │
        ▼
Client handler executes
        │
        ├─ sseClient.addHandler('messageSent', handler)
        ├─ handler(payload) → messages.push(payload)
        │
        ▼
DOM Updated ✓
```

## Exactly-Once Delivery

```
Timeline:
---------

Client A connects:          Client B connects:
GET /chat-sse/api           GET /chat-sse/api
│                           │
├─ lastEventId = 5          ├─ lastEventId = 5
│                           │
└─ subscribe(userA, 5)      └─ subscribe(userA, 5)
   lastEventId = 5             lastEventId = 5
   subscribers[A]              subscribers[B]

EVENT 6 CREATED:
persistEvent() → event.id = 6

broadcastEvent(6, userA, ...) →
  For subscribers[A]:
    ├─ userId check: userA == userA ✓
    ├─ eventId check: 5 >= 6? NO ✓
    └─ Send to A, set A.lastEventId = 6

  For subscribers[B]:
    ├─ userId check: userA == userA ✓
    ├─ eventId check: 5 >= 6? NO ✓
    └─ Send to B, set B.lastEventId = 6

LATER: EVENT 7 CREATED:
broadcastEvent(7, userA, ...) →
  For subscribers[A]:
    ├─ userId check: userA == userA ✓
    ├─ eventId check: 6 >= 7? NO ✓
    └─ Send to A, set A.lastEventId = 7

  For subscribers[B]:
    ├─ userId check: userA == userA ✓
    ├─ eventId check: 6 >= 7? NO ✓
    └─ Send to B, set B.lastEventId = 7

CLIENT A RECONNECTS with lastEventId=6:
GET /chat-sse/api?lastEventId=6
│
├─ getEventsAfter(userA, 6)
│  └─ SELECT * FROM event WHERE userId='A' AND id > 6
│     └─ Returns: [event 7, event 8, ...] (if they exist)
│
└─ subscribe(userA, 6)
   lastEventId = 6
   subscribers[A_new]

   eventId check for event 7:
   ├─ 6 >= 7? NO ✓
   └─ Send missed event 7

RESULT:
✓ A received 6 once (original broadcast)
✓ B received 6 once (original broadcast)
✓ A_new received 6 zero times (already has it)
✓ A_new received 7 once (on reconnection)
✓ No event received twice
✓ No event lost
```

## Multi-User Isolation

```
Database:
┌─────────────────────────────────────────┐
│ event table                             │
├─────────────────────────────────────────┤
│ id│ userId    │ type         │ data     │
├───┼───────────┼──────────────┼──────────┤
│ 1 │ user_A    │ messageSent  │ ...      │
│ 2 │ user_B    │ messageSent  │ ...      │
│ 3 │ user_A    │ messageSent  │ ...      │
│ 4 │ user_B    │ messageSent  │ ...      │
└─────────────────────────────────────────┘

Subscribers Map:
┌──────────────────────────────────────────────────┐
│ subscribers = Map                                │
├──────────────────────────────────────────────────┤
│ "sub_1": { userId: "user_A", lastEventId: 3 }   │
│ "sub_2": { userId: "user_B", lastEventId: 4 }   │
│ "sub_3": { userId: "user_A", lastEventId: 2 }   │
│ "sub_4": { userId: "user_B", lastEventId: 3 }   │
└──────────────────────────────────────────────────┘

broadcastEvent(5, "user_A", ...) →
  Check each subscriber:
  - sub_1: user_A == user_A ✓, 3 >= 5 ✗ → SEND
  - sub_2: user_B == user_A ✗ → SKIP
  - sub_3: user_A == user_A ✓, 2 >= 5 ✗ → SEND
  - sub_4: user_B == user_A ✗ → SKIP

Result: Event 5 sent only to user_A's 2 clients
```

## Database Transaction Atomicity

```
Scenario 1: SUCCESS
─────────────────
BEGIN TRANSACTION
  ├─ INSERT into event (id=1, userId='A', ...)
  │  ✓ Success
  ├─ INSERT into outbox (eventId=1, published=false)
  │  ✓ Success
COMMIT
  ✓ Both rows created atomically
  ✓ Event is ready to broadcast
  ✓ broadcastEvent() proceeds

Scenario 2: FAILURE
──────────────────
BEGIN TRANSACTION
  ├─ INSERT into event (id=1, userId='A', ...)
  │  ✓ Success
  ├─ INSERT into outbox (eventId=1, published=false)
  │  ✗ CONSTRAINT VIOLATION or ERROR
ROLLBACK
  ✓ Event row is deleted
  ✓ Outbox row is not created
  ✓ No partial state
  ✓ broadcastEvent() never called
  ✓ Event lost (guaranteed not to be broadcast)

RESULT: Exactly-once guarantee maintained
        Either event is fully created OR not at all
```

## Client Missed Event Recovery

```
Page Load Timeline:
──────────────────

T=0:  Browser loads /chat-sse page
      │
      ├─ Page render starts
      │
      └─ load() action executes
         │
         ├─ getLastEventId('user_A')
         │  └─ SELECT MAX(id) FROM event WHERE userId='user_A'
         │     └─ Returns: 42
         │
         └─ Return data: { messages, lastEventId: 42 }

T=1:  Page renders in browser
      │
      ├─ onMount() executes (JS running)
      │
      └─ User sees historical messages

T=2:  Meanwhile, server-side events occur:
      │
      ├─ Event 43 created by another user (ignored)
      ├─ Event 44 created by user_A ← MISSED!
      └─ Event 45 created by user_A ← MISSED!

T=3:  Client SSE connection initiates:
      │
      ├─ new SseClient('/chat-sse/api?lastEventId=42')
      │
      └─ GET /chat-sse/api?lastEventId=42

T=4:  Server endpoint processes:
      │
      ├─ getEventsAfter('user_A', 42)
      │  └─ SELECT * FROM event
      │     WHERE userId='user_A' AND id > 42
      │     └─ Returns: [event 44, event 45]
      │
      ├─ subscribe('user_A', 42)
      │  └─ subscribers['sub_1'] = { userId: 'user_A', lastEventId: 42 }
      │
      └─ Response stream begins:

T=5:  Browser receives SSE stream:
      │
      ├─ id: 44
      │  event: messageSent
      │  data: {...}
      │
      ├─ id: 45
      │  event: messageSent
      │  data: {...}
      │
      └─ id: -1
         event: ping
         (live stream continues)

T=6:  Client processes events:
      │
      ├─ messages.push(event44)
      ├─ messages.push(event45)
      └─ DOM updated with all messages

RESULT: No gap in event stream
        All events received: 1-42 (from initial page)
                            44-45 (from missed recovery)
        Events 44-45 appear seamlessly
```

## High-Level Component Interactions

```
┌────────────┐
│   User     │
└─────┬──────┘
      │ (performs action)
      ▼
┌──────────────────┐
│  Page Component  │
│  +page.svelte    │
└────────┬─────────┘
         │ (form submit)
         ▼
┌──────────────────────┐
│  Server Action       │
│  +page.server.ts     │
│  sendMessage()       │
└────┬─────────────────┘
     │ (calls)
     ▼
┌──────────────────────┐
│ persistEvent()       │
│ events.ts            │
│ (ATOMIC DB TXN)      │
└────┬─────────────────┘
     │ (stores & returns event)
     ▼
┌──────────────────────┐
│ broadcastEvent()     │
│ sse.ts               │
└────┬─────────────────┘
     │ (sends to all subscribers)
     ▼
┌──────────────────────────────────┐
│ Subscriber Controllers           │
│ (in-memory Map)                  │
│ ├─ controller.enqueue(SSE text)  │
│ └─ Update lastEventId            │
└────┬─────────────────────────────┘
     │ (emits)
     ▼
┌──────────────────────┐
│ Browser EventSource  │
│ (receives SSE)       │
└────┬─────────────────┘
     │ (fires event)
     ▼
┌──────────────────────┐
│ Client Handler       │
│ sseClient handler()  │
│ addHandler()         │
└────┬─────────────────┘
     │ (updates state)
     ▼
┌──────────────────────┐
│ Svelte State         │
│ messages = [...]     │
└────┬─────────────────┘
     │ (reactive)
     ▼
┌──────────────────────┐
│ DOM Updated          │
│ User sees new msg    │
└──────────────────────┘
```

## Transactional Flow

```
persistEvent(userId, 'messageSent', data)
│
├─ db.transaction(async (tx) => {
│   │
│   ├─ tx.insert(event)
│   │  ├─ Prepare INSERT
│   │  └─ (not yet committed)
│   │
│   ├─ tx.insert(outbox)
│   │  ├─ Prepare INSERT
│   │  └─ (not yet committed)
│   │
│   ├─ Both rows in flight
│   │
│   ├─ Any error?
│   │  ├─ YES → ROLLBACK (no rows created)
│   │  └─ NO → COMMIT (both rows created)
│   │
│   └─ return event
│
└─ Event is now persisted OR not at all
   (no partial state possible)
```
