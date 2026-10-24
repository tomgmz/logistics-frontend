'use client'

import { nameWithRole } from '@/lib/roles'
import type { Message, MessageParticipant } from '@/app/types/messaging/messaging.types'
import MessageItem from './MessageItem'
import type { DeleteScope } from './ConfirmDeleteDialog'

interface MessageBubbleProps {
  message:          Message
  isMine:           boolean
  currentUserId:    string
  sender?:          MessageParticipant & { is_online?: boolean }
  /** Last message of a run from one sender: name + avatar. */
  showSenderName?:  boolean
  showSeen?:        boolean
  onReply?:         (msg: Message) => void
  onReact?:         (messageId: string, emoji: string) => void
  /** 'me' deletes it for you; 'everyone' unsends it (your own messages only). */
  onDelete?:        (messageId: string, scope: DeleteScope) => void
  replyToSenderName?: string
  compact?:         boolean
}

/** A direct message, drawn by the shared Untitled UI MessageItem. */
export default function MessageBubble({
  message, isMine, currentUserId, sender, showSenderName = true, showSeen = false,
  onReply, onReact, onDelete, replyToSenderName, compact,
}: MessageBubbleProps) {
  const initials = sender
    ? `${sender.first_name?.[0] ?? '?'}${sender.last_name?.[0] ?? '?'}`.toUpperCase()
    : '??'

  return (
    <MessageItem
      messageId={message.id}
      isMine={isMine}
      currentUserId={currentUserId}
      senderName={sender ? nameWithRole(sender.first_name, sender.last_name, sender.role) : undefined}
      showName={showSenderName}
      initials={initials}
      online={sender?.is_online}
      createdAt={message.created_at}
      body={message.body}
      attachmentUrl={message.attachment_url}
      stamped={message.attachment_stamped}
      seen={isMine ? showSeen : undefined}
      pending={message.id.startsWith('optimistic-')}
      replyTo={message.reply_to ? { name: replyToSenderName, content: message.reply_to.content } : null}
      reactions={message.reactions}
      onReact={onReact ? (emoji) => onReact(message.id, emoji) : undefined}
      onReply={onReply ? () => onReply(message) : undefined}
      onDelete={onDelete ? (scope) => onDelete(message.id, scope) : undefined}
      compact={compact}
    />
  )
}
