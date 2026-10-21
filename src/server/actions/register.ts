"use server";

import { redirect } from "next/navigation";
import type { CommunityType, VendorCategory } from "@/generated/prisma/client";
import { t, type MessageKey } from "@/i18n";
import { startSession } from "@/lib/auth/current-user";
import { homePathFor } from "@/lib/auth/rules";
import { normalizeIndianMobile } from "@/lib/phone";
import { isSelfRegistrationRole, parseBlocks, parsePincodes } from "@/lib/registration";
import { isPhoneRegistered } from "@/server/auth";
import { checkCode, issueCode } from "@/server/otp-flow";
import { communityForJoining, registerAccount, searchCommunities, type JoinCommunity, type RegisterError, type RegisterInput } from "@/server/registration";

// Public actions for the registration wizard. They create nothing until the final step, where the
// phone is verified and the account is made together with its request, in one go.

const COMMUNITY_TYPES: readonly CommunityType[] = ["APARTMENT_SOCIETY", "GATED_COMMUNITY", "PG_COLIVING", "HOSTEL", "OFFICE_CAMPUS"];
const VENDOR_CATEGORIES: readonly VendorCategory[] = ["GROCERIES", "HOME_SERVICES", "REPAIRS"];

/** A live community and its flats, by invite code or id. */
export async function findCommunityAction(by: { code: string } | { id: string }): Promise<JoinCommunity | null> {
  if ("code" in by) return /^[A-Za-z0-9]{2,12}$/.test(by.code.trim()) ? communityForJoining({ code: by.code }) : null;
  return typeof by.id === "string" && by.id.length > 0 ? communityForJoining({ id: by.id }) : null;
}

export async function searchCommunitiesAction(query: string) {
  return searchCommunities(String(query).slice(0, 60));
}

export type SendCodeResult = { ok: true; phone: string } | { ok: false; error: string };

/** Step one of verifying the phone. A number that already has an account is sent to log in instead. */
export async function sendRegistrationCodeAction(phoneInput: string): Promise<SendCodeResult> {
  const phone = normalizeIndianMobile(String(phoneInput));
  if (!phone) return { ok: false, error: t("errors.invalidPhone") };
  if (await isPhoneRegistered(phone)) return { ok: false, error: t("register.errors.ALREADY_REGISTERED") };
  const error = await issueCode(phone);
  return error ? { ok: false, error } : { ok: true, phone };
}

export type RegisterState = { error?: string };

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const integer = (formData: FormData, key: string) => {
  const n = Number(text(formData, key));
  return Number.isInteger(n) ? n : Number.NaN;
};

/** Reads what the wizard collected for the chosen role. A role nobody may register as is refused here too. */
function detailsFrom(formData: FormData, role: string): RegisterInput["details"] | RegisterError {
  switch (role) {
    case "RESIDENT":
      return { kind: "RESIDENT", communityId: text(formData, "communityId"), flatId: text(formData, "flatId") };
    case "MANAGER": {
      const type = text(formData, "communityType") as CommunityType;
      const blocks = parseBlocks(text(formData, "blocks"));
      if (!COMMUNITY_TYPES.includes(type)) return "INVALID_COMMUNITY";
      if (!blocks) return "INVALID_LAYOUT";
      return {
        kind: "MANAGER",
        community: {
          name: text(formData, "communityName"),
          type,
          address: text(formData, "address"),
          city: text(formData, "city"),
          pincode: text(formData, "pincode"),
          blockLabel: text(formData, "blockLabel"),
          unitLabel: text(formData, "unitLabel"),
          layout: { blocks, floors: integer(formData, "floors"), unitsPerFloor: integer(formData, "unitsPerFloor") },
        },
      };
    }
    case "VENDOR": {
      const categories = formData.getAll("categories").map(String).filter((c): c is VendorCategory => (VENDOR_CATEGORIES as readonly string[]).includes(c));
      const pincodes = parsePincodes(text(formData, "pincodes"));
      if (!pincodes) return "INVALID_BUSINESS";
      return {
        kind: "VENDOR",
        business: { name: text(formData, "businessName"), categories, city: text(formData, "city"), serviceAreaPincodes: pincodes, gstin: text(formData, "gstin") || null },
      };
    }
    default:
      return "ROLE_NOT_ALLOWED";
  }
}

const errorKey = (code: RegisterError): MessageKey => `register.errors.${code}`;

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const role = text(formData, "role");
  if (!isSelfRegistrationRole(role)) return { error: t(errorKey("ROLE_NOT_ALLOWED")) };
  const details = detailsFrom(formData, role);
  if (typeof details === "string") return { error: t(errorKey(details)) };
  const phone = normalizeIndianMobile(text(formData, "phone"));
  if (!phone) return { error: t("errors.invalidPhone") };

  const codeError = await checkCode(phone, text(formData, "code"));
  if (codeError) return { error: codeError };
  const result = await registerAccount({ phone, name: text(formData, "name"), role, details }, new Date());
  if (!result.ok) return { error: t(errorKey(result.error)) };

  await startSession(result.userId);
  redirect(homePathFor({ role }));
}
