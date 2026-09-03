/**
 * Landing Page — Freelancer-Client Trust Platform
 *
 * This is the public-facing landing page.
 * Will contain hero section, feature highlights, and CTAs.
 */

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight">
        Freelancer–Client Trust Platform
      </h1>
      <p className="mt-4 max-w-lg text-center text-lg text-zinc-500">
        Protected transactions through simulated escrow, AI requirement
        verification, and controlled deliverable release.
      </p>
    </main>
  );
}
