// Daily check that Pantry can still read the store ads from Flipp.
// Runs the app's own price-checking code (from index.html) against a sample ZIP and list.
// Fails loudly if the ad service changed shape, stopped answering, or prices stop being read.
const fs = require("fs"), path = require("path"), os = require("os");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const file = path.join(os.tmpdir(), "pantry-app.js");
fs.writeFileSync(file, scripts[scripts.length - 1]);
const app = require(file);

const ZIP = process.env.PANTRY_ZIP || "28202";
const ITEMS = ["milk", "eggs", "bread", "chicken breast", "bananas", "cereal", "coffee", "cheese"];
const STORES = (process.env.PANTRY_STORES || "Harris Teeter,Food Lion,Lowes Foods,Target").split(",");

(async () => {
  const out = await app.checkPrices(ZIP, ITEMS, STORES, { fresh: true });
  const problems = [];
  const priced = out.deals.filter(d => d.unit_price !== null);
  const withSize = priced.filter(d => d.per);
  const found = out.results.filter(r => STORES.some(s => (r.stores[s] || []).some(d => d.unit_price !== null)));
  const notLive = out.deals.filter(d => !app.isLive(d.valid_from, d.valid_to));
  const storesWithAds = STORES.filter(s => out.status[s] && out.status[s].items);

  console.log(`ZIP ${ZIP}: ${out.deals.length} deals read, ${priced.length} with a price, ${withSize.length} with a size.`);
  console.log(`Stores with ads: ${storesWithAds.join(", ") || "none"}`);
  out.results.forEach(r => {
    const best = STORES.flatMap(s => (r.stores[s] || []).filter(d => d.unit_price !== null)).sort((a, b) => a.unit_price - b.unit_price)[0];
    console.log(`  ${r.item}: ${best ? `${best.price_label} at ${best.store} (${best.name})` : "no priced match"}`);
  });
  out.warnings.forEach(w => console.log("Warning: " + w));

  if (out.failedCompletely) problems.push("Couldn't read any ads at all.");
  if (out.deals.length < 100) problems.push(`Only ${out.deals.length} deals read (expected 100+).`);
  if (priced.length < out.deals.length * 0.5) problems.push(`Only ${priced.length} of ${out.deals.length} deals have a price: price reading may be broken.`);
  if (found.length < ITEMS.length / 2) problems.push(`Only ${found.length} of ${ITEMS.length} sample items matched a priced deal.`);
  if (storesWithAds.length < 2) problems.push(`Only ${storesWithAds.length} of the sample stores returned ads.`);
  if (priced.length && withSize.length < priced.length * 0.05) problems.push("Almost no sizes read: size parsing may be broken.");
  if (notLive.length) problems.push(`${notLive.length} deals are from an ad that isn't running today.`);

  if (problems.length) { console.error("\nPROBLEMS:\n- " + problems.join("\n- ")); process.exit(1); }
  console.log("\nAll good.");
})().catch(e => { console.error("Check crashed: " + (e && e.stack || e)); process.exit(1); });
