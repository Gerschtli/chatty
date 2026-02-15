import { requireLogin } from '$lib/server/auth';
import { registerSubscriber, removeSubscriber } from '$lib/server/registry';
import { Subscriber, type Event } from '$lib/server/sse';
import { randomUUID } from 'node:crypto';

export async function GET({ request, url }) {
	const user = requireLogin();

	const lastEventId = request.headers.get('Last-Event-ID') ?? url.searchParams.get('lastEventId');

	const subscriber = new Subscriber(user.id);
	registerSubscriber(subscriber);
	subscriber.onClose(() => removeSubscriber(subscriber));

	subscriber.setInitialEvents(await loadEventsAfter(lastEventId));

	return new Response(subscriber.buildWebStream().pipeThrough(new TextEncoderStream()), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}

// TODO: implement
async function loadEventsAfter(lastEventId: string | null) {
	console.log('loading events after:', lastEventId);
	return [
		{ id: randomUUID(), type: 'previous', data: 'prev1' },
		{ id: randomUUID(), type: 'previous', data: 'prev2' },
		{ id: randomUUID(), type: 'previous', data: 'prev3' }
	] satisfies Event[];
}
