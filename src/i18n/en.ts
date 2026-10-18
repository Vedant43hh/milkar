// English UI strings. Every user-facing string lives here so a Hindi (hi.ts) dictionary with the
// same shape can be added later. Use {name} placeholders for values.

export const en = {
  app: {
    name: "Milkar",
    tagline: "Buy together. Save together.",
    description: "Group buying for housing societies: neighbours pool grocery orders and everyone pays the wholesale price.",
  },
  units: {
    KG: "kg",
    G: "g",
    LITRE: "L",
    ML: "ml",
    PACKET: "packet",
    PIECE: "piece",
    DOZEN: "dozen",
  },
  categories: {
    GRAINS_FLOUR: "Rice, atta & grains",
    DALS_PULSES: "Dals & pulses",
    OILS_GHEE: "Oils & ghee",
    SUGAR_SALT: "Sugar, salt & jaggery",
    SPICES: "Spices",
    TEA_COFFEE: "Tea & coffee",
    BREAKFAST: "Breakfast",
    HOME_CARE: "Home care",
    PERSONAL_CARE: "Personal care",
    EGGS_DAIRY: "Eggs & dairy",
  },
  meter: {
    unlock: "{units} more to unlock {price}!",
    qualify: "Needs {units} more to qualify",
    best: "Best price unlocked",
    societyQty: "{qty} ordered by your society",
  },
  home: {
    comingSoon: "Phase 1 is ready: the database, pricing engine and demo data are set up.",
  },
} as const;
