import "../styles/globals.css";
import type { Metadata } from "next";
import { WalletProviders } from "~~/components/wallet/WalletProviders";
import { Header } from "~~/components/layout/Header";
import { Footer } from "~~/components/layout/Footer";

export const metadata: Metadata = {
  title: "Scaffold-HBAR — Priced Asset Registry & Developer Experience",
  description: "Production-grade Hedera developer starter template with Pyth Oracle price feeds, HCS attestations, Reown wallet integration, and Mirror Node verification.",
  keywords: ["Hedera", "HBAR", "Pyth Oracle", "HCS", "HTS", "Reown", "WalletConnect", "Next.js", "Web3"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased flex flex-col selection:bg-indigo-500 selection:text-white">
        <WalletProviders>
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
        </WalletProviders>
      </body>
    </html>
  );
}
