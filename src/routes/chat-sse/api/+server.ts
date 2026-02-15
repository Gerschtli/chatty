import { getRequestEvent } from '$app/server';
import { redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getSubscriber, addSubscriber as registerSubscriber, removeSubscriber } from './registry';
import { Subscriber, type Event } from './sse';

export async function GET({ request, url }) {
	const user = requireLogin();

	const lastEventId = request.headers.get('Last-Event-ID') ?? url.searchParams.get('lastEventId');

	const subscriber = new Subscriber(user.id);
	registerSubscriber(subscriber);
	subscriber.onClose(() => removeSubscriber(subscriber));

	subscriber.setInitialEvents(loadEventsAfter(lastEventId));

	return new Response(subscriber.buildWebStream().pipeThrough(new TextEncoderStream()), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}

function loadEventsAfter(lastEventId: string | null) {
	console.log('loading events after:', lastEventId);
	return [
		{ id: randomUUID(), type: 'previous', data: 'prev1' },
		{ id: randomUUID(), type: 'previous', data: 'prev2' },
		{ id: randomUUID(), type: 'previous', data: 'prev3' }
	] satisfies Event[];
}

// setInterval(() => simulateLiveEvents(), 500);

let intervalEventId = 3;
function simulateLiveEvents() {
	console.log('running simulate send');
	const eventId = ++intervalEventId;

	for (const subscriber of getSubscriber('qf2nvwytgl6f77cfs3kczywp')) {
		subscriber.push({ id: randomUUID(), type: 'live', data: `live${eventId - 3}` });
	}
}

function requireLogin() {
	const { locals } = getRequestEvent();

	if (!locals.user) redirect(302, '/demo/lucia/login');

	return locals.user;
}
