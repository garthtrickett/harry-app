import { Kysely, sql } from "kysely";
import type { Database } from "../types";

export async function up(db: Kysely<Database>) {
  await db.schema
    .createTable("client_onboarding")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) => c.notNull().references("user.id").onDelete("cascade"))
    .addColumn("status", "text", (c) => c.notNull().defaultTo("not_started"))
    .addColumn("current_step_id", "text", (c) => c.notNull().defaultTo("welcome_video"))
    .addColumn("part_1_completed_at", "timestamp")
    .addColumn("part_2_completed_at", "timestamp")
    .addColumn("submitted_at", "timestamp")
    .addColumn("coach_reviewed_at", "timestamp")
    .addColumn("coach_reviewer_id", "uuid", (c) => c.references("user.id").onDelete("set null"))
    .addColumn("coach_notes", "text")
    .addColumn("blocked_reason", "text")
    .addColumn("created_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("hlc", "text", (c) => c.notNull().defaultTo("0000000000000:0000:initial"))
    .execute();

  await db.schema
    .createIndex("client_onboarding_user_id_unique_idx")
    .on("client_onboarding")
    .column("user_id")
    .unique()
    .execute();

  await db.schema
    .createIndex("client_onboarding_status_idx")
    .on("client_onboarding")
    .column("status")
    .execute();

  await db.schema
    .createIndex("client_onboarding_hlc_idx")
    .on("client_onboarding")
    .column("hlc")
    .execute();

  await db.schema
    .createTable("client_onboarding_step")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("onboarding_id", "uuid", (c) => c.notNull().references("client_onboarding.id").onDelete("cascade"))
    .addColumn("step_id", "text", (c) => c.notNull())
    .addColumn("part", "text", (c) => c.notNull())
    .addColumn("status", "text", (c) => c.notNull().defaultTo("not_started"))
    .addColumn("payload", "jsonb", (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("completed_at", "timestamp")
    .addColumn("created_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("hlc", "text", (c) => c.notNull().defaultTo("0000000000000:0000:initial"))
    .execute();

  await db.schema
    .createIndex("client_onboarding_step_unique_idx")
    .on("client_onboarding_step")
    .columns(["onboarding_id", "step_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("client_onboarding_step_status_idx")
    .on("client_onboarding_step")
    .columns(["onboarding_id", "status"])
    .execute();

  await db.schema
    .createIndex("client_onboarding_step_hlc_idx")
    .on("client_onboarding_step")
    .column("hlc")
    .execute();

  await db.schema
    .createTable("client_health_waiver_acceptance")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("onboarding_id", "uuid", (c) => c.notNull().references("client_onboarding.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (c) => c.notNull().references("user.id").onDelete("cascade"))
    .addColumn("waiver_version", "text", (c) => c.notNull())
    .addColumn("signature_name", "text", (c) => c.notNull())
    .addColumn("accepted_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("ip_address", "text")
    .addColumn("device_metadata", "jsonb")
    .addColumn("created_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("client_health_waiver_acceptance_unique_idx")
    .on("client_health_waiver_acceptance")
    .columns(["onboarding_id", "waiver_version"])
    .unique()
    .execute();

  await db.schema
    .createIndex("client_health_waiver_acceptance_user_idx")
    .on("client_health_waiver_acceptance")
    .column("user_id")
    .execute();

  await db.schema
    .createTable("client_onboarding_media")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("onboarding_id", "uuid", (c) => c.notNull().references("client_onboarding.id").onDelete("cascade"))
    .addColumn("step_id", "text", (c) => c.notNull())
    .addColumn("media_kind", "text", (c) => c.notNull())
    .addColumn("storage_key", "text", (c) => c.notNull())
    .addColumn("public_url", "text")
    .addColumn("original_filename", "text")
    .addColumn("mime_type", "text", (c) => c.notNull())
    .addColumn("size_bytes", "bigint")
    .addColumn("created_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("client_onboarding_media_onboarding_step_idx")
    .on("client_onboarding_media")
    .columns(["onboarding_id", "step_id"])
    .execute();

  await db.schema
    .createTable("client_nutrition_gpt_summary")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("onboarding_id", "uuid", (c) => c.notNull().references("client_onboarding.id").onDelete("cascade"))
    .addColumn("raw_payload", "jsonb", (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("summary_payload", "jsonb", (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("provider", "text")
    .addColumn("model_name", "text")
    .addColumn("client_visible", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("created_at", "timestamp", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("client_nutrition_gpt_summary_onboarding_idx")
    .on("client_nutrition_gpt_summary")
    .column("onboarding_id")
    .execute();
}

export async function down(db: Kysely<Database>) {
  await db.schema.dropTable("client_nutrition_gpt_summary").ifExists().execute();
  await db.schema.dropTable("client_onboarding_media").ifExists().execute();
  await db.schema.dropTable("client_health_waiver_acceptance").ifExists().execute();
  await db.schema.dropTable("client_onboarding_step").ifExists().execute();
  await db.schema.dropTable("client_onboarding").ifExists().execute();
}