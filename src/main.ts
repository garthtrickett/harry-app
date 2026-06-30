import { Effect } from "effect";
import { runClientUnscoped } from "./lib/client/runtime.ts";
import { clientLog } from "./lib/client/clientLog.ts";
import { initPWA } from "./lib/client/stores/pwaStore.ts";

import "./components/layouts/app-shell.ts";

const bootstrapApp = Effect.gen(function* () {
  yield* clientLog("info", "[Main] Initiating minimal authentication shell bootstrap sequence...");

  const { initAuth } = yield* Effect.promise(() => import("./lib/client/stores/authStore.ts"));
  yield* clientLog("info", "[Main] Attempting session restoration...");
  yield* initAuth();

  yield* Effect.sync(() => {
    clientLog("info", "[Main] Registering PWA installation listeners...");
    initPWA();
  });

  yield* clientLog("info", "[Main] Minimal authentication shell bootstrapped without SRS dashboard services.");
}).pipe(
  Effect.catchAll((err) =>
    clientLog("error", "[Main] Catastrophic failure occurred during the minimal application boot process", err)
  )
);

runClientUnscoped(bootstrapApp);
