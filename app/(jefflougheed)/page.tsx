import { Nav } from './components/Nav'
import { WidgetShellHero, WidgetShellChat } from '@/components/shells/widget/WidgetShell'
import { Problem } from './components/Problem'
import { SectionOutcomes } from './components/SectionOutcomes'
import { SectionWhy } from './components/SectionWhy'
import { SectionCareer } from './components/SectionCareer'
import { SectionTestimonials } from './components/SectionTestimonials'
import { SectionProcess } from './components/SectionProcess'
import { Session } from './components/Session'
import { Footer } from './components/Footer'
import { Colophon } from './components/Colophon'
import { ChatSessionProvider } from '@/services/chat/ui/v1/core/ChatSessionProvider'

export default function Page() {
  return (
    // Singleton session shared by the two conversation surfaces, Hero and Chat
    // (the overlay), so a message sent on one appears on the other. instanceKey
    // "sage" resolves the same store for both. Nav/SectionProcess sit inside
    // harmlessly — they use only the shell action expand(), never the session
    // context. (Hero/Chat are wired to consume this in the following commits.)
    <ChatSessionProvider instanceKey="sage">
      <Nav />
      <main>
        <WidgetShellHero />
        <Problem />
        <SectionOutcomes />
        <SectionWhy />
        <SectionProcess />
        <SectionCareer />
        <SectionTestimonials />
        {/* <Session /> */}
        <WidgetShellChat />
      </main>
      <Footer />
      <Colophon />
    </ChatSessionProvider>
  )
}
