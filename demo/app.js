/* ============================================================
   ScopeLock demo — small interaction layer
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Mobile navigation ---------- */
  var sidebar = document.getElementById("sidebar");
  var menuToggle = document.getElementById("menuToggle");
  var scrim = document.getElementById("scrim");
  var mobile = window.matchMedia("(max-width: 1024px)");

  function setNav(open) {
    sidebar.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    scrim.hidden = !open;
  }

  menuToggle.addEventListener("click", function () {
    setNav(!sidebar.classList.contains("is-open"));
  });

  scrim.addEventListener("click", function () {
    setNav(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setNav(false);
  });

  mobile.addEventListener("change", function (event) {
    if (!event.matches) setNav(false);
  });

  /* ---------- Sidebar navigation state ---------- */
  var navItems = Array.prototype.slice.call(document.querySelectorAll(".nav-item"));

  navItems.forEach(function (item) {
    item.addEventListener("click", function (event) {
      event.preventDefault();
      navItems.forEach(function (other) {
        other.classList.remove("is-active");
        other.removeAttribute("aria-current");
      });
      item.classList.add("is-active");
      item.setAttribute("aria-current", "page");
      if (mobile.matches) setNav(false);
    });
  });

  /* ---------- Job table filtering ---------- */
  var rows = Array.prototype.slice.call(document.querySelectorAll("#jobsBody tr[data-status]"));
  var emptyRow = document.querySelector(".empty-row");
  var footNote = document.querySelector(".foot-note");
  var searchInput = document.getElementById("searchInput");
  var segments = Array.prototype.slice.call(document.querySelectorAll(".seg"));

  var activeFilter = "all";
  var query = "";

  function applyFilters() {
    var shown = 0;

    rows.forEach(function (row) {
      var matchesStatus = activeFilter === "all" || row.dataset.status === activeFilter;
      var matchesQuery = !query || row.textContent.toLowerCase().indexOf(query) !== -1;
      var visible = matchesStatus && matchesQuery;

      row.hidden = !visible;
      if (visible) shown += 1;
    });

    emptyRow.hidden = shown !== 0;
    footNote.textContent = "Showing " + shown + " of 12 jobs";
  }

  segments.forEach(function (segment) {
    segment.addEventListener("click", function () {
      segments.forEach(function (other) {
        other.classList.remove("is-active");
        other.setAttribute("aria-pressed", "false");
      });
      segment.classList.add("is-active");
      segment.setAttribute("aria-pressed", "true");
      activeFilter = segment.dataset.filter;
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      query = searchInput.value.trim().toLowerCase();
      applyFilters();
    });

    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        searchInput.value = "";
        query = "";
        applyFilters();
        searchInput.blur();
      }
    });

    document.addEventListener("keydown", function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  applyFilters();
})();
