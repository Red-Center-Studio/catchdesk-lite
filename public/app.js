// CatchDesk client script. Every page works without it; this adds helpful touches:
// clear messages for network failures, double-submit protection, confirm prompts, copy and print buttons,
// photo checks and shrinking before upload, and saved-item prices in the quote editor.
(function () {
  "use strict";

  var netBox = document.getElementById("net-error");

  function showNetError(message) {
    if (!netBox) return alert(message);
    netBox.innerHTML = "";
    var div = document.createElement("div");
    div.className = "rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger";
    div.textContent = message;
    netBox.appendChild(div);
    netBox.classList.remove("hidden");
    netBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Confirm prompts on buttons with data-confirm.
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target instanceof Element ? e.target.closest("[data-confirm]") : null;
      if (el && !window.confirm(el.getAttribute("data-confirm") || "Are you sure?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  // Print buttons, and copy-to-clipboard buttons with data-copy.
  document.addEventListener("click", function (e) {
    var t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest("[data-print]")) {
      e.preventDefault();
      window.print();
      return;
    }
    var copy = t.closest("[data-copy]");
    if (copy && navigator.clipboard) {
      e.preventDefault();
      var label = copy.textContent;
      navigator.clipboard.writeText(copy.getAttribute("data-copy") || "").then(
        function () {
          copy.textContent = "Copied";
          setTimeout(function () {
            copy.textContent = label;
          }, 2000);
        },
        function () {
          copy.textContent = "Copy failed. Select the link instead.";
        },
      );
    }
  });

  // ---------- Photos: shrink large phone photos before upload, and check the count and size ----------

  var MAX_PHOTO = 10 * 1024 * 1024;
  var MAX_FILES = 6;
  var pending = 0;

  function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") {
      return Promise.resolve(file);
    }
    return createImageBitmap(file)
      .then(function (bmp) {
        var max = 1800;
        var scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
        if (scale === 1 && file.size < 1500000) return file;
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
        return new Promise(function (resolve) {
          canvas.toBlob(
            function (blob) {
              if (!blob || blob.size >= file.size) return resolve(file);
              var name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
              resolve(new File([blob], name, { type: "image/jpeg" }));
            },
            "image/jpeg",
            0.82,
          );
        });
      })
      .catch(function () {
        return file;
      });
  }

  document.querySelectorAll("form[data-photos] input[type=file]").forEach(function (input) {
    var status = input.form ? input.form.querySelector("[data-photo-status]") : null;
    function say(text) {
      if (status) status.textContent = text;
    }
    input.addEventListener("change", function () {
      var files = input.files ? Array.prototype.slice.call(input.files) : [];
      if (files.length > MAX_FILES) {
        say("Choose " + MAX_FILES + " photos at most.");
        return;
      }
      if (!files.length) {
        say("");
        return;
      }
      if (typeof DataTransfer !== "function") {
        say(files.length + " photo" + (files.length === 1 ? "" : "s") + " chosen.");
        return;
      }
      pending += 1;
      say("Getting your photos ready...");
      Promise.all(files.map(shrink))
        .then(function (smaller) {
          try {
            var dt = new DataTransfer();
            smaller.forEach(function (f) {
              dt.items.add(f);
            });
            input.files = dt.files;
          } catch {
            // Older browsers cannot replace the chosen files; the originals are sent instead.
          }
          var big = smaller.some(function (f) {
            return f.size > MAX_PHOTO;
          });
          say(
            big
              ? "A photo is too big. Each photo must be 10 MB or smaller."
              : smaller.length + " photo" + (smaller.length === 1 ? "" : "s") + " ready to send.",
          );
        })
        .then(function () {
          pending -= 1;
        });
    });
  });

  // ---------- Enhanced form submits: one at a time, and a clear message when the network fails ----------

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-enhance")) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (form.dataset.busy === "1") return;
    var submitter = e.submitter;
    if (pending > 0) {
      setTimeout(function () {
        if (typeof form.requestSubmit === "function") form.requestSubmit(submitter || undefined);
      }, 300);
      return;
    }
    var data = new FormData(form);
    if (submitter && submitter.name) data.append(submitter.name, submitter.value);
    var action = (submitter && submitter.getAttribute("formaction")) || form.getAttribute("action") || location.href;

    if (!navigator.onLine) {
      showNetError(
        "You are offline, so this was not sent. What you typed is still here. Try again when you have signal.",
      );
      return;
    }

    form.dataset.busy = "1";
    var buttons = form.querySelectorAll("button[type=submit], button:not([type])");
    buttons.forEach(function (b) {
      b.disabled = true;
    });
    var label = submitter ? submitter.textContent : "";
    if (submitter) submitter.textContent = "Sending...";

    function reset() {
      form.dataset.busy = "";
      buttons.forEach(function (b) {
        b.disabled = false;
      });
      if (submitter) submitter.textContent = label;
    }

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, 90000);

    fetch(action, {
      method: (form.getAttribute("method") || "post").toUpperCase(),
      body: data,
      credentials: "same-origin",
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
      headers: { "X-Requested-With": "fetch" },
    })
      .then(function (res) {
        clearTimeout(timer);
        if (res.status === 413) {
          reset();
          showNetError("That upload is too big. Use fewer photos, each 10 MB or smaller.");
          return;
        }
        if (res.redirected) {
          window.location.assign(res.url);
          return;
        }
        return res.text().then(function (html) {
          document.open();
          document.write(html);
          document.close();
          window.scrollTo(0, 0);
        });
      })
      .catch(function () {
        clearTimeout(timer);
        reset();
        showNetError(
          "We could not reach the server, so this was not sent. What you typed is still here. Check your signal and try again.",
        );
      });
  });

  // ---------- Quote editor: picking a saved item fills in its price ----------

  var editor = document.querySelector("form[data-quote-editor]");
  var saved = document.getElementById("saved-items");
  if (editor && saved) {
    var prices = {};
    saved.querySelectorAll("option").forEach(function (o) {
      if (o.getAttribute("data-price")) prices[o.value] = o.getAttribute("data-price");
    });
    editor.addEventListener("change", function (e) {
      var input = e.target;
      if (!(input instanceof HTMLInputElement) || input.name !== "desc[]") return;
      var price = prices[input.value];
      var line = input.closest("[data-line]");
      var priceInput = line ? line.querySelector("input[name='price[]']") : null;
      if (price && priceInput && !priceInput.value) priceInput.value = price;
    });
  }
})();
