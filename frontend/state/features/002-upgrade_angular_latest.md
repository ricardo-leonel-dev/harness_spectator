---
feature_number: 2
name: upgrade_angular_latest
title: Upgrade Angular from v18 to latest stable (v22)
status: done
created_at: 2026-08-27T06:06:05.000Z
updated_at: 2026-08-27T07:12:56.000Z
---

## Description
The frontend currently pins Angular ~18.2 (core, cli, forms, router, etc. in frontend/package.json), several major versions behind. Angular 22 is the current stable release (June 2026, active support through Dec 2026, LTS through May 2028). Research and execute an incremental upgrade path (18->19->20->21->22, using 'ng update' one major at a time) covering all @angular/* packages, angular-eslint, zone.js/signals migration considerations, and any breaking changes per major version. Must keep the app buildable, lintable, and passing existing tests at every step.

## Acceptance
- [ ] All @angular/* packages (core, common, forms, platform-browser, platform-browser-dynamic, router, cli, compiler, compiler-cli) and angular-eslint are on the latest v22 stable release
- [ ] Upgrade performed incrementally (one major version at a time via 'ng update'), not a direct jump, with each intermediate step verified
- [ ] Breaking changes for each major (19, 20, 21, 22) are identified and addressed (e.g. deprecated APIs, zone.js/zoneless considerations, control flow syntax, build system changes)
- [ ] npm run lint, npm run build, and npm run test (ChromeHeadless) all pass after the upgrade
- [ ] package.json / package-lock.json reflect the new pinned versions consistently
