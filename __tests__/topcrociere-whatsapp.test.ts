import { describe, expect, it } from "vitest";
import {
  buildTrackedUrl,
  fillDestinationUsername,
  renderMessageWithoutLink,
  sanitizeUsername,
} from "@/lib/tracking/message";

const WA =
  "https://wa.me/393508238830?text=Ciao%2C%20vengo%20da%20Instagram%20-%20CROCIERA%20{username}";

describe("Top Crociere: nome utente nel link WhatsApp", () => {
  it("pulisce il nome utente Instagram", () => {
    expect(sanitizeUsername("@mario.rossi_75")).toBe("mario.rossi_75");
    expect(sanitizeUsername("mario<script>")).toBe("marioscript");
    expect(sanitizeUsername("")).toBeNull();
    expect(sanitizeUsername(null)).toBeNull();
  });

  it("aggiunge u= al link tracciato solo se c'è un nome", () => {
    const withName = new URL(buildTrackedUrl("abc", "https://x.it", "tok", "mario"));
    expect(withName.pathname).toBe("/r/abc");
    expect(withName.searchParams.get("r")).toBe("tok");
    expect(withName.searchParams.get("u")).toBe("mario");
    const noName = new URL(buildTrackedUrl("abc", "https://x.it", "tok"));
    expect(noName.searchParams.has("u")).toBe(false);
  });

  it("inserisce @nome nel testo precompilato, anche se codificato", () => {
    expect(fillDestinationUsername(WA, "mario")).toContain("CROCIERA%20%40mario");
    const encoded = WA.replace("{username}", "%7Busername%7D");
    expect(fillDestinationUsername(encoded, "mario")).toContain("CROCIERA%20%40mario");
    expect(fillDestinationUsername(WA, null).endsWith("CROCIERA%20")).toBe(true);
  });

  it("senza nome il saluto resta pulito", () => {
    expect(
      renderMessageWithoutLink({ message: "Ciao {username}! Ecco il preventivo {link}", commenterName: null })
    ).toBe("Ciao! Ecco il preventivo");
    expect(
      renderMessageWithoutLink({ message: "Ciao {username}!", commenterName: "mario" })
    ).toBe("Ciao mario!");
  });
});

describe("Top Crociere: nome solo dove serve", () => {
  it("passa il nome solo se la destinazione usa {username}", async () => {
    const { usernameForDestination } = await import("@/lib/tracking/message");
    expect(usernameForDestination(WA, "mario")).toBe("mario");
    expect(usernameForDestination("https://topcrociere.com", "mario")).toBeNull();
  });
});
