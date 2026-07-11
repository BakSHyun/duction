import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SettingsForms from "@/components/SettingsForms";
import PushPrefs from "@/components/PushPrefs";

export const metadata = { title: "설정" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");

  const optOut: string[] = user.pushOptOut ? JSON.parse(user.pushOptOut) : [];

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <h1 className="font-display text-2xl font-semibold">설정</h1>
      <PushPrefs optOut={optOut} />
      <SettingsForms nickname={user.nickname} />
    </div>
  );
}
