import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-md min-h-screen px-6 py-10 flex flex-col gap-8">
      <div className="font-display italic font-bold text-3xl text-berry">créno</div>
      <div className="flex flex-col gap-3">
        <h1 className="font-display font-extrabold text-4xl leading-tight">Fini le cahier et les rendez-vous ratés.</h1>
        <p className="text-muted">
          Vos clientes réservent par lien WhatsApp, au salon ou à domicile, paient un acompte en mobile money,
          et vous voyez votre caisse chaque soir.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/salons" className="btn-primary min-h-13 text-base">Trouver un salon près de moi</Link>
        <Link href="/login" className="btn-ghost">Je suis un salon : créer mon espace</Link>
        <Link href="/fatou-beaute" className="btn-ghost">Voir une page de réservation (démo)</Link>
      </div>
      <ul className="card p-5 flex flex-col gap-2 text-sm">
        <li>• Lien de réservation à partager sur WhatsApp et Instagram</li>
        <li>• Acompte Wave, Orange Money, MTN contre les rendez-vous ratés</li>
        <li>• Rappels WhatsApp automatiques</li>
        <li>• Prestations à domicile avec frais de déplacement</li>
        <li>• Fichier clientes, offres et vœux en un clic</li>
      </ul>
    </main>
  );
}
