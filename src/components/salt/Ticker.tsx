const tickerItems = [
  "Up to 40% off selected products",
  "US shipping available",
  "No hidden checkout tariffs",
  "New arrivals updated weekly",
  "Secure Shopify checkout",
  "Cookware, gifts, apparel, and decor",
];

const Ticker = () => {
  return (
    <div className="sticky top-0 z-[120] overflow-hidden whitespace-nowrap py-2.5 text-[0.8rem] tracking-wider uppercase border-b border-[hsl(40_5%_20%)] bg-gradient-to-r from-[hsl(40_5%_9%)] to-[hsl(42_6%_15%)] text-[hsl(38_30%_93%)]">
      <div className="inline-flex gap-9 pl-[100%] animate-crawl">
        {[...tickerItems, ...tickerItems].map((item, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-salt-gold inline-block" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

export default Ticker;
