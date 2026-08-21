(function () {
  "use strict";

  var canvas = document.getElementById("water");
  if (!canvas) return;

  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl || reducedMotion) {
    document.body.classList.add("static-bg");
    return;
  }

  function compileShader(src, type) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(vsSrc, fsSrc) {
    var vs = compileShader(vsSrc, gl.VERTEX_SHADER);
    var fs = compileShader(fsSrc, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  var VERT = [
    "attribute vec2 aPosition;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = aPosition * 0.5 + 0.5;",
    "  gl_Position = vec4(aPosition, 0.0, 1.0);",
    "}"
  ].join("\n");

  var SIM_FRAG = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "varying vec2 vUv;",
    "uniform sampler2D uState;",
    "uniform vec2 uTexel;",
    "float decode(float v) { return v * 2.0 - 1.0; }",
    "float encode(float v) { return clamp(v, -1.0, 1.0) * 0.5 + 0.5; }",
    "void main() {",
    "  vec4 self = texture2D(uState, vUv);",
    "  float hN = decode(texture2D(uState, vUv + vec2(0.0, uTexel.y)).r);",
    "  float hS = decode(texture2D(uState, vUv - vec2(0.0, uTexel.y)).r);",
    "  float hE = decode(texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r);",
    "  float hW = decode(texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r);",
    "  float prevH = decode(self.g);",
    "  float newH = (hN + hS + hE + hW) * 0.5 - prevH;",
    "  newH *= 0.988;",
    "  gl_FragColor = vec4(encode(newH), self.r, 0.0, 1.0);",
    "}"
  ].join("\n");

  var DROP_FRAG = [
    "precision mediump float;",
    "varying vec2 vUv;",
    "uniform vec2 uCenter;",
    "uniform float uRadius;",
    "uniform float uStrength;",
    "uniform float uAspect;",
    "void main() {",
    "  vec2 diff = vUv - uCenter;",
    "  diff.x *= uAspect;",
    "  float d = length(diff);",
    "  float drop = uStrength * (1.0 - smoothstep(0.0, uRadius, d));",
    "  gl_FragColor = vec4(drop * 0.5, 0.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  var RENDER_FRAG = [
    "precision mediump float;",
    "varying vec2 vUv;",
    "uniform sampler2D uHeight;",
    "uniform sampler2D uBackground;",
    "uniform vec2 uTexel;",
    "uniform vec2 uAspect;",
    "float decode(float v) { return v * 2.0 - 1.0; }",
    "void main() {",
    "  float hL = decode(texture2D(uHeight, vUv - vec2(uTexel.x, 0.0)).r);",
    "  float hR = decode(texture2D(uHeight, vUv + vec2(uTexel.x, 0.0)).r);",
    "  float hD = decode(texture2D(uHeight, vUv - vec2(0.0, uTexel.y)).r);",
    "  float hU = decode(texture2D(uHeight, vUv + vec2(0.0, uTexel.y)).r);",
    "  vec2 grad = vec2(hR - hL, hU - hD);",
    "  vec2 ratio = vec2(min(uAspect.x / uAspect.y, 1.0), min(uAspect.y / uAspect.x, 1.0));",
    "  vec2 bgUv = vUv * ratio + (1.0 - ratio) * 0.5;",
    "  vec2 offset = grad * 0.09;",
    "  vec3 color = texture2D(uBackground, bgUv + offset).rgb;",
    "  float highlight = clamp(grad.x * 0.6 + grad.y * 0.6, 0.0, 1.0);",
    "  color += highlight * 0.32;",
    "  float shadow = clamp(-(grad.x * 0.6 + grad.y * 0.6), 0.0, 1.0);",
    "  color -= shadow * 0.2;",
    "  gl_FragColor = vec4(color, 1.0);",
    "}"
  ].join("\n");

  var simProgram = createProgram(VERT, SIM_FRAG);
  var dropProgram = createProgram(VERT, DROP_FRAG);
  var renderProgram = createProgram(VERT, RENDER_FRAG);
  if (!simProgram || !dropProgram || !renderProgram) {
    document.body.classList.add("static-bg");
    return;
  }

  var quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  function bindQuad(program) {
    var loc = gl.getAttribLocation(program, "aPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  var simW = 256, simH = 256;
  var neutral = new Uint8Array(simW * simH * 4);
  for (var n = 0; n < neutral.length; n += 4) {
    neutral[n] = 127;
    neutral[n + 1] = 127;
    neutral[n + 2] = 0;
    neutral[n + 3] = 255;
  }
  var simTextures = [];
  var simFbos = [];
  for (var i = 0; i < 2; i++) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, simW, simH, 0, gl.RGBA, gl.UNSIGNED_BYTE, neutral);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    simTextures.push(tex);
    simFbos.push(fbo);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  var bgTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, bgTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([13, 15, 8, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  var imgAspect = 1;
  var bgImage = new Image();
  bgImage.onload = function () {
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgImage);
    imgAspect = bgImage.naturalWidth / bgImage.naturalHeight;
  };
  bgImage.src = "garden.jpg";

  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }
  resize();
  window.addEventListener("resize", resize);

  var src = 0, dest = 1;
  var pendingDrops = [];

  function addDrop(x, y, strength, radius) {
    pendingDrops.push({ x: x, y: y, strength: strength, radius: radius || 0.06 });
    if (pendingDrops.length > 12) pendingDrops.shift();
  }

  var lastMove = 0;
  function toUv(clientX, clientY) {
    return { x: clientX / window.innerWidth, y: 1.0 - clientY / window.innerHeight };
  }

  window.addEventListener("mousemove", function (e) {
    var now = performance.now();
    if (now - lastMove < 40) return;
    lastMove = now;
    var uv = toUv(e.clientX, e.clientY);
    addDrop(uv.x, uv.y, 0.35, 0.05);
  });

  window.addEventListener("click", function (e) {
    var uv = toUv(e.clientX, e.clientY);
    addDrop(uv.x, uv.y, 0.9, 0.09);
  });

  window.addEventListener(
    "touchmove",
    function (e) {
      if (!e.touches || !e.touches.length) return;
      var t = e.touches[0];
      var uv = toUv(t.clientX, t.clientY);
      addDrop(uv.x, uv.y, 0.35, 0.05);
    },
    { passive: true }
  );

  window.addEventListener(
    "touchstart",
    function (e) {
      if (!e.touches || !e.touches.length) return;
      var t = e.touches[0];
      var uv = toUv(t.clientX, t.clientY);
      addDrop(uv.x, uv.y, 0.8, 0.08);
    },
    { passive: true }
  );

  function ambientDrop() {
    addDrop(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, 0.4 + Math.random() * 0.3, 0.06 + Math.random() * 0.04);
    setTimeout(ambientDrop, 1800 + Math.random() * 2200);
  }
  setTimeout(ambientDrop, 900);
  setTimeout(function () {
    addDrop(0.3, 0.6, 0.6, 0.08);
  }, 300);
  setTimeout(function () {
    addDrop(0.7, 0.4, 0.6, 0.08);
  }, 900);

  var simTexelLoc, simStateLoc;
  var dropCenterLoc, dropRadiusLoc, dropStrengthLoc, dropAspectLoc;
  var rHeightLoc, rBgLoc, rTexelLoc, rAspectLoc;

  gl.useProgram(simProgram);
  simStateLoc = gl.getUniformLocation(simProgram, "uState");
  simTexelLoc = gl.getUniformLocation(simProgram, "uTexel");

  gl.useProgram(dropProgram);
  dropCenterLoc = gl.getUniformLocation(dropProgram, "uCenter");
  dropRadiusLoc = gl.getUniformLocation(dropProgram, "uRadius");
  dropStrengthLoc = gl.getUniformLocation(dropProgram, "uStrength");
  dropAspectLoc = gl.getUniformLocation(dropProgram, "uAspect");

  gl.useProgram(renderProgram);
  rHeightLoc = gl.getUniformLocation(renderProgram, "uHeight");
  rBgLoc = gl.getUniformLocation(renderProgram, "uBackground");
  rTexelLoc = gl.getUniformLocation(renderProgram, "uTexel");
  rAspectLoc = gl.getUniformLocation(renderProgram, "uAspect");

  function frame() {
    requestAnimationFrame(frame);

    gl.bindFramebuffer(gl.FRAMEBUFFER, simFbos[dest]);
    gl.viewport(0, 0, simW, simH);
    gl.disable(gl.BLEND);
    gl.useProgram(simProgram);
    bindQuad(simProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simTextures[src]);
    gl.uniform1i(simStateLoc, 0);
    gl.uniform2f(simTexelLoc, 1 / simW, 1 / simH);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (pendingDrops.length) {
      gl.useProgram(dropProgram);
      bindQuad(dropProgram);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.colorMask(true, false, false, false);
      var canvasAspect = window.innerWidth / window.innerHeight;
      gl.uniform1f(dropAspectLoc, canvasAspect);
      for (var i = 0; i < pendingDrops.length; i++) {
        var d = pendingDrops[i];
        gl.uniform2f(dropCenterLoc, d.x, d.y);
        gl.uniform1f(dropRadiusLoc, d.radius);
        gl.uniform1f(dropStrengthLoc, d.strength);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.colorMask(true, true, true, true);
      gl.disable(gl.BLEND);
      pendingDrops.length = 0;
    }

    var tmp = src;
    src = dest;
    dest = tmp;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(renderProgram);
    bindQuad(renderProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simTextures[src]);
    gl.uniform1i(rHeightLoc, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.uniform1i(rBgLoc, 1);
    gl.uniform2f(rTexelLoc, 1 / simW, 1 / simH);
    gl.uniform2f(rAspectLoc, window.innerWidth / window.innerHeight, imgAspect);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  requestAnimationFrame(frame);
})();
