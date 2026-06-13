import type { EditorialPageCopy } from "@/content/pages/types";

const missionVisionPageCopy: EditorialPageCopy = {
  eyebrow: "Our Purpose",
  title: "Our Mission & Vision",
  summary:
    "SALT is built to make everyday shopping feel more compassionate, more dignified, and easier to navigate from the first glance to checkout.",
  chips: ["Compassion", "Dignity", "Clarity", "Practical support"],
  sections: [
    {
      id: "mission",
      kind: "rich",
      title: "Mission",
      body: [
        "Our mission is to bring compassion into the shopping experience so people can choose practical products without friction or confusion.",
        "We want the store to feel supportive, especially when a shopper is making a decision for themselves, their home, or someone they care about.",
      ],
    },
    {
      id: "vision",
      kind: "rich",
      title: "Vision",
      body: [
        "Our vision is a storefront where useful products are presented with enough context to make confident decisions quickly.",
        "We want each page to feel warm and editorial, but still structured enough that shoppers can scan, compare, and move on with confidence.",
      ],
    },
    {
      id: "values",
      kind: "cards",
      title: "Values",
      items: [
        {
          title: "Compassion",
          body: "We keep people in mind first, especially when they are shopping for everyday support.",
        },
        {
          title: "Clarity",
          body: "Useful details stay visible so shoppers do not have to hunt for what matters.",
        },
        {
          title: "Practicality",
          body: "Products should solve a real need and still feel easy to choose.",
        },
        {
          title: "Trust",
          body: "We aim for a calm, dependable experience that feels honest from page to page.",
        },
      ],
    },
    {
      id: "commitment",
      kind: "rich",
      title: "Commitment",
      body: [
        "We are committed to keeping the storefront useful, the language straightforward, and the support path easy to find when questions come up.",
        "That commitment extends to the product catalog, the editorial pages, and every place a shopper needs a little more confidence.",
      ],
    },
  ],
  actions: [
    { label: "About SALT", to: "/about", primary: true },
    { label: "Shop the catalog", to: "/shop" },
    { label: "Contact support", to: "/contact" },
  ],
};

export default missionVisionPageCopy;
