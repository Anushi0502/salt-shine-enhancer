import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/mac/.npm/_npx/31e32ef8478fbf80/node_modules/playwright-core/index.mjs';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const bannerScope = process.env.SALT_BANNER_SCOPE || 'expanded';
const bannerRatio = process.env.SALT_BANNER_RATIO || '2x1';
const isSixByFive = bannerRatio === '6x5';
const canvas = isSixByFive ? { width: 1200, height: 1000 } : { width: 1774, height: 887 };
const designScale = isSixByFive ? canvas.width / 1774 : 1;
// Shop.app collection detail heroes currently crop 6:5 media into a centered
// 2:1 frame. Keep the complete SALT composition inside that shared safe zone.
const safeTop = isSixByFive ? 200 : 0;
const outputDir = path.join(
  projectRoot,
  isSixByFive
    ? 'output/imagegen/salt-collection-banners-6x5'
    : bannerScope === 'remaining'
      ? 'output/imagegen/salt-collection-banners-all'
      : 'output/imagegen/salt-collection-banners-expanded',
);
const backgroundDir = path.join(
  isSixByFive ? projectRoot : outputDir,
  isSixByFive ? 'output/imagegen/salt-collection-banners-all/backgrounds' : 'backgrounds',
);
const sourceManifestPath = bannerScope === 'remaining' || bannerScope === 'all' || isSixByFive
  ? path.join(projectRoot, 'public/data/collections.json')
  : path.join(outputDir, 'manifest.json');
const executablePath = process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH ||
  '/Users/mac/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const NAVY = '#062b4e';
const TERRACOTTA = '#c8795b';

const groups = {
  pets: {
    background: 'pets',
    copy: 'Make everyday care simpler with thoughtful picks for comfortable, happier routines.',
    benefits: ['CARE MADE SIMPLE', 'PLAY & CONNECT', 'COMFORT FIRST', 'HAPPY EVERYDAY'],
    strip: ['DOG ESSENTIALS', 'CAT ESSENTIALS', 'FEEDING', 'GROOMING', 'TRAVEL', 'TOYS', 'PET COMFORT', 'AND MORE'],
    icons: ['target', 'heart', 'sun', 'sparkle'],
  },
  beauty: {
    background: 'beauty',
    copy: 'Feel good, look refreshed, and make everyday beauty rituals your own.',
    benefits: ['GLOW DAILY', 'CARE FIRST', 'EASY ROUTINES', 'FEEL BEAUTIFUL'],
    strip: ['MAKEUP', 'SKINCARE', 'HAIRCARE', 'LIP CARE', 'EYE BEAUTY', 'TOOLS', 'GLOW ESSENTIALS', 'AND MORE'],
    icons: ['sparkle', 'heart', 'sun', 'target'],
  },
  kids: {
    background: 'kids',
    copy: 'Bright picks for play, learning, growing, and everyday little adventures.',
    benefits: ['PLAY & LEARN', 'IMAGINE MORE', 'FAMILY FUN', 'BRIGHTER DAYS'],
    strip: ['KIDS WEAR', 'TOYS & GAMES', 'BACK TO SCHOOL', 'CREATIVE PLAY', 'OUTDOOR FUN', 'GIFTS FOR KIDS', 'EVERYDAY ESSENTIALS', 'AND MORE'],
    icons: ['target', 'heart', 'sun', 'sparkle'],
  },
  fashion: {
    background: 'fashion',
    copy: 'Bring comfort, confidence, and easy everyday style together in one place.',
    benefits: ['EVERYDAY STYLE', 'EASY LAYERS', 'ACCESSORIZE WELL', 'FEEL CONFIDENT'],
    strip: ['EVERYDAY STYLE', 'ACCESSORIES', 'BAGS & WALLETS', 'FOOTWEAR', 'T-SHIRTS', 'WATCHES', 'JEWELRY', 'AND MORE'],
    icons: ['sparkle', 'target', 'heart', 'sun'],
  },
  tech: {
    background: 'tech',
    copy: 'Small tools, smarter setups, and better everyday moments—made to keep you moving.',
    benefits: ['CREATE BETTER', 'STAY CONNECTED', 'WORK SMARTER', 'ENJOY MORE'],
    strip: ['AUDIO', 'EARBUDS', 'PHONE CASES', 'CHARGING', 'DESK TECH', 'CREATOR TOOLS', 'ACCESSORIES', 'AND MORE'],
    icons: ['sparkle', 'target', 'sun', 'heart'],
  },
  kitchen: {
    background: 'kitchen',
    copy: 'Simple, useful pieces that make cooking, hosting, and everyday routines feel better.',
    benefits: ['COOK WITH EASE', 'HOST BEAUTIFULLY', 'DAILY ESSENTIALS', 'MADE TO ENJOY'],
    strip: ['COOKWARE', 'KITCHEN GADGETS', 'DINING', 'COFFEE & TEA', 'CLEANING', 'SERVING', 'TABLETOP', 'AND MORE'],
    icons: ['target', 'heart', 'sparkle', 'sun'],
  },
  wellness: {
    background: 'wellness',
    copy: 'Gentle, practical essentials for calmer spaces, more comfort, and brighter days.',
    benefits: ['COMFORT FIRST', 'REST & RESET', 'EVERYDAY SUPPORT', 'FEEL YOUR BEST'],
    strip: ['WELLNESS', 'RELAXATION', 'SLEEP', 'DAILY LIVING', 'MEDICAL AIDS', 'HOME SAFETY', 'SENIOR LIVING', 'AND MORE'],
    icons: ['heart', 'sun', 'target', 'sparkle'],
  },
  sports: {
    background: 'sports',
    copy: 'Move more comfortably with practical gear for training, recovery, and everyday momentum.',
    benefits: ['MOVE WITH EASE', 'TRAIN SMARTER', 'REST & RESET', 'FEEL YOUR BEST'],
    strip: ['FITNESS', 'TRAINING', 'RECOVERY', 'WATER BOTTLES', 'SPORTS ACCESSORIES', 'OUTDOOR', 'WELLNESS', 'AND MORE'],
    icons: ['target', 'sparkle', 'heart', 'sun'],
  },
  gifts: {
    background: 'gifts',
    copy: 'Thoughtful finds and feel-good details made to make someone’s day brighter.',
    benefits: ['GIVE THOUGHTFULLY', 'MAKE IT SPECIAL', 'EASY TO LOVE', 'BRIGHTER MOMENTS'],
    strip: ['GIFTS FOR MOM', 'GIFTS FOR DAD', 'GIFTS FOR SENIORS', 'HOUSEWARMING', 'HOLIDAY GIFTS', 'BEST SELLERS', 'STAFF PICKS', 'AND MORE'],
    icons: ['heart', 'sparkle', 'sun', 'target'],
  },
  anime: {
    background: 'anime',
    copy: 'Find playful, display-worthy favorites that make every collection feel a little more special.',
    benefits: ['COLLECT JOYFULLY', 'DISPLAY WITH PRIDE', 'FIND FAVORITES', 'BRIGHTER MOMENTS'],
    strip: ['FIGURES', 'DISPLAY PIECES', 'COLLECTIBLES', 'ANIME GIFTS', 'DESK FAVORITES', 'ACCESSORIES', 'NEW FINDS', 'AND MORE'],
    icons: ['heart', 'sparkle', 'target', 'sun'],
  },
  office: {
    background: 'office',
    copy: 'Plan beautifully, work smarter, and find the everyday tools that keep ideas moving.',
    benefits: ['PLAN & ORGANIZE', 'WRITE & CREATE', 'STUDY SMARTER', 'EVERYDAY ESSENTIALS'],
    strip: ['NOTEBOOKS', 'PENS & PENCILS', 'DESK TOOLS', 'SCHOOL BAGS', 'PLANNERS', 'ORGANIZERS', 'ART SUPPLIES', 'AND MORE'],
    icons: ['target', 'sparkle', 'sun', 'heart'],
  },
  home: {
    background: 'home-decor',
    copy: 'Small details that make home feel warmer, more personal, and easier to enjoy.',
    benefits: ['STYLE YOUR SPACE', 'LIGHT IT BETTER', 'BRING NATURE IN', 'FEEL AT HOME'],
    strip: ['HOME DECOR', 'LIGHTING', 'WALL ART', 'SEASONAL', 'ARTIFICIAL PLANTS', 'ACCESSORIES', 'COZY DETAILS', 'AND MORE'],
    icons: ['sparkle', 'sun', 'heart', 'target'],
  },
  utility: {
    background: 'utility',
    copy: 'Useful everyday upgrades that help life feel more organized, capable, and ready for anything.',
    benefits: ['MAKE LIFE EASIER', 'READY FOR MORE', 'SMARTER ROUTINES', 'EVERYDAY VALUE'],
    strip: ['GARDEN & TOOLS', 'CAR ACCESSORIES', 'TRAVEL', 'COVERS & CASES', 'CLEANING', 'STORAGE', 'PRACTICAL FINDS', 'AND MORE'],
    icons: ['target', 'sparkle', 'sun', 'heart'],
  },
};

const forceGroups = {
  'everyday-jewelry': 'fashion',
  'luxury-fragrances': 'beauty',
  'dog-supplies': 'pets',
  necklaces: 'fashion',
  'kids-footwear': 'kids',
  'trending-finds': 'gifts',
  trousers: 'fashion',
  'fitness-equipment': 'sports',
  'under-25': 'gifts',
  'womens-fashion': 'fashion',
  women: 'fashion',
  'womens-footwear': 'fashion',
  'all-products': 'utility',
  'portable-gadgets': 'tech',
  'new-arrivals': 'gifts',
  'under-50': 'gifts',
  'under-60': 'gifts',
  'premium-picks': 'gifts',
  'general-merchandise': 'gifts',
  'lunch-boxes': 'office',
  'water-bottles': 'utility',
  'men-collection': 'fashion',
  rings: 'fashion',
  footwear: 'fashion',
  'mens-fashion': 'fashion',
  'formal-footwear': 'fashion',
  'school-bags': 'office',
  earrings: 'fashion',
  bracelets: 'fashion',
  hats: 'fashion',
  'magsafe-gadgets': 'tech',
  'under-35': 'gifts',
  'mouse-keyboard': 'tech',
  'anime-collectables': 'anime',
  test: 'gifts',
  'wall-lights': 'home',
  'stationery': 'office',
  'back-to-school': 'kids',
  'storage-organization': 'office',
  'earbuds-and-cases': 'tech',
  'iphone-cases': 'tech',
  'covers-cases': 'tech',
  'dramatic-lashes': 'beauty',
  'mascara-collection': 'beauty',
  'eye-beauty-collection': 'beauty',
  'glam-eye-palettes': 'beauty',
  'blush-glow': 'beauty',
  'repair-shine-serums': 'beauty',
  'hair-nourishment': 'beauty',
  'hair-wash-essentials': 'beauty',
  'womens-beauty-essentials': 'beauty',
  'beauty-makeup-essentials': 'beauty',
  'lips-and-care': 'beauty',
  'face-creams-moisturizers': 'beauty',
  'womens-accessories': 'fashion',
  'women-bags-and-wallets': 'fashion',
  'mens-accessories': 'fashion',
  'mens-bags-wallets': 'fashion',
  'men-t-shirt': 'fashion',
  'watches': 'fashion',
  'jeans': 'fashion',
  'jewelry-accessories': 'fashion',
  'mens-footwear': 'fashion',
  'gifts-for-seniors': 'gifts',
  'gifts-for-dad': 'gifts',
  'gifts-for-mom': 'gifts',
  'holiday-gifts': 'gifts',
  'housewarming-gifts': 'gifts',
  gifts: 'gifts',
  'best-sellers': 'gifts',
  'staff-picks': 'gifts',
  'viral-tiktok-products': 'gifts',
  'under-44-99': 'gifts',
  'health-wellness': 'wellness',
  'medical-accessories': 'wellness',
  'senior-living-solutions': 'wellness',
  'home-safety': 'wellness',
  'daily-living-aids': 'wellness',
  'relaxation-products': 'wellness',
  'sleep-essentials': 'wellness',
  'decorative-accessories': 'home',
  'smart-lighting': 'home',
  'seasonal-decor': 'home',
  'wall-art': 'home',
  'home-decor': 'home',
  'artificial-plants': 'home',
  'dining-essentials': 'kitchen',
  'coffee-tea-accessories': 'kitchen',
  cookware: 'kitchen',
  'kitchen-gadgets': 'kitchen',
  'cleaning-tools': 'kitchen',
  'car-accessories': 'utility',
  'garden-tools': 'utility',
  'travel-outdoor': 'utility',
  kids: 'kids',
  'kids-wear': 'kids',
  'pet-essentials': 'pets',
  'pet-toys': 'pets',
  'pet-grooming': 'pets',
  'pet-feeding': 'pets',
  'pet-travel': 'pets',
  'cat-supplies': 'pets',
};

const copyOverrides = {
  'under-44-99': 'Small everyday upgrades with a price that keeps life feeling easy.',
  'best-sellers': 'The everyday favorites customers keep coming back to.',
  'staff-picks': 'Thoughtful finds our team loves for brighter everyday routines.',
  'viral-tiktok-products': 'Fresh, useful, and fun finds making everyday moments more memorable.',
  test: 'Celebrate the everyday with useful, feel-good finds chosen to make life a little brighter.',
  'senior-living-solutions': 'Practical comforts and thoughtful support for more independent everyday living.',
  'home-safety': 'Simple, thoughtful additions that help every room feel safer and more comfortable.',
};

const headlineOverrides = {
  'mens-bags-wallets': ["MEN'S BAGS", '& Wallets'],
  'women-bags-and-wallets': ["WOMEN'S BAGS", '& Wallets'],
  'womens-beauty-essentials': ["WOMEN'S BEAUTY", '& Skincare'],
  'repair-shine-serums': ['REPAIR & SHINE', 'Serums'],
  'hair-wash-essentials': ['HAIR WASH', 'Essentials'],
  'coffee-tea-accessories': ['COFFEE & TEA', 'Accessories'],
  'beauty-makeup-essentials': ['BEAUTY', 'Makeup Essentials'],
  'face-creams-moisturizers': ['FACE CREAMS', '& Moisturizers'],
  'camping-travel-essentials': ['CAMPING & TRAVEL', 'Essentials'],
  'travel-outdoor': ['CAMPING & TRAVEL', 'Essentials'],
  'home-decor': ['HOME', '& Decor'],
  'car-accessories': ['HOME & CAR', 'Accessories'],
  'smart-lighting': ['LIGHTING', '& Decor'],
  'under-44-99': ['UNDER', '$44.99'],
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function titleLayout(handle, title) {
  if (headlineOverrides[handle]) return headlineOverrides[handle];
  const clean = title.replaceAll('’', "'");
  const amp = clean.indexOf(' & ');
  if (amp > 0) return [clean.slice(0, amp), `&${clean.slice(amp + 2)}`];
  const forMatch = clean.match(/^(.*?)\s+(for|Collection)\s+(.+)$/i);
  if (forMatch) return [forMatch[1], `${forMatch[2]} ${forMatch[3]}`];
  const words = clean.split(/\s+/);
  if (words.length === 1) return [clean, 'Essentials'];
  return [words[0], words.slice(1).join(' ')];
}

function iconSvg(kind, size = 42) {
  const common = `width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="${NAVY}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === 'heart') return `<svg ${common}><path d="M24 39S8 29 8 17c0-5 3-8 8-8 4 0 7 3 8 6 1-3 4-6 8-6 5 0 8 3 8 8 0 12-16 22-16 22Z"/></svg>`;
  if (kind === 'sun') return `<svg ${common}><circle cx="24" cy="24" r="7"/><path d="M24 4v7M24 37v7M4 24h7M37 24h7M9.9 9.9l5 5M33.1 33.1l5 5M38.1 9.9l-5 5M14.9 33.1l-5 5"/></svg>`;
  if (kind === 'sparkle') return `<svg ${common}><path d="m24 5 3.6 12.4L40 21l-12.4 3.6L24 37l-3.6-12.4L8 21l12.4-3.6L24 5Z"/><path d="m38 31 .9 3.1L42 35l-3.1.9L38 39l-.9-3.1L34 35l3.1-.9L38 31Z"/></svg>`;
  return `<svg ${common}><circle cx="24" cy="24" r="11"/><path d="M24 6v7M24 35v7M6 24h7M35 24h7"/><circle cx="24" cy="24" r="3"/></svg>`;
}

function resolveGroup(collection) {
  if (forceGroups[collection.handle]) return forceGroups[collection.handle];
  return collection.group && groups[collection.group] ? collection.group : 'gifts';
}

function renderHtml({ collection, group, backgroundDataUrl }) {
  const [main, script] = titleLayout(collection.handle, collection.title);
  const mainSize = main.length > 13 ? 58 : main.length > 9 ? 70 : main.length <= 4 ? 98 : 84;
  const scriptSize = script.length > 18 ? 54 : script.length > 12 ? 62 : script.length <= 7 ? 80 : 70;
  const body = copyOverrides[collection.handle] || group.copy;
  const px = (value) => `${Math.round(value * designScale)}px`;
  const y = (value) => `${Math.round(safeTop + value * designScale)}px`;
  const benefits = group.benefits.map((label, index) => `
    <div class="benefit">
      <div class="benefit-icon">${iconSvg(group.icons[index], isSixByFive ? 26 : 39)}</div>
      <div class="benefit-label">${escapeHtml(label)}</div>
    </div>`).join('');
  const strip = group.strip.map((label, index) => `
    <div class="strip-item">
      <div class="strip-icon">${iconSvg(group.icons[index % group.icons.length], isSixByFive ? 38 : 56)}</div>
      <div class="strip-label">${escapeHtml(label)}</div>
    </div>`).join('');

  return `<!doctype html>
  <html><head><meta charset="utf-8"/><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; }
    body { background: #fff; font-family: Arial, Helvetica, sans-serif; color: ${NAVY}; }
    .banner { position: relative; width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; background: #fff; }
    .scene { position: absolute; inset: 0; background-image: url('${backgroundDataUrl}'); background-size: cover; background-position: ${isSixByFive ? '76% center' : 'center'}; }
    .scene::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(255,255,255,.99) 0%, rgba(255,255,255,.98) 26%, rgba(255,255,255,.88) 34%, rgba(255,255,255,.28) 43%, rgba(255,255,255,0) 54%); }
    .top-left { position: absolute; left: ${px(68)}; top: ${y(26)}; width: ${px(560)}; text-align: center; z-index: 2; }
    .leaf-logo { width: ${px(58)}; height: ${px(42)}; margin: 0 auto ${px(7)}; }
    .brand { letter-spacing: ${px(17)}; padding-left: ${px(17)}; font-size: ${px(50)}; line-height: 1; font-weight: 300; }
    .tagline { margin-top: ${px(14)}; font-size: ${px(13)}; letter-spacing: ${px(3)}; font-weight: 700; white-space: nowrap; }
    .rule { width: ${px(142)}; height: ${px(1)}; background: ${NAVY}; opacity: .7; margin: ${px(26)} auto 0; }
    .left-copy { position: absolute; left: ${px(48)}; top: ${y(203)}; width: ${px(600)}; z-index: 2; text-align: center; }
    .headline-main { font-size: ${px(mainSize)}; line-height: .9; letter-spacing: ${px(1)}; font-weight: 900; text-transform: uppercase; white-space: nowrap; }
    .headline-script { margin-top: ${px(6)}; color: ${TERRACOTTA}; font-family: "Snell Roundhand", "Segoe Script", "Brush Script MT", cursive; font-size: ${px(scriptSize)}; line-height: .93; white-space: nowrap; }
    .headline-underline { width: ${px(282)}; height: ${px(4)}; border-radius: 50%; background: ${TERRACOTTA}; transform: rotate(-4deg); margin: ${px(7)} auto 0; }
    .body-copy { margin: ${px(26)} auto 0; width: ${px(560)}; font-size: ${px(22)}; line-height: 1.23; font-weight: 600; }
    .benefits { display: flex; justify-content: space-between; width: ${px(590)}; margin: ${px(23)} auto 0; }
    .benefit { width: ${px(142)}; text-align: center; }
    .benefit-icon { height: ${px(43)}; display: flex; align-items: center; justify-content: center; }
    .benefit-label { margin-top: ${px(7)}; font-size: ${px(12)}; line-height: 1.16; font-weight: 800; }
    .cta { width: ${px(570)}; height: ${px(66)}; margin: ${px(19)} auto 0; border-radius: ${px(38)}; background: ${NAVY}; color: white; display: flex; align-items: center; justify-content: center; gap: ${px(20)}; font-size: ${px(21)}; letter-spacing: ${px(1.3)}; white-space: nowrap; box-shadow: 0 ${px(9)} ${px(16)} rgba(6,43,78,.15); }
    .cta-arrow { font-size: ${px(34)}; font-weight: 300; line-height: 1; margin-top: ${px(-3)}; }
    .badge { position: absolute; z-index: 3; top: ${y(21)}; right: ${px(50)}; width: ${px(188)}; height: ${px(188)}; border-radius: 50%; background: rgba(200,121,91,.91); border: ${px(2)} solid rgba(255,255,255,.93); box-shadow: 0 0 0 ${px(1)} rgba(200,121,91,.5), inset 0 0 ${px(5)} rgba(255,255,255,.2); color: #fff; text-align: center; padding-top: ${px(35)}; font-size: ${px(18)}; line-height: 1.27; letter-spacing: ${px(.5)}; }
    .badge-heart { font-size: ${px(25)}; margin-top: ${px(4)}; }
    .strip { position: absolute; left: 0; right: 0; ${isSixByFive ? `top: ${y(705)};` : 'bottom: 0;'} height: ${px(182)}; z-index: 4; background: rgba(255,255,255,.96); display: flex; align-items: flex-start; padding: ${px(17)} 0 0 ${px(35)}; gap: 0; }
    .strip-item { width: ${px(150)}; text-align: center; flex: 0 0 ${px(150)}; }
    .strip-icon { width: ${px(102)}; height: ${px(102)}; border-radius: 50%; background: #f0efee; margin: 0 auto ${px(5)}; display: flex; align-items: center; justify-content: center; }
    .strip-label { font-size: ${px(13)}; line-height: 1.12; font-weight: 800; }
    .brush { position: absolute; z-index: 5; right: ${px(-35)}; ${isSixByFive ? `top: ${y(716)};` : 'bottom: -77px;'} width: ${px(535)}; height: ${px(248)}; border-radius: 72% 0 0 0; background: ${NAVY}; transform: rotate(-5deg); box-shadow: ${px(-19)} ${px(-8)} 0 rgba(6,43,78,.35); }
    .brush-copy { position: absolute; right: ${px(55)}; top: ${px(63)}; width: ${px(375)}; color: #fff; text-align: center; font-family: "Snell Roundhand", "Segoe Script", "Brush Script MT", cursive; font-size: ${px(29)}; line-height: 1.05; transform: rotate(-1deg); }
    .brush-heart { font-family: Arial, sans-serif; font-size: ${px(25)}; margin-top: ${px(4)}; }
  </style></head><body>
    <div class="banner">
      <div class="scene"></div>
      <div class="top-left">
        <svg class="leaf-logo" viewBox="0 0 64 44" fill="none" stroke="${NAVY}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M32 40V21"/><path d="M32 28C22 25 15 18 15 8c10 1 17 7 17 20Z"/><path d="M32 27c10-3 17-10 17-20-10 1-17 7-17 20Z"/></svg>
        <div class="brand">SALT</div>
        <div class="tagline">GOOD THINGS FOR A BRIGHTER EVERYDAY</div>
        <div class="rule"></div>
      </div>
      <div class="left-copy">
        <div class="headline-main">${escapeHtml(main)}</div>
        <div class="headline-script">${escapeHtml(script)}</div>
        <div class="headline-underline"></div>
        <div class="body-copy">${escapeHtml(body)}</div>
        <div class="benefits">${benefits}</div>
        <div class="cta">SHOP ${escapeHtml(collection.title.toUpperCase())}<span class="cta-arrow">→</span></div>
      </div>
      <div class="badge">IDEAS<br/>TOOLS<br/>INSPIRATION<br/>ALL HERE<div class="badge-heart">♡</div></div>
      <div class="strip">${strip}</div>
      <div class="brush"><div class="brush-copy">More of What You Love<br/>for Less Stress<div class="brush-heart">♡</div></div></div>
    </div>
  </body></html>`;
}

const sourceManifest = JSON.parse(await fs.readFile(sourceManifestPath, 'utf8'));
const originalBannerHandles = [
  'office-school-supplies',
  'mens-beauty-skincare',
  'kids-toys-games',
  'bedsheets-handlooms-towels',
  'creator-essentials',
  'massage-tools',
  'audio',
  'wigs',
  'robe',
  'candles',
  't-shirt',
];
const expandedManifestPath = path.join(
  projectRoot,
  'output/imagegen/salt-collection-banners-expanded/clean-upload-manifest.json',
);
const expandedManifest = bannerScope === 'remaining'
  ? JSON.parse(await fs.readFile(expandedManifestPath, 'utf8'))
  : null;
const existingBannerHandles = new Set([
  ...originalBannerHandles,
  ...(expandedManifest?.targets || []).map((entry) => entry.handle),
]);
const collections = bannerScope === 'remaining'
  ? (sourceManifest.collections || [])
      .filter((collection) => !['classification-fallback', 'classification-review'].includes(collection.handle))
      .filter((collection) => !existingBannerHandles.has(collection.handle))
      .map((collection, index) => ({
        number: index + 80,
        handle: collection.handle,
        title: collection.title,
      collectionId: collection.id,
      }))
  : bannerScope === 'all' || isSixByFive
    ? (sourceManifest.collections || [])
        .filter((collection) => !['classification-fallback', 'classification-review'].includes(collection.handle))
        .map((collection, index) => ({
          number: index + 1,
          handle: collection.handle,
          title: collection.title,
          collectionId: collection.id,
        }))
  : sourceManifest.collections;
const expectedCount = bannerScope === 'remaining' ? 35 : bannerScope === 'all' || isSixByFive ? 114 : 68;
if (!Array.isArray(collections) || collections.length !== expectedCount) {
  throw new Error(`Expected ${expectedCount} ${bannerScope} collections, found ${collections?.length ?? 0}`);
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: canvas, deviceScaleFactor: 1 });
const rendered = [];

for (const collection of collections) {
  const groupName = resolveGroup(collection);
  const group = groups[groupName];
  const backgroundPath = path.join(backgroundDir, `${group.background}.png`);
  const backgroundDataUrl = `data:image/png;base64,${(await fs.readFile(backgroundPath)).toString('base64')}`;
  const fileName = `${String(collection.number).padStart(2, '0')}-${collection.handle}.png`;
  const outputPath = path.join(outputDir, fileName);
  await page.setContent(renderHtml({ collection, group, backgroundDataUrl }), { waitUntil: 'load' });
  await page.screenshot({ path: outputPath, type: 'png' });
  rendered.push({
    number: collection.number,
    handle: collection.handle,
    title: collection.title,
    collectionId: collection.collectionId,
    fileName,
    group: groupName,
    background: `${group.background}.png`,
  });
}

await browser.close();
await fs.writeFile(path.join(outputDir, 'clean-render-manifest.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  scope: bannerScope,
  ratio: bannerRatio,
  width: canvas.width,
  height: canvas.height,
  source: 'clean generated category scenes with deterministic SALT reference-style typography overlay',
  count: rendered.length,
  collections: rendered,
}, null, 2) + '\n');
console.log(JSON.stringify({ scope: bannerScope, count: rendered.length, outputDir, backgrounds: Object.keys(groups).length }));
