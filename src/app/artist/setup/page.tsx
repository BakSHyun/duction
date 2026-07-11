import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ArtistSetupForm from "@/components/ArtistSetupForm";

export const metadata = { title: "작가 등록" };

export const dynamic = "force-dynamic";

export default async function ArtistSetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 font-display text-2xl font-semibold">
        {user.isArtist ? "작가 프로필 수정" : "커스텀 작가로 등록"}
      </h1>
      <p className="mb-6 text-sm text-mauve">
        팔로워에게 새 분양이 자동으로 알려지고, 분양 이력과 낙찰가가 프로필에 쌓입니다.
      </p>
      <ArtistSetupForm
        defaults={{ artistBio: user.artistBio ?? "", artistSns: user.artistSns ?? "" }}
      />
    </div>
  );
}
