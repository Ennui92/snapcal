# SnapCal: positioning, gaps, and how it makes money

Written 2026-07-17. This is a working document, not a pitch deck. It argues for
specific choices and says what would make them wrong.

---

## 1. The market we are actually entering

Photo-based calorie logging is no longer a novel idea. Cal AI proved the
category and owns the search term. So "you can photograph your food" is table
stakes and cannot be the value proposition.

What is still broken, across every app in the category, is **portion size**.
Independent benchmarking puts photo-based estimates between roughly ±1.4% and
±19.8% mean absolute error, and portions can be off by **20 to 40 percent when
there is no physical reference in the frame**. Mixed dishes (a plate of food
with sauce, oil, and things hidden under other things) are the worst case for
every app tested. SnapCalorie's answer is depth sensing on newer phones.

That is the opening. Two of the things already built here attack exactly that
failure, and neither is a feature a competitor can trivially copy:

1. **The hand is the ruler.** The user calibrates their palm-to-fingertip
   length once, and the model is told that measurement on every photo. It is a
   depth sensor made of a body part every user already owns, on every phone.
2. **It remembers.** Packaged and repeat foods are stored on the device and
   reused, so the same Lacta bar returns the same number every time.

Point 2 is quietly the stronger one. The loudest complaint about AI calorie
apps is not that they are wrong, it is that they are **inconsistent**: the same
lunch scanned twice gives two different numbers, and the moment a user notices
that, they stop trusting the app and churn. Competitors re-run inference from
scratch every time, so they are structurally inconsistent. SnapCal converges.

> **Positioning: SnapCal is the calorie app that learns your food.**
> Photograph a meal and go eat it. It remembers what you eat, so the numbers
> stop drifting and the logging gets faster every week.

Note that this is also a **cost** advantage, not just a marketing line. Every
repeat meal served from the local library is an API call not made. Competitors'
unit costs stay flat forever; ours fall the longer someone uses the app.

### Against each competitor, in one line

| Them | Their pitch | Our line |
|---|---|---|
| **Cal AI** | Fast AI photo scanning | Same speed, but it learns your food so the numbers stop changing, and you can see the price before you install |
| **MyFitnessPal** | The biggest food database | You should not have to search a database to eat lunch |
| **Noom** | Behaviour change coaching | We are not going to lecture you at €60 a month |
| **MacroFactor** | Rigorous adaptive TDEE | Same honest maths, none of the data entry |
| **Yazio / Lifesum** | Polished, localised | Ours opens straight into the camera and never asks you to make an account |

### Who this is for, precisely

Not "people who want to lose weight". That is the whole market and reaches
nobody. The person who converts here is:

**Someone who has already tried MyFitnessPal and quit.** They know what a
calorie budget is, they do not need convincing that tracking works, and they
quit because logging was 12 taps a meal. They do not need education, they need
the friction removed. This matters because it dictates every piece of copy:
we sell *relief from a known pain*, not the concept of calorie counting.

Secondary, and cheap to win: **privacy-minded technical users** (no account,
local database, source on GitHub) and **Greek speakers** (see channels).

---

## 2. Gaps that block making money

Ordered by how much they cost us. The first four are hard blockers.

1. **The Gemini key ships inside the APK.** Anyone who unzips the release can
   extract it and spend Ermis's quota. This blocks *any* public distribution,
   not just scale. The client already prefers `EXPO_PUBLIC_ANALYZER_PROXY_URL`,
   so the fix is a thin proxy (Cloud Function or Supabase Edge Function) that
   holds the key, enforces a per-install rate limit, and is the natural place
   to meter free vs paid. **Do this before the app is listed anywhere.**
2. **No iOS build.** Health app revenue skews heavily to iOS. Staying
   Android-only caps revenue structurally, no matter how good the funnel is.
   The codebase is plain Expo, so this is an EAS build and a developer account,
   not a rewrite.
3. **Nothing to sell.** No billing, no entitlement check, no paywall. Nothing
   in the app can currently be bought. RevenueCat is the standard answer and
   handles both stores plus trials and win-backs.
4. **Not on Google Play.** A sideloaded APK has zero discovery, and most
   non-technical users will not install one. No listing means no organic
   installs, which means the entire funnel below is theoretical.

Then the ones that cost retention rather than blocking launch:

5. **No backup.** "Everything stays on your phone" is our best story and our
   biggest liability: lose the phone, lose a year of logging. This must be
   solved *without* betraying the privacy claim: an encrypted export the user
   controls, restorable on a new device. This is also the single most
   sellable premium feature, so the fix and the business model are the same move.
6. **No weight trend chart.** Weights are logged and never visualised. The
   trend line going down is the emotional payoff that makes people renew. We
   are collecting the data and throwing away the reward.
7. **No habit loop.** No reminder to log, no widget, no streak notification.
   Calorie apps die in week one. D7 retention is the biggest single lever on
   lifetime value and we currently do nothing to defend it.
8. **No barcode fallback.** For a packaged item a barcode is faster and exact.
   Users expect it, and it is cheap to add.
9. **Sharing is plain text.** A good-looking share card is free distribution.
10. **Legal and safety.** A Play listing needs a privacy policy and a data
    safety declaration, plus a clear "not medical advice" line. Calorie apps
    also get scrutinised for eating-disorder risk: the calorie floor is already
    implemented, which is good, and it should be documented and paired with a
    signposting line for users who set extreme goals.

---

## 3. Money: what to charge and how to split it

### The trial choice, and why not Cal AI's

Cal AI runs a 3-day trial that requires card details up front, behind a paywall
you cannot see until you have finished the onboarding quiz. It works for them
because they buy installs and optimise hard for revenue per install.

That is the wrong model here, for a specific product reason: **SnapCal's magic
is cumulative.** The pitch is that it learns your food, and that is not visible
on day one. It shows up around day five, when the app recognises your usual
breakfast instantly. A 3-day card-required trial paywalls the user *before the
product has demonstrated its actual advantage*. We would be charging for a
promise we have not kept yet.

### Recommendation: a reverse trial

- **Days 1 to 7: everything unlocked. No card, no paywall, no signup.**
- **Day 8: drop to the free tier**, with the paywall shown at that moment.
- Free stays genuinely useful forever.

Why this converts better *for this app*:

- No card up front means far more people actually get in and use it. With no
  ad budget, a wide top of funnel is the whole game.
- The downgrade lands *after* the "it already knows my breakfast" moment, so
  we are selling something already experienced, not described.
- It converts on loss aversion (having something taken away) rather than
  novelty, which holds up better.
- It is honest, which is the brand. Cal AI hiding its price until after the
  quiz is exactly the behaviour we position against.

The trade-off, stated plainly: revenue per install will be lower than a hard
paywall, and this only wins if activation and word of mouth are genuinely
better. If we ever start buying installs, revisit this, because paid
acquisition maths favours the hard paywall.

### The free / premium line

The principle: **free is metered by the thing that costs us money (AI scans),
never by the thing that creates the habit (logging).** A crippled free tier
kills the reviews and the word of mouth we depend on.

**Free, forever**
- **3 AI photo scans a day**
- **Unlimited logging of foods already in your library** — zero API cost to us,
  and it makes the free tier get *better* the more you use it, which is the
  product story doing the marketing
- Unlimited manual entries
- Today view, daily budget, streak, percent-eaten slider, corrections
- Last 7 days of history

**Plus** (the paid tier)
- Unlimited scans
- Full history, weight trend chart, weekly review
- **Encrypted backup and restore, and multi-device** (fixes gap 5)
- Fitness sync (Strava, Health Connect) so workouts raise the day's budget
- Custom macro, sugar and protein targets
- Coach nudges and strictness levels
- Share cards
- Barcode scanning, once it exists

The free tier deliberately covers a light logger completely. That is the point:
they become the people who recommend it.

### Price

Cal AI sits around $29.99/year with monthly near $9.99, using dynamic pricing.
We undercut on annual and stay honest about it.

| Plan | Price | Purpose |
|---|---|---|
| Monthly | **€4.99** | Anchor. Deliberately unattractive next to annual |
| **Annual** | **€24.99** (~€2.08/mo) | The target. Aim for 70%+ of subscribers here |
| Lifetime | **€49.99**, launch offer | See below |

**Lifetime is a deliberate choice, not a gimmick.** The audience we attract
first (privacy-minded, no-account, source-on-GitHub) is disproportionately
subscription-averse, and would otherwise never pay anything. It also brings
cash in early, when it is worth the most. Because scans have a real marginal
cost, lifetime carries a generous fair-use cap (say 15 scans a day) so the
liability stays bounded. Consider retiring it once organic installs are steady.

### Where the paywall appears

1. **Day 8, at the downgrade.** Primary. Frame it as what they would lose.
2. **On the 4th scan of a day.** Contextual, at the moment of need.
3. **After the first weekly result** ("you finished 3,400 kcal under budget").
   Emotional peak, and the best place to sell the annual plan.
4. Settings. Passive.

Plus a **win-back at day 30** for non-converters: 50% off the first year.

### Numbers to hold ourselves to

| Metric | Target |
|---|---|
| Install → onboarding complete | > 70% |
| Logs a meal on day 1 | > 60% |
| D7 retention | 25–35% |
| Day-8 paywall → purchase | 4–8% |
| Annual share of subscriptions | > 70% |
| Gemini cost per active free user | < €0.15/month |

That last one is the health check on the whole model. If the local library is
working as designed, cost per user should *fall* month over month. If it does
not, the core thesis is wrong and the free tier needs re-metering.

---

## 4. Getting the first users

No ad budget, one developer. Ranked by return per hour.

1. **Play Store, localised into all five languages.** The app already speaks
   English, Greek, German, Spanish and French. Most competitors ship
   English-only listings in those stores. Five localised listings is five
   markets of organic search for one afternoon of work. This is the single
   cheapest lever available and it should happen first.
2. **Own Greece.** There is no good Greek-language calorie app, Ermis is
   Greek, the Greek copy already exists, and the local-products idea is already
   in the code (the Lacta example). Teach it Greek food properly (moussaka,
   souvlaki, gyros, Greek yogurt brands, the supermarket own-brands) and it
   becomes the obvious choice for an entire country nobody else is serving.
   Same playbook that fits Eortes. Germany second, where the privacy angle
   lands hardest.
3. **Short video, because the product is the ad.** Point phone at plate,
   number appears, done. That fifteen-second loop is how this category grew.
   Zero cost, highest ceiling.
4. **Reddit, carefully.** r/loseit, r/CICO, r/1200isplenty do not tolerate
   promotion, so it goes as a build-in-public story ("I got sick of MyFitnessPal
   taking 12 taps per meal, so I built this") rather than an ad. The privacy
   angle plays straight in r/privacy, r/degoogle and r/fossdroid, where an
   APK on GitHub with no account and a local database is genuinely news.
   Ermis already has Reddit ad tooling if paid ever makes sense.
5. **Show HN / Product Hunt.** The local-first, no-account architecture is the
   hook for that audience, not the calorie counting.

The one line to lead with everywhere:

> **Photograph your food. Keep eating. It learns what you eat, so it gets
> faster and more accurate every week, and none of it leaves your phone.**

---

## 5. What would make this wrong

- **If accuracy is not actually better.** The whole position rests on hand
  calibration plus the local library beating a naked photo. That is a testable
  claim and it has not been tested. Weigh 30 typical meals, log them with and
  without a hand in frame, and measure. If it does not hold up, the honest
  position becomes speed and privacy, and the pricing has to come down.
- **If Cal AI ships a memory feature.** Our moat is a design choice, not
  technology. The defence is being further along on the specific thing (local
  products, per-user calibration) and owning the underserved languages.
- **If retention is the usual calorie-app disaster.** Every number above
  assumes D7 in the 25–35% band. If it comes in at 10%, no pricing model saves
  it and the work goes into the habit loop (gap 7) before anything else here.

## Sources

- Cal AI pricing: [eesel](https://www.eesel.ai/blog/cal-ai-pricing), [NutriScan](https://nutriscan.app/blog/posts/cal-ai-pricing-2026-monthly-yearly-premium-abc6e7b26f)
- Photo-estimate accuracy benchmarking: [Clinical Nutrition Report](https://clinicalnutritionreport.com/research/ai-photo-calorie-benchmark-2026/), [SnapCalorie review](https://wellnesspulse.com/nutrition/snapcalorie-ai-image-tracker-review/)
