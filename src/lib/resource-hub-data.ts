import type { SiteResourceGuide } from "@/lib/site-navigation";

const P = {
  planner: "scented-decorative-candle-aromatherapy-nordic-room-decor",
  dailyBloom: "the-living-legacy-planner",
  pillOrganizer: "7-day-pill-organizer-box-travel-friendly-medicine-dispenser",
  tcarePill: "tcare-travel-pill-organizer-moisture-proof-daily-pill-case-1",
  pillBox14: "14-grid-7-day-pill-box-weekly-organizer-for-vitamins-medicine",
  arthritisGloves: "square-ball-shaped-scented-candle-handcrafted-colorful-birthday-gift",
  laopaoLamp: "laopao-10w-wireless-charging-led-desk-lamp-dimmable-with-night-light",
  digitalClock: "digital-wall-clock-time-day-and-temperature-display",
  nonstickCookware: "9-piece-nonstick-cookware-set-champagne-lightweight-durable",
  stainlessCookware: "12pc-stainless-cookware-set-cook-n-home-kitchen",
  laptopDesk: "portable-aluminum-laptop-desk-stand-with-mouse-pad",
  meshBags:
    "hodr-mesh-bags-lightweight-mesh-stuff-sack-drawstring-storage-bags-compression-pouches-for-camping-hiking-laundry-grocery",
  foldingToilet:
    "can-opener-adjustable-stainless-steel-non-slip-manual-jar-bottle-bottle-lid-opener-gadget-home-kitchen-professional-gadgets-tool",
  catHarness: "adjustable-cartoon-bee-cat-harness-with-leash-dogs-cats",
  petBrush: "3-in-1-pet-spray-brush-steam-massage-hair-removal-comb",
  dogPoopBags: "dog-poop-bags-10-rolls-portable-pet-waste-bags",
  dogWaterBottle: "portable-dog-water-bottle-travel-water-dispenser-for-pets",
  catBed: "cozy-winter-cat-bed-cave-nest-for-cats-small-dogs",
  petSeatBelt: "adjustable-pet-harness-cat-dog-seat-belt-for-travel",
  dogHarness: "soft-mesh-dog-harness-breathable-comfort-for-small-dogs-cats",
  medicalBag: "portable-weekly-pill-box-8-grids-health-care-travel-organizer",
  gpsTracker: "mini-gps-tracker-find-my-app-smart-tag-for-pets-keys",
  relics: "the-living-legacy-planner",
  helloKitty: "kawaii-hello-kitty-doll-with-artificial-flowers-sanrio-bouquet-gift",
  volcanoDiffuser: "volcano-flame-aroma-diffuser-360ml-jellyfish-humidifier",
  miniTrainDiffuser: "mini-train-shape-aromatherapy-diffuser-with-led-lamp",
  multicolorDiffuser: "multicolor-humidifier-aromatherapy-flame-diffuser",
  paamaaLamp:
    "square-ball-shaped-scented-candle-handcrafted-colorful-birthday-gift",
  aierwillHumidifier: "aierwill-train-humidifier-ultrasonic-aromatherapy-diffuser",
  titanicDiffuser: "titanic-ship-model-air-humidifier-250ml-essential-oil-diffuser",
  verticalStand: "scented-candle-painting-kit-diy-creative-modeling-materials",
  hotWaterBag: "hot-water-bottle-bag-warm-belly-hands-feet",
  foldingLunchBowl:
    "portable-folding-lunch-box-bowl-sets-silicone-3pcs-set-food-container-outdoor-camping-tableware-set-foldable-salad-bowl-with-lid",
  foldingCup:
    "outdoors-silicone-folding-cup-with-hanging-hole-creative-water-cup-travel-portable-washing-cup-fashion-travel-silicone-cup",
  canOpener:
    "can-opener-adjustable-stainless-steel-non-slip-manual-jar-bottle-bottle-lid-opener-gadget-home-kitchen-professional-gadgets-tool",
  bottleOpener:
    "6-in-1-bottle-opener-multifunctional-screw-cap-jar-can-openers-lid-grip-opener-home-camping-safety-can-opener-kitchen-gadgets",
  bottlePump: "atwfs-electric-wireless-bottle-pump",
} as const;

const featured = (...handles: string[]) => handles.map((handle) => ({ handle }));

export const RESOURCE_HUB_HUB_FEATURED_PRODUCTS = featured(P.planner, P.dailyBloom, P.digitalClock);

export const RESOURCE_HUB_GUIDES: SiteResourceGuide[] = [
  {
    title: "Senior Living Guides",
    handle: "senior-living-guides",
    summary: "Practical checklists and buyer-friendly advice for safer, calmer living at home.",
    collectionRoute: "/collections/senior-living-solutions",
    featuredProducts: featured(P.planner, P.dailyBloom, P.arthritisGloves),
    topics: [
      {
        title: "Best Gifts for Seniors",
        handle: "best-gifts-for-seniors",
        summary:
          "A thoughtful guide to gifts that feel useful, comfortable, and respectful, with products that support everyday routines instead of collecting dust.",
        collectionRoute: "/collections/gifts",
        featuredProducts: featured(P.planner, P.dailyBloom, P.medicalBag),
      },
      {
        title: "Home Safety Tips",
        handle: "home-safety-tips",
        summary:
          "A calm starting point for safer rooms, gentler night-time navigation, and small upgrades that reduce avoidable friction at home.",
        collectionRoute: "/collections/home-decor-lighting",
        featuredProducts: featured(P.laopaoLamp, P.digitalClock, P.medicalBag),
      },
      {
        title: "Caregiver Resources",
        handle: "caregiver-resources",
        summary:
          "A practical guide for caregivers who need products and systems that save time, reduce stress, and keep important details organized.",
        collectionRoute: "/collections/senior-living-solutions",
        featuredProducts: featured(P.tcarePill, P.pillBox14, P.medicalBag),
      },
    ],
  },
  {
    title: "Home & Living",
    handle: "home-living",
    summary: "Calm, room-by-room ideas for organizing small spaces, reducing clutter, and making the home feel more settled.",
    collectionRoute: "/collections/home-kitchen",
    featuredProducts: featured(P.laopaoLamp, P.digitalClock, P.meshBags),
    topics: [
      {
        title: "How to Stay Organized at Home",
        handle: "how-to-stay-organized-at-home",
        summary: "A simple guide for turning clutter into a manageable system, one room and one habit at a time.",
        collectionRoute: "/collections/home-kitchen",
        featuredProducts: featured(P.meshBags, P.planner, P.digitalClock),
      },
      {
        title: "Small Space Organization Tips",
        handle: "small-space-organization-tips",
        summary: "Space-saving ideas for apartments, shared rooms, and compact homes where every inch has to work a little harder.",
        collectionRoute: "/collections/home-kitchen",
        featuredProducts: featured(P.foldingLunchBowl, P.foldingCup, P.verticalStand),
      },
      {
        title: "Decluttering Your Home",
        handle: "decluttering-your-home",
        summary: "A straightforward plan for clearing visual noise, keeping what matters, and making it easier to maintain order afterward.",
        collectionRoute: "/collections/home-kitchen",
        featuredProducts: featured(P.foldingToilet, P.meshBags, P.digitalClock),
      },
      {
        title: "Creating a Comfortable Living Space",
        handle: "creating-a-comfortable-living-space",
        summary: "Ideas for adding warmth, light, and small comforts so the home feels inviting without becoming busy.",
        collectionRoute: "/collections/home-decor-lighting",
        featuredProducts: featured(P.laopaoLamp, P.paamaaLamp, P.miniTrainDiffuser),
      },
    ],
  },
  {
    title: "Lifestyle & Wellness",
    handle: "lifestyle-wellness",
    summary: "Simple, sustainable habits and comfort-forward products that help the day feel less rushed and more manageable.",
    collectionRoute: "/collections/health-wellness",
    featuredProducts: featured(P.dailyBloom, P.volcanoDiffuser, P.hotWaterBag),
    topics: [
      {
        title: "Simple Habits for a Less Stressful Life",
        handle: "simple-habits-for-a-less-stressful-life",
        summary: "A gentle reset for people who want less noise in the day and more rhythm without turning life into a project.",
        collectionRoute: "/collections/health-wellness",
        featuredProducts: featured(P.dailyBloom, P.volcanoDiffuser, P.hotWaterBag),
      },
      {
        title: "Creating Better Daily Routines",
        handle: "creating-better-daily-routines",
        summary: "A page for building repeatable routines that make mornings, evenings, and in-between moments feel easier to trust.",
        collectionRoute: "/collections/health-wellness",
        featuredProducts: featured(P.planner, P.digitalClock, P.pillOrganizer),
      },
      {
        title: "Work-Life Balance Tips",
        handle: "work-life-balance-tips",
        summary: "Practical ways to protect focus and personal time so work does not crowd out the rest of the day.",
        collectionRoute: "/collections/health-wellness",
        featuredProducts: featured(P.laptopDesk, P.verticalStand, P.digitalClock),
      },
      {
        title: "Self-Care at Home",
        handle: "self-care-at-home",
        summary: "Low-effort comfort ideas for the moments when you need rest, a pause, or a more soothing environment.",
        collectionRoute: "/collections/health-wellness",
        featuredProducts: featured(P.hotWaterBag, P.volcanoDiffuser, P.titanicDiffuser),
      },
    ],
  },
  {
    title: "Gift Guides",
    handle: "gift-guides",
    summary: "Occasion-led gift ideas that feel personal, useful, and easy to choose when you want the present to be appreciated, not overthought.",
    collectionRoute: "/collections/gifts",
    featuredProducts: featured(P.dailyBloom, P.planner, P.helloKitty),
    topics: [
      {
        title: "Best Gifts for Mom",
        handle: "best-gifts-for-mom",
        summary: "Warm, practical gifts for moms who appreciate something useful, thoughtful, and a little more personal than the usual default.",
        collectionRoute: "/collections/gifts",
        featuredProducts: featured(P.dailyBloom, P.laopaoLamp, P.nonstickCookware),
      },
      {
        title: "Best Gifts for Dad",
        handle: "best-gifts-for-dad",
        summary: "Useful, giftable picks for dads who value function, good design, and items they can actually use.",
        collectionRoute: "/collections/gifts",
        featuredProducts: featured(P.verticalStand, P.stainlessCookware, P.canOpener),
      },
      {
        title: "Best Gifts for Grandparents",
        handle: "best-gifts-for-grandparents",
        summary: "Comfort-first gift ideas for grandparents that feel kind, easy to enjoy, and simple to incorporate into daily life.",
        collectionRoute: "/collections/gifts",
        featuredProducts: featured(P.planner, P.relics, P.medicalBag),
      },
      {
        title: "Housewarming Gift Ideas",
        handle: "housewarming-gift-ideas",
        summary: "A curated mix of gifts that help a new home feel finished, comfortable, and ready to use.",
        collectionRoute: "/collections/home-decor-lighting",
        featuredProducts: featured(P.laopaoLamp, P.digitalClock, P.nonstickCookware),
      },
      {
        title: "Holiday Gift Guides",
        handle: "holiday-gift-guides",
        summary: "Seasonal gift ideas that keep shopping organized and help you choose something meaningful without the last-minute scramble.",
        collectionRoute: "/collections/gifts",
        featuredProducts: featured(P.dailyBloom, P.helloKitty, P.titanicDiffuser),
      },
    ],
  },
  {
    title: "Home Safety & Organization",
    handle: "home-safety-organization",
    summary: "Straightforward guidance for keeping the home safer, important items easier to find, and routines easier to maintain.",
    collectionRoute: "/collections/home-kitchen",
    featuredProducts: featured(P.laopaoLamp, P.digitalClock, P.medicalBag),
    topics: [
      {
        title: "Home Safety Tips for Every Age",
        handle: "home-safety-tips-for-every-age",
        summary: "A family-friendly guide to safer home details that matter at every stage of life, from lighting to organization.",
        collectionRoute: "/collections/home-decor-lighting",
        featuredProducts: featured(P.miniNightLight, P.digitalClock, P.gpsTracker),
      },
      {
        title: "Organizing Important Documents",
        handle: "organizing-important-documents",
        summary: "A guide for keeping critical papers, passwords, and emergency information together so they are easier to find when needed.",
        collectionRoute: "/collections/senior-living-solutions",
        featuredProducts: featured(P.planner, P.dailyBloom, P.medicalBag),
      },
      {
        title: "Family Emergency Preparedness",
        handle: "family-emergency-preparedness",
        summary: "A practical checklist for making sure the household has the basics ready before a problem turns urgent.",
        collectionRoute: "/collections/travel-outdoor",
        featuredProducts: featured(P.medicalBag, P.gpsTracker, P.foldingToilet),
      },
      {
        title: "Keeping Your Home Clutter-Free",
        handle: "keeping-your-home-clutter-free",
        summary: "A maintenance-minded page for keeping surfaces clear, storage simple, and the house easier to reset each day.",
        collectionRoute: "/collections/home-kitchen",
        featuredProducts: featured(P.meshBags, P.foldingLunchBowl, P.foldingCup),
      },
    ],
  },
  {
    title: "Family & Legacy",
    handle: "family-legacy",
    summary: "Thoughtful planning pages that help families preserve memories, organize key information, and make the future feel less scattered.",
    collectionRoute: "/collections/senior-living-solutions",
    featuredProducts: featured(P.planner, P.relics, P.dailyBloom),
    topics: [
      {
        title: "Preserving Family Memories",
        handle: "preserving-family-memories",
        summary: "A gentle guide to saving stories, notes, and keepsakes so family history stays available and meaningful.",
        collectionRoute: "/collections/senior-living-solutions",
        featuredProducts: featured(P.relics, P.dailyBloom, P.planner),
      },
      {
        title: "Why Every Family Should Have Important Information Organized",
        handle: "why-every-family-should-have-important-information-organized",
        summary: "A clear case for keeping essential household and care information in one place before life gets complicated.",
        collectionRoute: "/collections/senior-living-solutions",
        featuredProducts: featured(P.planner, P.pillBox14, P.medicalBag),
      },
      {
        title: "Creating a Family Legacy",
        handle: "creating-a-family-legacy",
        summary: "A page for capturing values, stories, and practical details that outlast a single season.",
        collectionRoute: "/collections/senior-living-solutions",
        featuredProducts: featured(P.relics, P.dailyBloom, P.helloKitty),
      },
      {
        title: "Planning for the Future",
        handle: "planning-for-the-future",
        summary: "A calm, practical page that helps families think ahead without making the conversation feel heavy.",
        collectionRoute: "/collections/senior-living-solutions",
        featuredProducts: featured(P.planner, P.digitalClock, P.medicalBag),
      },
    ],
  },
  {
    title: "Pet & Home Life",
    handle: "pet-home-life",
    summary: "Practical pet-care pages that keep feeding, travel, grooming, and everyday home routines simpler for people and pets.",
    collectionRoute: "/collections/pet-essentials",
    featuredProducts: featured(P.catHarness, P.petBrush, P.dogWaterBottle),
    topics: [
      {
        title: "Organizing Pet Supplies",
        handle: "organizing-pet-supplies",
        summary: "A tidy, practical guide for keeping leashes, grooming tools, waste bags, and feeding gear easy to reach.",
        collectionRoute: "/collections/pet-essentials",
        featuredProducts: featured(P.dogPoopBags, P.petBrush, P.petSeatBelt),
      },
      {
        title: "Making Your Home Pet-Friendly",
        handle: "making-your-home-pet-friendly",
        summary: "Simple ideas for sharing the home with pets in a way that feels comfortable, safe, and easy to maintain.",
        collectionRoute: "/collections/pet-essentials",
        featuredProducts: featured(P.catBed, P.dogHarness, P.catHarness),
      },
      {
        title: "Travel Tips for Pet Owners",
        handle: "travel-tips-for-pet-owners",
        summary: "A handy planning guide for road trips, appointments, and overnight stays with pets, plus the gear that makes travel smoother.",
        collectionRoute: "/collections/travel-outdoor",
        featuredProducts: featured(P.petSeatBelt, P.dogWaterBottle, P.gpsTracker),
      },
    ],
  },
];
