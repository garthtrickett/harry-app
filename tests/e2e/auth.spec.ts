import { test, expect } from "./utils/base-test";

test.describe("Authentication shell flow", () => {
  test("should show a visual representation of login failure", async ({ page }) => {
    // 1. Navigate to the login route
    await page.goto("/login");

    // 2. Submit invalid credentials
    await page.locator("#email").fill("nonexistent-learner@test.com");
    await page.locator("#password").fill("WrongPassword123!");
    await page.locator('button[type="submit"]').click();

    // 3. Verify the error feedback is rendered visually
    const errorAlert = page.locator("login-view >> text=Invalid credentials");
    await expect(errorAlert).toBeVisible();
  });

  test("should allow a new user to sign up, log in to a blank page, and log out", async ({ page }) => {
    const email = `test-user-${Date.now()}@test.com`;
    const password = "Password123!";

    // 1. Navigate to the registration route
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/signup/);

    // 2. Submit the registration credentials
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator('button[type="submit"]').click();

    // 3. Confirm redirection to the login route
    await expect(page).toHaveURL(/\/login/);

    // 4. Fill in credentials on the login screen and authenticate
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator('button[type="submit"]').click();

    // 5. Verify successful navigation to the blank authenticated shell
    await expect(page).toHaveURL("/");
    await expect(page.locator('[data-testid="blank-authenticated-page"]')).toBeVisible();
    await expect(page.locator("text=Trainer Dashboard")).toHaveCount(0);
    await expect(page.locator("button", { hasText: "Import & Start Workout" })).toHaveCount(0);

    // 6. Confirm logout returns to the login route
    await page.locator("button", { hasText: "Logout" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("login-view")).toBeVisible();
  });
});
