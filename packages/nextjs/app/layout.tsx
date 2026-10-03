import "../styles/globals.css";
import type { Metadata } from "next";
import { WalletProvider } from "~~/components/wallet/WalletContext";
import { Header } from "~~/components/layout/Header";
import { Footer } from "~~/components/layout/Footer";

export const metadata: Metadata = {
  title: "Scaffold-HBAR — Priced Asset Registry & Developer Experience",
  description: "Production-grade Hedera developer starter template with Pyth Oracle price feeds, HCS attestations, server operator signing, and Mirror Node verification.",
  keywords: ["Hedera", "HBAR", "Pyth Oracle", "HCS", "HTS", "Next.js", "Web3", "Scaffold-HBAR"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased flex flex-col selection:bg-indigo-500 selection:text-white">
        <WalletProvider>
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
