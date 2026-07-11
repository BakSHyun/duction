/**
 * 알림 발송 채널 추상화 (M17) — 웹푸시는 활성, SMS·알림톡은 어댑터 자리.
 * 사업자 계약 후 send()만 채우고 env 키를 넣으면 파이프라인 수정 없이 활성화된다.
 * 유료 채널(SMS·알림톡)은 중요 알림만 보낸다 — types로 제한.
 */

export type NotifyPayload = {
  type: string;
  title: string;
  body: string;
  link: string;
};

export interface NotifyChannel {
  name: string;
  enabled: () => boolean;
  /** 이 채널이 발송할 알림 타입. null이면 전부 (무료 채널) */
  types: string[] | null;
  send: (userId: string, payload: NotifyPayload) => Promise<void>;
}

/** 돈·제재가 걸린 알림 — 유료 채널로도 보낼 가치가 있는 것들 */
export const CRITICAL_TYPES = [
  "WON",
  "SECOND_CHANCE",
  "ORDER_CANCELLED",
  "PENALTY",
  "DISPUTE_OPENED",
  "PAID",
];

/** SMS — 사업자(NHN Cloud, 알리고 등) 계약 후 구현. User.phone + 본인인증과 함께 활성화 */
export const smsChannel: NotifyChannel = {
  name: "sms",
  enabled: () => !!process.env.SMS_API_KEY,
  types: CRITICAL_TYPES,
  async send() {
    throw new Error(
      "SMS 어댑터 미구현 — SMS_API_KEY가 설정됐지만 발송 코드가 없습니다. notify-channels.ts를 구현하세요.",
    );
  },
};

/** 카카오 알림톡 — 카카오 비즈메시지 계약 + 템플릿 승인 후 구현 */
export const alimtalkChannel: NotifyChannel = {
  name: "alimtalk",
  enabled: () => !!process.env.KAKAO_ALIMTALK_KEY,
  types: CRITICAL_TYPES,
  async send() {
    throw new Error(
      "알림톡 어댑터 미구현 — KAKAO_ALIMTALK_KEY가 설정됐지만 발송 코드가 없습니다. notify-channels.ts를 구현하세요.",
    );
  },
};
