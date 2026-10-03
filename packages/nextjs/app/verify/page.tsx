import { Suspense } from "react";
import { VerifyForm } from "~~/components/VerifyForm";

export const metadata = { title: "Verify | Priced Asset Registry" };

export default function VerifyPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Verify an attestation</h1>
      <Suspense fallback={<div className="text-center text-neutral-400 py-8">Loading verification...</div>}>
        <VerifyForm />
      </Suspense>
    </main>
  );
}
