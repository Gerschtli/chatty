import type { Socket } from '@sveltejs/kit';

export const socket: Socket = {
	open(peer) {
		// Send welcome to the new client
		peer.send('Welcome to the server!');

		// Join new client to the "chat" channel
		peer.subscribe('chat');

		// Notify every other connected client
		peer.publish('chat', `[system] ${peer} joined!`);
	},

	message(peer, message) {
		// The server re-broadcasts incoming messages to everyone
		peer.publish('chat', `[${peer}] ${message}`);
	},

	close(peer) {
		peer.publish('chat', `[system] ${peer} has left the chat!`);
		peer.unsubscribe('chat');
	},
};
