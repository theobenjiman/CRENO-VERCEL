"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayShort } from "@/lib/format";
import type { Slot } from "@/lib/slots";
import { cancelByClient, getRescheduleSlots, reschedule } from "./actions";

interface Props {
  token: string;
  days: string[];
  canChange: boolean;
  noticeHours: number;
  hasDeposit: boolean;
  salonWhatsApp: string | null;
}

export default function ManageBooking(p: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "move" | "cancel">("idle");
  const [date, setDate] = useState(p.days[0] ?? "");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [start, setStart] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, startLoad] = useTransition();
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (mode !== "move" || !date) return;
    setStart("");
    startLoad(async () => setSlots(await getRescheduleSlots(p.token, date)));
  }, [mode, date, p.token]);

  function doMove() {
    setError("");
    startBusy(async () => {
      const r = await reschedule(p.token, start, date);
      if (r.error) return setError(r.error);
      setMsg("C'est déplacé ! Vous allez recevoir la confirmation sur WhatsApp.");
      setMode("idle");
      router.refresh();
    });
  }

  function doCancel() {
    setError("");
    startBusy(async () => {
      const r = await cancelByClient(p.token);
      if (r.error) return setError(r.error);
      setMsg("Votre rendez-vous est annulé.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {msg && <p role="status" className="card p-4 font-semibold text-berry">{msg}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-[#A3203F]">{error}</p>}

      {mode === "idle" && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-primary" disabled={!p.canChange} onClick={() => setMode("move")}>Déplacer</button>
          <button type="button" className="btn-ghost" onClick={() => setMode("cancel")}>Annuler</button>
        </div>
      )}
      {!p.canChange && mode === "idle" && (
        <p className="text-xs text-muted">
          Moins de {p.noticeHours} h avant le rendez-vous : le déplacement en ligne n&apos;est plus possible.
          {p.salonWhatsApp && <> <a className="text-rose font-semibold" href={`https://wa.me/${p.salonWhatsApp.replace("+", "")}`}>Écrire au salon</a></>}
        </p>
      )}

      {mode === "move" && (
        <section className="flex flex-col gap-2">
          <h2 className="section-title">Nouveau jour et heure</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {p.days.map((d) => (
              <button key={d} type="button" onClick={() => setDate(d)}
                className={`shrink-0 w-14 rounded-xl py-2 text-center ${date === d ? "bg-berry text-white" : "bg-white border border-line"}`}>
                <span className="block text-[11px]">{dayShort(d)}</span>
                <span className="block font-bold">{Number(d.slice(8, 10))}</span>
              </button>
            ))}
          </div>
          {loading && <p className="text-sm text-muted">Recherche des créneaux…</p>}
          {!loading && slots?.length === 0 && <p className="text-sm text-muted">Plus de créneau ce jour-là.</p>}
          {!loading && !!slots?.length && (
            <div className="grid grid-cols-4 gap-2">
              {slots.map((s) => (
                <button key={s.start} type="button" onClick={() => setStart(s.start)}
                  className={`min-h-11 rounded-xl text-sm ${start === s.start ? "bg-rose text-white font-bold" : "bg-white border border-line"}`}>{s.label}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={() => setMode("idle")}>Retour</button>
            <button type="button" className="btn-primary" disabled={!start || busy} onClick={doMove}>{busy ? "…" : "Confirmer"}</button>
          </div>
        </section>
      )}

      {mode === "cancel" && (
        <section className="card p-4 flex flex-col gap-3">
          <p className="font-semibold">Annuler ce rendez-vous ?</p>
          {p.hasDeposit && (
            <p className="text-sm text-muted">
              {p.canChange
                ? "Vous annulez dans les délais : le salon vous contactera pour votre acompte."
                : `Annulation à moins de ${p.noticeHours} h : l'acompte reste acquis au salon.`}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={() => setMode("idle")}>Garder</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doCancel}>{busy ? "…" : "Oui, annuler"}</button>
          </div>
        </section>
      )}
    </div>
  );
}
