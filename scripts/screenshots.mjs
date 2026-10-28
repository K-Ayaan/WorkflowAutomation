// Captures the Operate screenshots required by the exercise into Result/.
// Run after the Postman collection (npm run test:api) so the four booking instances exist.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const BASE = 'http://localhost:8088';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'Result');
mkdirSync(outDir, { recursive: true });

const api = async (p, body) => {
  const res = await fetch(BASE + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!res.ok) throw new Error(`${p} -> ${res.status} ${await res.text()}`);
  return res.json();
};

// Map patientId -> root booking instance key (latest one per patient)
const roots = (await api('/v2/process-instances/search', { filter: { processDefinitionId: { $in: ['hospital-booking', 'hospital-booking-propagate-all'] } }, page: { limit: 100 } })).items;
const keyOf = {};
for (const pi of roots) {
  const vars = await api('/v2/variables/search', { filter: { processInstanceKey: pi.processInstanceKey, scopeKey: pi.processInstanceKey, name: 'patientId' } });
  keyOf[JSON.parse(vars.items[0].value)] = pi.processInstanceKey;
}
const children = async (key) => (await api('/v2/process-instances/search', { filter: { parentProcessInstanceKey: key }, sort: [{ field: 'startDate' }] })).items;
const case1 = keyOf['P-1001'], case2 = keyOf['P-1002'], case3 = keyOf['P-1003'], propAll = keyOf['P-1004'];
const [case1Child] = await children(case1);
const case3Children = await children(case3);
const [propAllChild] = await children(propAll);
const [case2Decision] = (await api('/v2/decision-instances/search', { filter: { processInstanceKey: case2 } })).items;
console.log({ case1, case1Child: case1Child.processInstanceKey, case2, case3, case3Children: case3Children.map((c) => c.processInstanceKey), propAll, propAllChild: propAllChild.processInstanceKey, case2Decision: case2Decision.decisionEvaluationInstanceKey });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1250 }, deviceScaleFactor: 1 });

const settle = async (ms = 2500) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.isVisible().catch(() => false)) {
    await gotIt.click();
    await page.waitForTimeout(500);
  }
};
const shot = async (name) => {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('saved', name);
};
const open = async (url, ms) => {
  await page.goto(url.startsWith('http') || url.startsWith('file') ? url : BASE + url);
  await settle(ms);
};
const clickElement = async (elementId, tab) => {
  await page.locator(`[data-element-id="${elementId}"]`).first().click({ force: true });
  await page.waitForTimeout(1200);
  if (tab) {
    await page.getByRole('tab', { name: tab }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
  }
};

// Login
await page.goto(BASE + '/operate/login');
await page.fill('#username', 'demo');
await page.fill('#password', 'demo');
await page.keyboard.press('Enter');
await page.waitForURL(/\/operate(?!\/login)/);
await settle();

await open('/operate');
await shot('01-operate-dashboard');

await open('/operate/processes?active=true&incidents=true&completed=true&canceled=true');
await shot('02-all-process-instances');

// Case 1 – Cardiology, bookedCount 3 → AVAILABLE → booked → confirmation → completed
await open(`/operate/processes/${case1}`);
await shot('03-case1-parent-booking-succeeded');
await clickElement('Call_SendConfirmation', 'Details');
await shot('04-case1-call-activity-links-to-child');
await clickElement('Call_SendConfirmation', 'Input Mappings');
await shot('05-case1-call-activity-input-mappings');
await open(`/operate/processes/${case1Child.processInstanceKey}`);
await shot('06-case1-child-send-notification-propagation-off');

// Case 2 – Cardiology, bookedCount 12 → FULL → slot-full notice
await open(`/operate/processes/${case2}`);
await shot('07-case2-parent-slot-full');
await open(`/operate/decisions/${case2Decision.decisionEvaluationInstanceKey}`);
await shot('08-case2-slot-decision-FULL');

// Case 3 – booking then cancellation message → event subprocess
await open(`/operate/processes/${case3}`);
await shot('09-case3-parent-cancellation-path');
await clickElement('Call_SendCancellation', 'Details');
await shot('10-case3-cancellation-call-activity-links-to-child');
await open(`/operate/processes/${case3Children[1].processInstanceKey}`);
await shot('11-case3-child-cancellation-notification');

// Propagation comparison
await open(`/operate/processes/${propAllChild.processInstanceKey}`);
await shot('12-propagate-all-child-receives-every-parent-variable');
await open(`/operate/processes/${propAll}`);
await shot('13-propagate-all-parent-receives-child-variables');

// Messages delivered by the REST connector, and the Postman/newman run
await open('http://localhost:8090', 500);
await shot('14-telegram-inbox');
await page.setViewportSize({ width: 1680, height: 1250 });
await open(pathToFileURL(path.join(outDir, 'newman-report.html')).href, 1500);
await shot('15-postman-newman-summary');
await page.getByRole('tab', { name: /Total Requests/i }).first().click().catch(() => {});
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(outDir, '16-postman-newman-requests.png'), fullPage: true });
console.log('saved 16-postman-newman-requests');

await browser.close();
