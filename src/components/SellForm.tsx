"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createListingAction, type ActionResult } from "@/app/actions";
import { AUTHENTICITY, BLYTHE_LINES, CONDITION_GRADES, CUSTOM_LEVELS } from "@/lib/constants";

type Category = { id: string; name: string; slug: string; parentName: string | null };
type BlytheModel = { id: string; name: string; line: string; releaseYear: number | null };

const BODY_SLUGS = ["neo", "middie", "petite", "vintage", "custom-full"];

const inputCls =
  "w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-bill focus:outline-none";
const labelCls = "mb-1 block text-sm font-semibold";

export default function SellForm({
  categories,
  models,
}: {
  categories: Category[];
  models: BlytheModel[];
}) {
  const [state, submit, pending] = useActionState<ActionResult | null, FormData>(
    createListingAction,
    null,
  );
  const [categoryId, setCategoryId] = useState("");
  const [customLevel, setCustomLevel] = useState("NONE");
  const [line, setLine] = useState("NEO");
  const [startMode, setStartMode] = useState("now");
  const justDone = useSearchParams().get("done") === "1";

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isBody = !!selectedCategory && BODY_SLUGS.includes(selectedCategory.slug);
  const lineModels = models.filter((m) => m.line === line);

  return (
    <form action={submit} className="space-y-6">
      {justDone && (
        <p className="rounded-lg bg-ok-soft p-3 text-sm font-medium text-ok">
          등록 완료! 연속 등록 모드예요 — 다음 아이를 바로 등록하세요. (마이페이지에서 방금 등록한 경매를 확인할 수 있어요)
        </p>
      )}
      {/* 카테고리 */}
      <div>
        <label className={labelCls}>카테고리 *</label>
        <select
          name="categoryId"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputCls}
        >
          <option value="">선택해주세요</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentName ? `${c.parentName} > ` : ""}
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>제목 *</label>
        <input name="title" required maxLength={80} placeholder="예) 네오 브라이스 홀리우드 풀셋 (2001)" className={inputCls} />
      </div>

      {/* 브라이스 본체 전용 템플릿 */}
      {isBody && (
        <div className="space-y-4 rounded-xl border border-bill/25 bg-cream/70 p-4">
          <p className="text-sm font-bold text-bill-deep">브라이스 본체 정보</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>라인</label>
              <select value={line} onChange={(e) => setLine(e.target.value)} className={inputCls}>
                {BLYTHE_LINES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>모델명</label>
              <select name="blytheModelId" className={inputCls}>
                <option value="">목록에 없음 / 모름</option>
                {lineModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.releaseYear ? ` (${m.releaseYear})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>풀셋 구성 (있는 것만 체크)</label>
            <div className="flex flex-wrap gap-4 text-sm">
              {[
                ["fullSetBox", "박스"],
                ["fullSetCert", "증지"],
                ["fullSetStand", "스탠드"],
                ["fullSetOutfit", "기본 아웃핏"],
              ].map(([name, label]) => (
                <label key={name} className="flex items-center gap-1.5">
                  <input type="checkbox" name={name} className="accent-bill" /> {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>커스텀 여부</label>
            <select
              name="customLevel"
              value={customLevel}
              onChange={(e) => setCustomLevel(e.target.value)}
              className={inputCls}
            >
              {CUSTOM_LEVELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          {customLevel !== "NONE" && (
            <div className="grid gap-3">
              <div>
                <label className={labelCls}>커스텀 작가명</label>
                <input name="customArtist" placeholder="작가명 (본인 커스텀이면 '셀프')" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>커스텀 내역</label>
                <input
                  name="customDetails"
                  placeholder="예) 페이스업, 입 카빙, 아이칩 4종 교체, 오비츠24 바디"
                  className={inputCls}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 정품 구분 — 정책 B 핵심 */}
      <div>
        <label className={labelCls}>정품 구분 *</label>
        <div className="space-y-2">
          {AUTHENTICITY.map((a) => (
            <label
              key={a.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card p-3 text-sm has-checked:border-bill has-checked:bg-cream"
            >
              <input type="radio" name="authenticity" value={a.value} required className="accent-bill" />
              <span className="font-medium">{a.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-bill">
          ⚠ 팩토리 제품을 정품으로 기재할 경우 영구 이용 정지 및 전액 환불 조치됩니다.
        </p>
      </div>

      {/* 상태 등급 */}
      <div>
        <label className={labelCls}>상태 등급 *</label>
        <div className="grid grid-cols-2 gap-2">
          {CONDITION_GRADES.map((g) => (
            <label
              key={g.value}
              className="flex cursor-pointer flex-col rounded-lg border border-line bg-card p-3 has-checked:border-bill has-checked:bg-cream"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <input type="radio" name="conditionGrade" value={g.value} required className="accent-bill" />
                {g.label}
              </span>
              <span className="mt-0.5 pl-5 text-xs text-mauve">{g.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>상세 설명 *</label>
        <textarea
          name="description"
          required
          rows={6}
          placeholder={"헤어 상태, 페이스 기스·변색, 아이 메커니즘 작동 여부, 바디 관절 상태 등을 상세히 적어주세요.\nC등급은 하자 부위를 반드시 명시해야 합니다."}
          className={inputCls}
        />
      </div>

      {/* 사진 */}
      <div>
        <label className={labelCls}>사진 * (최대 10장)</label>
        <input type="file" name="images" accept="image/*" multiple required className={inputCls} />
        <p className="mt-1 text-xs text-mauve">
          권장: ① 당일 날짜 손메모 인증샷 ② 얼굴 정면 ③ 뒷통수(스탬프) ④ 아이 메커니즘 줄 ⑤ 박스·증지.
          첫 번째 사진이 인증샷 겸 대표 이미지로 사용됩니다. 발송 전 <a href="/guide/shipping" target="_blank" rel="noopener noreferrer" className="text-bill underline">포장 가이드</a>도 확인해주세요.
        </p>
      </div>

      {/* 경매 설정 */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>시작가 (원) *</label>
          <input name="startPrice" type="number" min={1000} step={100} required placeholder="10000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>즉시구매가 (선택)</label>
          <input name="buyNowPrice" type="number" min={0} step={100} placeholder="없으면 비워두세요" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>경매 기간 *</label>
          <select name="durationHours" required defaultValue="72" className={inputCls}>
            <option value="24">24시간</option>
            <option value="48">2일</option>
            <option value="72">3일</option>
            <option value="120">5일</option>
            <option value="168">7일</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>최저 낙찰가 (선택 · 비공개)</label>
          <input name="reservePrice" type="number" min={0} step={100} placeholder="미달 시 유찰돼요" className={inputCls} />
          <p className="mt-1 text-xs text-mauve-light">금액은 공개되지 않아요. 고가 희소품 헐값 낙찰 방지용.</p>
        </div>
        <div>
          <label className={labelCls}>시작 방식</label>
          <select name="startMode" value={startMode} onChange={(e) => setStartMode(e.target.value)} className={inputCls}>
            <option value="now">즉시 시작</option>
            <option value="scheduled">예약 시작 (분양 예고)</option>
          </select>
          {startMode === "scheduled" && (
            <>
              <input name="scheduledAt" type="datetime-local" required className={`${inputCls} mt-2`} />
              <p className="mt-1 text-xs text-mauve-light">
                시작 전까지 입찰이 잠긴 &lsquo;예고&rsquo; 상태로 노출돼요. 작가님이라면 팔로워에게 예고 알림이 나가요.
              </p>
            </>
          )}
        </div>
      </div>

      {state?.message && (
        <p className={`rounded-lg p-3 text-sm font-medium ${state.ok ? "bg-ok-soft text-ok" : "bg-cream text-bill-deep"}`}>
          {state.message}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-mauve">
        <input type="checkbox" name="continueMode" defaultChecked={justDone} className="accent-bill" />
        연속 등록 모드 — 등록 후 이 폼으로 돌아와요 (컬렉션 정리에 유용)
      </label>

      <button
        disabled={pending}
        className="w-full rounded-xl bg-duck py-3 font-bold text-ink hover:bg-duck-deep disabled:opacity-50"
      >
        {pending ? "등록 중…" : "경매 시작하기"}
      </button>
    </form>
  );
}
