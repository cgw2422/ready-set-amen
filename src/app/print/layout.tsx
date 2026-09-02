import { PrintButton } from "@/components/print/print-button";

export const metadata = {
  // Printouts contain rosters and medical data — never index them.
  robots: { index: false, follow: false, nocache: true },
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <div className="mx-auto w-full max-w-4xl px-6 py-6 print:px-0 print:py-0">
        <PrintButton />
        {children}
      </div>
    </div>
  );
}
