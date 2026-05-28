'use client'

import { useState } from 'react'
import { ShareModal } from './ShareModal'

const LINKS = [
  { label: 'Book', kind: 'scroll', href: '#how-it-works' },
  { label: 'Coach / Operate', kind: 'external', href: 'https://www.jefflougheed.ca' },
  { label: 'Share', kind: 'share', href: '#' },
] as const

export function Nav() {
  const [open, setOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const scrollToBooking = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
  }

  const renderItems = (mobile: boolean) => {
    const cls = mobile
      ? 'w-full border-b border-line py-4 text-left font-mono text-[14px] uppercase tracking-[0.18em] text-ink'
      : 'font-mono text-[13px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink'
    const closeIfMobile = () => {
      if (mobile) setOpen(false)
    }

    return LINKS.map((link) => {
      if (link.kind === 'share') {
        return (
          <button
            key={link.label}
            type="button"
            aria-label="Share this page"
            onClick={() => {
              closeIfMobile()
              setShareOpen(true)
            }}
            className={`${cls} cursor-pointer border-0 bg-transparent`}
          >
            {link.label}
          </button>
        )
      }

      if (link.kind === 'external') {
        return (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeIfMobile}
            className={cls}
          >
            {link.label}
          </a>
        )
      }

      // kind === 'scroll' (Book)
      return (
        <a
          key={link.label}
          href={link.href}
          onClick={(e) => {
            e.preventDefault()
            closeIfMobile()
            scrollToBooking()
          }}
          className={cls}
        >
          {link.label}
        </a>
      )
    })
  }

  return (
    <>
      <nav className="sticky top-0 z-40 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
        <div className="mx-auto flex h-14 sm:h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <div className="group relative flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.012em] whitespace-nowrap">
            <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-ink">
              <img src="/2bl/2blai_logo.svg" alt="" className="h-full w-full object-cover" />
            </span>
            <span className="hidden sm:inline">Second Brain Labs</span>

            {/* Desktop-only hover reveal — full logo illustration popover */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden origin-top-left scale-95 opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 motion-reduce:transition-none md:block"
            >
              <div className="rounded-xl border border-line bg-ink p-3 shadow-[0_20px_40px_-20px_rgba(31,26,20,0.45)]">
                <img src="/2bl/2blai_logo.svg" alt="" className="block h-[180px] w-[180px] object-contain" />
              </div>
            </div>
          </div>

          {/* Desktop links */}
          <div className="hidden items-center gap-8 md:flex">
            {renderItems(false)}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex flex-col gap-[5px] p-2 md:hidden"
          >
            <span className={`block h-px w-[22px] bg-ink transition-all ${open ? 'translate-y-[6px] rotate-45' : ''}`} />
            <span className={`block h-px w-[22px] bg-ink transition-all ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-px w-[22px] bg-ink transition-all ${open ? '-translate-y-[6px] -rotate-45' : ''}`} />
          </button>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <div className="flex flex-col px-5 pb-6 pt-1 md:hidden">
            {renderItems(true)}
          </div>
        )}
      </nav>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  )
}
