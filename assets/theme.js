(function () {
  const nav = document.getElementById("main-nav");
  const menuBtn = document.getElementById("menu-toggle");

  if (nav && menuBtn) {
    menuBtn.addEventListener("click", function () {
      const expanded = nav.classList.toggle("is-open");
      menuBtn.setAttribute("aria-expanded", String(expanded));
    });
  }
})();
