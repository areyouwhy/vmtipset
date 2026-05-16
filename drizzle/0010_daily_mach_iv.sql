CREATE TABLE "event_types" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"abbreviation" text,
	"image_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
