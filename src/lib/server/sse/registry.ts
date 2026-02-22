import type { Subscriber } from './subscriber';

const subscribers = new Map<string, Map<string, Subscriber>>();

export function registerSubscriber(subscriber: Subscriber) {
	if (!subscribers.has(subscriber.userId)) subscribers.set(subscriber.userId, new Map());

	subscribers.get(subscriber.userId)!.set(subscriber.id, subscriber);
}

export function removeSubscriber(subscriber: Subscriber) {
	subscribers.get(subscriber.userId)?.delete(subscriber.id);
}

export function getSubscribers(userId: string) {
	return subscribers.get(userId)?.values() ?? [];
}
