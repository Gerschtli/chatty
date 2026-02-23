import type { SocketHandler } from './socketHandler';

const socketHandlers = new Map<string, Map<string, SocketHandler>>();

export function registerSocketHandler(socketHandler: SocketHandler) {
	if (!socketHandlers.has(socketHandler.userId))
		socketHandlers.set(socketHandler.userId, new Map());

	socketHandlers.get(socketHandler.userId)!.set(socketHandler.id, socketHandler);
}

export function removeSocketHandler(socketHandler: SocketHandler) {
	socketHandlers.get(socketHandler.userId)?.delete(socketHandler.id);
}

export function getSocketHandlers(userId: string) {
	return socketHandlers.get(userId)?.values() ?? [];
}
