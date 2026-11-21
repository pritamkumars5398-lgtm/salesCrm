"use client";
import IntegrationsPanel from "@/components/settings/IntegrationsPanel";
import { PageHeader } from "./ui";

/** The platform's own .env keys: whether each works and how much balance is left. */
export default function AdminPlatform() {
  return (
    <>
      <PageHeader title="Platform keys" sub="The keys in the server's .env. Clients allowed to use platform keys run on these — watch their balances here." />
      <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <IntegrationsPanel endpoint="/api/superadmin/integrations" title="Platform API keys" subtitle="Checked live with each provider." />
      </div>
    </>
  );
}
