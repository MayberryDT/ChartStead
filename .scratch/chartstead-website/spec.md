# ChartStead website

Status: ready-for-agent

## Problem

The marketing site at `/home/halla/chartstead-web` is a separate Astro repo. It already lives on `https://chartstead.com`. It still uses conceptual UI images, fictional Harborline sample data, and CTAs that point at the workers.dev demo app. The product demo is a different event (Pacific Open Data Summit) with a thin unused AI Engineer World's Fair stub. Visitors cannot see one real program that matches the site, the demo app, and the public embeds.

## Solution

Use this ChartStead issue board — **Website** tab — for all marketing-site tickets. Keep website code in `/home/halla/chartstead-web`. Do not nest that repo inside ChartStead.

The launch loop is:

1. Rebuild the product demo as one AI Engineer World's Fair 2026 program (Competition 61).
2. Put the demo app on `https://demo.chartstead.com` (Competition 60). Production stays on workers.dev. The marketing site is already on `https://chartstead.com` (Website 06 done).
3. Replace every site image, publish the example-event CTA, shoot the lander video, lock site copy, and point CTAs at the ChartStead-domain demo (Website 01–05).
4. Tyler reviews the site with his own eyes (Website 07).
5. Publish product docs at `/docs` (Website 08).
6. Add a YouTube guided-demo PIP on `/demo` (Website 09) and an AI copy-paste agent tour prompt (Website 10).
7. Add a marketing **Log in** link to `https://app.chartstead.com` (Website 11). Demo remains the public try path; login is not free self-service signup.

## Authority

Website code follows `/home/halla/chartstead-web/AGENTS.md`. Tickets and status live only on this board.