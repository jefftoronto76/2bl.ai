// Placeholder until Commit 2 wires in the real <LandingPage /> sections.
// Exercises the Heirloom tokens (bg-hero-glow, font-display/body, accent,
// text-primary, text-muted) so the scaffold can be verified on preview.
export default function HeirloomPage() {
  return (
    <main className="bg-hero-glow min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display font-light text-text-primary text-5xl sm:text-6xl tracking-tight mb-4">
        Heirloom
      </h1>
      <p className="font-display italic text-accent text-lg sm:text-xl mb-3">
        Every life deserves to be a book.
      </p>
      <p className="font-body text-text-muted text-base max-w-md">
        An AI-guided biography platform. The full landing page arrives in the next step.
      </p>
    </main>
  );
}
