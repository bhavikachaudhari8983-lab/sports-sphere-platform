// One-time upgrade step: puts every event that has no tournament into a default tournament (named after the
// "Competition name" setting). Safe to run more than once. Usage: npm run db:backfill
import { ensureDefaultTournament } from "../src/lib/tournaments";
import { prisma } from "../src/lib/prisma";

ensureDefaultTournament()
  .then((r) => console.log(r ? `Moved ${r.moved} event(s) into "${r.tournament.name}".` : "Every event already belongs to a tournament."))
  .finally(() => prisma.$disconnect());
