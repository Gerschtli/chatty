import { subscribe } from '$lib/server/sse';

export async function GET({ request, url }) {
	const lastEventIdHeader = request.headers.get('Last-Event-Id');
	const lastEventIdQuery = url.searchParams.get('lastEventId');
	const lastEventId = lastEventIdHeader ?? lastEventIdQuery;

	const { stream } = await subscribe(lastEventId);

	return new Response(stream.pipeThrough(new TextEncoderStream()), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
