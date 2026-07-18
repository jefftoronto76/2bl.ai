'use client'
import { useEffect, useState, Fragment } from 'react'

const SECTION_LINKS = [
  { label: 'Background', href: '#problem' },
  { label: 'Outcomes', href: '#outcomes' },
  { label: 'Principles', href: '#why' },
  { label: 'Getting Started', href: '#how-it-works' },
  { label: 'Work', href: '#career' },
  { label: 'Testimonials', href: '#testimonials' },
] as const

export function SectionRail() {
  const [active, setActive] = useState<string>(SECTION_LINKS[0].href)
  const [pastHero, setPastHero] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const hero = document.getElementById('hero')
      const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0
      setPastHero(heroBottom < window.innerHeight * 0.6)
    }
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const els = SECTION_LINKS.map((s) => document.querySelector(s.href)).filter(Boolean) as Element[]
    if (!els.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible.length) setActive('#' + (visible[0].target as HTMLElement).id)
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className={'section-rail' + (pastHero ? '' : ' is-hidden')}>
      {SECTION_LINKS.map((s, i) => (
        <Fragment key={s.href}>
          {i > 0 && <span className="section-rail-sep" aria-hidden="true">·</span>}
          <a
            href={s.href}
            className={'section-rail-link' + (active === s.href ? ' is-active' : '')}
            onClick={(e) => { e.preventDefault(); document.querySelector(s.href)?.scrollIntoView({ behavior: 'smooth' }) }}
          >
            {s.label}
          </a>
        </Fragment>
      ))}
    </div>
  )
}
