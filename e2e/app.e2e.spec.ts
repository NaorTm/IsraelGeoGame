import { test, expect, type Page } from '@playwright/test';
import { settlements } from '../src/data/settlements';
import { getSettlementDistrictId } from '../src/utils/districts';

const SOLO_DISTRICT_ID = 'אילת';
const PVP_DISTRICT_ID = 'חיפה';
const MAILPIT_URL = 'http://127.0.0.1:54324/api/v1/messages';

type TestUser = {
  email: string;
  username: string;
  password: string;
};

function districtSettlementMap(districtId: string) {
  return new Map(
    settlements
      .filter((settlement) => getSettlementDistrictId(settlement) === districtId)
      .map((settlement) => [settlement.name_he, settlement.id])
  );
}

const soloSettlements = districtSettlementMap(SOLO_DISTRICT_ID);
const pvpSettlements = districtSettlementMap(PVP_DISTRICT_ID);
const totalPvpRounds = 5;

async function pollForEmailActionLink(email: string, expectedType: 'magiclink' | 'signup') {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const inboxResponse = await fetch(MAILPIT_URL);
    const inbox = (await inboxResponse.json()) as {
      messages: Array<{
        ID: string;
        To: Array<{ Address: string }>;
      }>;
    };

    const messages = inbox.messages
      .filter((entry) => entry.To.some((recipient) => recipient.Address === email))
      .reverse();

    for (const message of messages) {
      const detailsResponse = await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`);
      const details = (await detailsResponse.json()) as { Text?: string };
      const verifyUrls =
        String(details.Text ?? '').match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^\s)]+/g) ?? [];

      for (const verifyUrl of verifyUrls) {
        const url = new URL(verifyUrl);

        if (url.searchParams.get('type') === expectedType) {
          return verifyUrl;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Verification link of type ${expectedType} for ${email} did not arrive in Mailpit.`);
}

async function magicLinkLogin(page: Page, user: TestUser) {
  await page.goto('/profile');
  await page.getByTestId('auth-mode-magic-link').click();
  await page.getByTestId('magic-link-email').fill(user.email);
  await page.getByTestId('magic-link-submit').click();
  await expect(page.getByTestId('auth-message')).toContainText('קישור');

  const verifyUrl = await pollForEmailActionLink(user.email, 'magiclink');
  await page.goto(verifyUrl);
  await expect(page).toHaveURL(/\/profile$/);
}

async function signUpWithPassword(page: Page, user: TestUser) {
  await page.goto('/profile');
  await page.getByTestId('auth-mode-password-signup').click();
  await page.getByTestId('email-signup-email').fill(user.email);
  await page.getByTestId('email-signup-password').fill(user.password);
  await page.getByTestId('email-signup-confirm-password').fill(user.password);
  await page.getByTestId('email-signup-submit').click();
  await expect(page.getByTestId('auth-message')).toContainText('מייל אימות');
}

async function expectPasswordLoginBlockedUntilVerification(page: Page, user: TestUser) {
  await page.goto('/profile');
  await page.getByTestId('auth-mode-password-login').click();
  await page.getByTestId('email-login-email').fill(user.email);
  await page.getByTestId('email-login-password').fill(user.password);
  await page.getByTestId('email-login-submit').click();
  await expect(page.getByTestId('auth-message')).toContainText('עדיין לא אומת');
}

async function verifyEmailSignup(page: Page, email: string) {
  const verifyUrl = await pollForEmailActionLink(email, 'signup');
  await page.goto(verifyUrl);
  await expect(page).toHaveURL(/\/profile$/);
}

async function passwordLogin(page: Page, user: TestUser) {
  await page.goto('/profile');
  await page.getByTestId('auth-mode-password-login').click();
  await page.getByTestId('email-login-email').fill(user.email);
  await page.getByTestId('email-login-password').fill(user.password);
  await page.getByTestId('email-login-submit').click();
}

async function claimUsername(page: Page, username: string) {
  await expect(page.getByTestId('username-form')).toBeVisible();
  await page.getByTestId('username-input').fill(username);
  await page.getByTestId('username-submit').click();
  await expect(page.getByTestId('username-message')).toContainText('נשמר');
  await expect(page.getByTestId('profile-chip')).toContainText(`@${username}`);
}

async function clickSettlement(page: Page, settlementId: string) {
  const target = page.locator(`[data-testid="settlement-${settlementId}"]`).first();
  await expect(target).toBeVisible();
  await target.dispatchEvent('click');
}

async function currentSettlementId(page: Page, mapping: Map<string, string>, testId: string) {
  const settlementName = (await page.getByTestId(testId).textContent())?.trim() ?? '';
  const settlementId = mapping.get(settlementName);

  if (!settlementId) {
    throw new Error(`No settlement id mapped for prompt "${settlementName}".`);
  }

  return settlementId;
}

async function completeSoloSession(page: Page) {
  await page.goto('/solo');
  await page.getByTestId('region-expand-toggle').click();
  await page.locator(`[data-region-id="${SOLO_DISTRICT_ID}"]`).click();
  await page.getByTestId('round-count-5').click();
  await page.getByTestId('solo-start-button').click();
  await expect(page.getByTestId('solo-stage-loading')).toBeVisible();

  for (let round = 0; round < soloSettlements.size; round += 1) {
    const settlementId = await currentSettlementId(page, soloSettlements, 'solo-current-settlement-he');
    await clickSettlement(page, settlementId);
    await expect(page.getByTestId('solo-feedback-next')).toBeVisible();
    await page.getByTestId('solo-feedback-next').click();
  }

  await expect(page.getByTestId('solo-summary')).toBeVisible();
  await expect(page.getByTestId('solo-save-status')).toContainText('נשמר');
}

async function queueForPvp(page: Page) {
  await page.goto('/pvp');
  await page.getByTestId('pvp-district-select').selectOption({ value: PVP_DISTRICT_ID });
  await page.getByTestId('pvp-queue-button').click();
}

function firstWrongSettlement(correctId: string) {
  const options = [...pvpSettlements.values()].filter((settlementId) => settlementId !== correctId);
  const candidate = options[0];

  if (!candidate) {
    throw new Error('No wrong-settlement candidate available for PvP test.');
  }

  return candidate;
}

async function playPvpMatchInBrowser(page: Page, mode: 'perfect' | 'one-miss') {
  for (let round = 1; round <= totalPvpRounds; round += 1) {
    const settlementId = await currentSettlementId(
      page,
      pvpSettlements,
      'pvp-current-settlement-he'
    );

    await expect(page.getByTestId('pvp-me-round-progress')).toContainText(
      `${round}/${totalPvpRounds}`
    );

    if (mode === 'one-miss') {
      await clickSettlement(page, firstWrongSettlement(settlementId));
      await expect(page.getByTestId('pvp-match-message')).toContainText('פספוס');
    }

    await clickSettlement(page, settlementId);

    if (round < totalPvpRounds) {
      await expect(page.getByTestId('pvp-me-round-progress')).toContainText(
        `${round + 1}/${totalPvpRounds}`
      );
    }
  }
}

test.describe.configure({ mode: 'serial' });

test('verified email login, magic link login, solo cloud save, PvP realtime flow, and logout/relogin', async ({ browser }) => {
  test.slow();

  expect(soloSettlements.size).toBeGreaterThanOrEqual(2);
  expect(pvpSettlements.size).toBeGreaterThanOrEqual(5);

  const stamp = Date.now();
  const user1: TestUser = {
    email: `e2e.player1.${stamp}@example.com`,
    username: `e2e_one_${String(stamp).slice(-6)}`,
    password: 'Passw0rd!123',
  };
  const user2: TestUser = {
    email: `e2e.player2.${stamp}@example.com`,
    username: `e2e_two_${String(stamp).slice(-6)}`,
    password: 'Passw0rd!123',
  };

  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  await signUpWithPassword(page1, user1);
  await expectPasswordLoginBlockedUntilVerification(page1, user1);
  await verifyEmailSignup(page1, user1.email);
  await claimUsername(page1, user1.username);

  await page1.getByTestId('logout-button').click();
  await expect(page1.getByTestId('topbar-login-link')).toBeVisible();
  await passwordLogin(page1, user1);
  await expect(page1.getByTestId('profile-chip')).toContainText(`@${user1.username}`);

  await signUpWithPassword(page2, user2);
  await verifyEmailSignup(page2, user2.email);
  await page2.getByTestId('logout-button').click();
  await expect(page2.getByTestId('topbar-login-link')).toBeVisible();
  await magicLinkLogin(page2, user2);
  await claimUsername(page2, user2.username);

  await completeSoloSession(page1);
  await page1.goto('/profile');
  await expect(page1.getByTestId('progress-card')).toContainText(SOLO_DISTRICT_ID);

  await queueForPvp(page1);
  await expect(page1.getByTestId('pvp-queue-searching')).toBeVisible();

  await queueForPvp(page2);
  await expect(page1).toHaveURL(/\/match\//);
  await expect(page2).toHaveURL(/\/match\//);
  await expect(page1.getByTestId('pvp-ready-screen')).toBeVisible();
  await expect(page2.getByTestId('pvp-ready-screen')).toBeVisible();

  await page1.getByTestId('pvp-ready-button').click();
  await expect(page2.getByTestId('pvp-ready-screen')).toContainText('מוכן');

  await page1.reload();
  await expect(page1.getByTestId('pvp-ready-screen')).toBeVisible();
  await expect(page1.getByTestId('pvp-ready-button')).toBeDisabled();
  await expect(page1.getByTestId('pvp-sync-status')).toBeVisible();

  await page2.getByTestId('pvp-ready-button').click();
  await expect(page1.getByTestId('pvp-active-match')).toBeVisible();
  await expect(page2.getByTestId('pvp-active-match')).toBeVisible();

  await page2.reload();
  await expect(page2.getByTestId('pvp-active-match')).toBeVisible();
  await expect(page2.getByTestId('pvp-sync-status')).toBeVisible();
  await expect(page2.getByTestId('pvp-map-loading')).toBeVisible();

  await playPvpMatchInBrowser(page1, 'perfect');

  await expect(page2.getByTestId('pvp-opponent-round-progress')).toContainText(`5/${totalPvpRounds}`);

  await expect(page1.getByTestId('pvp-waiting-for-result')).toBeVisible();

  await page1.reload();
  await expect(page1.getByTestId('pvp-waiting-for-result')).toBeVisible();
  await expect(page1.getByTestId('pvp-sync-status')).toBeVisible();

  await playPvpMatchInBrowser(page2, 'one-miss');

  await expect(page1.getByTestId('pvp-result-screen')).toBeVisible();
  await expect(page2.getByTestId('pvp-result-screen')).toBeVisible();
  await expect(page1.getByTestId('pvp-result-screen')).toContainText(user1.username);
  await expect(page2.getByTestId('pvp-result-screen')).toContainText(user2.username);

  await page1.getByTestId('logout-button').click();
  await expect(page1.getByTestId('topbar-login-link')).toBeVisible();
  await passwordLogin(page1, user1);
  await expect(page1.getByTestId('profile-chip')).toContainText(`@${user1.username}`);

  await context1.close();
  await context2.close();
});
