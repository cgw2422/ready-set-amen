import type { Metadata } from "next";
import { CheckBadge, Wordmark } from "@/components/brand";
import { ChurchVan, DottedRoute, LocationPin, PrayingHands } from "@/components/marketing/art";
import { SiteHeader } from "@/components/marketing/chrome";
import { Icon } from "@/components/marketing/icons";
import {
  Band,
  Display,
  Eyebrow,
  FaqItem,
  FeatureCard,
  HeadcountPhone,
  ReadinessPhone,
} from "@/components/marketing/sections";
import { LAUNCH_PRICE, REGULAR_PRICE } from "@/lib/pricing";
import { appOrigin } from "@/lib/hosts";

export const metadata: Metadata = {
  title: "Ready. Set. Amen. — Keep the trip together.",
  description:
    "The faith-first trip planner for church groups. Organize people, waivers, payments, vehicles, rooms, and every detail — then cover the trip in prayer.",
};

const FEATURES = [
  {
    title: "People & Contacts",
    body: "Keep attendee, parent, medical, and emergency information organized.",
    icon: <Icon.people />,
  },
  {
    title: "Waivers & Forms",
    body: "Create, send, and collect electronic waivers from any device.",
    icon: <Icon.waiver />,
  },
  {
    title: "Payments",
    body: "Track deposits, partial payments, scholarships, waived amounts, and balances.",
    icon: <Icon.payment />,
  },
  {
    title: "Transportation",
    body: "Add vehicles, drivers, passengers, and know exactly where everyone is riding.",
    icon: <Icon.van />,
  },
  {
    title: "Lodging",
    body: "Create rooms, cabins, or dorms and assign people with capacity visibility.",
    icon: <Icon.lodging />,
  },
  {
    title: "Itinerary & Tasks",
    body: "Build your schedule and track what still needs finished.",
    icon: <Icon.schedule />,
  },
  {
    title: "Headcounts",
    body: "Fast mobile headcounts show who is present and who is missing.",
    icon: <Icon.headcount />,
  },
  {
    title: "Prayer",
    body: "Pray over your group and trip as an intentional final preparation step.",
    icon: <PrayingHands className="h-7 w-7" />,
  },
];

const TRIP_TYPES = [
  "Youth Convention",
  "Youth Camp",
  "Church Camp",
  "Mission Trips",
  "Men's Conference",
  "Ladies Conference",
  "Couples Retreat",
  "Bible Quizzing",
  "Choir Trips",
  "Retreats",
  "Amusement Park Trips",
  "Christian School Trips",
];

const INCLUDED = [
  "Unlimited trips",
  "Attendee management",
  "Electronic waivers",
  "Payment tracking",
  "Vehicle assignments",
  "Room assignments",
  "Itineraries",
  "Trip tasks",
  "Mobile headcounts",
  "Trip packets",
  "Prayer preparation",
  "Future V1 improvements and updates",
];

export default function MarketingHome() {
  const app = appOrigin();
  const loginUrl = `${app}/login`;
  const signupUrl = `${app}/signup`;

  return (
    <div id="top">
      <SiteHeader loginUrl={loginUrl} signupUrl={signupUrl} />

      {/* ---------------------------------------------------------------- hero */}
      <Band tone="cream" className="relative overflow-hidden">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)] [&>*]:min-w-0">
          <div className="min-w-0">
            <Eyebrow>Church trips, without the chaos.</Eyebrow>
            <Display as="h1" className="mt-3 text-navy">
              Keep the
              <br />
              trip together.
            </Display>
            <p className="mt-4 font-display text-lg font-bold text-green-deep sm:text-xl">
              The faith-first trip planner for church groups.
            </p>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-navy-soft">
              Ready Set Amen helps youth pastors and church leaders organize every detail so you can
              focus on what matters most — the people and the purpose.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href={signupUrl}
                className="inline-flex min-h-[52px] items-center rounded-xl bg-green-brand px-6 font-display text-base font-extrabold uppercase tracking-wide text-white hover:bg-green-deep"
              >
                Start Planning Free
              </a>
              <a
                href="#how-it-works"
                className="inline-flex min-h-[52px] items-center rounded-xl border border-line bg-white px-5 font-semibold text-navy hover:bg-cream-deep"
              >
                See How It Works
              </a>
            </div>
            <p className="mt-3 text-sm text-navy-faint">
              No card required. Unlock lifetime access for {LAUNCH_PRICE} when you&rsquo;re ready.
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: <Icon.shield />,
                  title: "Secure & Private",
                  body: "Your trip information stays organized and protected.",
                },
                {
                  icon: <Icon.church />,
                  title: "Built for Ministry",
                  body: "Designed around the way church leaders actually plan trips.",
                },
                {
                  icon: <PrayingHands className="h-7 w-7" />,
                  title: "Faith First",
                  body: "Prayer is part of the preparation, not an afterthought.",
                },
              ].map((item) => (
                <li key={item.title} className="min-w-0">
                  <span className="text-green-brand">{item.icon}</span>
                  <p className="mt-1.5 font-display text-sm font-extrabold uppercase tracking-tight text-navy">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-snug text-navy-soft">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Two overlapping phones showing the real product surfaces. */}
          <div className="relative mx-auto w-full min-w-0 max-w-[520px] pb-10 pt-12 lg:mx-0">
            {/* Decorative only; the phones repeat information the page already
                states in text, so none of this needs to be read aloud. */}
            <DottedRoute className="pointer-events-none absolute inset-x-2 top-0 h-12 text-gold" />
            <ChurchVan className="pointer-events-none absolute -left-1 bottom-0 h-11 w-16 text-green-brand sm:h-14 sm:w-24" />
            <LocationPin className="pointer-events-none absolute right-3 top-1 h-7 w-7 text-coral sm:h-9 sm:w-9" />
            <PrayingHands className="pointer-events-none absolute bottom-0 right-1 h-10 w-10 text-navy sm:h-12 sm:w-12" />
            <div className="flex items-start justify-center">
              <div className="rotate-[-4deg]">
                <ReadinessPhone />
              </div>
              <div className="-ml-6 mt-16 rotate-[5deg] sm:-ml-8 sm:mt-20 lg:mt-24">
                <HeadcountPhone />
              </div>
            </div>
          </div>
        </div>
      </Band>

      {/* ------------------------------------------------------------- problem */}
      <Band tone="white">
        <Display className="max-w-3xl text-navy">
          Church trips shouldn&rsquo;t require six spreadsheets and a group-text miracle.
        </Display>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-navy-soft">
          You&rsquo;ve got students, parents, waivers, money, vans, hotel rooms, schedules, emergency
          contacts, and a hundred little details to keep straight. Ready Set Amen brings all of it
          together so you can spend less time chasing paperwork and more time leading people.
        </p>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { q: "Who still needs a waiver?", tone: "bg-coral-soft" },
            { q: "Which van is Caleb riding in?", tone: "bg-gold-soft" },
            { q: "Who hasn't paid?", tone: "bg-green-soft" },
            { q: "Are all 48 people back on the bus?", tone: "bg-cream-deep" },
          ].map((card) => (
            <li
              key={card.q}
              className={`rounded-2xl px-4 py-5 font-display text-lg font-extrabold leading-tight text-navy ${card.tone}`}
            >
              {card.q}
            </li>
          ))}
        </ul>
        <p className="mt-6 font-display text-xl font-extrabold uppercase tracking-tight text-green-deep">
          Ready Set Amen knows.
        </p>
      </Band>

      {/* ------------------------------------------------------------ features */}
      <Band id="features" tone="cream">
        <Display className="text-navy">
          Everything you need.
          <br />
          <span className="text-green-deep">All in one place.</span>
        </Display>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </Band>

      {/* ------------------------------------------------------------- waivers */}
      <Band id="waivers" tone="white">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center [&>*]:min-w-0">
          <div className="min-w-0">
            <Eyebrow>Waivers</Eyebrow>
            <Display className="mt-3 text-navy">Stop chasing paper waivers.</Display>
            <p className="mt-4 text-base leading-relaxed text-navy-soft">
              Create your church&rsquo;s waiver once. Assign it to the trip. Send parents a secure
              signing link. They sign from their phone — no account required.
            </p>

            <ol className="mt-7 flex flex-wrap items-center gap-2">
              {["Create", "Send", "Sign", "Done"].map((step, index) => (
                <li key={step} className="flex items-center gap-2">
                  <span
                    className={`inline-flex min-h-[40px] items-center rounded-xl px-3.5 font-display text-sm font-extrabold uppercase tracking-wide ${
                      index === 3 ? "bg-green-brand text-white" : "bg-cream-deep text-navy"
                    }`}
                  >
                    {step}
                  </span>
                  {index < 3 ? (
                    <span aria-hidden="true" className="text-navy-faint">
                      &rarr;
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>

            <ul className="mt-7 grid gap-2 sm:grid-cols-2">
              {[
                "Secure individual signing links",
                "Parents don't need accounts",
                "Adult and minor signing flows",
                "Real-time signed / unsigned tracking",
                "Reusable waiver templates",
                "Signed-document audit trail",
              ].map((benefit) => (
                <li key={benefit} className="flex items-start gap-2 text-sm text-navy">
                  <CheckBadge className="mt-0.5 h-5 w-5 bg-green-soft text-green-deep" />
                  {benefit}
                </li>
              ))}
            </ul>

            <a
              href={signupUrl}
              className="mt-7 inline-flex min-h-[52px] items-center rounded-xl bg-green-brand px-6 font-display text-base font-extrabold uppercase tracking-wide text-white hover:bg-green-deep"
            >
              Start Planning Free
            </a>
            <p className="mt-4 max-w-lg text-xs leading-relaxed text-navy-faint">
              Ready Set Amen provides electronic waiver collection tools. Churches are responsible
              for the waiver language they use and should have it reviewed by appropriate legal
              counsel.
            </p>
          </div>

          <div className="min-w-0 rounded-2xl border border-line bg-cream p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-navy-soft">
              Participant Release
            </p>
            <p className="mt-1 font-display text-xl font-extrabold text-navy">42 / 50 signed</p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-cream-deep">
              <div className="h-full w-[84%] rounded-full bg-green-brand" />
            </div>
            <ul className="mt-4 space-y-2">
              {[
                { name: "Ruby Bergstrom", state: "Signed", tone: "bg-green-soft text-green-deep" },
                { name: "Micah Ferrara", state: "Signed", tone: "bg-green-soft text-green-deep" },
                { name: "Ike Okonkwo", state: "Viewed", tone: "bg-gold-soft text-gold-deep" },
                { name: "Sofia Delacroix", state: "Not sent", tone: "bg-coral-soft text-coral-deep" },
              ].map((row) => (
                <li
                  key={row.name}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-navy">{row.name}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.tone}`}>
                    {row.state}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Band>

      {/* ----------------------------------------------------------- headcount */}
      <Band tone="cream">
        <div className="grid gap-10 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center [&>*]:min-w-0">
          <div className="mx-auto lg:mx-0">
            <HeadcountPhone present={46} total={48} missing={["Ruby Bennett", "Micah Cole"]} />
          </div>
          <div className="min-w-0">
            <Display className="text-navy">Everybody here?</Display>
            <p className="mt-2 font-display text-xl font-bold text-green-deep">Know in seconds.</p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-navy-soft">
              Run a headcount for the whole trip, one vehicle, one room, or a custom group — right
              from your phone.
            </p>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {[
                "Fast tap-to-count",
                "Vehicle-specific headcounts",
                "Room-specific headcounts",
                "Saved headcount history",
                "Instant missing-person list",
              ].map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-navy">
                  <CheckBadge className="mt-0.5 h-5 w-5 bg-white text-green-deep" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Band>

      {/* ---------------------------------------------------------- readiness */}
      <Band tone="white">
        <Display className="max-w-3xl text-navy">Know what still needs attention.</Display>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-navy-soft">
          Instead of digging through lists and spreadsheets, Ready Set Amen surfaces exactly what
          still needs your attention.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="min-w-0 rounded-2xl border border-line bg-cream p-5">
            <p className="font-display text-3xl font-extrabold text-navy">92% Ready</p>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                { label: "People", value: "Complete", ok: true },
                { label: "Waivers", value: "4 remaining", ok: false },
                { label: "Payments", value: "$375 outstanding", ok: false },
                { label: "Transportation", value: "1 unassigned", ok: false },
                { label: "Rooms", value: "Complete", ok: true },
                { label: "Tasks", value: "2 remaining", ok: false },
              ].map((row) => (
                <li
                  key={row.label}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2.5"
                >
                  <span className="font-semibold text-navy">{row.label}</span>
                  <span
                    className={`flex min-w-0 items-center gap-1.5 text-sm font-bold ${
                      row.ok ? "text-green-deep" : "text-navy-soft"
                    }`}
                  >
                    {row.ok ? <CheckBadge className="h-5 w-5 bg-green-soft text-green-deep" /> : null}
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-w-0 flex-col justify-center rounded-2xl bg-green-brand p-6 text-white">
            <p className="font-display text-2xl font-extrabold uppercase leading-tight">
              100% Logistically Ready
            </p>
            <p className="mt-3 text-base leading-relaxed text-white/85">
              You&rsquo;ve checked the boxes. Now let&rsquo;s cover the trip in prayer.
            </p>
            <div className="mt-5 flex min-w-0 items-center gap-3 rounded-xl bg-white/10 px-4 py-3">
              <PrayingHands className="h-7 w-7 shrink-0 text-gold" />
              <span className="min-w-0 font-display text-base font-extrabold uppercase tracking-tight">
                Pray Over The Group
              </span>
            </div>
            <div className="mt-6">
              <Wordmark size="sm" />
              <p className="mt-3 font-semibold text-white/90">You&rsquo;re ready to go.</p>
            </div>
          </div>
        </div>
      </Band>

      {/* --------------------------------------------------------- trip types */}
      <Band tone="cream">
        <Display className="max-w-3xl text-navy">
          Built for the trips churches actually take.
        </Display>
        <ul className="mt-8 flex flex-wrap gap-2.5">
          {TRIP_TYPES.map((type) => (
            <li
              key={type}
              className="rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-navy"
            >
              {type}
            </li>
          ))}
        </ul>
      </Band>

      {/* ------------------------------------------------------- how it works */}
      <Band id="how-it-works" tone="white">
        <Display className="text-navy">Ready in three steps.</Display>
        <ol className="mt-9 grid gap-5 lg:grid-cols-3">
          {[
            {
              step: "Ready",
              body: "Create the trip and add your people.",
              tone: "bg-green-brand text-cream",
            },
            {
              step: "Set",
              body: "Collect waivers, organize vehicles and rooms, track payments, and finish your checklist.",
              tone: "bg-coral text-navy",
            },
            {
              step: "Amen",
              body: "Pray over the group, run your headcounts, and go.",
              tone: "bg-gold text-navy",
            },
          ].map((item, index) => (
            <li key={item.step} className="rounded-2xl border border-line bg-cream p-5">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-navy-faint">
                Step {index + 1}
              </span>
              <p
                className={`mt-2 inline-block rounded-sm px-3 py-1 font-display text-2xl font-extrabold uppercase leading-none ${item.tone}`}
              >
                {item.step}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-navy-soft">{item.body}</p>
            </li>
          ))}
        </ol>
      </Band>

      {/* ------------------------------------------------------------- pricing */}
      <Band id="pricing" tone="green">
        <div className="grid gap-9 lg:grid-cols-2 lg:items-center [&>*]:min-w-0">
          <div className="min-w-0">
            <Display className="text-white">
              One price.
              <br />
              <span className="text-gold">Yours forever.</span>
            </Display>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/85">
              No subscription. No monthly fee. Pay once during our launch period and keep Ready Set
              Amen for good.
            </p>
            <a
              href={signupUrl}
              className="mt-7 inline-flex min-h-[52px] items-center rounded-xl bg-gold px-6 font-display text-base font-extrabold uppercase tracking-wide text-navy hover:brightness-95"
            >
              Start Planning Free
            </a>
            <p className="mt-3 text-sm text-white/80">
              No card required. Unlock lifetime access for {LAUNCH_PRICE} when you&rsquo;re ready.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 text-navy shadow-[0_18px_40px_-20px_rgba(0,0,0,0.5)]">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-coral-deep">
              Limited-time launch price
            </p>
            <p className="mt-2 font-display text-5xl font-extrabold leading-none">{LAUNCH_PRICE}</p>
            <p className="mt-1 font-display text-lg font-extrabold uppercase tracking-tight text-green-deep">
              Lifetime access
            </p>
            <p className="mt-1 text-sm text-navy-soft">One-time payment. No monthly fee.</p>
            <p className="mt-1 text-sm text-navy-faint">
              Regular lifetime price: {REGULAR_PRICE}
            </p>

            <ul className="mt-5 grid gap-1.5 sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-navy">
                  <CheckBadge className="mt-0.5 h-5 w-5 bg-green-soft text-green-deep" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Band>

      {/* -------------------------------------------------------- why leaders */}
      <Band tone="cream">
        <Display className="max-w-3xl text-navy">
          Built for leaders who already have enough to keep track of.
        </Display>
        <ul className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "Less chasing",
              body: "Know who still owes money, forms, or information.",
            },
            {
              title: "Less guessing",
              body: "See exactly where people are riding, sleeping, and supposed to be.",
            },
            {
              title: "More ministry",
              body: "Spend less time managing chaos and more time caring for people.",
            },
          ].map((card) => (
            <li key={card.title} className="rounded-2xl border border-line bg-white p-6">
              <p className="font-display text-xl font-extrabold uppercase tracking-tight text-green-deep">
                {card.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-navy-soft">{card.body}</p>
            </li>
          ))}
        </ul>
      </Band>

      {/* ----------------------------------------------------------------- faq */}
      <Band id="faq" tone="white">
        <Display className="text-navy">Questions?</Display>
        <div className="mt-7 max-w-3xl">
          <FaqItem
            question="Is Ready Set Amen a church management system?"
            answer="No. Ready Set Amen focuses specifically on church trips and group travel."
          />
          <FaqItem
            question="Do parents need an account to sign a waiver?"
            answer="No. Parents receive a secure signing link and can complete the waiver from their phone."
          />
          <FaqItem
            question="Can I use my own waiver language?"
            answer="Yes. Churches create and manage their own waiver language."
          />
          <FaqItem
            question="Does Ready Set Amen collect trip payments?"
            answer="Ready Set Amen currently tracks payments but does not process attendee trip payments."
          />
          <FaqItem
            question="How much does Ready Set Amen cost?"
            answer={`Ready Set Amen is currently ${LAUNCH_PRICE} for lifetime access during our limited launch period. There is no monthly subscription.`}
          />
          <FaqItem
            question="Do I have to pay before trying it?"
            answer="No. You can create your account and start building your first trip without a card. You only unlock lifetime access when you're ready to use the full trip workflow."
          />
          <FaqItem
            question="Can I use it from my phone?"
            answer="Yes. Ready Set Amen was designed mobile-first."
          />
          <FaqItem
            question="Can more than one leader help manage a trip?"
            answer="Yes, after lifetime access is activated, organization owners can invite additional leaders."
          />
          <FaqItem
            question="Is prayer included in the readiness score?"
            answer="No. Prayer is intentionally separate from the logistical readiness score."
          />
        </div>
      </Band>

      {/* -------------------------------------------------------------- footer */}
      <footer className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Wordmark size="sm" />
            <p className="mt-4 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-gold">
              Keep the trip together.
            </p>
            <p className="mt-2 max-w-sm text-sm text-white/70">
              The faith-first trip planner for church groups.
            </p>
          </div>
          <div className="flex flex-col text-sm sm:items-end">
            {/* min-h-[44px]: these are the only links in the footer and they are
                thumb targets like any other. */}
            <a
              href={signupUrl}
              className="inline-flex min-h-[44px] items-center font-semibold text-white hover:underline"
            >
              Start Planning Free
            </a>
            <a
              href={loginUrl}
              className="inline-flex min-h-[44px] items-center text-white/80 hover:underline"
            >
              Log In
            </a>
            <a
              href="/legal/esign"
              className="inline-flex min-h-[44px] items-center text-white/80 hover:underline"
            >
              Electronic signature disclosure
            </a>
            <p className="mt-3 text-white/50">
              &copy; {new Date().getFullYear()} Ready Set Amen
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
