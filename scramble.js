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

  var NORMAL_DURATION = 2600;
  var NORMAL_STAGGER = 300;
  var FAST_DURATION = 320;
  var FAST_CHANGE_INTERVAL = 35;

  function init() {
    var targets = document.querySelectorAll("[data-scramble], [data-scramble-fast]");
    if (reducedMotion) return;

    var normalEls = [];
    var fastEls = [];
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      var finalText = el.textContent;
      el.textContent = finalText.replace(/\S/g, randChar);
      if (el.hasAttribute("data-scramble-fast")) {
        fastEls.push({ el: el, text: finalText });
      } else {
        normalEls.push({ el: el, text: finalText });
      }
    }

    var normalFinish = normalEls.length > 0 ? (normalEls.length - 1) * NORMAL_STAGGER + NORMAL_DURATION : 0;
    var fastStagger = fastEls.length > 1 ? Math.max(15, (normalFinish - FAST_DURATION) / (fastEls.length - 1)) : 0;

    normalEls.forEach(function (item, i) {
      crackle(item.el, item.text, NORMAL_DURATION, 50, i * NORMAL_STAGGER);
    });
    fastEls.forEach(function (item, i) {
      crackle(item.el, item.text, FAST_DURATION, FAST_CHANGE_INTERVAL, i * fastStagger);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
