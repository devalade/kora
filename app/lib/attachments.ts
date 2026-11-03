import { and, db, eq, isNull } from 'void/db';
import { attachments, channelMembers, messages } from '@schema';

export async function attachmentForUser(id: string, userId: string) {
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!row) return null;
  if (!row.messageId) return row.uploaderId === userId ? row : null;
  const [message] = await db
    .select({ channelId: messages.channelId })
    .from(messages)
    .where(and(eq(messages.id, row.messageId), isNull(messages.deletedAt)));
  if (!message) return null;
  const member = await db
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .where(
      and(eq(channelMembers.channelId, message.channelId), eq(channelMembers.userId, userId)),
    );
  return member.length > 0 ? row : null;
}
