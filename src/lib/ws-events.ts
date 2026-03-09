import z from 'zod';

const requestErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
});

// Define operations as a record of schemas
const operations = {
	'chat.sendMessage': {
		request: z.object({ chatId: z.number(), content: z.string() }),
		response: z.object({ messageId: z.string() }),
	},
	'chat.joinChat': {
		request: z.object({ chatId: z.number(), name: z.string() }),
		response: z.object({ success: z.boolean() }),
	},
} as const;

// Define events as a record of schemas
const events = {
	'chat.messageSent': z.object({
		id: z.string(),
		chatId: z.int(),
		userId: z.string(),
		user: z.object({
			username: z.string(),
		}),
		content: z.string(),
		createdAt: z.date(),
	}),
	'chat.userJoined': z.object({
		chatId: z.int(),
		userId: z.string(),
	}),
	error: z.object({
		code: z.string(),
		message: z.string(),
	}),
} as const;

// Helper for result/error union
const resultErrorUnion = (resultSchema: z.ZodTypeAny) =>
	z.union([
		z.object({ result: resultSchema, error: z.undefined().optional() }),
		z.object({ result: z.undefined().optional(), error: requestErrorSchema }),
	]);

// Build requestSchema dynamically
export const requestSchema = z.union(
	(Object.keys(operations) as (keyof typeof operations)[]).map((method) =>
		z.object({
			type: z.literal('request'),
			id: z.number(),
			method: z.literal(method),
			params: operations[method].request,
		}),
	),
);

// Build responseSchema dynamically
const responseSchema = z.union(
	(Object.keys(operations) as (keyof typeof operations)[]).map((method) =>
		z
			.object({
				type: z.literal('response'),
				requestId: z.number(),
				method: z.literal(method),
			})
			.and(resultErrorUnion(operations[method].response)),
	),
);

// Build eventSchema dynamically
const eventSchema = z.union(
	(Object.keys(events) as (keyof typeof events)[]).map((eventType) =>
		z.object({
			type: z.literal('event'),
			id: z.number(),
			eventType: z.literal(eventType),
			data: events[eventType],
		}),
	),
);

export const serverMessageSchema = z.union([responseSchema, eventSchema]);

// Inferred types

export type Operations = {
	[T in keyof typeof operations]: {
		request: z.infer<(typeof operations)[T]['request']>;
		response: z.infer<(typeof operations)[T]['response']>;
	};
};
export type Events = {
	[T in keyof typeof events]: z.infer<(typeof events)[T]>;
};
export type RequestError = z.infer<typeof requestErrorSchema>;

export type Request<T extends keyof Operations> = {
	type: 'request';
	id: number;
	method: T;
	params: Operations[T]['request'];
};

export type Response<T extends keyof Operations> = {
	type: 'response';
	requestId: number;
	method: T;
} & (
	| { result: Operations[T]['response']; error?: undefined }
	| { result?: undefined; error: RequestError }
);

export type Event<E extends keyof Events> = {
	type: 'event';
	id: number;
	eventType: E;
	data: Events[E];
};
