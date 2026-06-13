export type EditorialRichSection = {
  id: string;
  kind: "rich";
  title: string;
  body: string[];
};

export type EditorialCardItem = {
  title: string;
  body: string;
};

export type EditorialCardsSection = {
  id: string;
  kind: "cards";
  title: string;
  items: EditorialCardItem[];
};

export type EditorialFaqItem = {
  question: string;
  answer: string;
};

export type EditorialFaqSection = {
  id: string;
  kind: "faq";
  title: string;
  items: EditorialFaqItem[];
};

export type EditorialSection = EditorialRichSection | EditorialCardsSection | EditorialFaqSection;

export type EditorialPageAction = {
  label: string;
  to: string;
  primary?: boolean;
};

export type EditorialPageCopy = {
  eyebrow: string;
  title: string;
  summary: string;
  chips: string[];
  sections: EditorialSection[];
  actions: EditorialPageAction[];
};
