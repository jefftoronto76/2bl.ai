'use client'

import ReactMarkdown from 'react-markdown'
import { BookingCard } from './BookingCard'
import { markdownComponents } from './markdownComponents'
import type { BookingCardData, SageParameterPublic } from '@/services/chat/ui/v1/parseBookingCards'

export function SageReply({
  prose,
  cards,
  sageParameters,
}: {
  prose: string
  cards: BookingCardData[]
  sageParameters: SageParameterPublic[]
}) {
  if (!prose && cards.length === 0) return null

  return (
    <div
      data-sage-role="assistant"
      className="sage-animate max-w-[680px] border-l-2 border-accent/35 pl-4 [animation:sage-slide-up_0.28s_ease-out_both]"
    >
      {prose && (
        <div className="font-display text-[18px] font-normal leading-[1.55] tracking-[-0.005em] text-[color:var(--color-text-primary)] [text-wrap:pretty]">
          <ReactMarkdown components={markdownComponents}>{prose}</ReactMarkdown>
        </div>
      )}

      {cards.length > 0 && (
        <div className="mt-3 flex w-full flex-col gap-2">
          {cards.map((card, i) => {
            const match = sageParameters.find((p) => (p.url ?? '') === card.url)
            return (
              <BookingCard
                key={`${card.url}-${i}`}
                {...card}
                openAs={match?.open_as ?? 'new_tab'}
                embedCode={match?.embed_code ?? null}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
