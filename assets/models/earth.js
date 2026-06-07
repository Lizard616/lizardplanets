(function () {
  const CONFIG_URL = "/assets/models/earth.json";

  function register(config) {
    if (!window.WebGLModels || !window.PlanetRenderer) {
      console.error("Planet renderer dependencies not loaded");
      return;
    }
    window.WebGLModels.register(config.slug, (container) => {
      window.PlanetRenderer.init(container, config);
    });
  }

  fetch(CONFIG_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(register)
    .catch((err) => console.error("Failed to load planet config:", CONFIG_URL, err));
})();
