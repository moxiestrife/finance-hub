import { chromium, devices } from 'playwright';

const results = {};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://127.0.0.1:8765/ui-facelift-mockup.html', { waitUntil: 'networkidle' });

results.desktopBox = await page.locator('#desktop').boundingBox();
results.phoneBox = await page.locator('#phone').boundingBox();
results.hasBrowserChrome = await page.locator('#desktop .browser-chrome').count();
results.hasSideRail = await page.locator('#desktop .side-rail').count();
results.desktopBottomNav = await page.locator('#desktop .bottom-nav').count();
results.phoneBottomNav = await page.locator('#phone .bottom-nav').count();
results.desktopStackCols = await page.locator('#desktop .stack').evaluate((el) => getComputedStyle(el).gridTemplateColumns);
results.phoneStackDisplay = await page.locator('#phone .stack').evaluate((el) => getComputedStyle(el).display);
results.desktopCardCount = await page.locator('#desktop .cat-card').count();
results.phoneCardCount = await page.locator('#phone .cat-card').count();
results.labels = await page.locator('.device-label').allTextContents();

const heroState = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.hero')].map((h) => ({
      metric: h.dataset.metric,
      label: h.querySelector('.hero-label').textContent,
      value: h.querySelector('.hero-figure').textContent,
      chip: h.querySelector('.hero-chip').textContent,
      accent: getComputedStyle(h).getPropertyValue('--hero-accent').trim(),
      dotsCurrent: [...h.querySelectorAll('.hero-dot')].map((d) => d.getAttribute('aria-current')),
    }))
  );

results.initialHeroes = await heroState();

await page.locator('#desktop .hero-figure-btn').click();
results.afterDesktopTap = await heroState();

await page.locator('#phone .hero-dot[data-idx="2"]').click();
results.afterPhoneDot = await heroState();

await page.locator('#phone .hero-figure-btn').click();
results.afterPhoneTap = await heroState();

await page.locator('#desktop [data-theme-toggle]').click();
results.themeAfterDesktopToggle = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
results.phoneSurfaceAfterDark = await page.locator('#phone').evaluate((el) => getComputedStyle(el).backgroundColor);
results.desktopSurfaceAfterDark = await page.locator('#desktop').evaluate((el) => getComputedStyle(el).backgroundColor);
results.toggleIcons = await page.evaluate(() =>
  [...document.querySelectorAll('[data-theme-toggle]')].map((b) => b.textContent)
);
results.pillPrimaryAfterInFrameToggle = await page.evaluate(() => ({
  lightHasPrimary: document.getElementById('themeLight').classList.contains('primary'),
  darkHasPrimary: document.getElementById('themeDark').classList.contains('primary'),
}));

await page.locator('#themeLight').click();
results.themeAfterLightPill = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

await page.locator('#phone [data-theme-toggle]').click();
results.themeAfterPhoneToggle = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

results.phoneEstimatedIncome = await page.locator('#phone').evaluate((el) => /estimated income/i.test(el.innerText));
results.phoneEllySubtitle = await page.locator('#phone').evaluate((el) => /This fortnight\s*·\s*Elly/i.test(el.innerText));
results.desktopEstimatedIncome = await page.locator('#desktop').evaluate((el) => /estimated income/i.test(el.innerText));
results.phoneItemsLeft = await page.locator('#phone [data-items-left]').textContent();
results.phoneSectionLabel = await page.locator('#phone .section-label').textContent();
results.phoneHeroFigureSize = await page.locator('#phone .hero-figure').evaluate((el) => getComputedStyle(el).fontSize);
results.desktopHeroFigureSize = await page.locator('#desktop .hero-figure').evaluate((el) => getComputedStyle(el).fontSize);
results.dotBox = await page.locator('#phone .hero-dot').first().boundingBox();
results.figureUnderline = await page.locator('#phone .hero-figure-btn').evaluate((el) => ({
  borderBottom: getComputedStyle(el).borderBottom,
  color: getComputedStyle(el).color,
}));

// Swipe left on phone hero via Touch constructor
results.swipe = await page.evaluate(() => {
  const hero = document.querySelector('#phone .hero');
  const before = hero.dataset.metric;
  const mk = (type, x) =>
    new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      changedTouches: [new Touch({ identifier: 1, target: hero, clientX: x, clientY: 120 })],
    });
  hero.dispatchEvent(mk('touchstart', 300));
  hero.dispatchEvent(mk('touchend', 200));
  const afterPhone = hero.dataset.metric;
  const afterDesktop = document.querySelector('#desktop .hero').dataset.metric;
  return { before, afterPhone, afterDesktop, synced: afterPhone === afterDesktop, changed: before !== afterPhone };
});

await page.setViewportSize({ width: 850, height: 900 });
results.narrowDesktopCols = await page.locator('#desktop .stack').evaluate((el) => getComputedStyle(el).gridTemplateColumns);

await page.setViewportSize({ width: 1400, height: 900 });
results.wideDesktopCols = await page.locator('#desktop .stack').evaluate((el) => getComputedStyle(el).gridTemplateColumns);

await page.screenshot({ path: 'qa-facelift-wide.png', fullPage: true });

// Phone-like device for swipe realism
const context = await browser.newContext({ ...devices['iPhone 13'] });
const phonePage = await context.newPage();
await phonePage.goto('http://127.0.0.1:8765/ui-facelift-mockup.html', { waitUntil: 'networkidle' });
const box = await phonePage.locator('#phone .hero').boundingBox();
const y = box.y + box.height / 2;
await phonePage.touchscreen.tap(box.x + box.width / 2, y);
const beforeSwipe = await phonePage.locator('#phone .hero').getAttribute('data-metric');
await phonePage.touchscreen.swipe ? null : null;
// manual drag via mouse not available; use CDP-like touch through locator evaluate already done
results.iphoneContextPhoneWidth = await phonePage.locator('#phone').boundingBox();
results.iphoneBothFramesPresent = await phonePage.locator('#desktop').count();

await phonePage.screenshot({ path: 'qa-facelift-iphone-ctx.png', fullPage: true });

console.log(JSON.stringify(results, null, 2));
await browser.close();
