import { describe, it, expect, beforeEach } from "vitest";
import "./DashboardView.ts";

describe("DashboardView minimal authenticated shell", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should render a blank authenticated page with only logout available", async () => {
    const element = document.createElement("dashboard-view") as HTMLElement & {
      updateComplete: Promise<boolean>;
    };

    document.body.appendChild(element);
    await element.updateComplete;

    expect(element.querySelector('[data-testid="blank-authenticated-page"]')).not.toBeNull();
    expect(element.textContent).toContain("Logout");
    expect(element.textContent).not.toContain("Trainer Dashboard");
    expect(element.textContent).not.toContain("Import & Start Workout");
    expect(element.textContent).not.toContain("Movement Gate");
  });
});
