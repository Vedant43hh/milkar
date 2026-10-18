// Indian mobile numbers, stored in E.164 form: +91 followed by 10 digits starting 6–9.

/** Accepts "98765 43210", "+91-98765-43210", "09876543210", "919876543210". Returns null if invalid. */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** "+919876543210" → "+91 98765 43210" */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** "+919876543210" → "+91 ••••• •3210", for showing where a code was sent. */
export function maskPhone(e164: string): string {
  const m = /^\+91\d{6}(\d{4})$/.exec(e164);
  return m ? `+91 ••••• •${m[1]}` : e164;
}
