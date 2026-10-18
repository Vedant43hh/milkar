import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell, Button, Card, ErrorText, Skeleton } from "@/components/ui";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor, safeNextPath } from "@/lib/auth/rules";
import { DEMO_USER_KEYS, DEMO_USERS } from "@/lib/demo";
import { getEnv } from "@/lib/env";
import { demoLoginAction } from "@/server/actions/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t("auth.loginTitle") };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AppShell>
      <h1 className="text-xl font-semibold">{t("auth.loginHeading")}</h1>
      <p className="mt-1 mb-6 text-sm text-stone-600">{t("auth.loginIntro")}</p>
      <Suspense fallback={<Skeleton lines={2} />}>
        <LoginSection searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function LoginSection({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const user = await getCurrentUser();
  if (user) redirect(next ?? homePathFor(user));

  const env = getEnv();
  return (
    <div className="space-y-6">
      {params.error === "demo" && <ErrorText>{t("errors.demoDisabled")}</ErrorText>}
      <LoginForm next={next} mockOtp={env.OTP_MODE === "mock"} />
      {env.DEMO_MODE && <DemoLogins next={next} />}
    </div>
  );
}

function DemoLogins({ next }: { next: string | null }) {
  return (
    <Card>
      <h2 className="font-medium">{t("auth.demoHeading")}</h2>
      <p className="mb-3 text-sm text-stone-600">{t("auth.demoIntro")}</p>
      <div className="space-y-2">
        {DEMO_USER_KEYS.map((key) => {
          const demo = DEMO_USERS[key];
          return (
            <form key={key} action={demoLoginAction}>
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="next" value={next ?? ""} />
              <Button variant="secondary" className="flex items-center justify-between text-left">
                <span>{t("auth.demoAs", { name: demo.name })}</span>
                <span className="text-xs text-stone-500">
                  {t(`roles.${demo.role}`)}
                  {demo.flat ? ` · ${demo.flat}` : ""}
                </span>
              </Button>
            </form>
          );
        })}
      </div>
    </Card>
  );
}
