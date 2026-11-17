"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { formatDateTime } from "@/lib/utils";

type Row = { id: string; name: string; idNo: string; college: string; events: string[]; verifiedAt: string | null; reviewer: string | null };
type Result = { approved: Array<{ id: string; sportsId: string }>; skipped: Array<{ id: string; reason: string }> };

export function BulkApprove({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [skipped, setSkipped] = useState<Result["skipped"]>([]);
  const all = selected.size === rows.length;
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? id;

  async function run() {
    setLoading(true);
    const r = await api<Result>("/api/admin/bulk-approve", { body: { ids: [...selected] } });
    setLoading(false);
    setConfirm(false);
    if (!r.ok) return toast.error("Approval failed", r.error);
    setSkipped(r.data.skipped);
    setSelected(new Set());
    toast.success(`Approved ${r.data.approved.length}`, r.data.skipped.length ? `${r.data.skipped.length} skipped — see below` : "QR Sports IDs issued");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {skipped.length > 0 && (
        <div role="alert" className="rounded-xl border border-warning bg-warning-bg p-4 text-small">
          <p className="font-semibold">Skipped — open these individually:</p>
          <ul className="mt-1 list-inside list-disc">
            {skipped.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/students/${s.id}`} className="font-semibold underline underline-offset-4">
                  {nameOf(s.id)}
                </Link>{" "}
                — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="sticky top-20 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card lg:top-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} className="size-5 accent-[var(--primary)]" />
          Select all ({rows.length})
        </label>
        <Button variant="success" className="ml-auto" disabled={!selected.size} onClick={() => setConfirm(true)} icon={<CheckCircle2 className="size-4" aria-hidden />}>
          Approve {selected.size || ""} selected
        </Button>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-card">
            <input id={`sel-${r.id}`} type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-3 size-5 shrink-0 accent-[var(--primary)]" aria-label={`Select ${r.name}`} />
            <label htmlFor={`sel-${r.id}`} className="min-w-0 flex-1 cursor-pointer py-1.5">
              <span className="block font-semibold">{r.name}</span>
              <span className="block font-mono text-small">{r.idNo}</span>
              <span className="block text-small text-muted">{r.college}</span>
              <span className="block text-small">{r.events.join(" · ")}</span>
              <span className="block text-small text-muted">Verified {formatDateTime(r.verifiedAt)}</span>
              {r.reviewer && (
                <Badge tone="info" icon={<Eye className="size-3.5" aria-hidden />} className="mt-1">
                  {r.reviewer} reviewing
                </Badge>
              )}
            </label>
            <Link href={`/admin/students/${r.id}`} className="grid min-h-11 shrink-0 place-items-center rounded-lg px-3 text-small font-semibold text-muted hover:bg-surface-2 hover:text-fg">
              Open
            </Link>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={run}
        loading={loading}
        tone="success"
        confirmLabel={`Approve ${selected.size}`}
        title={`Approve ${selected.size} student${selected.size === 1 ? "" : "s"}?`}
        description="Each student gets a signed QR Sports ID. Every approval is recorded individually in the audit log under your name. Anyone whose record changed since this list loaded is skipped."
      />
    </div>
  );
}
