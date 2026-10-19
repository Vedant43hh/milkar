import { expect, type Page } from "@playwright/test";

export const uniquePhone = () => `9${String(Date.now()).slice(-9)}`;

export async function loginWithOtp(page: Page, phone: string) {
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(/Code sent to \+91/)).toBeVisible();
  await page.getByLabel("6-digit code").fill("123456"); // mock mode accepts any 6 digits
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
