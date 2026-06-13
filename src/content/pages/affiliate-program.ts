import type { EditorialPageCopy } from "@/content/pages/types";

const affiliateProgramPageCopy: EditorialPageCopy = {
  eyebrow: "Partnerships",
  title: "Affiliate Program",
  summary:
    "Share SALT with your audience through a values-aligned partnership that keeps the process transparent, supportive, and easy to understand.",
  chips: ["Creator-friendly", "Transparent terms", "Values-aligned", "Supportive"],
  sections: [
    {
      id: "benefits",
      kind: "cards",
      title: "Why Join",
      items: [
        {
          title: "Earn on helpful recommendations",
          body: "Share products your audience can genuinely use while keeping the tone conversational and grounded.",
        },
        {
          title: "Work with a values-first brand",
          body: "The program is built for partners who care about clarity, usefulness, and trust.",
        },
        {
          title: "Keep the process simple",
          body: "A straightforward application path makes it easy to get started and stay organized.",
        },
      ],
    },
    {
      id: "eligibility",
      kind: "rich",
      title: "Eligibility",
      body: [
        "The program is a fit for creators, publishers, and community builders who regularly talk about home, gifting, wellness, or everyday tools.",
        "We look for partners who can present SALT in a useful, honest way without over-selling the story.",
      ],
    },
    {
      id: "what-you-share",
      kind: "cards",
      title: "What You Share",
      items: [
        {
          title: "Curated home essentials",
          body: "Products that support a calmer home, a more organized routine, or a thoughtful gift.",
        },
        {
          title: "Practical lifestyle finds",
          body: "Useful picks that are easy to explain and easy for audiences to understand.",
        },
        {
          title: "Seasonal favorites",
          body: "Rotating items that give your content a reason to stay fresh and timely.",
        },
      ],
    },
    {
      id: "how-it-works",
      kind: "rich",
      title: "How It Works",
      body: [
        "Apply through the contact page, share a little about your audience, and tell us where you plan to feature SALT.",
        "Once approved, you can create content, share links, and keep an eye on performance with a process that is easy to follow.",
      ],
    },
    {
      id: "faq",
      kind: "faq",
      title: "FAQ",
      items: [
        {
          question: "How do I apply?",
          answer: "Use the contact page and mention that you are interested in the affiliate program.",
        },
        {
          question: "What kind of content works best?",
          answer:
            "Helpful recommendations, clear product context, and honest recommendations tend to fit best.",
        },
      ],
    },
  ],
  actions: [
    { label: "Contact support", to: "/contact", primary: true },
    { label: "Shop the catalog", to: "/shop" },
  ],
};

export default affiliateProgramPageCopy;
