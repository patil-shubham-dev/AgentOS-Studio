import { chromium } from 'playwright-core';

const BASE_URL = 'http://localhost:5199';

async function textSummary(page, label) {
  const url = page.url();
  const title = await page.title().catch(() => 'N/A');
  const buttons = await page.locator('button').count();
  const inputs = await page.locator('input').count();
  const visibleTexts = await page.locator('h1, h2, h3, h4, h5, h6').allTextContents().catch(() => []);
  const viewport = page.viewportSize();
  console.log(`[${label}]`);
  console.log(`  URL: ${url}`);
  console.log(`  Title: ${title}`);
  console.log(`  Buttons: ${buttons}, Inputs: ${inputs}`);
  console.log(`  Headings: ${visibleTexts.slice(0, 5).join(' | ')}`);
  console.log(`  Viewport: ${viewport.width}x${viewport.height}\n`);
}

async function checkOverlap(page, label) {
  // Verify the main content area is visible and has reasonable dimensions
  const bodyBox = await page.locator('body').boundingBox();
  if (!bodyBox) return;
  // Check that our primary container renders
  const settingsContainer = page.locator('[class*="space-y-6"]').first();
  const containerBox = await settingsContainer.boundingBox().catch(() => null);
  if (containerBox) {
    console.log(`  [${label}] Main container: ${containerBox.width.toFixed(0)}x${containerBox.height.toFixed(0)} at (${containerBox.x.toFixed(0)}, ${containerBox.y.toFixed(0)})`);
  }
}

async function run() {
  console.log('=== Provider UI Text Validation ===\n');
  const browser = await chromium.launch({ headless: true });

  // ── 1280×720 ──
  console.log('── 1280×720 ──');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(BASE_URL + '/#/settings', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => p.waitForTimeout(3000));
    await p.waitForTimeout(3000);
    await textSummary(p, 'Settings');
    await checkOverlap(p, 'Settings');
    // Open drawer
    await p.locator('button:has-text("Add Provider")').first().click().catch(() => {});
    await p.waitForTimeout(1500);
    await textSummary(p, 'Drawer Open');
    // Check drawer is visible
    const drawer = p.locator('[class*="fixed right-0"]').first();
    const drawerBox = await drawer.boundingBox().catch(() => null);
    if (drawerBox) {
      console.log(`  Drawer: ${drawerBox.width.toFixed(0)}x${drawerBox.height.toFixed(0)} at (${drawerBox.x.toFixed(0)}, ${drawerBox.y.toFixed(0)})`);
      console.log(`  Drawer visible within viewport: ${drawerBox.x >= 0 && drawerBox.y >= 0 && drawerBox.x + drawerBox.width <= 1280 && drawerBox.y + drawerBox.height <= 720 ? 'YES' : 'NO'}`);
    }
    // Check preset buttons visible
    const presets = p.locator('button:has-text("OpenAI")');
    const presetCount = await presets.count();
    console.log(`  Preset buttons visible: ${presetCount > 0 ? `YES (${presetCount})` : 'NO'}`);
    await p.close();
    await ctx.close();
  }

  // ── 1920×1080 ──
  console.log('\n── 1920×1080 ──');
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(BASE_URL + '/#/settings', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => p.waitForTimeout(3000));
    await p.waitForTimeout(3000);
    await textSummary(p, 'Settings');
    await checkOverlap(p, 'Settings');

    // Open drawer
    await p.locator('button:has-text("Add Provider")').first().click().catch(() => {});
    await p.waitForTimeout(1500);

    // Select OpenAI preset
    await p.locator('button:has-text("OpenAI")').first().click().catch(() => {});
    await p.waitForTimeout(2000);

    // Verify configure form
    const nameInput = p.locator('input[placeholder="My Provider"]');
    const nameVisible = await nameInput.isVisible().catch(() => false);
    console.log(`  Name input visible: ${nameVisible}`);
    const urlInput = p.locator('input[placeholder*="api.openai.com"]');
    const urlVisible = await urlInput.isVisible().catch(() => false);
    console.log(`  URL input visible: ${urlVisible}`);
    // URL should be pre-filled for OpenAI
    const urlValue = await urlInput.inputValue().catch(() => '');
    console.log(`  URL value: ${urlValue || '(empty)'}`);

    // Fill API key
    const pwInput = p.locator('input[type="password"]');
    await pwInput.fill('sk-test-key-12345').catch(() => {});
    await p.waitForTimeout(2000);

    // Check validation status
    const validateText = await p.locator('text=Validating').isVisible().catch(() => false);
    console.log(`  Validation indicator: ${validateText ? 'visible' : 'not shown yet'}`);

    // Open model selector
    await p.locator('button:has-text("Search and select models")').first().click().catch(() => {});
    await p.waitForTimeout(1000);
    const searchInput = p.locator('input[placeholder="Search models..."]');
    const searchVisible = await searchInput.isVisible().catch(() => false);
    console.log(`  Model search input visible: ${searchVisible}`);

    // Check select-all checkbox
    const selectAll = p.locator('text=Select all');
    const selectAllVisible = await selectAll.isVisible().catch(() => false);
    console.log(`  Select-all visible: ${selectAllVisible}`);

    // Test keyboard navigation
    await searchInput.focus().catch(() => {});
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(200);
    const focusedEl = p.locator('[role="option"][aria-selected]').first();
    const focusedExists = await focusedEl.isVisible().catch(() => false);
    console.log(`  ARIA option element exists: ${focusedExists}`);

    // Escape to close
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);

    // Verify we're back
    const addBtnAgain = p.locator('button:has-text("Add Provider")');
    const backToSettings = await addBtnAgain.isVisible().catch(() => false);
    console.log(`  Back to settings after Escape: ${backToSettings}`);

    await p.close();
    await ctx.close();
  }

  // ── HDPI ──
  console.log('\n── 1920×1080 @ 2× (HDPI) ──');
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(BASE_URL + '/#/settings', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => p.waitForTimeout(3000));
    await p.waitForTimeout(3000);
    await textSummary(p, 'Settings HDPI');
    await checkOverlap(p, 'Settings HDPI');

    // Open drawer
    await p.locator('button:has-text("Add Provider")').first().click().catch(() => {});
    await p.waitForTimeout(1500);
    const drawerHdpi = p.locator('[class*="fixed right-0"]').first();
    const drawerBoxHdpi = await drawerHdpi.boundingBox().catch(() => null);
    if (drawerBoxHdpi) {
      console.log(`  Drawer: ${drawerBoxHdpi.width.toFixed(0)}x${drawerBoxHdpi.height.toFixed(0)}`);
      console.log(`  Drawer in viewport bounds: ${drawerBoxHdpi.x >= 0 && drawerBoxHdpi.y >= 0 && drawerBoxHdpi.x + drawerBoxHdpi.width <= 1920 && drawerBoxHdpi.y + drawerBoxHdpi.height <= 1080 ? 'YES' : 'NO'}`);
    }

    // Select Anthropic preset
    await p.locator('button:has-text("Anthropic")').first().click().catch(() => {});
    await p.waitForTimeout(1500);

    // Verify form fields
    const nameInput = p.locator('input[placeholder="My Provider"]');
    console.log(`  Name field visible: ${await nameInput.isVisible().catch(() => false)}`);
    const urlAtHdpi = p.locator('input[placeholder*="anthropic.com"]').first();
    console.log(`  URL field visible: ${await urlAtHdpi.isVisible().catch(() => false)}`);

    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    await p.close();
    await ctx.close();
  }

  // ── Check saved screenshots ──
  console.log('\n── Screenshot file sizes ──');
  const fs = await import('fs');
  const { resolve, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const shotDir = resolve(__dirname, '..', 'docs', 'provider-ui-validation');
  const files = fs.readdirSync(shotDir).filter(f => f.endsWith('.png')).sort();
  for (const f of files) {
    const stat = fs.statSync(resolve(shotDir, f));
    console.log(`  ${f}: ${(stat.size / 1024).toFixed(1)} KB`);
  }

  await browser.close();
  console.log('\n✓ Text validation complete');
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
