// Case-insensitive "contains" filter for Prisma on both databases.
// SQLite's LIKE already ignores case (and has no `mode` option); PostgreSQL needs mode: "insensitive".
const IS_POSTGRES = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "");

export function textMatch(q: string): { contains: string } {
  return (IS_POSTGRES ? { contains: q, mode: "insensitive" } : { contains: q }) as { contains: string };
}
