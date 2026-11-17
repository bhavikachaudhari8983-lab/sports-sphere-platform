// One-time: creates the private Supabase Storage bucket used for uploaded documents.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/supabase-setup.mjs
const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "uploads";
if (!url || !secret) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const headers = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
const existing = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers });
if (existing.ok) {
  console.log(`Bucket "${bucket}" already exists.`);
} else {
  const r = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 5 * 1024 * 1024 }),
  });
  if (!r.ok) {
    console.error(`Could not create bucket (${r.status}): ${await r.text()}`);
    process.exit(1);
  }
  console.log(`Created private bucket "${bucket}".`);
}
