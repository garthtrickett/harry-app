import { signal, computed } from "@preact/signals-core";
import { clientLog } from "../clientLog";
import { runClientUnscoped } from "../runtime";

export type Locale = "en" | "ja" | "es";

export const en = {
  common: {
    loading: "Loading...",
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    logout: "Logout",
    profile: "Profile",
    language: "Language",
    back_to_login: "Back to Login"
  },
  training: {
    reveal: "Reveal Target",
    executionCue: "Execution Cue",
    next: "Next Movement",
    completed: "Completed",
    failed: "Failed",
    themeLabel: "Workout Configuration"
  }
};

export const ja = {
  common: {
    loading: "読み込み中...",
    save: "保存",
    cancel: "キャンセル",
    confirm: "確認",
    delete: "削除",
    logout: "ログアウト",
    profile: "プロファイル",
    language: "言語",
    back_to_login: "ログインに戻る"
  },
  training: {
    reveal: "目標を表示",
    executionCue: "トレーニングキュー",
    next: "次の動作",
    completed: "完了",
    failed: "未完了",
    themeLabel: "ワークアウト設定"
  }
};

export const es = {
  common: {
    loading: "Cargando...",
    save: "Guardar",
    cancel: "Cancelar",
    confirm: "Confirmar",
    delete: "Eliminar",
    logout: "Cerrar sesión",
    profile: "Perfil",
    language: "Idioma",
    back_to_login: "Volver al inicio"
  },
  training: {
    reveal: "Revelar objetivo",
    executionCue: "Indicación de ejecución",
    next: "Siguiente movimiento",
    completed: "Completado",
    failed: "Fallado",
    themeLabel: "Configuración de entrenamiento"
  }
};

const dictionaries = { en, ja, es };

const storedLocale = (localStorage.getItem("app-locale") as Locale) || "en";
export const localeState = signal<Locale>(storedLocale in dictionaries ? storedLocale : "en");

const dictionaryState = computed(() => dictionaries[localeState.value]);

export const setLocale = (newLocale: Locale) => {
  if (localeState.value === newLocale) return;
  localeState.value = newLocale;
  localStorage.setItem("app-locale", newLocale);
  document.documentElement.lang = newLocale;
  runClientUnscoped(clientLog("info", `Language mutated to ${newLocale}`));
};

export const t = (path: string, vars?: Record<string, string | number>): string => {
  const keys = path.split(".");
  let current: unknown = dictionaryState.value;

  for (const key of keys) {
    if (typeof current === "object" && current !== null && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      console.warn(`[i18n] Missing dictionary key: ${path} for locale ${localeState.value}`);
      return path;
    }
  }

  let text = String(current);
  if (vars) {
    Object.entries(vars).forEach(([key, value]) => {
      text = text.replace(`{${key}}`, String(value));
    });
  }

  return text;
};
