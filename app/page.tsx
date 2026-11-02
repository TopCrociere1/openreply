import { redirect } from "next/navigation";

// Top Crociere: istanza privata, niente pagina pubblicitaria del progetto.
// L'indirizzo principale porta al pannello (che rimanda al login se serve).
export default function Home() {
  redirect("/dashboard");
}
