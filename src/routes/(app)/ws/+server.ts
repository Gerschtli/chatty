import { redirect, type Socket } from '@sveltejs/kit';

export const socket: Socket = {
	upgrade({ context, locals }) {
		console.log(`[ws] upgrade request`);

		if (!locals.user) redirect(302, '/login');

		context.user = locals.user;
	},

	open(peer) {
		console.log(`[ws] opened connection with peer ${peer}`, peer.context);
		// Send welcome to the new client
		peer.send(`Welcome to the server!`);

		// Join new client to the "chat" channel
		peer.subscribe(`chat`);

		// Notify every other connected client
		peer.publish(`chat`, `[system] ${peer} joined!`);
	},

	message(peer, message) {
		console.log(`[ws] received message from peer ${peer}`, `:`, message.text());

		// The server re-broadcasts incoming messages to everyone
		peer.publish(`chat`, `[${peer}] ${message}`);
	},

	close(peer) {
		console.log(`[ws] closed connection with peer ${peer}`);
		peer.publish(`chat`, `[system] ${peer} has left the chat!`);
		peer.unsubscribe(`chat`);
	},

	error(peer, error) {
		console.log(`[ws] error with peer ${peer}`, error);
	},
};
