'use client'

import { MapPin } from 'lucide-react'
import { PHOTO_PLACEHOLDER } from '@/app/types/messaging/messaging.types'
import { MentionText } from './BookingMention'

/**
 * The inside of a chat bubble: the photo (if the message has one) above its
 * caption, or just the text. A photo sent without a caption carries the
 * "📷 Photo" placeholder as its text, which is not shown under the picture.
 */
export default function MessagePhoto({ body, attachmentUrl, stamped }: {
  body:           string
  attachmentUrl?: string | null
  stamped?:       boolean
}) {
  if (!attachmentUrl) return <MentionText text={body} />
  const caption = body && body !== PHOTO_PLACEHOLDER ? body : null

  return (
    <figure className="flex flex-col gap-1.5">
      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="relative block overflow-hidden rounded-md outline-1 -outline-offset-[0.5px] outline-white/10" title="Open the full photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachmentUrl} alt={caption ?? 'Photo'} loading="lazy" className="block max-w-full w-[240px] max-h-[320px] object-cover bg-black/20" />
        {stamped && (
          <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/55 text-white ff-body text-[9px] tracking-wide">
            <MapPin size={9} /> Stamped
          </span>
        )}
      </a>
      {caption && <figcaption className="px-1.5 pb-0.5"><MentionText text={caption} /></figcaption>}
    </figure>
  )
}
