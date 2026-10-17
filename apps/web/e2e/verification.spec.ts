import { expect, test } from "@playwright/test";

test("a malformed credential link shows a helpful not-found page that is never indexed", async ({
  page,
}) => {
  const response = await page.goto("/verify/not-a-credential");
  expect(response?.status()).toBe(404);
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Credential not found");
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.getByText("Valid", { exact: true })).toHaveCount(0);
});

test("verification pages are never cached", async ({ request }) => {
  const response = await request.get("/verify/00000000-0000-4000-8000-000000000000");
  expect(response.headers()["cache-control"]).toMatch(/no-store/);
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
});
