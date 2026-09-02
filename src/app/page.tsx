import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LinkButton } from "@/components/ui";
import { CheckBadge, Confetti, LogoLockup, Wordmark } from "@/components/brand";

const PROMISES = [
  {
    title: "Stay ready",
    body: "Track every detail and deadline with confidence.",
    tone: "bg-green-brand",
  },
  {
    title: "Keep everyone together",
    body: "Organize people, forms, and info in one place.",
    tone: "bg-coral",
  },
  {
    title: "Handle payments",
    body: "Know exactly who has paid and what is outstanding.",
    tone: "bg-gold",
  },
  {
    title: "Communicate clearly",
    body: "Send waiver links parents can sign from their phone.",
    tone: "bg-green-brand",
  },
  {
    title: "Pray over every step",
    body: "Invite prayer and cover your trip in faith.",
    tone: "bg-coral",
  },
  {
    title: "Make an impact",
    body: "Focus on what matters: people, purpose, and God's Kingdom.",
    tone: "bg-gold",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: { select: { slug: true } } },
      orderBy: { createdAt: "asc" },
    });
    redirect(membership ? `/orgs/${membership.organization.slug}` : "/onboarding");
  }

  return (
    <div className="min-h-dvh bg-cream">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <LogoLockup />
        <div className="flex items-center gap-2">
          <LinkButton href="/login" variant="ghost" size="sm">
            Sign in
          </LinkButton>
          <LinkButton href="/signup" size="sm">
            Get started
          </LinkButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-20">
        <section className="pt-6 sm:pt-12">
          <Wordmark size="lg" />
          <h1 className="mt-7 font-display text-4xl font-extrabold leading-[1.05] text-navy sm:text-6xl">
            Keep the trip
            <br />
            together.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-navy-soft">
            The faith-first trip planner for church groups. Ready. Set. Amen. helps churches plan
            amazing trips with less stress and more purpose — organize people, track details,
            collect waivers, and pray over every step.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <LinkButton href="/signup" size="lg">
              Start your first trip
            </LinkButton>
            <LinkButton href="/login" variant="secondary" size="lg">
              I already have an account
            </LinkButton>
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROMISES.map((p) => (
            <div key={p.title} className="rounded-2xl border border-line bg-white p-5">
              <span
                className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full ${p.tone} text-white`}
                aria-hidden="true"
              >
                <CheckBadge className="h-6 w-6 bg-transparent" />
              </span>
              <p className="font-display text-lg font-bold text-navy">{p.title}</p>
              <p className="mt-1 text-sm text-navy-soft">{p.body}</p>
            </div>
          ))}
        </section>

        <section className="relative mt-16 overflow-hidden rounded-3xl bg-navy px-6 py-12 text-center text-white">
          <Confetti className="pointer-events-none absolute inset-x-0 top-0 h-16 w-full opacity-80" />
          <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-gold">
            The final step
          </p>
          <p className="mx-auto mt-3 max-w-lg font-display text-2xl font-extrabold sm:text-3xl">
            You&rsquo;ve checked the boxes.
            <br />
            Now let&rsquo;s cover the trip in prayer.
          </p>
          <p className="mx-auto mt-4 max-w-md text-sm text-white/70">
            Every trip ends preparation the same way: praying over the people, the travel, and what
            God wants to do. Not a score. Not a badge. Just the most important step.
          </p>
        </section>

        <p className="mt-10 text-center text-xs text-navy-faint">
          Ready Set Amen provides electronic waiver collection tools. Organizations are responsible
          for ensuring their waiver language and processes meet applicable legal requirements.{" "}
          <Link href="/legal/esign" className="underline">
            Electronic records disclosure
          </Link>
        </p>
      </main>
    </div>
  );
}
