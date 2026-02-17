import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	age: integer('age'),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull()
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const chat = sqliteTable('chat', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull()
});

export const chatMember = sqliteTable('chat_member', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	chatId: integer('chat_id')
		.notNull()
		.references(() => chat.id),
	userId: text('user_id')
		.notNull()
		.references(() => user.id)
});

export const message = sqliteTable('message', {
	id: text('id').primaryKey(),
	chatId: integer('chat_id')
		.notNull()
		.references(() => chat.id),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	content: text('content').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const event = sqliteTable('event', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	type: text('type').notNull(),
	data: text('data').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const outbox = sqliteTable('outbox', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	eventId: integer('event_id')
		.notNull()
		.references(() => event.id),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;

export type Message = typeof message.$inferSelect;

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	messages: many(message),
	chatMembers: many(chatMember, { relationName: 'chatMembers' })
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}));

export const chatRelations = relations(chat, ({ many }) => ({
	members: many(chatMember, { relationName: 'members' }),
	messages: many(message, { relationName: 'messages' })
}));

export const chatMembersRelations = relations(chatMember, ({ one }) => ({
	chat: one(chat, {
		fields: [chatMember.chatId],
		references: [chat.id],
		relationName: 'members'
	}),
	user: one(user, {
		fields: [chatMember.userId],
		references: [user.id],
		relationName: 'chatMembers'
	})
}));

export const messageRelations = relations(message, ({ one }) => ({
	chat: one(chat, {
		fields: [message.chatId],
		references: [chat.id],
		relationName: 'messages'
	}),
	user: one(user, {
		fields: [message.userId],
		references: [user.id]
	})
}));

export const eventRelations = relations(event, ({ one }) => ({
	user: one(user, {
		fields: [event.userId],
		references: [user.id]
	})
}));

export const outboxRelations = relations(outbox, ({ one }) => ({
	event: one(event, {
		fields: [outbox.eventId],
		references: [event.id]
	})
}));
