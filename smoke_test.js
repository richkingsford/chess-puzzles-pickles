const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const rootDir = __dirname;
const gameDir = path.join(rootDir, 'game');
const resultsFile = path.join(rootDir, 'smoke_test_results.json');

function saveResults(results, meta = {}) {
  const payload = {
    updatedAt: new Date().toISOString(),
    ...meta,
    results
  };
  fs.writeFileSync(resultsFile, JSON.stringify(payload, null, 2));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.unref();
    tester.on('error', reject);
    tester.listen(0, '127.0.0.1', () => {
      const address = tester.address();
      const port = address && typeof address === 'object' ? address.port : null;
      tester.close((closeErr) => {
        if (closeErr) return reject(closeErr);
        if (!port) return reject(new Error('Failed to allocate free port'));
        resolve(port);
      });
    });
  });
}

function runNpmSync(args, cwd) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8'
    });
  }

  return spawnSync('npm', args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8'
  });
}

function runNpm(args, cwd) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
      cwd,
      stdio: 'pipe',
      windowsHide: true
    });
  }

  return spawn('npm', args, {
    cwd,
    stdio: 'pipe',
    windowsHide: true
  });
}

const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;

function parseIndexText(text) {
  const match = String(text || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  return {
    current: Number(match[1]),
    total: Number(match[2])
  };
}

function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (Date.now() - started > timeoutMs) {
          reject(new Error(`Server returned status ${res.statusCode}`));
        } else {
          setTimeout(tick, 500);
        }
      });

      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for server at ${url}`));
        } else {
          setTimeout(tick, 500);
        }
      });
    };

    tick();
  });
}

function runBuild() {
  const result = runNpmSync(['run', 'build'], gameDir);

  if (result.status !== 0) {
    const errText = result.error ? `\n${result.error.message}` : '';
    throw new Error(`Build failed:${errText}\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
}

function startPreviewServer(port) {
  const proc = runNpm(['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], gameDir);

  proc.stdout.on('data', (data) => {
    process.stdout.write(String(data));
  });

  proc.stderr.on('data', (data) => {
    process.stderr.write(String(data));
  });

  return proc;
}

async function stopServer(server) {
  if (!server || server.killed) return;

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('cmd.exe', ['/d', '/s', '/c', `taskkill /PID ${server.pid} /T /F`], {
        stdio: 'ignore',
        windowsHide: true
      });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }

  server.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (!server.killed) {
    server.kill('SIGKILL');
  }
}

async function runUseCase(name, fn, results) {
  const checks = [];
  const check = (label, pass) => {
    const item = { label, pass: Boolean(pass) };
    checks.push(item);
    return item.pass;
  };

  const requireCheck = (label, pass, message) => {
    const ok = check(label, pass);
    if (!ok) {
      throw new Error(message || label);
    }
  };

  const formatChecks = (items) => items
    .map((item) => `${item.pass ? green('PASS') : red('FAIL')} ${item.label}`)
    .join(', ');

  try {
    await fn({ check, requireCheck });
    console.log(`${green('PASS')} ${name}`);
    if (checks.length) {
      console.log(`  - ${formatChecks(checks)}`);
    }
    results.push({ name, pass: true, checks });
    saveResults(results, { inProgress: true });
  } catch (error) {
    console.log(`${red('FAIL')} ${name}`);
    if (checks.length) {
      console.log(`  - ${formatChecks(checks)}`);
    }
    console.log(`  ↳ ${error.message}`);
    results.push({ name, pass: false, error: error.message, checks });
    saveResults(results, { inProgress: true });
  }
}

async function isVisibleFast(locator, timeout = 400) {
  return locator.isVisible({ timeout }).catch(() => false);
}

async function hasErrorBanner(page) {
  const generic = await isVisibleFast(page.getByText('Something went wrong', { exact: false }));
  const loadError = await isVisibleFast(page.getByText('Error loading puzzles.', { exact: false }));
  return generic || loadError;
}

async function getSmokeState(page) {
  return page.evaluate(() => {
    if (!window.__smokePuzzle || typeof window.__smokePuzzle.getState !== 'function') return null;
    return window.__smokePuzzle.getState();
  });
}

async function playExpectedMove(page) {
  return page.evaluate(() => {
    if (!window.__smokePuzzle || typeof window.__smokePuzzle.playExpectedMove !== 'function') return false;
    return window.__smokePuzzle.playExpectedMove();
  });
}

async function playIncorrectMove(page) {
  return page.evaluate(() => {
    if (!window.__smokePuzzle || typeof window.__smokePuzzle.playIncorrectMove !== 'function') return false;
    return window.__smokePuzzle.playIncorrectMove();
  });
}

async function canPlayExpected(page) {
  return page.evaluate(() => {
    if (!window.__smokePuzzle || typeof window.__smokePuzzle.canPlayExpected !== 'function') return false;
    return window.__smokePuzzle.canPlayExpected();
  });
}

async function canPlayIncorrect(page) {
  return page.evaluate(() => {
    if (!window.__smokePuzzle || typeof window.__smokePuzzle.canPlayIncorrect !== 'function') return false;
    return window.__smokePuzzle.canPlayIncorrect();
  });
}

async function resetPuzzle(page) {
  const resetButton = page.getByTestId('reset-button');
  if (await isVisibleFast(resetButton)) {
    await resetButton.click();
    await page.waitForTimeout(150);
  }
}

async function preparePlayablePuzzle(page, requireWrongMove = false) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await resetPuzzle(page);
    await closeDictionaryModalIfOpen(page);

    const state = await getSmokeState(page);
    const unlocked = Boolean(state && !state.isSolved && !state.isFailed && !state.moveStatus && state.autoAdvanceCountdown === null);
    const expected = await canPlayExpected(page);
    const wrong = await canPlayIncorrect(page);

    if (unlocked && expected && (!requireWrongMove || wrong)) {
      return true;
    }

    const moved = await goNextIfPossible(page);
    if (!moved) {
      break;
    }
  }

  return false;
}

async function waitForCondition(predicate, timeoutMs = 6000, intervalMs = 120) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await predicate();
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function revealHintsUntil(page, count) {
  const revealButton = page.getByRole('button', { name: /Reveal Hint|Show Answer/i });

  for (let hintNumber = 1; hintNumber <= count; hintNumber += 1) {
    if (!(await revealButton.isVisible())) break;
    await revealButton.click();
    await page.getByText(`Hint ${hintNumber}:`, { exact: false }).first().waitFor({ timeout: 4000 });
  }
}

async function closeDictionaryModalIfOpen(page) {
  const closeButton = page.getByRole('button', { name: 'Close dictionary' });
  if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeButton.click();
  }
}

async function goNextIfPossible(page) {
  const nextButton = page.getByTestId('next-button');
  const disabled = await nextButton.isDisabled();
  if (disabled) return false;
  await nextButton.click();
  await page.waitForTimeout(250);
  return true;
}

async function main() {
  const results = [];
  let browser;
  let context;
  let page;
  let server;
  let appUrl;

  try {
    console.log('Building app for smoke test...');
    runBuild();

    const smokePort = await getFreePort();
    appUrl = `http://127.0.0.1:${smokePort}`;

    console.log('Starting preview server...');
    server = startPreviewServer(smokePort);
    await waitForServer(appUrl, 45000);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(10000);
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

    const categoryButtons = page.locator('button:has(span.font-medium)');

    await runUseCase('Home screen loads', async ({ requireCheck, check }) => {
      await page.getByRole('heading', { name: 'Chess Puzzles' }).waitFor({ timeout: 6000 });
      requireCheck('heading visible', true);

      const loadingVisible = await isVisibleFast(page.getByText('Loading...', { exact: false }));
      requireCheck('NEG no stuck loading', !loadingVisible);

      const errorVisible = await hasErrorBanner(page);
      requireCheck('NEG no error banner', !errorVisible);

      check('NEG dictionary modal hidden', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
    }, results);

    await runUseCase('Category list is available', async ({ requireCheck }) => {
      const count = await categoryButtons.count();
      requireCheck('category count > 0', count > 0, 'No puzzle categories found');

      const firstCategoryText = String(await categoryButtons.first().innerText());
      requireCheck('category button has progress counts', /\d+\s*\/\s*\d+/.test(firstCategoryText));

      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
      requireCheck('NEG no puzzle board before selection', !(await isVisibleFast(page.getByTestId('puzzle-index'))));
    }, results);

    await runUseCase('Open first category puzzle', async ({ requireCheck }) => {
      await categoryButtons.first().click();
      await page.getByTestId('puzzle-index').waitFor({ timeout: 6000 });
      const index = parseIndexText(await page.getByTestId('puzzle-index').innerText());

      requireCheck('puzzle index visible', Boolean(index));
      requireCheck('board state text visible', await isVisibleFast(page.getByText(/White to move|Black to move|Partnered!|TRY AGAIN|CORRECT!/i).first()));
      requireCheck('tags panel visible', await isVisibleFast(page.getByTestId('tags-panel')));
      requireCheck('NEG no category heading on puzzle screen', !(await isVisibleFast(page.getByRole('heading', { name: 'Chess Puzzles' }))));
      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
    }, results);

    await runUseCase('Tags section is shown', async ({ requireCheck }) => {
      await page.getByTestId('tags-panel').waitFor({ timeout: 4000 });
      const chipCount = await page.getByTestId('tag-chip').count();
      requireCheck('tag chips exist', chipCount > 0, 'No tag chips found');

      const tagsLabel = await isVisibleFast(page.getByText('Tags', { exact: true }));
      requireCheck('tags label visible', tagsLabel);

      requireCheck('NEG no dictionary modal yet', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
    }, results);

    await runUseCase('Reveal first hint works', async ({ requireCheck }) => {
      await page.getByRole('button', { name: /Reveal Hint|Show Answer/i }).click();
      await page.getByText('Hint 1:', { exact: false }).first().waitFor({ timeout: 4000 });

      requireCheck('hint 1 rendered', true);
      requireCheck('reveal button still visible', await isVisibleFast(page.getByRole('button', { name: /Reveal Hint|Show Answer/i })));
      requireCheck('NEG no dictionary modal auto-open', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
    }, results);

    await runUseCase('Hint dictionary popup opens', async ({ requireCheck, check }) => {
      let found = false;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await revealHintsUntil(page, 4);
        const termButtons = page.locator('button[title^="Tap to learn:"]');
        const termCount = await termButtons.count();
        check(`scan attempt ${attempt + 1} found terms`, termCount > 0);
        if (termCount > 0) {
          await termButtons.first().click();
          found = true;
          break;
        }

        const moved = await goNextIfPossible(page);
        if (!moved) break;
      }

      requireCheck('term tap executed', found, 'No tappable dictionary terms found after scanning multiple puzzles');
      requireCheck('dictionary modal opened', await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }), 1200));
      await closeDictionaryModalIfOpen(page);
      requireCheck('NEG modal closes successfully', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
    }, results);

    await runUseCase('Tag dictionary popup opens', async ({ requireCheck, check }) => {
      let opened = false;

      for (let attempt = 0; attempt < 5 && !opened; attempt += 1) {
        const chips = page.getByTestId('tag-chip');
        const chipCount = await chips.count();
        check(`tag scan attempt ${attempt + 1} chips > 0`, chipCount > 0);

        for (let index = 0; index < chipCount; index += 1) {
          await chips.nth(index).click();
          const closeBtn = page.getByRole('button', { name: 'Close dictionary' });
          if (await closeBtn.isVisible({ timeout: 600 }).catch(() => false)) {
            opened = true;
            await closeBtn.click();
            break;
          }
        }

        if (!opened) {
          const moved = await goNextIfPossible(page);
          if (!moved) break;
        }
      }

      requireCheck('tag opens dictionary modal', opened, 'No tag chip opened a dictionary entry after scanning multiple puzzles');
      requireCheck('NEG modal closes successfully', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
    }, results);

    await runUseCase('Mate-pattern tag does not overmatch', async ({ requireCheck, check }) => {
      let foundMatePatternsTag = false;

      for (let attempt = 0; attempt < 25 && !foundMatePatternsTag; attempt += 1) {
        const chips = page.getByTestId('tag-chip');
        const chipCount = await chips.count();

        for (let index = 0; index < chipCount; index += 1) {
          const chip = chips.nth(index);
          const label = String(await chip.innerText()).trim().toLowerCase();
          if (label === 'mate patterns') {
            foundMatePatternsTag = true;
            await chip.click();

            const modalClose = page.getByRole('button', { name: 'Close dictionary' });
            requireCheck('dictionary modal opened for mate patterns', await isVisibleFast(modalClose, 1200));

            const smotheredVisible = await isVisibleFast(page.getByText('Smothered Mate', { exact: true }), 600);
            requireCheck('NEG not mapped to Smothered Mate', !smotheredVisible, 'Mate patterns incorrectly mapped to Smothered Mate');

            const fallbackTitleVisible = await isVisibleFast(page.getByText('mate patterns', { exact: true }), 600);
            check('fallback tag title shown', fallbackTitleVisible);

            await closeDictionaryModalIfOpen(page);
            break;
          }
        }

        if (!foundMatePatternsTag) {
          const moved = await goNextIfPossible(page);
          if (!moved) break;
        }
      }

      requireCheck('found at least one mate patterns tag', foundMatePatternsTag, 'No mate patterns tag found while scanning puzzles');
      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
    }, results);

    await runUseCase('Incorrect move resets gracefully', async ({ requireCheck }) => {
      requireCheck('found puzzle with wrong-move branch', await preparePlayablePuzzle(page, true), 'Could not find puzzle with an incorrect-move branch');

      const before = await getSmokeState(page);
      requireCheck('smoke API state available', Boolean(before));
      requireCheck('initial status idle', !before.moveStatus);

      const wrongPlayed = await playIncorrectMove(page);
      requireCheck('wrong move injected', wrongPlayed, 'Could not inject wrong move from smoke API');

      const sawIncorrect = await waitForCondition(async () => {
        const state = await getSmokeState(page);
        return state && state.moveStatus === 'incorrect';
      }, 2500);
      requireCheck('INCORRECT status appears', sawIncorrect);

      const resetDone = await waitForCondition(async () => {
        const state = await getSmokeState(page);
        return state && !state.moveStatus && state.currentMoveIndex === 0 && state.fen === before.fen;
      }, 3500);
      requireCheck('board resets to original fen', resetDone, 'Board did not reset after incorrect move');

      const postResetState = await getSmokeState(page);
      requireCheck('NEG no solved flag', Boolean(postResetState) && !postResetState.isSolved);
      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
    }, results);

    await runUseCase('Board locks during feedback', async ({ requireCheck }) => {
      requireCheck('found puzzle with wrong-move branch', await preparePlayablePuzzle(page, true), 'Could not find puzzle with an incorrect-move branch');

      const played = await playIncorrectMove(page);
      requireCheck('seed incorrect feedback', played);

      const statusVisible = await waitForCondition(async () => {
        const state = await getSmokeState(page);
        return state && state.moveStatus === 'incorrect';
      }, 2500);
      requireCheck('feedback state active', statusVisible);

      const before = await getSmokeState(page);
      const blockedMove = await playExpectedMove(page);
      const after = await getSmokeState(page);

      requireCheck('moves blocked during feedback', blockedMove === false);
      requireCheck('fen unchanged while feedback active', before && after && before.fen === after.fen);

      await waitForCondition(async () => {
        const state = await getSmokeState(page);
        return state && !state.moveStatus;
      }, 3500);

      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
      requireCheck('NEG no dictionary modal pop', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
    }, results);

    await runUseCase('Correct flow keeps board stable', async ({ requireCheck }) => {
      requireCheck('found puzzle with expected move', await preparePlayablePuzzle(page, false), 'Could not find puzzle with an expected-move branch');

      const before = await getSmokeState(page);
      requireCheck('smoke API state available', Boolean(before));

      const played = await playExpectedMove(page);
      requireCheck('expected move injected', played);

      const correctVisible = await waitForCondition(async () => {
        const state = await getSmokeState(page);
        return state && state.moveStatus === 'correct';
      }, 2000);
      requireCheck('CORRECT status appears', correctVisible);

      const afterCorrectState = await getSmokeState(page);
      const hasOpponentReplyStep = Boolean(
        afterCorrectState &&
        !afterCorrectState.isSolved &&
        (afterCorrectState.answerLength - afterCorrectState.currentMoveIndex) >= 1
      );

      if (hasOpponentReplyStep) {
        requireCheck('opponent reply state queued', Boolean(afterCorrectState.pendingOpponentMove));
        requireCheck('opponent reply note visible', await isVisibleFast(page.getByTestId('opponent-reply-note')));
      }

      const freezeAttempt = await playExpectedMove(page);
      requireCheck('moves blocked while CORRECT shown', freezeAttempt === false);

      const progressed = await waitForCondition(async () => {
        const state = await getSmokeState(page);
        return state && (
          state.currentMoveIndex !== before.currentMoveIndex ||
          state.isSolved ||
          state.autoAdvanceCountdown !== null
        );
      }, 2500);
      requireCheck('puzzle state progresses after feedback', progressed);

      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
      requireCheck('NEG no dictionary modal pop', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
    }, results);

    await runUseCase('Solved puzzle countdown auto-advances', async ({ requireCheck, check }) => {
      requireCheck('found puzzle with expected move', await preparePlayablePuzzle(page, false), 'Could not find puzzle suitable for solve flow');

      const indexBefore = parseIndexText(await page.getByTestId('puzzle-index').innerText());
      requireCheck('index readable before solve', Boolean(indexBefore));
      requireCheck('has next puzzle available', indexBefore.total > indexBefore.current);

      let solved = false;
      for (let step = 0; step < 8; step += 1) {
        const state = await getSmokeState(page);
        if (state && state.isSolved) {
          solved = true;
          break;
        }

        const played = await playExpectedMove(page);
        check(`solve step ${step + 1} move accepted`, played);
        if (!played) break;

        const reached = await waitForCondition(async () => {
          const s = await getSmokeState(page);
          return s && (s.isSolved || s.moveStatus === 'correct' || s.currentMoveIndex !== state.currentMoveIndex);
        }, 2500);
        check(`solve step ${step + 1} state progressed`, reached);
      }

      const solvedState = await getSmokeState(page);
      solved = solved || Boolean(solvedState && solvedState.isSolved);
      requireCheck('puzzle solved', solved, 'Could not solve puzzle via smoke API');

      const countdownVisible = await isVisibleFast(page.getByTestId('next-countdown'), 2000);
      requireCheck('countdown visible', countdownVisible);

      const blockedDuringCountdown = await playExpectedMove(page);
      requireCheck('moves blocked during countdown', blockedDuringCountdown === false);

      const movedNext = await waitForCondition(async () => {
        const now = parseIndexText(await page.getByTestId('puzzle-index').innerText());
        return now && now.current === indexBefore.current + 1;
      }, 6000);
      requireCheck('auto-advanced to next puzzle', movedNext);

      requireCheck('NEG no countdown after navigation', !(await isVisibleFast(page.getByTestId('next-countdown'))));
      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
    }, results);

    await runUseCase('Next puzzle navigation works', async ({ requireCheck }) => {
      await closeDictionaryModalIfOpen(page);
      const indexText = page.getByTestId('puzzle-index');
      const before = parseIndexText(await indexText.innerText());
      requireCheck('index readable', Boolean(before));
      requireCheck('has more than one puzzle', before.total >= 2);

      await page.getByTestId('next-button').click();
      await page.waitForTimeout(350);
      const after = parseIndexText(await indexText.innerText());
      requireCheck('index still readable after next', Boolean(after));
      requireCheck('next increased index', after.current > before.current, 'Next did not increase puzzle index');

      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
      requireCheck('NEG no dictionary modal open', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
    }, results);

    await runUseCase('Previous puzzle navigation works', async ({ requireCheck }) => {
      await closeDictionaryModalIfOpen(page);
      const indexText = page.getByTestId('puzzle-index');
      const before = parseIndexText(await indexText.innerText());
      requireCheck('index readable', Boolean(before));

      if (before.current <= 1) {
        await page.getByTestId('next-button').click();
        await page.waitForTimeout(350);
      }

      const current = parseIndexText(await indexText.innerText());
      requireCheck('positioned beyond first puzzle', current.current > 1, 'Could not position to validate Previous');

      await page.getByTestId('prev-button').click();
      await page.waitForTimeout(350);
      const after = parseIndexText(await indexText.innerText());
      requireCheck('index readable after previous', Boolean(after));
      requireCheck('previous decreased index', after.current < current.current, 'Previous did not decrease puzzle index');

      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
      requireCheck('NEG no dictionary modal open', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
    }, results);

    await runUseCase('Back to categories works', async ({ requireCheck }) => {
      await page.getByTestId('back-button').click();
      await page.getByRole('heading', { name: 'Chess Puzzles' }).waitFor({ timeout: 5000 });

      requireCheck('category heading visible', true);
      requireCheck('NEG puzzle index hidden', !(await isVisibleFast(page.getByTestId('puzzle-index'))));
      requireCheck('NEG dictionary modal hidden', !(await isVisibleFast(page.getByRole('button', { name: 'Close dictionary' }))));
      requireCheck('NEG no app crash banner', !(await hasErrorBanner(page)));
    }, results);

    const passed = results.filter((r) => r.pass).length;
    const failed = results.length - passed;

    console.log('');
    console.log(`Smoke test summary: ${passed}/${results.length} passed, ${failed} failed.`);

    if (failed > 0) {
      process.exitCode = 1;
    }

    saveResults(results, {
      inProgress: false,
      passed,
      failed,
      total: results.length
    });
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});

    await stopServer(server);
  }
}

main().catch((error) => {
  try {
    saveResults([], { inProgress: false, fatalError: error.message });
  } catch (_) {
    // ignore secondary write errors
  }
  console.error(error);
  process.exit(1);
});
