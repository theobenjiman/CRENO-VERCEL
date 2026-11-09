"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Login() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("e") === "auth" ? "La connexion n'a pas abouti. Réessayez." : "");

  const callback = () => `${window.location.origin}/auth/callback?next=/app`;

  async function google() {
    setError("");
    setBusy(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback(), queryParams: { prompt: "select_account" } },
    });
    if (error) { setBusy(false); setError("Connexion Google indisponible pour le moment."); }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Adresse email invalide.");
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callback() } });
    setBusy(false);
    if (error) return setError("Envoi impossible. Réessayez dans une minute.");
    setSent(true);
  }

  return (
    <main className="mx-auto max-w-sm min-h-screen px-6 py-12 flex flex-col gap-6">
      <div className="font-display italic font-bold text-3xl text-berry">créno</div>
      <div className="flex flex-col gap-1">
        <h1 className="font-display font-bold text-2xl">Espace salon</h1>
        <p className="text-sm text-muted">Pour les gérantes et coiffeuses. Vos clientes n&apos;ont pas besoin de compte pour réserver.</p>
      </div>

      <button type="button" onClick={google} disabled={busy}
        className="btn min-h-13 bg-white border border-line text-ink text-base hover:bg-petal shadow-sm">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {busy && !showEmail ? "Redirection…" : "Continuer avec Google"}
      </button>

      {!showEmail ? (
        <button type="button" className="text-sm text-rose font-semibold" onClick={() => setShowEmail(true)}>
          Pas de compte Google ? Recevoir un lien par email
        </button>
      ) : sent ? (
        <p role="status" className="card p-4 text-sm">
          C&apos;est envoyé ! Ouvrez l&apos;email reçu à <strong>{email}</strong> sur ce téléphone et touchez le lien pour vous connecter.
        </p>
      ) : (
        <form onSubmit={emailLink} className="flex flex-col gap-3">
          <label className="label">Votre adresse email
            <input className="input text-base" type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="fatou@gmail.com" />
          </label>
          <button className="btn-primary" disabled={busy}>{busy ? "Envoi…" : "Recevoir le lien de connexion"}</button>
        </form>
      )}

      {error && <p role="alert" className="text-sm font-semibold text-[#A3203F]">{error}</p>}
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}
