import { Dashboard } from "~~/components/Dashboard";
import Link from "next/link";

export const metadata = {
  title: "Priced Asset Registry",
};

export default async function Home() {
  return (
    <main className="container mx-auto flex min-h-screen flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Priced Asset Registry</h1>
        <p className="max-w-2xl text-neutral-300">
          Oracle-stamped HTS asset registry: Pyth prices, HCS attestation, Mirror Node verification.
        </p>
        <div className="mt-2">
          <Link
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
            href="/verify"
          >
            Verify attestation →
          </Link>
        </div>
      </header>
      <Dashboard />
    </main>
  );
}
