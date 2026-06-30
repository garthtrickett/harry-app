import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { logout } from "../lib/client/stores/authStore.ts";
import { clientLog } from "../lib/client/clientLog.ts";
import { runClientUnscoped } from "../lib/client/runtime.ts";

@customElement("dashboard-view")
export class DashboardView extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    runClientUnscoped(clientLog("info", "[DashboardView] Blank authenticated page mounted."));
  }

  private handleLogout = () => {
    runClientUnscoped(clientLog("info", "[DashboardView] Logout requested from blank authenticated page."));
    logout();
  };

  override render() {
    return html`
      <div data-testid="blank-authenticated-page" class="min-h-[60vh]">
        <div class="flex justify-end">
          <button
            type="button"
            @click=${this.handleLogout}
            class="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded text-sm font-medium border border-zinc-800 transition-colors cursor-pointer"
          >
            Logout
          </button>
        </div>
      </div>
    `;
  }
}
