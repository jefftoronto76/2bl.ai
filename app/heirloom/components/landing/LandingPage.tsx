'use client';

/*
  LandingPage — composes the redesigned storefront.

  The Hero (HeroSection.tsx) is the photo-constellation hero: its
  "Start Your Story" keeps the production chat activation —
  dispatch({ type: 'OPEN_CHAT' }) from useChatStore — same as every other
  CTA on this page. PageThread.tsx is a self-contained, absolutely-positioned
  overlay that draws the scroll-triggered thread through every section below
  the hero — it finds section boundaries via each section's own
  data-screen-label attribute, so it needs no props from here.

  Section order:
  PageThread (overlay) → Nav → Hero → WhatIs → HowItWorks(book) → ContributorModel
      → Features(best parts) → BuyerPersonas → Pricing → Cta(closing) → Footer
*/

import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { PageThread } from './PageThread';
import { WhatIsHeirloomSection } from './WhatIsHeirloomSection';
import { HowItWorksSection } from './HowItWorksSection';
import { ContributorModelSection } from './ContributorModelSection';
import { FeaturesSection } from './FeaturesSection';
import { BuyerPersonasSection } from './BuyerPersonasSection';
import { PricingSection } from './PricingSection';
import { CtaSection } from './CtaSection';
import { Footer } from './Footer';

// ─── Root ──────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-text-primary">
      <PageThread />
      <LandingNav />
      <HeroSection />
      <WhatIsHeirloomSection />
      <HowItWorksSection />
      <ContributorModelSection />
      <FeaturesSection />
      <BuyerPersonasSection />
      <PricingSection />
      <CtaSection />
      <Footer />
    </div>
  );
}

export default LandingPage;
