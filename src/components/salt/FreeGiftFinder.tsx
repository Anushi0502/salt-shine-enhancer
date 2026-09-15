import { FormEvent, useState } from "react";

import { trackAnalyticsEvent } from "@/lib/analytics-events";

export const GIFT_FINDER_OPTIONS = {
  recipient: [
    { value: "partner", label: "Partner" },
    { value: "family", label: "Family" },
    { value: "friend", label: "Friend" },
    { value: "self", label: "Myself" },
  ],
  occasion: [
    { value: "birthday", label: "Birthday" },
    { value: "holiday", label: "Holiday" },
    { value: "thank-you", label: "Thank you" },
    { value: "just-because", label: "Just because" },
  ],
  budget: [
    { value: "under-25", label: "Under $25" },
    { value: "25-50", label: "$25–$50" },
    { value: "over-50", label: "Over $50" },
  ],
  interest: [
    { value: "home", label: "Home" },
    { value: "style", label: "Style" },
    { value: "tech", label: "Tech" },
    { value: "wellness", label: "Wellness" },
  ],
} as const;

export type GiftFinderAnswer = {
  recipient: (typeof GIFT_FINDER_OPTIONS.recipient)[number]["value"];
  occasion: (typeof GIFT_FINDER_OPTIONS.occasion)[number]["value"];
  budget: (typeof GIFT_FINDER_OPTIONS.budget)[number]["value"];
  interest: (typeof GIFT_FINDER_OPTIONS.interest)[number]["value"];
};

export type GiftFinderProduct = {
  slug: string;
  label: string;
  description?: string;
  href?: string;
  recipient?: readonly GiftFinderAnswer["recipient"][];
  occasion?: readonly GiftFinderAnswer["occasion"][];
  budget?: readonly GiftFinderAnswer["budget"][];
  interest?: readonly GiftFinderAnswer["interest"][];
  priority?: number;
};

export type GiftFinderRecommendation = GiftFinderProduct & {
  matchScore: number;
};

export const DEFAULT_GIFT_PRODUCTS: readonly GiftFinderProduct[] = [
  {
    slug: "cozy-home-find",
    label: "Cozy Home Find",
    description: "A thoughtful everyday upgrade for their space.",
    interest: ["home", "wellness"],
    budget: ["under-25", "25-50"],
    occasion: ["birthday", "holiday", "thank-you", "just-because"],
    priority: 3,
  },
  {
    slug: "everyday-style-find",
    label: "Everyday Style Find",
    description: "An easy-to-love accessory for a personal touch.",
    interest: ["style"],
    recipient: ["partner", "friend", "self"],
    budget: ["under-25", "25-50"],
    priority: 2,
  },
  {
    slug: "smart-tech-find",
    label: "Smart Tech Find",
    description: "A useful little upgrade for daily routines.",
    interest: ["tech"],
    recipient: ["partner", "family", "friend", "self"],
    budget: ["25-50", "over-50"],
    priority: 1,
  },
];

const MAX_RECOMMENDATIONS = 3;

function scoreProduct(product: GiftFinderProduct, answers: GiftFinderAnswer): number {
  let score = product.priority ?? 0;

  if (product.recipient?.includes(answers.recipient)) score += 4;
  if (product.occasion?.includes(answers.occasion)) score += 3;
  if (product.budget?.includes(answers.budget)) score += 3;
  if (product.interest?.includes(answers.interest)) score += 5;

  return score;
}

export function recommendGifts(
  answers: GiftFinderAnswer,
  products: readonly GiftFinderProduct[] = DEFAULT_GIFT_PRODUCTS,
): GiftFinderRecommendation[] {
  return products
    .map((product, index) => ({
      ...product,
      matchScore: scoreProduct(product, answers),
      sourceIndex: index,
    }))
    .sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        (b.priority ?? 0) - (a.priority ?? 0) ||
        a.sourceIndex - b.sourceIndex,
    )
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ sourceIndex: _sourceIndex, ...recommendation }) => recommendation);
}

const QUESTION_COPY = {
  recipient: "Who is it for?",
  occasion: "What is the occasion?",
  budget: "What is your budget?",
  interest: "What do they enjoy?",
} as const;

type QuestionKey = keyof GiftFinderAnswer;

type FreeGiftFinderProps = {
  products?: readonly GiftFinderProduct[];
  className?: string;
  title?: string;
  description?: string;
};

const initialAnswers: Partial<GiftFinderAnswer> = {};

export function FreeGiftFinder({
  products = DEFAULT_GIFT_PRODUCTS,
  className = "",
  title = "Find a gift in four quick picks",
  description = "Answer a few questions and get deterministic SALT picks—no account, API, or extra service required.",
}: FreeGiftFinderProps) {
  const [answers, setAnswers] = useState<Partial<GiftFinderAnswer>>(initialAnswers);
  const [recommendations, setRecommendations] = useState<GiftFinderRecommendation[]>([]);

  const isComplete = (Object.keys(QUESTION_COPY) as QuestionKey[]).every(
    (key) => Boolean(answers[key]),
  );

  function handleAnswer(key: QuestionKey, value: string) {
    setAnswers((current) => ({ ...current, [key]: value } as Partial<GiftFinderAnswer>));
    setRecommendations([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isComplete) return;

    setRecommendations(recommendGifts(answers as GiftFinderAnswer, products));
  }

  return (
    <section
      aria-labelledby="free-gift-finder-title"
      className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ${className}`.trim()}
    >
      <div className="mb-6 max-w-2xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          SALT Gift Finder
        </p>
        <h2 id="free-gift-finder-title" className="text-2xl font-semibold text-slate-950">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-5 md:grid-cols-2">
          {(Object.keys(QUESTION_COPY) as QuestionKey[]).map((key) => {
            const options = GIFT_FINDER_OPTIONS[key];

            return (
              <fieldset key={key} className="rounded-2xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">
                  {QUESTION_COPY[key]}
                </legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {options.map((option) => {
                    const inputId = `free-gift-finder-${key}-${option.value}`;
                    const isSelected = answers[key] === option.value;

                    return (
                      <label
                        key={option.value}
                        htmlFor={inputId}
                        className={`cursor-pointer rounded-xl border px-3 py-2 text-sm transition ${
                          isSelected
                            ? "border-slate-950 bg-slate-950 text-white"
                            : "border-slate-200 text-slate-700 hover:border-slate-400"
                        }`}
                      >
                        <input
                          id={inputId}
                          name={key}
                          type="radio"
                          value={option.value}
                          checked={isSelected}
                          onChange={(event) => handleAnswer(key, event.target.value)}
                          className="sr-only"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={!isComplete}
          className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Show my SALT picks
        </button>
      </form>

      {recommendations.length > 0 ? (
        <div
          aria-live="polite"
          aria-labelledby="free-gift-finder-results-title"
          className="mt-8 border-t border-slate-200 pt-6"
        >
          <h3 id="free-gift-finder-results-title" className="text-lg font-semibold text-slate-950">
            Your SALT picks
          </h3>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            {recommendations.map((recommendation) => (
              <li key={recommendation.slug} className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{recommendation.label}</p>
                {recommendation.description ? (
                  <p className="mt-1 text-sm leading-5 text-slate-600">{recommendation.description}</p>
                ) : null}
                {recommendation.href ? (
                  <a
                    href={recommendation.href}
                    onClick={() =>
                      trackAnalyticsEvent("select_item", {
                        item_list_name: "SALT Gift Finder",
                        items: [
                          {
                            item_id: recommendation.slug,
                            item_name: recommendation.label,
                          },
                        ],
                      })
                    }
                    className="mt-3 inline-flex text-sm font-semibold text-slate-950 underline underline-offset-4"
                  >
                    View this find
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
