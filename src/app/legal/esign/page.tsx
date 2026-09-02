import { LogoLockup } from "@/components/brand";
import { ELECTRONIC_CONSENT_TEXT, LEGAL_DISCLAIMER } from "@/lib/waiver-content";

export const metadata = { title: "Electronic records and signatures" };

export default function EsignDisclosurePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <LogoLockup />
      <h1 className="mt-8 font-display text-3xl font-extrabold text-navy">
        Electronic records and signatures
      </h1>

      <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-navy-soft">
        <p>
          When you sign a document through Ready Set Amen, you are signing it electronically. This
          page explains what that means before you agree to it.
        </p>

        <h2 className="font-display text-lg font-bold text-navy">What you are agreeing to</h2>
        <p className="rounded-xl border border-line bg-white p-4 text-navy">
          {ELECTRONIC_CONSENT_TEXT}
        </p>

        <h2 className="font-display text-lg font-bold text-navy">What we record</h2>
        <p>
          For every signature we store the exact version of the document you signed, your typed
          name, an optional drawn signature, the date and time, the acknowledgements you checked,
          the answers you provided, and technical details such as your IP address and browser. This
          record is what makes an electronic signature meaningful, and it is kept with the
          organization that requested your signature.
        </p>
        <p>
          The document you signed is stored as an immutable snapshot. If the organization later
          edits its waiver template, your signed copy does not change.
        </p>

        <h2 className="font-display text-lg font-bold text-navy">Getting a paper copy</h2>
        <p>
          You can print or save a copy of anything you sign at the end of the signing process, and
          you may request a copy from the organization at any time.
        </p>

        <h2 className="font-display text-lg font-bold text-navy">Withdrawing consent</h2>
        <p>
          You are not required to sign electronically. If you would rather sign on paper, contact
          the organization that sent you the link and ask for a paper form.
        </p>

        <h2 className="font-display text-lg font-bold text-navy">About Ready Set Amen</h2>
        <p className="rounded-xl border border-gold/40 bg-gold-soft p-4 text-navy">
          {LEGAL_DISCLAIMER}
        </p>
      </div>
    </main>
  );
}
