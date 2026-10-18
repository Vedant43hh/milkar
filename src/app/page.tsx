import { t } from "@/i18n";

export default function Home() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold text-teal-800">{t("app.name")}</h1>
      <p className="mt-1 text-stone-600">{t("app.tagline")}</p>
      <p className="mt-6 text-sm text-stone-500">{t("home.comingSoon")}</p>
    </main>
  );
}
