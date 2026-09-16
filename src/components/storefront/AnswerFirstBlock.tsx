import type { EditorialAnswerBlock } from "@/lib/editorial-pages";

type AnswerFirstBlockProps = {
  block: EditorialAnswerBlock;
  className?: string;
};

const AnswerFirstBlock = ({ block, className = "" }: AnswerFirstBlockProps) => {
  return (
    <section
      aria-labelledby="answer-first-heading"
      data-aeo-block="answer-first"
      className={`salt-section-shell rounded-[1.55rem] border border-primary/15 bg-primary/[0.045] p-4 sm:p-5 lg:p-6 ${className}`.trim()}
    >
      <div className="max-w-3xl">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">Answer first</p>
        <h2
          id="answer-first-heading"
          data-aeo-question="true"
          className="mt-2 font-display text-[clamp(1.45rem,2.8vw,2.15rem)] leading-[0.98] text-foreground"
        >
          {block.question}
        </h2>
        <p data-aeo-answer="true" className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
          {block.answer}
        </p>
      </div>

      {block.takeaways?.length ? (
        <div className="mt-4 rounded-[1.05rem] border border-border/65 bg-background/88 px-3.5 py-3">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-primary/80">Key takeaways</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-foreground/90">
            {block.takeaways.map((takeaway) => (
              <li key={takeaway} data-aeo-takeaway="true" className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{takeaway}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {block.decisionSteps?.length ? (
        <div className="mt-4 border-t border-primary/10 pt-4">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-primary/80">How to use this page</p>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {block.decisionSteps.map((step) => (
              <div key={step.step} className="rounded-[0.95rem] border border-border/65 bg-background/72 px-3 py-3">
                <p className="font-display text-lg leading-none text-primary">{step.step}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{step.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.05rem] border border-border/65 bg-background/88 px-3.5 py-3">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-primary/80">Useful for</p>
          <p className="mt-1.5 text-sm leading-6 text-foreground/90">{block.usefulFor}</p>
        </div>
        <div className="rounded-[1.05rem] border border-border/65 bg-background/88 px-3.5 py-3">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-primary/80">Next step</p>
          <p className="mt-1.5 text-sm leading-6 text-foreground/90">{block.nextStep}</p>
        </div>
      </div>

      {block.queryPrompts?.length ? (
        <div className="mt-4 border-t border-primary/10 pt-4">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-primary/80">
            Questions this page answers
          </p>
          <ul className="mt-2 grid gap-2 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
            {block.queryPrompts.map((prompt) => (
              <li
                key={prompt}
                data-aeo-query="true"
                className="rounded-[0.9rem] border border-border/55 bg-background/65 px-3 py-2.5"
              >
                {prompt}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export default AnswerFirstBlock;
