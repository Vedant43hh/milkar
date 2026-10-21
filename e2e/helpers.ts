import { expect, type Page } from "@playwright/test";

let phoneCounter = 0;
/** A fresh 10-digit mobile number: the clock plus a counter, so two numbers in a row never clash. */
export const uniquePhone = () => `9${String(Date.now()).slice(-8)}${phoneCounter++ % 10}`;

/** A field by its label, ignoring hidden copies (Next keeps recently visited pages, hidden, for back/forward). */
const visibleField = (page: Page, label: string) => page.getByLabel(label).filter({ visible: true });

export async function loginWithOtp(page: Page, phone: string) {
  await visibleField(page, "Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(/Code sent to \+91/)).toBeVisible();
  await visibleField(page, "6-digit code").fill("123456"); // mock mode accepts any 6 digits
  await page.getByRole("button", { name: "Verify and log in" }).click();
}

export async function demoLogin(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`Log in as ${name}`) }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/login");
}

/** The registration wizard's last step: send a code to `phone`, type it, and submit. */
export async function verifyPhoneAndSubmit(page: Page, phone: string, submit: string) {
  await visibleField(page, "Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(/Code sent to \+91/)).toBeVisible({ timeout: 30_000 });
  await visibleField(page, "6-digit code").fill("123456"); // mock mode accepts any 6 digits
  await page.getByRole("button", { name: submit }).click();
}

/** "Next" in a step-by-step form. */
export async function nextStep(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
}
