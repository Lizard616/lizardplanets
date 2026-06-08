(function (global) {
  // Vanilla WebGL 2 planet renderer (no engine). Driven by per-planet JSON config.
  //
  // Each frame runs a three-pass pipeline:
  //   Pass 1 — Draw the planet into an off-screen framebuffer (FBO).
  //   Pass 2 — Full-screen atmosphere post-process (planet FBO → canvas).
  //   Pass 3 — Composite the ring on top, discarding fragments behind the planet.
  //
  // WebGL is a state machine: you configure buffers, shaders, textures, and
  // uniforms, then issue draw calls. The GPU runs vertex shaders (per vertex)
  // and fragment shaders (per pixel) in parallel.

  function normalizeConfig(raw) {
    const ringUrl = raw.textures?.ring ?? null;
    const ringEnabled = Boolean(ringUrl);
    const atm = raw.atmosphere ?? {};
    const scaleHeights = atm.scaleHeights ?? {};
    const coefficients = atm.coefficients ?? {};
    const camera = raw.camera ?? {};
    const initial = camera.initial ?? {};
    const sun = raw.sun ?? {};
    const animation = raw.animation ?? {};
    const mesh = raw.mesh ?? {};
    const body = raw.body ?? {};
    const ring = raw.ring ?? {};

    return {
      slug: raw.slug ?? "planet",
      displayName: raw.displayName ?? raw.slug ?? "Planet",
      textures: {
        day: raw.textures?.day ?? "",
        secb: raw.textures?.secb ?? "",
      },
      ring: {
        enabled: ringEnabled,
        texture: ringUrl,
        innerRadius: ring.innerRadius ?? 1.22,
        outerRadius: ring.outerRadius ?? 5.51,
        segments: ring.segments ?? 128,
      },
      body: {
        planetRadius: body.planetRadius ?? 1.0,
        atmosphereRadius: body.atmosphereRadius ?? 1.016,
      },
      atmosphere: {
        scaleHeights: {
          rayleigh: scaleHeights.rayleigh ?? 8 / 6371,
          mie: scaleHeights.mie ?? 1.2 / 6371,
          ozone: scaleHeights.ozone ?? 25 / 6371,
          ozoneFalloff: scaleHeights.ozoneFalloff ?? 5 / 6371,
        },
        coefficients: {
          rayleigh: coefficients.rayleigh ?? [36.9518, 86.0085, 210.8801],
          mie: coefficients.mie ?? [24.8469, 24.8469, 24.8469],
          ozone: coefficients.ozone ?? [3.8226, 11.4678, 0.541535],
        },
        mieG: atm.mieG ?? 0.8,
        sunIntensity: atm.sunIntensity ?? 20.0,
        exposure: atm.exposure ?? 1.2,
        saturation: atm.saturation ?? 1.2,
      },
      bump: {
        strength: body.bumpStrength ?? 3.0,
        useNormals: body.bumpUseNormals ?? false,
      },
      camera: {
        initialDistance: initial.distance ?? 2.6,
        initialPhi: initial.phi ?? 0.3,
        initialTheta: initial.theta ?? 0.5,
        minDistance: camera.minDistance ?? 1.12,
        maxDistance: camera.maxDistance ?? 8,
        drag: camera.drag ?? 0.005,
        zoom: camera.zoom ?? 0.002,
        damping: camera.damping ?? 5.5,
        throw: camera.throw ?? 0.32,
      },
      sun: {
        orbitSpeed: sun.orbitSpeed ?? 0.06,
        elevation: sun.elevation ?? 0.25,
      },
      animation: {
        cloudScrollSpeed: animation.cloudScrollSpeed ?? 0.0005,
      },
      mesh: {
        sphereResolution: mesh.sphereResolution ?? 64,
      },
    };
  }

  function resolveAssetUrl(url) {
    const raw = String(url || "").trim();
    if (!raw || /^https?:\/\//i.test(raw) || !raw.startsWith("/")) return raw;
    const base = document.documentElement.dataset.base || "/";
    return `${base.replace(/\/$/, "")}${raw}`;
  }

  function init(container, rawConfig) {
    const cfg = normalizeConfig(rawConfig);
    cfg.textures.day = resolveAssetUrl(cfg.textures.day);
    cfg.textures.secb = resolveAssetUrl(cfg.textures.secb);
    if (cfg.ring.texture) cfg.ring.texture = resolveAssetUrl(cfg.ring.texture);
    const canvas = container.querySelector(".webgl-model-canvas");
    if (!canvas) return;

    // Acquire a WebGL 2 rendering context bound to the <canvas>.
    // All subsequent gl.* calls operate on this context until another is created.
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) {
      container.innerHTML = '<p class="webgl-model-error">WebGL 2 is required</p>';
      return;
    }

    // ── Textures ──────────────────────────────────────────────────────────────
    // A texture is GPU-resident image data sampled by fragment shaders.
    // WebGL uses binding points: gl.bindTexture selects which texture receives
    // the next operation. Shaders reference textures by "unit" index (0–N).
    function loadTexture(url) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);

      // Upload a 1×1 gray pixel immediately so the shader has valid data
      // before the async image fetch completes (avoids black/unbound texture).
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([64, 64, 64, 255])
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // REPEAT on S lets cloud UVs scroll past the seam; CLAMP on T avoids poles.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        // Mipmaps are pre-filtered downscaled copies; trilinear filtering reduces
        // aliasing when the texture is minified (viewed at a sharp angle / far away).
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      };
      img.onerror = () => console.warn("Failed to load texture:", url);
      img.src = url;
      return tex;
    }

    function createRingStubTexture() {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0])
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return tex;
    }

    function loadRingTexture(url) {
      const tex = createRingStubTexture();

      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      };
      img.onerror = () => console.warn("Failed to load texture:", url);
      img.src = url;
      return tex;
    }

    const texDay = loadTexture(cfg.textures.day);
    const texSecb = loadTexture(cfg.textures.secb);
    const texRing = cfg.ring.enabled
      ? loadRingTexture(cfg.ring.texture)
      : createRingStubTexture();

    // ── PASS 1 shaders: textured planet surface ───────────────────────────────
    // Vertex shader — runs once per mesh vertex.
    //   • Reads attributes (aPos, aNorm, aUV) from bound vertex buffers.
    //   • Writes gl_Position (clip space) and varyings interpolated to fragments.
    // Fragment shader — runs once per rasterized pixel inside each triangle.
    //   • Samples textures, computes lighting, writes fragColor.
    const vsPlanet = `#version 300 es
    in vec3 aPos;
    in vec3 aNorm;
    in vec2 aUV;
    uniform mat4 uModel;
    uniform mat4 uMVP;
    out vec2 vUV;
    out vec3 vNormalW;
    out vec3 vTangentW;
    out vec3 vBitangentW;
    out vec3 vPositionW;
    void main(){
      // Flip U to match our mesh UV layout (reference project flips in Babylon too).
      vUV = vec2(1.0 - aUV.x, aUV.y);
      // Sphere tangent frame from UV parametrization (for bump mapping from SECB alpha).
      float phi = aUV.x * 6.2831853;
      float theta = aUV.y * 3.14159265;
      float sinT = sin(theta), cosT = cos(theta);
      float sinP = sin(phi), cosP = cos(phi);
      vec3 dPdu = vec3(-sinT * sinP, 0.0, sinT * cosP);
      vec3 dPdv = vec3(cosT * cosP, -sinT, cosT * sinP);
      vTangentW = normalize((uModel * vec4(-dPdu, 0.0)).xyz);
      vBitangentW = normalize((uModel * vec4(dPdv, 0.0)).xyz);
      // Transform normal to world space (w=0 skips translation). Used for lighting.
      vNormalW = normalize((uModel * vec4(aNorm, 0.0)).xyz);
      // World position (w=1) — needed for view-dependent specular highlights.
      vPositionW = (uModel * vec4(aPos, 1.0)).xyz;
      // MVP matrix chain: model → view → projection → clip space [-1,1]³.
      gl_Position = uMVP * vec4(aPos, 1.0);
    }`;

    const fsPlanet = `#version 300 es
    precision highp float;
    in vec2 vUV;
    in vec3 vNormalW;
    in vec3 vTangentW;
    in vec3 vBitangentW;
    in vec3 vPositionW;
    uniform sampler2D uDayTexture;
    uniform sampler2D uSecbTexture;
    uniform sampler2D uRingTexture;
    uniform float uRingInnerR;
    uniform float uRingOuterR;
    uniform vec3 uSunDir;
    uniform vec3 uCameraPos;
    uniform vec3 uRC;
    uniform float uTime;
    uniform float uCloudScrollSpeed;
    uniform float uBumpStrength;
    uniform bool uBumpUseNormals;
    out vec4 fragColor;

    float ringShadow(vec3 ro, vec3 rd){
      if(abs(rd.y) < 1e-4) return 1.0;
      float t = -ro.y / rd.y;
      if(t <= 0.0) return 1.0;
      vec3 hit = ro + rd * t;
      float r = length(hit.xz);
      if(r < uRingInnerR || r > uRingOuterR) return 1.0;
      float u = (r - uRingInnerR) / (uRingOuterR - uRingInnerR);
      float v = atan(hit.z, hit.x) * 0.159154943;
      v = v - floor(v);
      vec4 tex = texture(uRingTexture, vec2(u, v));
      float opacity = tex.a * max(max(tex.r, tex.g), tex.b);
      return 1.0 - opacity;
    }

    void main(){
      vec4 secb = texture(uSecbTexture, vUV);
      vec2 cloudUV = vUV - vec2(uTime * uCloudScrollSpeed, 0.0);
      float cloudMask = texture(uSecbTexture, cloudUV).b;
      float cloudShadeSurface = pow(cloudMask, 0.5);
      float emissionObstruction = cloudShadeSurface * cloudShadeSurface;
      float emissionFactor = 1.0 - emissionObstruction;

      // --- Cloud shadow on surface (sun → tangent-plane UV offset) ---
      // Use unnormalized sunTangent so offset → 0 at subsolar (avoids noon lensing
      // from normalizing a near-zero tangent direction).
      vec3 sunDir = normalize(uSunDir);
      float ringVis = ringShadow(vPositionW, sunDir);
      vec3 sunTangent = sunDir - vNormalW * dot(sunDir, vNormalW);
      float muSunElev = max(dot(vNormalW, sunDir), 0.0);
      float shadowStretch = mix(1.0, 1.0 / max(muSunElev, 0.18), smoothstep(0.8, 0.3, muSunElev));
      float shadowDist = 0.001 * shadowStretch;
      vec2 shadowUV = cloudUV
        + vec2(dot(sunTangent, vTangentW), dot(sunTangent, vBitangentW)) * shadowDist;
      float cloudShade = texture(uSecbTexture, shadowUV).b;
      cloudShade = pow(cloudShade, 0.5);
      float shadowStrength = cloudShade * cloudShade;
      float shadowFactor = 1.0 - shadowStrength;

      // --- Surface bump/displacement (SECB alpha; surface layer only) ---
      vec2 texel = 1.0 / vec2(textureSize(uSecbTexture, 0));
      float hX = texture(uSecbTexture, vUV + vec2(texel.x, 0.0)).a
               - texture(uSecbTexture, vUV - vec2(texel.x, 0.0)).a;
      float hY = texture(uSecbTexture, vUV + vec2(0.0, texel.y)).a
               - texture(uSecbTexture, vUV - vec2(0.0, texel.y)).a;
      vec3 bumpedNormal = normalize(vNormalW - uBumpStrength * (hX * vTangentW + hY * vBitangentW));
      float height = (texture(uSecbTexture, vUV).a - 0.5) * uBumpStrength * 0.05;
      vec3 surfacePos = uBumpUseNormals ? vPositionW : vPositionW + vNormalW * height;
      vec3 surfaceNormal = uBumpUseNormals ? vNormalW : bumpedNormal;

      // --- Surface: day diffuse + night emission (SECB green) ---
      vec3 dayColor = texture(uDayTexture, vUV).rgb;
      vec3 nightColor = vec3(secb.g);
      float surfaceNdl = dot(surfaceNormal, uSunDir);

      dayColor *= max(surfaceNdl, 0.0) * shadowFactor * ringVis;
      float nightSide = 1.0 - smoothstep(-0.05, 0.15, surfaceNdl);
      vec3 surfaceColor = dayColor + nightColor * nightSide * emissionFactor;

      // --- Surface specular (SECB red = ocean mask; tight glossy highlight) ---
      vec3 viewDirectionW = normalize(uCameraPos - surfacePos);
      vec3 halfVectorW = normalize(viewDirectionW + sunDir);
      float specComp = max(0.0, dot(surfaceNormal, halfVectorW));
      specComp = pow(specComp, 128.0) * 1.35;
      float ndv = max(0.0, dot(surfaceNormal, viewDirectionW));
      float oceanFresnel = pow(1.0 - ndv, 4.0) * 0.2;

      // Rayleigh complement hue; desaturated at noon, more saturated toward terminator.
      vec3 rayleighHue = uRC / max(max(uRC.r, uRC.g), uRC.b);
      vec3 specTint = vec3(1.0) - rayleighHue;
      specTint /= max(max(specTint.r, specTint.g), specTint.b);
      float muSun = max(0.0, surfaceNdl);
      float specSat = smoothstep(0.06, 0.78, 1.0 - muSun);
      vec3 specColor = mix(vec3(1.0), specTint, specSat);

      surfaceColor += secb.r * specColor * (specComp + oceanFresnel) * shadowFactor * ringVis;

      // --- Cloud layer: matte diffuse on top (no bump, no specular) ---
      float cloudAlpha = cloudShadeSurface;
      float cloudNdl = dot(vNormalW, uSunDir);
      float cloudDay = smoothstep(-0.12, 0.08, cloudNdl);
      float cloudDiffuse = mix(0.03, 0.12 + 0.88 * max(cloudNdl, 0.0), cloudDay) * ringVis;
      vec3 cloudColor = vec3(0.92) * cloudDiffuse;
      cloudAlpha *= mix(0.4, 1.0, cloudDay);
      vec3 finalColor = cloudColor * cloudAlpha + surfaceColor * (1.0 - cloudAlpha);

      fragColor = vec4(finalColor, 1.0);
    }`;

    const vsRing = `#version 300 es
    in vec3 aPos;
    in vec2 aUV;
    uniform mat4 uMVP;
    out vec2 vUV;
    out vec3 vPositionW;
    void main(){
      vUV = aUV;
      vPositionW = aPos;
      gl_Position = uMVP * vec4(aPos, 1.0);
    }`;

    const fsRing = `#version 300 es
    precision highp float;
    in vec2 vUV;
    in vec3 vPositionW;
    uniform sampler2D uRingTexture;
    uniform vec3 uSunDir;
    uniform vec3 uCameraPos;
    uniform float uPlanetR;
    out vec4 fragColor;

    bool planetBlocksView(vec3 ro, vec3 rd, float tMax, float R){
      vec3 oc = ro;
      float b = dot(oc, rd);
      float c = dot(oc, oc) - R * R;
      float disc = b * b - c;
      if(disc <= 0.0) return false;
      float tEnter = -b - sqrt(disc);
      return tEnter > 0.001 && tEnter < tMax - 0.001;
    }

    // Sun reaches this ring point (planet umbra on the ring plane).
    float ringSunOpen(vec3 p, vec3 sunDir, float R){
      vec3 oc = p;
      float b = dot(oc, sunDir);
      float c = dot(oc, oc) - R * R;
      float disc = b * b - c;
      if(disc <= 0.0) return 1.0;
      float tEnter = -b - sqrt(disc);
      return step(tEnter, 0.002);
    }

    void main(){
      vec3 toFrag = vPositionW - uCameraPos;
      float fragDist = length(toFrag);
      if(fragDist < 0.001) discard;
      vec3 rayDir = toFrag / fragDist;
      if(planetBlocksView(uCameraPos, rayDir, fragDist, uPlanetR)) discard;

      vec4 tex = texture(uRingTexture, vUV);
      float density = tex.a;
      if(density < 0.02) discard;

      vec3 sunDirN = normalize(uSunDir);

      // Full texture brightness whenever the sun reaches this point; only planet shadow dims it.
      float sunOpen = ringSunOpen(vPositionW, sunDirN, uPlanetR);
      vec3 color = tex.rgb * sunOpen;
      fragColor = vec4(color, density);
    }`;

    // ── PASS 2 shaders: full-screen atmospheric scattering post-process ─────
    // Instead of 3D geometry, we draw a single quad covering the viewport.
    // The fragment shader reconstructs a world-space ray per pixel using the
    // depth buffer from pass 1, then integrates volumetric scattering along it.
    const vsAtmo = `#version 300 es
    in vec2 aPos;
    out vec2 vUV;
    void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const fsAtmo = `#version 300 es
    precision highp float;
    #define PI 3.1415926535897932
    #define POINTS_FROM_CAMERA 16
    #define OPTICAL_DEPTH_POINTS 8

    in vec2 vUV;
    uniform sampler2D uScene;
    uniform sampler2D uDepth;
    uniform sampler2D uRingTexture;
    uniform mat4 uInvProj;
    uniform mat4 uInvView;
    uniform vec3 uCamPos;
    uniform vec3 uSunPos;
    uniform vec3 uPlanetPos;
    uniform float uPlanetR;
    uniform float uAtmoR;
    uniform float uRingInnerR;
    uniform float uRingOuterR;
    uniform float uRH;
    uniform vec3 uRC;
    uniform float uMH;
    uniform vec3 uMC;
    uniform float uMG;
    uniform float uOH;
    uniform vec3 uOC;
    uniform float uOF;
    uniform float uSunIntensity;
    uniform float uExposure;
    uniform float uSaturation;
    out vec4 fragColor;

    // Unproject a screen UV + depth value back to world space.
    // Inverse projection/view undo the camera transform for ray marching.
    vec3 worldFromUV(vec2 UV, float depth){
      vec4 ndc = vec4(UV * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 posVS = uInvProj * ndc;
      posVS /= posVS.w;
      return (uInvView * vec4(posVS.xyz, 1.0)).xyz;
    }

    vec3 acesTonemap(vec3 color){
      mat3 m1 = mat3(
        0.59719, 0.07600, 0.02840,
        0.35458, 0.90834, 0.13383,
        0.04823, 0.01566, 0.83777
      );
      mat3 m2 = mat3(
        1.60475, -0.10208, -0.00327,
        -0.53108, 1.10813, -0.07276,
        -0.07367, -0.00605, 1.07602
      );
      vec3 v = m1 * color;
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return clamp(m2 * (a / b), 0.0, 1.0);
    }

    bool rayIntersectSphere(vec3 ro, vec3 rd, vec3 cen, float R, out float t0, out float t1){
      vec3 oc = ro - cen;
      float b = 2.0 * dot(oc, rd);
      float c = dot(oc, oc) - R * R;
      float d = b * b - 4.0 * c;
      if(d < 0.0) return false;
      float sq = sqrt(d);
      t0 = (-b - sq) * 0.5;
      t1 = (-b + sq) * 0.5;
      return t1 >= 0.0;
    }

    float ringShadow(vec3 ro, vec3 rd){
      if(abs(rd.y) < 1e-4) return 1.0;
      float t = -ro.y / rd.y;
      if(t <= 0.0) return 1.0;
      vec3 hit = ro + rd * t;
      float r = length(hit.xz);
      if(r < uRingInnerR || r > uRingOuterR) return 1.0;
      float u = (r - uRingInnerR) / (uRingOuterR - uRingInnerR);
      float v = atan(hit.z, hit.x) * 0.159154943;
      v = v - floor(v);
      vec4 tex = texture(uRingTexture, vec2(u, v));
      float opacity = tex.a * max(max(tex.r, tex.g), tex.b);
      return 1.0 - opacity;
    }

    vec3 densityAtPoint(vec3 p){
      float h = length(p - uPlanetPos) - uPlanetR;
      vec3 dens = vec3(exp(-h / vec2(uRH, uMH)), 0.0);
      float denom = (uOH - h) / uOF;
      dens.z = (1.0 / (denom * denom + 1.0)) * dens.x;
      return dens;
    }

    vec3 opticalDepth(vec3 ro, vec3 rd, float len){
      float step = len / (float(OPTICAL_DEPTH_POINTS) - 1.0);
      vec3 p = ro;
      vec3 acc = vec3(0.0);
      for(int i = 0; i < OPTICAL_DEPTH_POINTS; i++){
        acc += densityAtPoint(p) * step;
        p += rd * step;
      }
      return acc;
    }

    vec3 calculateLight(vec3 ro, vec3 rd, float len, vec3 originalColor){
      vec3 p = ro;
      vec3 sunDir = normalize(uSunPos - uPlanetPos);
      float step = len / (float(POINTS_FROM_CAMERA) - 1.0);
      vec3 inR = vec3(0.0), inM = vec3(0.0), totOD = vec3(0.0);

      for(int i = 0; i < POINTS_FROM_CAMERA; i++){
        float sunLen = uAtmoR - length(p - uPlanetPos);
        float t0, t1;
        if(rayIntersectSphere(p, sunDir, uPlanetPos, uAtmoR, t0, t1)) sunLen = t1;
        vec3 sunOD = opticalDepth(p, sunDir, sunLen);
        vec3 viewOD = opticalDepth(p, -rd, step * float(i));
        vec3 T = exp(
          -uRC * (sunOD.x + viewOD.x)
          -uMC * (sunOD.y + viewOD.y)
          -uOC * (sunOD.z + viewOD.z)
        );
        float ringVis = ringShadow(p, sunDir);
        vec3 dens = densityAtPoint(p);
        totOD += dens * step;
        inR += dens.x * T * step * ringVis;
        inM += dens.y * T * step * ringVis;
        p += rd * step;
      }

      float ct = dot(rd, sunDir);
      float ct2 = ct * ct;
      float phR = 3.0 / (16.0 * PI) * (1.0 + ct2);
      float g = uMG, g2 = g * g;
      float phM = (3.0 * (1.0 - g2) / (2.0 * (2.0 + g2))) * ((1.0 + ct2) / pow(1.0 + g2 - 2.0 * g * ct, 1.5));
      inR *= phR * uRC;
      inM *= phM * uMC;
      vec3 opacity = exp(-(uMC * totOD.y + uRC * totOD.x + uOC * totOD.z));
      return (inR + inM) * uSunIntensity + originalColor * opacity;
    }

    vec3 scatter(vec3 originalColor, vec3 ro, vec3 rd, float maxDist){
      float tEnter, tExit;
      // Ray–atmosphere intersection: march only between entry and exit (or geometry).
      if(!rayIntersectSphere(ro, rd, uPlanetPos, uAtmoR, tEnter, tExit)) return originalColor;
      tEnter = max(0.0, tEnter);
      tExit = min(maxDist, tExit);
      float dist = max(0.0, tExit - tEnter);
      return calculateLight(ro + rd * tEnter, rd, dist, originalColor);
    }

    void main(){
      // Read pass-1 outputs: lit planet color and per-pixel depth [0,1].
      vec3 screenColor = texture(uScene, vUV).rgb;
      float depth = texture(uDepth, vUV).r;
      // Build view ray from camera through this pixel; maxDist stops at geometry.
      vec3 deepestPoint = worldFromUV(vUV, depth) - uCamPos;
      float maxDist = length(deepestPoint);
      vec3 rayDir = deepestPoint / maxDist;

      float t0, t1;
      if(rayIntersectSphere(uCamPos, rayDir, uPlanetPos, uPlanetR, t0, t1)){
        // Always integrate atmosphere to the near planet surface when the ray
        // hits it. The depth buffer can stop at the ring plane even though the
        // planet is visible through transparent ring gaps.
        maxDist = t0;
      }

      vec3 color = scatter(screenColor, uCamPos, rayDir, maxDist);
      color *= uExposure;
      color = acesTonemap(color);
      color = mix(vec3(0.299, 0.587, 0.114) * color, color, uSaturation);
      fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }`;

    // ── Shader programs ───────────────────────────────────────────────────────
    // Shaders are compiled separately, then linked into a program object.
    // Only linked programs can be activated with gl.useProgram().
    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        throw new Error("Shader compile failed");
      }
      return s;
    }

    function link(vs, fs) {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(p));
        throw new Error("Program link failed");
      }
      return p;
    }

    const planetProg = link(compile(gl.VERTEX_SHADER, vsPlanet), compile(gl.FRAGMENT_SHADER, fsPlanet));
    const ringProg = link(compile(gl.VERTEX_SHADER, vsRing), compile(gl.FRAGMENT_SHADER, fsRing));
    const atmoProg = link(compile(gl.VERTEX_SHADER, vsAtmo), compile(gl.FRAGMENT_SHADER, fsAtmo));

    // ── Geometry: unit sphere mesh ────────────────────────────────────────────
    // Positions, normals, and UVs live in separate buffer objects (VBOs).
    // Indices (EBO) let us reuse vertices instead of duplicating shared corners.
    function buildSphere(res) {
      const pos = [], norm = [], uv = [], idx = [];
      for (let j = 0; j <= res; j++) {
        const th = (j / res) * Math.PI;
        for (let i = 0; i <= res; i++) {
          const ph = (i / res) * 2 * Math.PI;
          const x = Math.sin(th) * Math.cos(ph);
          const y = Math.cos(th);
          const z = Math.sin(th) * Math.sin(ph);
          pos.push(x, y, z);
          norm.push(x, y, z);
          uv.push(i / res, j / res);
        }
      }
      for (let j = 0; j < res; j++) {
        for (let i = 0; i < res; i++) {
          const a = j * (res + 1) + i;
          const b = a + 1, c = a + (res + 1), d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      return {
        pos: new Float32Array(pos),
        norm: new Float32Array(norm),
        uv: new Float32Array(uv),
        idx: new Uint32Array(idx),
      };
    }

    function buildRing(innerR, outerR, segments) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = t * 2 * Math.PI;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        pos.push(cos * innerR, 0, sin * innerR);
        uv.push(0, t);
        pos.push(cos * outerR, 0, sin * outerR);
        uv.push(1, t);
      }
      for (let i = 0; i < segments; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
      return {
        pos: new Float32Array(pos),
        uv: new Float32Array(uv),
        idx: new Uint32Array(idx),
      };
    }

    const sph = buildSphere(cfg.mesh.sphereResolution);
    const ring = cfg.ring.enabled
      ? buildRing(cfg.ring.innerRadius, cfg.ring.outerRadius, cfg.ring.segments)
      : null;
    function mkBuf(type, data) {
      const buf = gl.createBuffer();
      gl.bindBuffer(type, buf);
      // STATIC_DRAW hints the driver: upload once, read many times on GPU.
      gl.bufferData(type, data, gl.STATIC_DRAW);
      return buf;
    }

    const posBuf = mkBuf(gl.ARRAY_BUFFER, sph.pos);
    const normBuf = mkBuf(gl.ARRAY_BUFFER, sph.norm);
    const uvBuf = mkBuf(gl.ARRAY_BUFFER, sph.uv);
    const idxBuf = mkBuf(gl.ELEMENT_ARRAY_BUFFER, sph.idx);
    const ringPosBuf = ring ? mkBuf(gl.ARRAY_BUFFER, ring.pos) : null;
    const ringUvBuf = ring ? mkBuf(gl.ARRAY_BUFFER, ring.uv) : null;
    const ringIdxBuf = ring ? mkBuf(gl.ELEMENT_ARRAY_BUFFER, ring.idx) : null;
    // Full-screen quad for pass 2 (clip-space corners → UVs in vertex shader).
    const quadBuf = mkBuf(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));

    // ── Framebuffer object (FBO) ──────────────────────────────────────────────
    // An FBO redirects rendering away from the canvas into textures.
    // Pass 1 writes color + depth here; pass 2 samples them as input.
    let fbo = null, fboColor = null, fboDepth = null, fboW = 0, fboH = 0;
    function ensureFBO(w, h) {
      if (w <= 0 || h <= 0) return;
      if (fboW === w && fboH === h) return;
      fboW = w;
      fboH = h;
      if (fbo) {
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(fboColor);
        gl.deleteTexture(fboDepth);
      }

      // Color attachment: RGBA8 stores the lit planet image.
      fboColor = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, fboColor);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Depth attachment: float depth lets pass 2 sample exact surface distance.
      // NEAREST filtering — depth is data, not a color to interpolate across taps.
      fboDepth = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, fboDepth);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, w, h, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboColor, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, fboDepth, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("FBO incomplete");
      }
      // null = default framebuffer (the canvas itself).
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // ── Math: camera matrices ───────────────────────────────────────────────────
    // Column-major 4×4 matrices match GLSL's mat4 layout.
    //   projection — perspective frustum (FOV, aspect, near/far clip planes)
    //   view       — camera position/orientation (inverse of world transform)
    //   MVP        — model × view × projection, sent to the vertex shader
    function mat4() { return new Float32Array(16); }
    function identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; }
    function perspective(fov, asp, n, f, o) {
      const t = 1 / Math.tan(fov / 2), nf = 1 / (n - f);
      o.fill(0);
      o[0] = t / asp; o[5] = t; o[10] = (f + n) * nf; o[11] = -1; o[14] = 2 * f * n * nf;
      return o;
    }
    function lookAt(e, c, u, o) {
      let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2];
      const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
      let sx = fy * u[2] - fz * u[1], sy = fz * u[0] - fx * u[2], sz = fx * u[1] - fy * u[0];
      const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
      const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
      o[0] = sx; o[1] = ux; o[2] = -fx; o[3] = 0;
      o[4] = sy; o[5] = uy; o[6] = -fy; o[7] = 0;
      o[8] = sz; o[9] = uz; o[10] = -fz; o[11] = 0;
      o[12] = -(sx * e[0] + sy * e[1] + sz * e[2]);
      o[13] = -(ux * e[0] + uy * e[1] + uz * e[2]);
      o[14] = fx * e[0] + fy * e[1] + fz * e[2];
      o[15] = 1;
      return o;
    }
    function mulMat(a, b, o) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += a[i + k * 4] * b[k + j * 4];
          o[i + j * 4] = s;
        }
      }
      return o;
    }
    function invertMat(m, o) {
      const a = m;
      const b00 = a[0] * a[5] - a[4] * a[1], b01 = a[0] * a[9] - a[8] * a[1], b02 = a[0] * a[13] - a[12] * a[1];
      const b03 = a[4] * a[9] - a[8] * a[5], b04 = a[4] * a[13] - a[12] * a[5], b05 = a[8] * a[13] - a[12] * a[9];
      const b06 = a[2] * a[7] - a[6] * a[3], b07 = a[2] * a[11] - a[10] * a[3], b08 = a[2] * a[15] - a[14] * a[3];
      const b09 = a[6] * a[11] - a[10] * a[7], b10 = a[6] * a[15] - a[14] * a[7], b11 = a[10] * a[15] - a[14] * a[11];
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return;
      det = 1 / det;
      o[0] = (a[5] * b11 - a[9] * b10 + a[13] * b09) * det;
      o[1] = (a[9] * b08 - a[1] * b11 - a[13] * b07) * det;
      o[2] = (a[1] * b10 - a[5] * b08 + a[13] * b06) * det;
      o[3] = (a[5] * b07 - a[1] * b09 - a[9] * b06) * det;
      o[4] = (a[8] * b10 - a[4] * b11 - a[12] * b09) * det;
      o[5] = (a[0] * b11 - a[8] * b08 + a[12] * b07) * det;
      o[6] = (a[4] * b08 - a[0] * b10 - a[12] * b06) * det;
      o[7] = (a[0] * b09 - a[4] * b07 + a[8] * b06) * det;
      o[8] = (a[7] * b05 - a[11] * b04 + a[15] * b03) * det;
      o[9] = (a[11] * b02 - a[3] * b05 - a[15] * b01) * det;
      o[10] = (a[3] * b04 - a[7] * b02 + a[15] * b00) * det;
      o[11] = (a[7] * b01 - a[3] * b03 - a[11] * b00) * det;
      o[12] = (a[10] * b04 - a[6] * b05 - a[14] * b03) * det;
      o[13] = (a[2] * b05 - a[10] * b02 + a[14] * b01) * det;
      o[14] = (a[6] * b02 - a[2] * b04 - a[14] * b00) * det;
      o[15] = (a[2] * b03 - a[6] * b01 + a[10] * b00) * det;
      return o;
    }

    // ── Draw helpers ────────────────────────────────────────────────────────────
    // attr() connects a vertex buffer to a shader attribute location.
    // u*() / um4() set uniform values (constants shared by all vertices/fragments).
    function attr(prog, name, buf, size) {
      const loc = gl.getAttribLocation(prog, name);
      if (loc < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      // (location, components, type, normalize, stride, offset)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    function u1f(prog, name, v) { gl.uniform1f(gl.getUniformLocation(prog, name), v); }
    function u1i(prog, name, v) { gl.uniform1i(gl.getUniformLocation(prog, name), v); }
    function u3f(prog, name, x, y, z) { gl.uniform3f(gl.getUniformLocation(prog, name), x, y, z); }
    function um4(prog, name, m) { gl.uniformMatrix4fv(gl.getUniformLocation(prog, name), false, m); }

    // ── Camera (orbit controls) ─────────────────────────────────────────────────
    // Spherical coordinates around the origin; eye position feeds view + specular.
    const CAM_DRAG = cfg.camera.drag;
    const CAM_ZOOM = cfg.camera.zoom;
    const CAM_DAMP = cfg.camera.damping;
    const CAM_THROW = cfg.camera.throw;
    const CAM_PHI_LIMIT = Math.PI / 2 - 0.02;
    const CAM_MIN_DIST = cfg.camera.minDistance;
    const CAM_MAX_DIST = cfg.camera.maxDistance;

    let camDist = cfg.camera.initialDistance;
    let camPhi = cfg.camera.initialPhi;
    let camTheta = cfg.camera.initialTheta;
    let camDistVel = 0, camPhiVel = 0, camThetaVel = 0;
    let mDown = false, lx = 0, ly = 0;
    let prevNow = performance.now();

    canvas.addEventListener("mousedown", (e) => {
      mDown = true;
      lx = e.clientX;
      ly = e.clientY;
      camThetaVel = 0;
      camPhiVel = 0;
    });
    window.addEventListener("mouseup", () => { mDown = false; });
    canvas.addEventListener("mousemove", (e) => {
      if (!mDown) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      camTheta -= dx * CAM_DRAG;
      camPhi = Math.max(-CAM_PHI_LIMIT, Math.min(CAM_PHI_LIMIT, camPhi + dy * CAM_DRAG));
      camThetaVel = -dx * CAM_DRAG * CAM_THROW * 60;
      camPhiVel = dy * CAM_DRAG * CAM_THROW * 60;
      lx = e.clientX;
      ly = e.clientY;
    });
    canvas.addEventListener("wheel", (e) => {
      const dz = e.deltaY * CAM_ZOOM;
      camDist = Math.max(CAM_MIN_DIST, Math.min(CAM_MAX_DIST, camDist + dz));
      camDistVel += dz * CAM_THROW * 35;
    }, { passive: true });

    const ICON_EXPAND =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>' +
      '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    const ICON_COMPRESS =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>' +
      '<line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

    const fsBtn = document.createElement("button");
    fsBtn.type = "button";
    fsBtn.className = "webgl-model-fullscreen-btn";
    fsBtn.setAttribute("aria-label", `Expand ${cfg.displayName} to fullscreen`);
    fsBtn.innerHTML = ICON_EXPAND;

    function isFullscreen() {
      return document.fullscreenElement === container
        || document.webkitFullscreenElement === container;
    }

    function syncFullscreenUi() {
      const fs = isFullscreen();
      fsBtn.innerHTML = fs ? ICON_COMPRESS : ICON_EXPAND;
      fsBtn.setAttribute("aria-label", fs ? "Exit fullscreen" : "Expand to fullscreen");
      resize();
    }

    fsBtn.addEventListener("click", () => {
      const req = container.requestFullscreen || container.webkitRequestFullscreen;
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (!req || !exit) return;
      if (isFullscreen()) exit.call(document);
      else req.call(container);
    });
    document.addEventListener("fullscreenchange", syncFullscreenUi);
    document.addEventListener("webkitfullscreenchange", syncFullscreenUi);
    container.appendChild(fsBtn);

    // Planet/atmosphere radii and scattering coefficients (scaled to unit sphere).
    const NEAR = 0.01, FAR = 20.0;
    const PLANET_R = cfg.body.planetRadius;
    const ATMO_R = cfg.body.atmosphereRadius;
    const RH = cfg.atmosphere.scaleHeights.rayleigh;
    const MH = cfg.atmosphere.scaleHeights.mie;
    const OH = cfg.atmosphere.scaleHeights.ozone;
    const OF = cfg.atmosphere.scaleHeights.ozoneFalloff;
    const RC = cfg.atmosphere.coefficients.rayleigh;
    const MC = cfg.atmosphere.coefficients.mie;
    const OC = cfg.atmosphere.coefficients.ozone;
    const MG = cfg.atmosphere.mieG;
    const SUN_INT = cfg.atmosphere.sunIntensity;
    const ATMO_EXPOSURE = cfg.atmosphere.exposure;
    const ATMO_SATURATION = cfg.atmosphere.saturation;
    const CLOUD_SCROLL = cfg.animation.cloudScrollSpeed;
    const SUN_ORBIT = cfg.sun.orbitSpeed;
    const SUN_ELEVATION = cfg.sun.elevation;
    const RING_INNER_R = cfg.ring.innerRadius;
    const RING_OUTER_R = cfg.ring.outerRadius;

    const proj = mat4(), view = mat4(), mvp = mat4(), invProj = mat4(), invView = mat4();
    const model = identity(mat4());
    let clock = performance.now();

    function resize() {
      // Match canvas backing store to CSS size × devicePixelRatio for sharp rendering.
      const w = canvas.clientWidth * devicePixelRatio | 0;
      const h = canvas.clientHeight * devicePixelRatio | 0;
      // Panel may be hidden (e.g. image/3D toggle); keep the last valid size.
      if (w <= 0 || h <= 0) return;
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      // Viewport defines the pixel rectangle that draw calls map into.
      gl.viewport(0, 0, w, h);
    }
    window.addEventListener("resize", resize);
    resize();

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min((now - prevNow) * 0.001, 0.032);
      prevNow = now;

      if (!mDown) {
        camTheta += camThetaVel * dt;
        camPhi += camPhiVel * dt;
        camDist += camDistVel * dt;
        const decay = Math.exp(-CAM_DAMP * dt);
        camThetaVel *= decay;
        camPhiVel *= decay;
        camDistVel *= decay;
      }
      camPhi = Math.max(-CAM_PHI_LIMIT, Math.min(CAM_PHI_LIMIT, camPhi));
      if (camPhi >= CAM_PHI_LIMIT && camPhiVel > 0) camPhiVel = 0;
      if (camPhi <= -CAM_PHI_LIMIT && camPhiVel < 0) camPhiVel = 0;
      camDist = Math.max(CAM_MIN_DIST, Math.min(CAM_MAX_DIST, camDist));

      if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return;
      resize();
      const W = canvas.width, H = canvas.height;
      if (W <= 0 || H <= 0) return;
      const t = (now - clock) * 0.001;

      const eye = [
        camDist * Math.cos(camPhi) * Math.sin(camTheta),
        camDist * Math.sin(camPhi),
        camDist * Math.cos(camPhi) * Math.cos(camTheta),
      ];

      // Rebuild camera matrices each frame (camera moves with user input).
      perspective(0.8, W / H, NEAR, FAR, proj);
      lookAt(eye, [0, 0, 0], [0, 1, 0], view);
      mulMat(proj, view, mvp);
      // Pass 2 needs inverse matrices to reconstruct world-space rays from depth.
      invertMat(proj, invProj);
      invertMat(view, invView);

      const sa = t * SUN_ORBIT;
      const sunDir = [Math.cos(sa), SUN_ELEVATION, Math.sin(sa)];
      const sl = Math.hypot(...sunDir);
      sunDir[0] /= sl; sunDir[1] /= sl; sunDir[2] /= sl;

      // ── Pass 1: render planet into off-screen FBO ───────────────────────────
      ensureFBO(W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); // redirect output to FBO textures
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); // nearer fragments win (occlusion on the sphere)

      gl.useProgram(planetProg); // activate pass-1 shader pair
      // Wire vertex attributes → GPU reads pos/norm/uv from these buffers per vertex.
      attr(planetProg, "aPos", posBuf, 3);
      attr(planetProg, "aNorm", normBuf, 3);
      attr(planetProg, "aUV", uvBuf, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      // Uniforms: same value for every vertex/fragment this draw call.
      um4(planetProg, "uMVP", mvp);
      um4(planetProg, "uModel", model);
      u3f(planetProg, "uSunDir", sunDir[0], sunDir[1], sunDir[2]);
      u3f(planetProg, "uCameraPos", eye[0], eye[1], eye[2]);
      u3f(planetProg, "uRC", RC[0], RC[1], RC[2]);
      u1f(planetProg, "uTime", t);
      u1f(planetProg, "uCloudScrollSpeed", CLOUD_SCROLL);
      u1f(planetProg, "uBumpStrength", cfg.bump.strength);
      const bumpUseNormalsLoc = gl.getUniformLocation(planetProg, "uBumpUseNormals");
      gl.uniform1i(bumpUseNormalsLoc, cfg.bump.useNormals ? 1 : 0);
      // Bind each texture to a unit, then tell the shader which unit to sample.
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texDay);
      u1i(planetProg, "uDayTexture", 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texSecb);
      u1i(planetProg, "uSecbTexture", 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, texRing);
      u1i(planetProg, "uRingTexture", 2);
      u1f(planetProg, "uRingInnerR", RING_INNER_R);
      u1f(planetProg, "uRingOuterR", RING_OUTER_R);
      // Issue the draw: indexed triangles assembled from the sphere EBO.
      gl.drawElements(gl.TRIANGLES, sph.idx.length, gl.UNSIGNED_INT, 0);

      // ── Pass 2: composite atmosphere to the canvas ──────────────────────────
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); // back to default (visible canvas)
      gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST); // full-screen quad has no depth ordering needs
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(atmoProg);
      attr(atmoProg, "aPos", quadBuf, 2);
      // Sample pass-1 outputs: scene color + depth for ray reconstruction.
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fboColor);
      u1i(atmoProg, "uScene", 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fboDepth);
      u1i(atmoProg, "uDepth", 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, texRing);
      u1i(atmoProg, "uRingTexture", 2);
      um4(atmoProg, "uInvProj", invProj);
      um4(atmoProg, "uInvView", invView);
      u3f(atmoProg, "uCamPos", eye[0], eye[1], eye[2]);
      u3f(atmoProg, "uSunPos", sunDir[0] * 5, sunDir[1] * 5, sunDir[2] * 5);
      u3f(atmoProg, "uPlanetPos", 0, 0, 0);
      u1f(atmoProg, "uPlanetR", PLANET_R);
      u1f(atmoProg, "uAtmoR", ATMO_R);
      u1f(atmoProg, "uRingInnerR", RING_INNER_R);
      u1f(atmoProg, "uRingOuterR", RING_OUTER_R);
      u1f(atmoProg, "uRH", RH); u3f(atmoProg, "uRC", RC[0], RC[1], RC[2]);
      u1f(atmoProg, "uMH", MH); u3f(atmoProg, "uMC", MC[0], MC[1], MC[2]);
      u1f(atmoProg, "uMG", MG);
      u1f(atmoProg, "uOH", OH); u3f(atmoProg, "uOC", OC[0], OC[1], OC[2]);
      u1f(atmoProg, "uOF", OF);
      u1f(atmoProg, "uSunIntensity", SUN_INT);
      u1f(atmoProg, "uExposure", ATMO_EXPOSURE);
      u1f(atmoProg, "uSaturation", ATMO_SATURATION);
      // TRIANGLE_STRIP: 4 vertices → 2 triangles covering the screen.
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ── Pass 3: ring over atmosphere (shader-occluded by planet sphere) ───
      if (cfg.ring.enabled && ring) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(ringProg);
      attr(ringProg, "aPos", ringPosBuf, 3);
      attr(ringProg, "aUV", ringUvBuf, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ringIdxBuf);
      um4(ringProg, "uMVP", mvp);
      u3f(ringProg, "uSunDir", sunDir[0], sunDir[1], sunDir[2]);
      u3f(ringProg, "uCameraPos", eye[0], eye[1], eye[2]);
      u1f(ringProg, "uPlanetR", PLANET_R);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texRing);
      u1i(ringProg, "uRingTexture", 0);
      gl.drawElements(gl.TRIANGLES, ring.idx.length, gl.UNSIGNED_INT, 0);
      gl.disable(gl.BLEND);
      }
    }

    // Kick off the render loop (browser calls frame() every vsync).
    requestAnimationFrame(frame);
  }

  global.PlanetRenderer = { init, normalizeConfig };
})(window);
