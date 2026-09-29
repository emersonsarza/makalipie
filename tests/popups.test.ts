import assert from "node:assert/strict";
import test from "node:test";
import { defaultBranchSettings, resolveBranch, visibleBranches } from "../src/lib/branches/schema";
import { openPopups, parsePopupSettings, popupClaimsBranch, popupDateRange, popupIsPast, type PopupListing } from "../src/lib/popups/schema";

const today = "2026-09-29";

function listing(overrides: Partial<PopupListing> = {}): PopupListing {
  return {
    id: "sunday-market",
    name: "Sunday Market",
    address: "Ayala Center Cebu",
    mapUrl: "https://maps.example.test/sunday",
    startDate: "2026-10-04",
    endDate: "2026-10-04",
    hours: "10:00 AM – 4:00 PM",
    items: ["Keylime", "Buko"],
    ...overrides,
  };
}

test("a pop-up refuses a last date before the first date", () => {
  assert.throws(
    () => parsePopupSettings({ version: 0, listings: [listing({ startDate: "2026-10-05", endDate: "2026-10-04" })] }),
    /last date/i,
  );
});

test("current and upcoming listings stay public, and a passed last date stays hidden", () => {
  const listings = [
    listing({ id: "later", name: "Later", startDate: "2026-10-11", endDate: "2026-10-12" }),
    listing({ id: "past-stop", name: "Past stop", startDate: "2026-09-20", endDate: "2026-09-28" }),
    listing({ id: "today-stop", name: "Today stop", startDate: "2026-09-28", endDate: today }),
    listing(),
  ];
  assert.equal(popupIsPast(listings[1], today), true);
  assert.deepEqual(openPopups(listings, today).map((item) => item.id), ["today-stop", "sunday-market", "later"]);
  assert.equal(popupDateRange("2026-10-04", "2026-10-04"), "October 4, 2026");
  assert.equal(openPopups([listings[1]], today).length, 0);
});

test("a pop-up id is refused as an online branch while the cart still falls back to a main branch", () => {
  const settings = defaultBranchSettings();
  const ids = visibleBranches(settings).map((branch) => branch.id);
  assert.deepEqual(ids, ["cebu", "manila"]);
  assert.equal(ids.includes("sunday-market"), false);
  assert.equal(popupClaimsBranch("sunday-market", [listing()]), true);
  assert.equal(popupClaimsBranch("cebu", [listing()]), false);
  assert.equal(resolveBranch("sunday-market", settings), "cebu");
});
