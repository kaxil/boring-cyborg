# CLAUDE.md

Boring Cyborg is a [Probot](https://github.com/probot/probot) GitHub App (CommonJS, Node `>= 22`) that labels PRs, requests reviewers, greets first-time contributors, inserts issue links, validates titles and checks branch freshness. Each repo that installs it opts in per feature through `.github/boring-cyborg.yml` on its default branch; the README holds the full annotated config schema, and it is the user-facing documentation, so update it whenever a config key changes.

## Commands

```sh
npm install
npm test                                  # jest, then `standard` lint; CI runs this on Node 22/24
npm run jest -- test/labeler.test.js      # one test file
npm run jest -- -t "should add labels based on file paths"  # tests whose name matches
npm run lint                              # standard --fix
npm start                                 # probot run ./index.js on localhost; needs .env, see .env.example
npm run dev                               # nodemon restart on change
npm run request_labeled                   # replay test/pr.labeled.json through the app locally
```

Style is [standard](https://standardjs.com/): no semicolons, two-space indent, space before function parens. Pre-commit hooks also forbid tabs and CRLF.

## Architecture

`index.js` wires webhook events to feature modules in `lib/`. PR features are listed in `prFeatures` with the events each handles, and a single handler serves all of them: it loads the config once (`utils.getConfig`), drops the event if the PR's base ref doesn't match the top-level `targetBranchFilter`, then runs every matching feature with `Promise.allSettled`. It is one handler on purpose: Probot builds a new `Context` per handler, and `utils.getPr` / `utils.getPrFiles` memoize on the `Context`, so sharing it is what makes each feature's `pulls.get` and `pulls.listFiles` hit the API once per webhook. Features should read the PR and its files through those helpers. `issues.opened` has its own handler.

Each `lib/<feature>.js` exports an async `(context, config)` function that returns early unless its config key (`labelPRBasedOnFilePath`, `addReviewerBasedOnLabel`, `verifyTitles`, ...) is present. Missing config means the feature is off; there is no global enable flag.

Branch filtering works at two levels. The top-level `targetBranchFilter` turns PR features off for non-matching base refs; per-rule `targetBranchFilter` (labeler labels, reviewer labels, issue-link matchers) then decides each rule. Both go through `utils.matchesBranchFilter`, which accepts a string or a list, treats empty/missing as match-all, and skips patterns that `safe-regex2` flags as unsafe. Labeler and reviewer rules accept either a legacy bare array or an object form (`{ paths | reviewers, targetBranchFilter }`), normalized by each module's `_parseRule`. New per-rule options should keep the bare-array form working.

`lib/greetings.js` decides "first-time contributor" without the Search API, because search results are truncated on very large repos like apache/airflow. It uses `author_association` as a fast path (`CONTRIBUTOR` is deliberately excluded on merge events) and falls back to `repos.listCommits` / `issues.listForRepo`. Read the comments there before changing detection logic.

`index.js` also serves `GET /boring-cyborg/stats`, which lists installations and requires `Authorization: Bearer $STATS_API_KEY`. Probot v14 has no Express router: the route is a plain Node `(req, res)` handler passed to `addHandler`, returning `true` when it handled the request. `addHandler` throws under `probot receive`, so the app catches that.

Probot v14 is ESM-only and only exposes `context.octokit.rest.<namespace>.<method>`; the bare `context.octokit.pulls.*` form no longer exists. The app itself stays CommonJS because `probot run` loads it with `import()`. The `Procfile` sets `HOST=0.0.0.0` because v14 binds `localhost` by default, which Heroku can't route to, and `LOG_FORMAT=json` because v14 no longer switches to JSON logs when `NODE_ENV=production`. Configure Probot through env vars, not CLI flags: probot 14.3.7's `run` drops its first two arguments whenever it gets more than two.

## Tests

- Feature tests build a fake Probot context with `createMockContext()` from `test/helpers.js`; octokit methods are `jest.fn()` stubs there. When a module starts calling a new octokit method, add it to that helper rather than patching per test.
- `test/index.test.js` drives a real `Probot` instance with `probot.receive(...)` and `jest.spyOn`s the feature module exports. That only works because `index.js` calls `labeler.addLabelsOnPr(...)` through the module object, and `utils.shouldProcessPr` calls `module.exports.matchesBranchFilter`. Don't destructure these imports.
- `test/helpers.test.js` checks that every member of that octokit mock exists on the real `ProbotOctokit`, so a renamed or removed Octokit method fails the suite instead of passing against the mock.
- Tests that need `probot` load it with `await import('probot')`, which Jest's CommonJS runtime only supports under `node --experimental-vm-modules` (the `jest` npm script). Plain `npx jest` fails on those files.
- `test/setup.js` disables real network access through nock for every test.

## Releases

Versions are CalVer (`YYYY.MM.DD`, with `.1`, `.2` for same-day releases). Publishing a GitHub release runs the tests and force-pushes to Heroku (`.github/workflows/deploy.yml`):

```sh
gh release create 2026.04.16 --title "2026.04.16" --generate-notes
```

`app.yml` is only the manifest used when first creating the GitHub App; editing it does not change the live app's permissions or events.
