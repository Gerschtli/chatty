import z from 'zod';

export const events = {
	messageSent: z.object({
		id: z.string(),
		userId: z.string(),
		user: z.object({
			username: z.string()
		}),
		content: z.string(),
		createdAt: z.date()
	}),
	ping: z.undefined(),
	error: z.literal('error')
};

export type Events = {
	[K in keyof typeof events]: z.infer<(typeof events)[K]>;
};

export type Message = Events['messageSent'];
