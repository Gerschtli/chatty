import z from 'zod';

export const events = {
	message: z.object({
		id: z.string(),
		userId: z.string(),
		user: z.object({
			username: z.string()
		}),
		content: z.string(),
		createdAt: z.date()
	}),
	ping: z.literal('ping'),
	error: z.literal('error')
};

export type Events = {
	[K in keyof typeof events]: z.infer<(typeof events)[K]>;
};
