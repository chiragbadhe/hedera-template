import { DocsLayout } from "~~/components/docs/DocsLayout";

export const metadata = {
  title: "Documentation | Priced Asset Registry",
  description: "Setup summaries for networks, wallets, architecture, and verification. Full docs live in the repository /docs tree.",
};

export default async function DocsPage(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const slug = params?.slug?.[0];

  return <DocsLayout selectedSlug={slug} />;
}
