import { IssueForm } from "~~/components/IssueForm";

export const metadata = {
  title: "Issue & Stamp Asset | Scaffold-HBAR",
  description: "Stamp an HTS token with live Pyth oracle observations and record on Hedera",
};

export default function IssuePage() {
  return (
    <main className="container mx-auto px-4 py-10">
      <IssueForm />
    </main>
  );
}
