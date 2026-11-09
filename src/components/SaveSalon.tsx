"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void> };

/** Lets a client keep the salon: save it as a contact, or add the booking page to her home screen. */
export default function SaveSalon({ slug, fromQr }: { slug: string; fromQr: boolean }) {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [tip, setTip] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    if (window.matchMedia?.("(display-mode: standalone)").matches) setHidden(true);
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;

  async function addToHome() {
    if (install) { await install.prompt(); setInstall(null); return; }
    setTip(true);
  }

  return (
    <div className={`mx-5 mt-4 rounded-2xl p-3 flex flex-col gap-2 ${fromQr ? "bg-petal" : "bg-white border border-line"}`}>
      <p className="text-sm font-semibold">
        {fromQr ? "Bienvenue ! Gardez ce salon dans votre téléphone pour réserver plus vite la prochaine fois." : "Gardez ce salon dans votre téléphone"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a href={`/${slug}/contact.vcf`} className="btn-ghost min-h-10 px-2 text-xs">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" /></svg>
          Enregistrer le contact
        </a>
        <button type="button" onClick={addToHome} className="btn-ghost min-h-10 px-2 text-xs">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 8v6M9 11h6" /></svg>
          Écran d&apos;accueil
        </button>
      </div>
      {tip && (
        <p role="status" className="text-xs text-muted">
          {ios
            ? "Sur iPhone : touchez le bouton Partager (carré avec une flèche) puis « Sur l'écran d'accueil »."
            : "Ouvrez le menu du navigateur (⋮) puis « Ajouter à l'écran d'accueil »."}
        </p>
      )}
    </div>
  );
}
