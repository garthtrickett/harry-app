import type { Migration } from "kysely";
import * as m00 from "../../migrations/00_init_db";
import * as m01 from "../../migrations/01_init_fitness_tables";
import * as m02 from "../../migrations/02_user_preferences";
import * as m03 from "../../migrations/03_add_hlc_columns";
import * as m04 from "../../migrations/04_rename_to_fitness_tables";
import * as m05 from "../../migrations/05_onboarding_persistence";

export const migrationObjects: Record<string, Migration> = {
  "00_init_db": { up: m00.up, down: m00.down },
  "01_user_preferences": { up: m02.up, down: m02.down }, // Remapped to run 2nd
  "02_init_fitness_tables": { up: m01.up, down: m01.down }, // Remapped to run 3rd
  "03_add_hlc_columns": { up: m03.up, down: m03.down },
  "04_rename_to_fitness_tables": { up: m04.up, down: m04.down },
  "05_onboarding_persistence": { up: m05.up, down: m05.down },
};
