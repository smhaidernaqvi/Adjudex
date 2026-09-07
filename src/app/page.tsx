/**
 * Landing Page — Adjudex
 *
 * Public-facing page. It describes what Adjudex actually is: a PRIVATE trust,
 * agreement and escrow layer for two parties who already found each other
 * somewhere else. There is deliberately no job board, no browsing and no
 * "available projects" anywhere in the product.
 */

import Link from "next/link";

const PILLARS = [
  {
    title: "Private by construction",
    body: "A transaction is addressed to exactly one other account. Only those two participants can ever see its terms, requirements, amounts, verification results or agreement history.",
  },
  {
    title: "AI-refined requirements",
    body: "Rough notes go in; objective, testable acceptance criteria come out, along with the ambiguities the AI found. Refinement is mandatory and must be confirmed before a request can be sent.",
  },
  {
    title: "Mutually locked agreements",
    body: "Nothing becomes binding until both parties accept the same version of the scope, requirements, amount and currency. The accepted snapshot is then locked as agreement v1.",
  },
  {
    title: "No unilateral changes",
    body: "After locking, neither side can edit terms or move the money. Either party proposes a change; it takes effect only when the other accepts, which appends a new immutable version.",
  },
  {
    title: "Escrow against the agreed version",
    body: "Funds are held against the version currently in force and released only after delivery, AI verification and review.",
  },
  {
    title: "AI verification of delivery",
    body: "Submissions are checked requirement-by-requirement against the locked agreement — never against rough notes, an unaccepted proposal, or a one-sided edit.",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-20">
      <div className="flex max-w-2xl flex-col items-center text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          The trust layer for deals you already made
        </h1>
        <p className="mt-4 text-lg text-zinc-500">
          You found each other on LinkedIn, Fiverr, Discord or a
          referral. Adjudex is where the two of you turn that
          conversation into an agreement that holds — with AI-refined
          requirements, mutual locking, escrow and objective
          verification.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Sign in
          </Link>
        </div>

        <p className="mt-4 text-xs text-zinc-400">
          Both parties need an Adjudex account. There is no public
          marketplace and nothing to browse.
        </p>
      </div>

      <div className="mt-16 grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((p) => (
          <div
            key={p.title}
            className="rounded-lg border border-zinc-200 p-4"
          >
            <h2 className="text-sm font-semibold">{p.title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
