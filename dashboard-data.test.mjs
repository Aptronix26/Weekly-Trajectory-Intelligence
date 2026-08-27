import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const governance = await readFile(new URL("./governance.js", import.meta.url), "utf8");
const match = html.match(/const D=(\{.*\});\nconst fmt=/);
assert.ok(match, "dashboard data block must be present");
const data = JSON.parse(match[1]);

const completed = {
  Mac: [1074, 897, 627, 467, 508, 655, 1016, 669],
  iPhone: [2240, 2527, 2386, 2955, 3296, 2952, 4394, 2484],
  iPad: [795, 670, 552, 484, 428, 349, 415, 311],
};

test("completed W1-W8 history matches the workbook", () => {
  for (const [lob, expected] of Object.entries(completed)) {
    assert.deepEqual(data.totals[lob].slice(0, 8), expected);
  }
  assert.equal(data.completedWeeks, 8);
  assert.equal(data.drivers.length, 7);
});

test("W9 live totals reconcile to the displayed model rows", () => {
  const expected = { Mac: 360, iPhone: 1158, iPad: 182 };
  for (const [lob, total] of Object.entries(expected)) {
    assert.equal(data.totals[lob][8], total);
    assert.equal(data.sub[lob].reduce((sum, row) => sum + row.weeks[8], 0), total);
  }
});

test("as-of metadata and live movements are consistent", () => {
  assert.equal(data.latest, "26 Aug 2026");
  assert.equal(data.liveWeek, "W9");
  assert.equal(data.liveDays, 4);
  assert.deepEqual(data.dates[7], { w: "W8", start: "16 Aug", end: "22 Aug" });
  assert.deepEqual(data.dates[8], { w: "W9", start: "23 Aug", end: "29 Aug" });
  for (const lob of Object.keys(completed)) {
    const totals = data.totals[lob];
    for (let i = 1; i < totals.length; i += 1) {
      const expectedMove = (totals[i] / totals[i - 1] - 1) * 100;
      assert.ok(Math.abs(data.moves[lob][i] - expectedMove) < 1e-10);
    }
  }
});

test("every LOB total reconciles to its displayed sub-LOB rows", () => {
  for (const lob of Object.keys(completed)) {
    for (let i = 0; i < data.weeks.length; i += 1) {
      assert.equal(
        data.sub[lob].reduce((sum, row) => sum + row.weeks[i], 0),
        data.totals[lob][i],
        `${lob} ${data.weeks[i]}`,
      );
    }
  }
});

test("new Mac models are included from the validated transaction dumps", () => {
  const macModels = new Map(data.sub.Mac.map(row => [row.name, row.weeks]));
  assert.equal(macModels.get('MBP M5 CTO 14" 2026 1TB')?.[7], 1);
  assert.equal(macModels.get('MBP M5 CTO 16" 2026')?.[8], 1);
});

test("trajectory governance follows dynamic live-week metadata", () => {
  assert.match(governance, /model\.completedWeeks/);
  assert.match(governance, /model\.liveWeek/);
  assert.match(governance, /model\.liveDays/);
  assert.doesNotMatch(governance, /model\.w8Days/);
  assert.doesNotMatch(governance, /length === 8/);
  assert.match(html, /governance\.js\?v=20260827-1/);
});

test("shared intelligence navigation includes all five dashboards", () => {
  assert.match(html, /dashboard-config\.js/);
  assert.match(html, /governance\.css/);
  assert.match(html, /governance\.js/);
  for (const path of [
    "Retail-Sales-MTD",
    "Boardroom-JAS-Weekly",
    "Boardroom-JAS-QTD",
    "Boardroom-JAS-YOY",
    "Weekly-Trajectory-Intelligence",
  ]) {
    assert.match(governance, new RegExp(`aptronix26\\.github\\.io/${path}/`, "i"));
  }
  assert.match(governance, /"weekly-trajectory": trajectoryAudit/);
});
