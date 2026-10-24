// What the portal IS, in one place. The pages hold no names, categories or
// colours of their own: the server reads this file and hands it to them.
//
// `defaults` are starting values only: the administrator edits name,
// subtitle, welcome text and colour theme on the Admin page, and once saved
// there the database's values win over these. Everything else below takes
// effect on the next deploy.

export default {
  defaults: {
    name: "Strandvågen",
    tagline: "Nabolaget vårt",
    welcome:
      "Velkommen til nabolagsportalen! Her deler vi beskjeder, planlegger dugnader og holder kontakten.",
    theme: "hav",
  },

  // Colour themes the administrator can choose between. `accent` drives
  // buttons, links and highlights; the rest of the palette follows it.
  themes: [
    { id: "hav", label: "Hav", accent: "#0b7a83" },
    { id: "fjord", label: "Fjord", accent: "#3457d5" },
    { id: "skog", label: "Skog", accent: "#2e7d4f" },
    { id: "solnedgang", label: "Solnedgang", accent: "#d0532b" },
    { id: "lyng", label: "Lyng", accent: "#8a4cbf" },
  ],

  // Wall categories. Renaming a label is safe; changing or removing an `id`
  // leaves existing posts with that id shown without a category.
  postCategories: [
    { id: "generelt", label: "Generelt", icon: "💬", color: "#5b6b7f" },
    { id: "beskjed", label: "Viktig beskjed", icon: "📣", color: "#d0532b" },
    { id: "hjelp", label: "Hjelp ønskes", icon: "🙋", color: "#b7791f" },
    { id: "gis-bort", label: "Gis bort / selges", icon: "🎁", color: "#2e7d4f" },
    { id: "mistet", label: "Mistet og funnet", icon: "🔎", color: "#8a4cbf" },
    { id: "tips", label: "Tips og anbefalinger", icon: "💡", color: "#0b7a83" },
  ],

  // Calendar categories, same rules as above.
  eventCategories: [
    { id: "dugnad", label: "Dugnad", icon: "🧹", color: "#2e7d4f" },
    { id: "sosialt", label: "Sosialt", icon: "🎉", color: "#d0532b" },
    { id: "mote", label: "Møte", icon: "🗣️", color: "#3457d5" },
    { id: "barn", label: "For barna", icon: "🧸", color: "#b7791f" },
    { id: "annet", label: "Annet", icon: "📌", color: "#5b6b7f" },
  ],

  // Put on the Links page when the portal is first set up; the administrator
  // edits or deletes them there afterwards.
  starterLinks: [
    { group: "Nyttige numre", title: "Legevakt", url: "tel:116117", description: "116 117 – når det haster, men ikke er livstruende" },
    { group: "Nyttige numre", title: "Politiet (ikke nødsituasjon)", url: "tel:02800", description: "02800 – ved nød, ring 112" },
    { group: "Nyttige numre", title: "Giftinformasjonen", url: "tel:+4722591300", description: "22 59 13 00 – døgnåpen" },
    { group: "Vær", title: "Yr", url: "https://www.yr.no", description: "Værvarsel fra Meteorologisk institutt og NRK" },
  ],

  sessionDays: 365, // how long a device stays logged in
  inviteDays: 14, // how long an invitation link works
};
