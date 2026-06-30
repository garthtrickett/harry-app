export const ROLES = {
  PLATFORM_OWNER: "PLATFORM_OWNER",
  CURATOR: "CURATOR",
  SUBSCRIBER: "SUBSCRIBER",
  GUEST: "GUEST"
} as const;

export type Role = keyof typeof ROLES;

export const PERMISSIONS = {
  // Global Administration
  PLATFORM_MANAGE: "platform:manage",
  
  // Trainer/Curator Actions
  WORKOUT_TEMPLATE_MANAGE: "workout_template:manage",
  EXERCISE_CURATE: "exercise:curate",
  AUDIO_GENERATION: "audio:generation",
  
  // Athlete/Subscriber Actions
  WORKOUT_START: "workout:start",
  PROGRESSION_UPDATE: "progression:update",
  THEME_TOGGLE: "theme:toggle",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PLATFORM_OWNER: [
    PERMISSIONS.PLATFORM_MANAGE,
    PERMISSIONS.WORKOUT_TEMPLATE_MANAGE,
    PERMISSIONS.EXERCISE_CURATE,
    PERMISSIONS.AUDIO_GENERATION,
    PERMISSIONS.WORKOUT_START,
    PERMISSIONS.PROGRESSION_UPDATE,
    PERMISSIONS.THEME_TOGGLE
  ],

  CURATOR: [
    PERMISSIONS.WORKOUT_TEMPLATE_MANAGE,
    PERMISSIONS.EXERCISE_CURATE,
    PERMISSIONS.AUDIO_GENERATION,
    PERMISSIONS.WORKOUT_START,
    PERMISSIONS.PROGRESSION_UPDATE,
    PERMISSIONS.THEME_TOGGLE
  ],

  SUBSCRIBER: [
    PERMISSIONS.WORKOUT_START,
    PERMISSIONS.PROGRESSION_UPDATE,
    PERMISSIONS.THEME_TOGGLE
  ],

  GUEST: [
    PERMISSIONS.WORKOUT_START,
    PERMISSIONS.PROGRESSION_UPDATE
  ]
};

export const hasPermission = (role: string | null | undefined, permission: Permission): boolean => {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as Role];
  return perms ? perms.includes(permission) : false;
};
