import { redirect } from "next/navigation";

// The HETS table (three tiers + head-2-head) now lives on /tabell as the main
// standings entry point. The /hets/<slug> rivalry pages stay where they are.
export default function HetsIndexRedirect() {
  redirect("/tabell");
}
