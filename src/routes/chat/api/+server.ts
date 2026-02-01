import { subscribe } from '$lib/server/sse';

export async function GET() {
	const { stream } = subscribe();

	return new Response(stream.pipeThrough(new TextEncoderStream()), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
