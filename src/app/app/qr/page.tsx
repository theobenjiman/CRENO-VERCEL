import Link from "next/link";
import QRCode from "qrcode";
import { requireOwner } from "@/lib/session";
import { appUrl } from "@/lib/booking";
import PrintButton from "./PrintButton";

type Props = { searchParams: Promise<{ f?: string }> };

const FORMATS = {
  a5: { label: "Comptoir (A5)", page: "A5 portrait" },
  a4: { label: "Mur / vitrine (A4)", page: "A4 portrait" },
} as const;
type FormatKey = keyof typeof FORMATS;

export default async function QrPage({ searchParams }: Props) {
  const { f } = await searchParams;
  const format: FormatKey = f === "a4" ? "a4" : "a5";
  const { salon } = await requireOwner();
  const link = `${appUrl()}/${salon.slug}`;
  const svg = await QRCode.toString(`${link}?via=qr`, {
    type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#2A1620", light: "#FFFFFF" },
  });
  const shortLink = link.replace(/^https?:\/\//, "");

  return (
    <div className="px-4 pt-5 flex flex-col gap-4">
      <style>{`
        @media print {
          @page { size: ${FORMATS[format].page}; margin: 0; }
          body { background: #fff !important; }
          body * { visibility: hidden; }
          #poster, #poster * { visibility: visible; }
          #poster { position: fixed; inset: 0; width: 100%; height: 100%; border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="print:hidden flex flex-col gap-1">
        <Link href="/app/settings" className="text-sm text-rose font-semibold">‹ Réglages</Link>
        <h1 className="font-display font-extrabold text-2xl">QR code du salon</h1>
        <p className="text-sm text-muted">
          Affichez-le au comptoir ou sur la vitrine. Vos clientes le scannent avec l&apos;appareil photo, réservent tout de suite
          et peuvent enregistrer le salon dans leur téléphone pour la prochaine fois.
        </p>
      </div>

      <div className="print:hidden flex gap-2" role="group" aria-label="Format">
        {(Object.keys(FORMATS) as FormatKey[]).map((k) => (
          <Link key={k} href={`/app/qr?f=${k}`} aria-current={k === format ? "true" : undefined}
            className={`min-h-9 px-3 rounded-full text-sm flex items-center ${k === format ? "bg-ink text-white font-semibold" : "bg-white border border-line"}`}>
            {FORMATS[k].label}
          </Link>
        ))}
      </div>

      <section id="poster" aria-label="Affiche à imprimer"
        className="mx-auto w-full max-w-sm aspect-[1/1.414] rounded-2xl border border-line shadow-lg shadow-rose/10 bg-white flex flex-col">
        <div className="bg-berry text-white text-center rounded-t-2xl px-6 pt-7 pb-6 flex flex-col gap-1">
          <div className="font-display italic font-bold text-lg opacity-90">créno</div>
          <div className="font-display font-extrabold text-[1.7rem] leading-tight">{salon.name}</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-6 text-center">
          <p className="font-display font-extrabold text-2xl leading-tight text-ink">Réservez votre prochain rendez-vous</p>
          <div className="w-[62%] aspect-square p-2 rounded-2xl border-4 border-rose bg-white [&>svg]:size-full"
            role="img" aria-label={`QR code vers ${shortLink}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="text-sm text-muted leading-snug">
            Scannez avec l&apos;appareil photo de votre téléphone<br />
            <span className="font-semibold text-ink">Acompte Wave · Orange Money · MTN</span>
          </p>
        </div>
        <div className="bg-petal text-center rounded-b-2xl py-3 px-4 text-sm font-semibold text-berry break-all">{shortLink}</div>
      </section>

      <div className="print:hidden flex flex-col gap-2">
        <PrintButton />
        <div className="grid grid-cols-2 gap-2">
          <a className="btn-ghost" href={`/api/qr/${salon.slug}?format=png&size=1600&download=1`}>QR en PNG</a>
          <a className="btn-ghost" href={`/api/qr/${salon.slug}?format=svg&download=1`}>QR en SVG</a>
        </div>
        <a className="btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(`Réservez chez ${salon.name} ici : ${link}`)}`}>
          Partager le lien sur WhatsApp
        </a>
        <p className="text-xs text-muted">
          Astuce : le PNG s&apos;utilise aussi sur vos statuts WhatsApp, flyers et cartes de visite. Le QR ne change pas, même si vous modifiez vos prestations.
        </p>
      </div>
    </div>
  );
}
