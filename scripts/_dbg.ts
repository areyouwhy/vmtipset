import { db } from "@/db";
import { players } from "@/db/schema";
import { ilike } from "drizzle-orm";
async function main() {
  const ps = await db.select().from(players).where(ilike(players.name, "%celik%"));
  for (const p of ps) console.log(`${p.name} | active=${p.active} | archived=${p.archivedAt ? "YES" : "no"} | id=${p.id}`);
}
main().then(()=>process.exit(0));
