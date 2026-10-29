import { expect, test } from "@playwright/test";

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "change-me-please-123";

test("unauthenticated users are sent to sign in", async ({ page }) => {
  await page.goto("/trips");
  await expect(page).toHaveURL(/\/login/);
});

test("create a multi-brand trip, progress it, and confirmation is gated", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);

  await page.getByRole("link", { name: "New trip" }).first().click();
  const name = `E2E Panorama ${Date.now()}`;
  // Validation keeps the user's input when the server rejects the form.
  await page.getByLabel("Trip name").fill(name);
  await page.getByLabel("Departure").fill("2027-06-10");
  await page.getByLabel("Return").fill("2027-06-01");
  await page.getByRole("button", { name: "Create trip" }).click();
  await expect(page.getByText("Return date must be on or after departure")).toBeVisible();
  await expect(page.getByLabel("Trip name")).toHaveValue(name);

  await page.getByLabel("Return").fill("2027-06-15");
  await page.getByRole("group", { name: "Participating brands" }).getByLabel("AYA").check();
  await page.getByRole("group", { name: "Supplying brands" }).getByLabel("Schmidt Car Hire").check();
  await page.getByRole("button", { name: "Create trip" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("Trip saved.")).toBeVisible();
  await expect(page.getByText("5 nights")).toBeVisible();

  for (const stage of ["Discovery", "Concept development"]) {
    await page.getByLabel("Move to").selectOption({ label: stage });
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText(`Currently ${stage}.`)).toBeVisible();
  }

  // Confirmation is not reachable from early stages: it must not be offered.
  await expect(page.getByLabel("Move to").locator("option", { hasText: "Confirmed" })).toHaveCount(0);

  // Search finds it.
  await page.getByLabel("Search trips, guests and suppliers").fill(name);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});
