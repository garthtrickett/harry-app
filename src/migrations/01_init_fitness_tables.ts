import { Kysely, sql } from "kysely";
import type { Database } from "../types";

export async function up(db: Kysely<Database>) {
  // 1. Create global grammar_point table representing exercise catalog
  await db.schema
    .createTable("grammar_point")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("deck_id", "uuid", (c) => c.notNull().references("deck.id").onDelete("cascade"))
    .addColumn("formal_name", "text", (c) => c.notNull())
    .addColumn("base_meaning", "text", (c) => c.notNull())
    .addColumn("lesson_number", "integer", (c) => c.notNull())
    .addColumn("sequence_order", "integer", (c) => c.notNull())
    .addColumn("difficulty_level", "text", (c) => c.notNull().defaultTo("Beginner"))
    .addColumn("created_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // Create unique index to guarantee catalog safety
  await db.schema
    .createIndex("grammar_point_formal_name_deck_idx")
    .on("grammar_point")
    .columns(["deck_id", "formal_name"])
    .unique()
    .execute();

  // 2. Refactor srs_card to map directly to exercises (grammar_points)
  await db.schema.alterTable("srs_card").dropColumn("front").execute();
  await db.schema.alterTable("srs_card").dropColumn("back").execute();
  await db.schema.alterTable("srs_card").dropColumn("audio_url").execute();
  await db.schema.alterTable("srs_card").dropColumn("deck_id").execute();

  await db.schema
    .alterTable("srs_card")
    .addColumn("grammar_point_id", "uuid", (c) => c.notNull().references("grammar_point.id").onDelete("cascade"))
    .execute();

  await db.schema
    .createIndex("srs_card_grammar_point_idx")
    .on("srs_card")
    .column("grammar_point_id")
    .execute();

  await db.schema
    .createIndex("srs_card_user_grammar_point_unique_idx")
    .on("srs_card")
    .columns(["user_id", "grammar_point_id"])
    .unique()
    .execute();

  // 3. Alter user_preference to add enforce_mastery_gates and nutrition/calorie/water targets
  await db.schema
    .alterTable("user_preference")
    .addColumn("enforce_mastery_gates", "boolean", (c) => c.notNull().defaultTo(true))
    .addColumn("calorie_target", "integer", (c) => c.notNull().defaultTo(2500))
    .addColumn("protein_target", "integer", (c) => c.notNull().defaultTo(150))
    .addColumn("water_target_ml", "integer", (c) => c.notNull().defaultTo(3000))
    .execute();
}

export async function down(db: Kysely<Database>) {
  await db.schema.dropTable("grammar_point").ifExists().execute();
  
  await db.schema
    .alterTable("user_preference")
    .dropColumn("enforce_mastery_gates")
    .dropColumn("calorie_target")
    .dropColumn("protein_target")
    .dropColumn("water_target_ml")
    .execute();
}
