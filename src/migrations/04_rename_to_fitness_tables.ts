import { Kysely } from "kysely";
import type { Database } from "../types";

export async function up(db: Kysely<Database>) {
  // Rename Tables
  await db.schema.alterTable("grammar_point").renameTo("exercise").execute();
  await db.schema.alterTable("srs_card").renameTo("exercise_progress").execute();

  // Rename Columns
  await db.schema
    .alterTable("exercise_progress")
    .renameColumn("grammar_point_id", "exercise_id")
    .execute();

  await db.schema
    .alterTable("user_preference")
    .renameColumn("daily_new_rule_limit", "daily_new_exercise_limit")
    .execute();

  await db.schema
    .alterTable("user_preference")
    .renameColumn("enforce_mastery_gates", "enforce_mastery_locks")
    .execute();
}

export async function down(db: Kysely<Database>) {
  // Revert Column Renames
  await db.schema
    .alterTable("user_preference")
    .renameColumn("enforce_mastery_locks", "enforce_mastery_gates")
    .execute();

  await db.schema
    .alterTable("user_preference")
    .renameColumn("daily_new_exercise_limit", "daily_new_rule_limit")
    .execute();

  await db.schema
    .alterTable("exercise_progress")
    .renameColumn("exercise_id", "grammar_point_id")
    .execute();

  // Revert Table Renames
  await db.schema.alterTable("exercise_progress").renameTo("srs_card").execute();
  await db.schema.alterTable("exercise").renameTo("grammar_point").execute();
}