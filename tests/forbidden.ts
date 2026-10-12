import type { Locale } from "@/i18n/config";

/**
 * "Never reassuring" language, per locale: harmless, safe to touch/approach/handle,
 * definitely. Thai and Burmese patterns allow the negated forms that mean the
 * opposite ("ไม่แน่นอน" / "မသေချာ" = uncertain).
 */
export const FORBIDDEN: Record<Locale, RegExp> = {
  en: /harmless|safe to (approach|handle|touch|pick)|you can approach|definitely/i,
  th: new RegExp(
    [
      "ไม่เป็นอันตราย", // harmless
      "ไม่มีอันตราย", // harmless / no danger
      "(?:จับ|สัมผัส|แตะ|เข้าใกล้|ถือ|หยิบ)(?:ได้)?(?:อย่าง)?ปลอดภัย", // touch/approach … safely
      "ปลอดภัย(?:ที่จะ|ต่อการ|ในการ)(?:จับ|สัมผัส|แตะ|เข้าใกล้|ถือ|หยิบ)", // safe to touch/approach
      "เข้าใกล้ได้", // you can approach
      "(?<!ไม่)แน่นอน", // definitely (but not ไม่แน่นอน, uncertain)
      "แน่ๆ",
    ].join("|"),
  ),
  my: new RegExp(
    [
      "အန္တရာယ်မရှိ", // harmless
      "အန္တရာယ်ကင်း", // free of danger
      "(?:ကိုင်|ထိ|ချဉ်းကပ်|ဖမ်း)\\S{0,8}\\s?(?:ဘေးကင်း|လုံခြုံ|စိတ်ချ)", // touch/approach … safe
      "(?:ဘေးကင်း|လုံခြုံ|စိတ်ချ)\\S{0,6}\\s?(?:ကိုင်|ထိ|ချဉ်းကပ်)", // safe … to touch/approach
      "ချဉ်းကပ်နိုင်", // you can approach
      "သေချာပေါက်", // definitely
      "အသေအချာ", // for certain
      "(?<!မ)သေချာ", // sure/definite (but not မသေချာ, uncertain)
    ].join("|"),
  ),
};

/**
 * Message keys that use a forbidden word only to deny it ("It won’t call a snake
 * harmless", "Do not assume it is harmless"). Listed explicitly so nothing else slips through.
 */
export const NEGATED_WARNING_KEYS = new Set(["home.promises.harmless.title", "species.notReviewedNoneBody"]);
