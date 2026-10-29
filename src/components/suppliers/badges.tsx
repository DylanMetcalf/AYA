import { Badge } from "@/components/ui/badge";

const RATE: Record<string, { tone: "success" | "warning" | "neutral" | "danger" | "info"; label: string }> = {
  approved: { tone: "success", label: "Approved" },
  pending_review: { tone: "warning", label: "Awaiting review" },
  draft: { tone: "neutral", label: "Draft" },
  superseded: { tone: "neutral", label: "Superseded" },
  rejected: { tone: "danger", label: "Rejected" },
};
export const RateStatusBadge = ({ status }: { status: string }) => <Badge tone={RATE[status]?.tone ?? "neutral"}>{RATE[status]?.label ?? status}</Badge>;

const VERIFY: Record<string, { tone: "success" | "warning" | "neutral"; label: string }> = {
  verified: { tone: "success", label: "Verified" },
  unverified: { tone: "neutral", label: "Unverified" },
  needs_review: { tone: "warning", label: "Needs review" },
};
export const VerificationBadge = ({ status }: { status: string }) => <Badge tone={VERIFY[status]?.tone ?? "neutral"}>{VERIFY[status]?.label ?? status}</Badge>;
