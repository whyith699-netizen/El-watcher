// Selectors untuk Moodle 3.x — theme Boost/Classic default.
// Sumber utama: atribut semantik (class .activityname, .instancename), bukan posisi.
export default {
  login: {
    // https://elearning.sma1klaten.sch.id/login/index.php
    form: 'form#login',
    username: 'input#username',
    password: 'input#password',
    submit: 'button#loginbtn, input#loginbtn',
    // Deteksi login gagal: Moodle menampilkan errorbox atau kembali ke form
    error: '.errorbox, .loginerrors, [role="alert"]',
    // Setelah login sukses biasanya redirect ke /my/ atau dashboard
    successIndicator: '.usermenu, #user-menu-toggle, nav.usermenu',
  },
  dashboard: {
    // /my/ — blok "Timeline" / "Upcoming events" / daftar course
    // Fallback utama: blok course overview
    courseList: '.course-section, .course-overview, block_myoverview [data-region="course-view"]',
    // Baris item di timeline block
    timelineItems: '.block_timeline .event-item, .block_timeline [data-region="event-item"]',
    // Kartu activity di course overview
    activityItems: '.course-item, .activity-item',
  },
  calendar: {
    // /calendar/view.php?view=upcoming — event list server-rendered
    upcomingEvents: '#region-main .eventlist .event, .calendar-event-card, [data-region="event-item"]',
    eventTitle: '.event-name, .name, h3, h4',
    eventTime: '.event-time, .date, .mr-1, time',
    eventCourse: '.event-course, .course',
    eventLink: 'a[href*="/mod/"], a[href*="/calendar/event.php"]',
  },
  // Kata kunci prioritas UH (FR-04)
  uhKeywords: ['uh', 'ulangan', 'quiz', 'kuis', 'test', 'ujian', 'ulbi', 'uts', 'uas', 'ph', 'penilaian'],
}
