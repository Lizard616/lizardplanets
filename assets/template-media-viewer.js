(function () {
  function activateView(viewer, view) {
    viewer.querySelectorAll(".template-media-btn").forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    viewer.querySelectorAll(".template-media-panel").forEach((panel) => {
      panel.hidden = panel.dataset.view !== view;
    });

    if (view === "model") {
      window.WebGLModels?.initAll();
      window.dispatchEvent(new Event("resize"));
    }
  }

  function bindViewer(viewer) {
    if (viewer.dataset.mediaBound) return;
    viewer.dataset.mediaBound = "1";

    const defaultView = viewer.dataset.defaultView || "image";
    activateView(viewer, defaultView);

    viewer.addEventListener("click", (event) => {
      const btn = event.target.closest(".template-media-btn");
      if (!btn || !viewer.contains(btn)) return;
      activateView(viewer, btn.dataset.view);
    });
  }

  function init() {
    document.querySelectorAll(".template-media-viewer[data-default-view]").forEach(bindViewer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
