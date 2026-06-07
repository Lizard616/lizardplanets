(function (global) {
  const registry = Object.create(null);

  function boot(container) {
    const name = container.dataset.model;
    const init = registry[name];
    if (!init) return;
    try {
      init(container);
      container.dataset.webglReady = "1";
    } catch (err) {
      console.error("WebGL model failed:", name, err);
    }
  }

  function flush(name) {
    document
      .querySelectorAll(`.webgl-model[data-model="${name}"]:not([data-webgl-ready])`)
      .forEach(boot);
  }

  function register(name, initFn) {
    registry[name] = initFn;
    flush(name);
  }

  function initAll() {
    document.querySelectorAll(".webgl-model[data-model]:not([data-webgl-ready])").forEach(boot);
  }

  global.WebGLModels = { register, initAll };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})(window);
