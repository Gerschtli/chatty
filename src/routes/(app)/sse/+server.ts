import { requireLogin } from '$lib/server/auth';
import { loadEventsAfter } from '$lib/server/events';
import { registerSubscriber, removeSubscriber } from '$lib/server/sse/registry';
import { Subscriber } from '$lib/server/sse/subscriber';

export async function GET({ request, url }) {
	const user = requireLogin();

	const lastEventId = request.headers.get('Last-Event-ID') ?? url.searchParams.get('lastEventId');

	const subscriber = new Subscriber(user.id);
	registerSubscriber(subscriber);
	subscriber.onClose(() => removeSubscriber(subscriber));

	subscriber.setInitialEvents(await loadEventsAfter(user.id, lastEventId));

	return new Response(subscriber.buildWebStream().pipeThrough(new TextEncoderStream()), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
}
