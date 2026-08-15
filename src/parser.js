// Parser DOM dashboard Moodle /my/ + /calendar/view.php?view=upcoming.
// Selector dipisah — mudah diganti saat layout berubah (PRD NFR-05).

export const SELECTORS = {
  // Blok timeline di dashboard Moodle standar.
  timelineItems: ".block_timeline [data-region='event-list'] [data-region='event-item']",
  itemLink: "a[data-region='event-list-link'], a.aabtn, a[href*='/mod/']",
  itemText: ".text-truncate, .d-md-block",
  itemDate: "[data-region='event-time']",
  courseName: ".coursename, .text-truncate span",
  // Kalender upcoming (fallback / sumber tambahan).
  calEvent: ".calendar-event-card, .event-card, .event",
  // Indikator dashboard selesai muat.
  dashboardReady: ".block_timeline, [data-region='blocks']",
  // Deteksi elemen login.
  loginError: ".loginerrors, [role='alert']",
  loginForm: "#login",
};

// Ekstrak daftar item mentah dari halaman (dijalankan di browser via page.$$eval).
export async function extractTimeline(page) {
  return page.evaluate((sel) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const out = [];
    const nodes = document.querySelectorAll(sel.timelineItems);
    for (const n of nodes) {
      const link = n.querySelector("a[href*='/mod/']") || n.querySelector("a[href]");
      if (!link) continue;
      const href = link.href || "";
      if (!href.includes("/mod/")) continue;
      const title = norm(link.textContent) || norm(n.textContent);
      const dateEl = n.querySelector("[data-region='event-time'], .text-truncate + .text-muted, .text-muted");
      const courseEl = n.querySelector(".coursename");
      // .text-truncate kedua sering berisi nama course di item timeline Moodle 3.9+.
      const truncates = Array.from(n.querySelectorAll(".text-truncate"));
      const course = norm(courseEl?.textContent) || norm(truncates[1]?.textContent) || "";
      const dateText = norm(dateEl?.textContent) || "";
      out.push({ title, url: href, course, dateText });
    }
    return out;
  }, SELECTORS);
}

// Kalender upcoming: baris event "name — course, tanggal".
export async function extractCalendar(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const out = [];
    // Kedua pola: kartu event modern dan tabel klasik.
    const rows = document.querySelectorAll(".calendar-event-card, .event, .eventlist .event");
    for (const r of rows) {
      const link = r.querySelector("a[href*='/mod/']");
      if (!link) continue;
      const name = norm(r.querySelector(".event-name, h3, .name, a")?.textContent) || norm(link.textContent);
      const course = norm(r.querySelector(".course-link, .course, .event-course")?.textContent);
      const dateText = norm(r.querySelector(".event-time, .date, time, .description ")?.textContent);
      out.push({ title: name, url: link.href, course, dateText });
    }
    // Tabel klasik upcoming_events.
    document.querySelectorAll("table#upcoming-events-table tr, .eventlist .event").forEach(() => {});
    return out;
  });
}

// Gabung dua sumber, dedup by URL.
export function mergeSources(timeline, calendar) {
  const byUrl = new Map();
  for (const it of [...timeline, ...calendar]) {
    if (!it.url) continue;
    if (!byUrl.has(it.url)) byUrl.set(it.url, it);
    else {
      const prev = byUrl.get(it.url);
      byUrl.set(it.url, {
        ...prev,
        course: prev.course || it.course,
        dateText: prev.dateText || it.dateText,
      });
    }
  }
  return [...byUrl.values()];
}
