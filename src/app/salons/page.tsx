import type { Metadata } from "next";
import Directory from "./Directory";

export const metadata: Metadata = {
  title: "Trouver un salon près de moi — Créno",
  description: "Salons de coiffure, tresses, ongles et barbiers près de vous. Réservez en ligne, au salon ou à domicile.",
};

export default function SalonsPage() {
  return <Directory />;
}
