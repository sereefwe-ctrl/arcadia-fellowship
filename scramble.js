(function () {
  "use strict";

  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+=-/\\<>";

  function randChar() {
    return CHARS[(Math.random() * CHARS.length) | 0];
  }

  function crackle(el, finalText, duration, changeInterval, delay) {
    setTimeout(function () {
      var startTime = null;
      var lastChange = -Infinity;

      function frame(now) {
        if (startTime === null) startTime = now;
        var elapsed = now - startTime;

        if (elapsed >= duration) {
          el.textContent = finalText;
          return;
        }

        if (now - lastChange >= changeInterval) {
          lastChange = now;
          var out = "";
          for (var i = 0; i < finalText.length; i++) {
            out += finalText[i] === " " ? " " : randChar();
          }
          el.textContent = out;
        }

        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    }, delay || 0);
  }

  function init() {
    var targets = document.querySelectorAll("[data-scramble]");
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      var finalText = el.textContent;
      if (reducedMotion) continue;
      el.textContent = finalText.replace(/\S/g, randChar);
      crackle(el, finalText, 1800, 50, i * 220);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
