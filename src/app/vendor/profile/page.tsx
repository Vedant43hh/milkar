import { BadgeCheck, Star } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Verification } from "@/components/vendor/verification";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { formatIST } from "@/lib/time";
import { vendorStanding } from "@/server/registration";

export const metadata: Metadata = { title: t("vendorProfile.title") };

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const user = await requirePortal("vendor");
  const [standing, vendor] = await Promise.all([
    vendorStanding(user.vendor.id),
    prisma.vendor.findUniqueOrThrow({ where: { id: user.vendor.id }, select: { kind: true, about: true, verifiedAt: true, ratingCount: true, ratingSum: true } }),
  ]);
  const rating = vendor.ratingCount > 0 ? (vendor.ratingSum / vendor.ratingCount).toFixed(1) : null;
  const rows: [string, string][] = [
    [t("vendorProfile.categories"), standing.categories.map((c) => t(`vendorProfile.category.${c}`)).join(", ")],
    [t("vendorProfile.city"), standing.city],
    [t("vendorProfile.phone"), formatPhone(standing.phone)],
    [t("vendorProfile.gstin"), standing.gstin ?? t("vendorProfile.noGstin")],
    [t("vendorProfile.serviceArea"), standing.serviceAreaPincodes.join(", ")],
  ];
  return (
    <div className="space-y-5">
      <PageHeader title={t("vendorProfile.title")} />
      <Card labelledBy="business-title">
        <CardHeader
          titleId="business-title"
          title={standing.name}
          subtitle={t(`vendorProfile.kind.${vendor.kind}`)}
          action={
            standing.verificationStatus === "VERIFIED" ? (
              <Badge tone="success" icon={<BadgeCheck aria-hidden className="size-3.5" />}>
                {t("vendor.verified")}
              </Badge>
            ) : (
              <Badge tone="warning">{t("vendor.pending")}</Badge>
            )
          }
        />
        <dl className="space-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-0.5 sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted">{label}</dt>
              <dd className="text-fg">{value}</dd>
            </div>
          ))}
          {vendor.about && (
            <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted">{t("vendorProfile.about")}</dt>
              <dd className="text-fg">{vendor.about}</dd>
            </div>
          )}
        </dl>
        {vendor.verifiedAt && standing.verificationStatus === "VERIFIED" && <p className="mt-3 text-sm text-muted">{t("vendorProfile.verifiedSince", { when: formatIST(vendor.verifiedAt, "date") })}</p>}
      </Card>

      <Card labelledBy="profile-rating">
        <CardHeader titleId="profile-rating" title={t("vendorProfile.ratingTitle")} />
        {rating ? (
          <p className="flex items-center gap-2 text-fg">
            <Star aria-hidden className="size-5 fill-current text-accent" />
            <span className="text-2xl font-semibold tabular-nums">{t("vendorHome.rating", { rating })}</span>
            <span className="text-sm text-muted">{t("vendorHome.ratingCount", { n: vendor.ratingCount })}</span>
          </p>
        ) : (
          <p className="text-sm text-muted">{t("vendorHome.noRatings")}</p>
        )}
      </Card>

      <Verification vendor={standing} />
    </div>
  );
}
