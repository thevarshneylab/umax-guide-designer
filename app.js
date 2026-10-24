/* Umax Guide Designer — browser UI. Design logic lives in umax.js. */
(function () {
  "use strict";

  var EXAMPLE = "ATGGCATCCGAGTTCAAGCGAGGCTACACCAAGAGGCTGAACTGCTCAGATGTGCCTCAGTTTGACAAGCTACAGGCTACGTGGAACCCAGAGTACAGCTGA";
  var EXAMPLE_TARGET = 18;  /* the C of CGA, codon 7 */

  /* The version stamped onto this script's own URL by tools/stamp.js, passed
     on to anything this script fetches so a cached copy of one asset can
     never be paired with a fresh copy of another. */
  var ASSET_VERSION = (function () {
    var tag = document.currentScript || document.querySelector('script[src*="app.js"]');
    var match = tag && tag.src && tag.src.match(/[?&]v=([A-Za-z0-9]+)/);
    return match ? match[1] : "";
  })();
  var versioned = function (url) {
    return ASSET_VERSION ? url + "?v=" + ASSET_VERSION : url;
  };

  var state = {
    seq: "", target: -1, family: "CBE", frame: 0, filter: "all",
    guides: [], editors: [], allEditors: [], sources: [],
    casVariants: [], casEnabled: {}, includeUntested: false,
    mode: "one", consequence: "any", scan: null, scanConfirmed: false
  };

  /* Above this much work a synchronous scan would visibly freeze the tab, so
     the user is asked first rather than left staring at a frozen page. */
  var SCAN_WARN_UNITS = 40000;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- rendering ---------- */

  /** Editors available given the backbone selection and the untested toggle. */
  function activeEditors() {
    return state.allEditors.filter(function (ed) {
      if (!state.includeUntested && ed.derived) return false;
      return state.casEnabled[ed.cas] !== false;
    });
  }

  function recompute() {
    state.guides = [];
    state.editors = activeEditors();
    if (state.target < 0 || state.target >= state.seq.length || !state.editors.length) return;
    state.guides = UMAX.design(state.seq, state.target, state.family, state.editors, state.frame);
  }

  function renderTrack() {
    var track = $("track");
    track.textContent = "";
    if (!state.seq.length) {
      track.innerHTML = '<p class="hint">Paste a sequence above, or load the example.</p>';
      return;
    }

    var best = state.guides.length ? state.guides[0] : null;
    var inWindow = {}, inPeak = {}, isBystander = {};
    if (best) {
      var ed = best.editor;
      for (var w = ed.window[0]; w <= ed.window[1]; w++) {
        var workIdx = best.start + w - 1;
        var idx = best.strand === "+" ? workIdx : state.seq.length - 1 - workIdx;
        if (w >= ed.peak[0] && w <= ed.peak[1]) inPeak[idx] = true; else inWindow[idx] = true;
      }
      best.bystanderIndices.forEach(function (i) { isBystander[i] = true; });
    }

    var perLine = 60;
    for (var start = 0; start < state.seq.length; start += perLine) {
      var line = document.createElement("div");
      line.className = "seqline";

      var coord = document.createElement("span");
      coord.className = "coord";
      coord.textContent = String(start + 1);

      var bases = document.createElement("span");
      bases.className = "bases";

      for (var i = start; i < Math.min(start + perLine, state.seq.length); i++) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "base";
        b.textContent = state.seq.charAt(i);
        b.setAttribute("data-i", String(i));
        b.setAttribute("aria-label", "Base " + (i + 1) + " " + state.seq.charAt(i));
        if ((i + 1) % 10 === 0) b.className += " sep";
        if (inPeak[i]) b.className += " inpeak";
        else if (inWindow[i]) b.className += " inwin";
        if (isBystander[i]) b.className += " isbys";
        if (i === state.target) b.className += " istarget";
        if (state.frame >= 0 && i >= state.frame && Math.floor((i - state.frame) / 3) % 2 === 1) {
          b.className += " codonalt";
        }
        bases.appendChild(b);
      }
      line.appendChild(coord);
      line.appendChild(bases);
      track.appendChild(line);
    }
  }

  function renderTarget() {
    var el = $("targetline");
    if (state.target < 0) { el.textContent = "No base selected."; return; }

    var base = state.seq.charAt(state.target);
    var strand = UMAX.guideStrandFor(base, state.family);
    var text = "Base " + (state.target + 1) + " is " + base + ". ";

    if (!strand) {
      text += state.family === "CBE"
        ? "Cytosine base editors change C or G — pick a C or a G."
        : "This editor acts on adenine, so pick an A or a T.";
      el.textContent = text;
      return;
    }

    var f = UMAX.FAMILY[state.family];
    var spectrum = UMAX.outcomeSpectrum(state.seq, state.frame, state.family, strand, state.target);
    var strandText = strand === "+"
      ? "a sense-strand guide (PAM downstream)"
      : "an antisense-strand guide (PAM upstream)";

    if (f.mixedProducts) {
      var seen = spectrum.map(function (o) { return base + "→" + o.observedBase; }).join(", ");
      text += "This editor produces a mixture — " + seen + " — via " + strandText + ".";
      el.textContent = text;

      if (state.frame >= 0) {
        var list = document.createElement("div");
        list.className = "spectrum";
        spectrum.forEach(function (o) {
          var row = document.createElement("div");
          row.className = "outcome " + o.kind;
          row.innerHTML = "<code></code><span class='okind'></span><span></span>";
          row.querySelector("code").textContent = base + "→" + o.observedBase;
          row.querySelector(".okind").textContent = o.kind;
          row.querySelectorAll("span")[1].textContent = o.description || "—";
          list.appendChild(row);
        });
        el.appendChild(list);
      }
      return;
    }

    text += base + "→" + spectrum[0].observedBase + ", via " + strandText + ".";
    if (spectrum[0].description) text += " On-target consequence: " + spectrum[0].description + ".";
    el.textContent = text;
  }

  function passesFilter(g) {
    if (state.filter === "ngg") return g.editor.pam === "NGG";
    if (state.filter === "precise") return !!g.editor.precise;
    if (state.filter === "nobys") return g.bystanders.length === 0;
    return true;
  }

  function spacerHTML(g) {
    var html = "";
    for (var i = 1; i <= UMAX.SPACER_LENGTH; i++) {
      var ch = g.spacer.charAt(i - 1);
      if (i === g.position) html += "<mark>" + ch + "</mark>";
      else if (g.bystanders.indexOf(i) >= 0) html += '<span class="b">' + ch + "</span>";
      else html += ch;
    }
    return html + '<span class="pam"> ' + g.pam + "</span>";
  }

  function renderResults() {
    var box = $("results");
    box.textContent = "";
    var list = state.guides.filter(passesFilter);
    $("count").textContent = state.target < 0 ? "" : "· " + list.length + " of " + state.guides.length;

    if (!state.editors.length) {
      var noed = document.createElement("div");
      noed.className = "empty";
      noed.textContent = noEditorsMessage();
      box.appendChild(noed);
      return;
    }
    if (state.target < 0) {
      box.innerHTML = '<div class="empty">Select a base in the sequence to design guides for it.</div>';
      return;
    }
    if (!state.guides.length) {
      box.innerHTML = '<div class="empty"></div>';
      var empty = box.firstChild;
      var flank = UMAX.flankReport(state.seq, state.target, state.family, state.editors);

      if (!flank) {
        empty.textContent = state.family === "ABE"
          ? "Adenine base editors change A or T. Pick an A or a T, or switch to the cytosine editors."
          : "Cytosine base editors change C or G. Pick a C or a G, or switch to the adenine editors.";
        return;
      }

      /* Before blaming the sequence, check whether the user's own backbone
         selection is what removed the guides. */
      var everything = state.allEditors;
      var withoutFilters = UMAX.design(state.seq, state.target, state.family, everything, state.frame);
      if (withoutFilters.length) {
        var missingCas = {};
        withoutFilters.forEach(function (g) {
          var hiddenByCas = state.casEnabled[g.editor.cas] === false;
          var hiddenByToggle = !state.includeUntested && g.editor.derived;
          if (hiddenByCas || hiddenByToggle) missingCas[g.editor.cas] = true;
        });
        var names = Object.keys(missingCas);
        if (names.length) {
          empty.innerHTML =
            "No guides under the current selection, but " + withoutFilters.length +
            " would be available using " + names.join(", ") +
            ".<br><br>Tick that backbone above" +
            (!state.includeUntested ? ", or allow predicted pairings," : "") +
            " to see them.";
          return;
        }
      }

      var lines = [];

      if (flank.shortOnPamSide) {
        /* The usual cause: not enough sequence on the side the PAM sits. */
        lines.push((flank.strand === "+" ? "A sense" : "An antisense") +
          "-strand guide is needed here, so its PAM sits <strong>" +
          flank.pamSide + "</strong> of this base — and only " +
          (flank.pamSide === "upstream" ? flank.upstream : flank.downstream) +
          " nt of sequence is pasted on that side.");
        lines.push("Paste at least " + flank.extraPamSide + " more nt " + flank.pamSide +
          " of the target. Around 30 nt of flanking sequence on both sides covers every editor in the suite.");
      } else {
        lines.push("No PAM in this region puts the base inside a " + state.family +
          "-Umax window on the " + (flank.strand === "+" ? "sense" : "antisense") + " strand.");
        lines.push("Options: try the other editor family if the change allows it, target a different " +
          "base in the same codon, or extend the sequence " + flank.pamSide +
          " in case a usable PAM lies just outside what is pasted.");
      }

      empty.innerHTML = lines.join("<br><br>");
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="empty">No guides match this filter.</div>';
      return;
    }

    var editedBase = UMAX.FAMILY[state.family].from;

    list.forEach(function (g, idx) {
      var ed = g.editor;
      var card = document.createElement("div");
      card.className = "guide" + (idx === 0 && state.filter === "all" ? " top" : "");

      var pamLabel = ed.pamPreference ? g.pamTier : ed.pam;
      var bystanderText = g.bystanders.length
        ? g.bystanders.map(function (w) { return editedBase + w; }).join(", ")
        : "none in window";

      var fam = UMAX.FAMILY[state.family];
      var consequence = "—";
      if (fam.mixedProducts) {
        /* With mixed products the intended change is only one of several
           outcomes, so the target's own spectrum is what matters; bystander
           consequences are listed separately below. */
        var spec = UMAX.outcomeSpectrum(state.seq, state.frame, state.family, g.strand, g.targetIndex);
        consequence = spec.map(function (o) {
          return o.base + ": " + (o.description || "—");
        }).join("  ·  ");
      } else {
        var all = UMAX.codonEffects(state.seq, state.frame, state.family, g.strand,
          [g.targetIndex].concat(g.bystanderIndices));
        if (all && all.length) consequence = all.map(UMAX.describeEffect).join("; ");
      }

      card.innerHTML =
        '<div class="ghead"><span class="ename"></span>' +
        '<span>' +
          '<span class="pill ' + (g.inPeak ? "good" : "warn") + '">position ' + g.position +
            (g.inPeak ? " · peak" : " · edge of window") + '</span> ' +
          '<span class="pill">' + pamLabel + ' · ' + g.pam + '</span> ' +
          '<span class="pill ' + (g.bystanders.length ? "warn" : "good") + '">' +
            (g.bystanders.length ? g.bystanders.length + " bystander" + (g.bystanders.length > 1 ? "s" : "") : "clean") +
          '</span>' +
        '</span></div>' +
        '<div class="spacer">' + spacerHTML(g) + '</div>' +
        '<div class="meta">' +
          '<div><span>Strand</span>' + (g.strand === "+" ? "sense" : "antisense") + '</div>' +
          '<div><span>Window</span>' + ed.window[0] + '–' + ed.window[1] + ' (peak ' + ed.peak[0] + '–' + ed.peak[1] + ')</div>' +
          '<div><span>Bystanders</span>' + bystanderText + '</div>' +
          '<div><span>GC</span>' + g.gc.toFixed(0) + '%</div>' +
          (g.contextFavorable === null ? '' :
            '<div><span>Context</span>' + (g.context || "—") +
            (g.contextFavorable ? ' · favorable' : ' · not preferred') + '</div>') +
          '<div style="grid-column:1/-1"><span>Protein</span><span class="cons"></span></div>' +
        '</div>' +
        '<p class="note"></p>';

      card.querySelector(".ename").textContent = ed.id;
      if (ed.derived) {
        var pred = document.createElement("span");
        pred.className = "pred";
        pred.textContent = " predicted pairing";
        card.querySelector(".ename").appendChild(pred);
        card.className += " derived";
      } else if (ed.unpublished) {
        var badge = document.createElement("span");
        badge.className = "unpub";
        badge.textContent = " unpublished";
        card.querySelector(".ename").appendChild(badge);
      }
      card.querySelector(".cons").textContent = consequence;
      card.querySelector(".cons").style.cssText = "display:inline;font-size:13px;letter-spacing:0;text-transform:none;font-weight:400;color:inherit";

      var note = card.querySelector(".note");
      note.textContent = ed.use;
      if (g.hasPolyT) {
        var warn = document.createElement("strong");
        warn.textContent = " Contains TTTT — this terminates Pol III transcription if you express the sgRNA from U6.";
        note.appendChild(warn);
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ghost";
      btn.style.alignSelf = "flex-start";
      btn.textContent = "Copy spacer";
      btn.addEventListener("click", function () { copyText(g.spacer, "Spacer copied"); });
      card.appendChild(btn);

      box.appendChild(card);
    });
  }

  function renderCasFilter() {
    var box = $("casfilter");
    box.textContent = "";
    state.casVariants.forEach(function (cas) {
      var predictedOnly = !state.casHasPublished[cas.id];
      var label = document.createElement("label");
      label.className = "chip" + (predictedOnly ? " predonly" : "");
      label.title = (cas.note || "") +
        (predictedOnly ? "\n\nNo published pairing with any Umax editor, so selecting this turns on predicted pairings." : "");
      label.innerHTML = '<input type="checkbox"><span class="cname"></span>' +
        '<span class="cpam"></span><span class="conly"></span>';
      var input = label.querySelector("input");
      input.checked = state.casEnabled[cas.id] !== false;
      input.setAttribute("aria-label", cas.id + ", " + cas.pam + " PAM" +
        (predictedOnly ? ", predicted pairings only" : ""));
      label.querySelector(".cname").textContent = cas.id;
      label.querySelector(".cpam").textContent = cas.pam;
      label.querySelector(".conly").textContent = predictedOnly ? "predicted only" : "";
      input.addEventListener("change", function () {
        state.casEnabled[cas.id] = this.checked;
        /* Selecting a backbone that has no published pairing would otherwise
           change nothing at all. Honour the selection and say what happened. */
        if (this.checked && predictedOnly && !state.includeUntested) {
          state.includeUntested = true;
          $("untested").checked = true;
          renderReference();
          toast(cas.id + " has no published pairings — predicted pairings turned on");
        }
        render();
      });
      box.appendChild(label);
    });
  }

  /** Why the active editor set is empty, in the user's own terms. */
  function noEditorsMessage() {
    var ticked = state.casVariants.filter(function (c) {
      return state.casEnabled[c.id] !== false;
    });
    if (!ticked.length) return "No Cas9 backbone selected — tick at least one above.";

    var predictedOnly = ticked.filter(function (c) { return !state.casHasPublished[c.id]; });
    if (predictedOnly.length === ticked.length && !state.includeUntested) {
      var names = predictedOnly.map(function (c) { return c.id; }).join(", ");
      return "Every pairing with " + names + " is predicted rather than published, " +
        "so nothing is available until \u201cInclude predicted pairings\u201d is ticked above.";
    }
    return "No editors available for the current selection.";
  }

  function scanWorkUnits() {
    var editable = 0;
    for (var i = 0; i < state.seq.length; i++) {
      if (UMAX.guideStrandFor(state.seq.charAt(i), state.family)) editable++;
    }
    return editable * Math.max(1, state.editors.length);
  }

  function scanRowMatches(entry) {
    if (state.consequence === "any") return true;
    /* With mixed products any outcome reaching the asked-for class counts,
       because that outcome is one the experiment will actually produce. */
    return entry.effectClasses.indexOf(state.consequence) >= 0;
  }

  function renderScan() {
    var box = $("scanresults");
    box.textContent = "";

    if (!state.seq.length) {
      box.innerHTML = '<div class="empty">Paste a sequence to scan.</div>';
      return;
    }
    if (!state.editors.length) {
      var msg = document.createElement("div");
      msg.className = "empty";
      msg.textContent = noEditorsMessage();
      box.appendChild(msg);
      $("count").textContent = "";
      return;
    }

    var units = scanWorkUnits();
    if (units > SCAN_WARN_UNITS && !state.scanConfirmed) {
      var warn = document.createElement("div");
      warn.className = "warn";
      warn.innerHTML =
        "<strong>This scan is large.</strong>" +
        "<p style='margin:7px 0 0'>About " + units.toLocaleString() +
        " base-editor combinations. The page will be unresponsive for a few seconds " +
        "while it runs. Shortening the sequence or unticking some Cas9 backbones " +
        "makes it quicker.</p>";
      var go = document.createElement("button");
      go.type = "button";
      go.className = "ghost";
      go.style.marginTop = "12px";
      go.textContent = "Scan anyway";
      go.addEventListener("click", function () { state.scanConfirmed = true; renderScan(); });
      warn.appendChild(go);
      box.appendChild(warn);
      $("count").textContent = "";
      return;
    }

    var scan = UMAX.scanSequence(state.seq, state.family, state.editors, state.frame);
    state.scan = scan;

    var rows = scan.entries.filter(function (e) { return e.guideCount > 0 && scanRowMatches(e); });
    $("count").textContent = "· " + rows.length + " of " + scan.reachable + " editable bases";

    var stats = document.createElement("div");
    stats.className = "scanstats";
    var unreachable = scan.editable - scan.reachable;
    [
      ["Editable bases", scan.editable],
      ["With a guide", scan.reachable],
      ["No guide", unreachable],
      ["Guides total", scan.totalGuides]
    ].forEach(function (pair) {
      var d = document.createElement("div");
      d.innerHTML = "<span></span><b></b>";
      d.querySelector("span").textContent = pair[0];
      d.querySelector("b").textContent = pair[1];
      stats.appendChild(d);
    });
    box.appendChild(stats);

    if (!rows.length) {
      var none = document.createElement("div");
      none.className = "empty";

      /* Distinguish "the selection is hiding everything" from "this sequence
         genuinely has nothing", the same way the single-base view does. */
      var wider = UMAX.scanSequence(state.seq, state.family, state.allEditors, state.frame);
      var widerRows = wider.entries.filter(function (e) {
        return e.guideCount > 0 && scanRowMatches(e);
      });

      if (widerRows.length && state.consequence === "any") {
        var blocked = {};
        widerRows.forEach(function (e) {
          var ed = e.best.editor;
          if (state.casEnabled[ed.cas] === false) blocked[ed.cas] = true;
          else if (!state.includeUntested && ed.derived) blocked[ed.cas] = true;
        });
        var names = Object.keys(blocked);
        none.textContent = names.length
          ? "Nothing under the current selection, but " + widerRows.length +
            " base" + (widerRows.length > 1 ? "s are" : " is") + " editable using " +
            names.join(", ") + ". Tick that backbone above" +
            (!state.includeUntested ? ", or allow predicted pairings," : "") + " to see them."
          : "No base in this sequence can be edited by the selected editors.";
      } else if (state.consequence !== "any") {
        none.textContent = widerRows.length
          ? "No editable base gives that consequence under the current selection, but " +
            widerRows.length + " would with a wider backbone selection."
          : "No editable base gives that consequence. Try another consequence filter, or check the reading frame.";
      } else {
        none.textContent = "No base in this sequence can be edited by the selected editors.";
      }

      box.appendChild(none);
      return;
    }

    var wrap = document.createElement("div");
    wrap.className = "scanwrap";
    var table = document.createElement("table");
    table.className = "scantable";
    table.innerHTML =
      "<thead><tr>" +
        "<th>Base</th><th>Change</th><th>Consequence</th>" +
        "<th>Best editor</th><th>Spacer + PAM</th><th>Pos</th>" +
        "<th>Byst.</th><th>Guides</th>" +
      "</tr></thead><tbody></tbody>";
    var tbody = table.querySelector("tbody");

    rows.forEach(function (e) {
      var g = e.best;
      var tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.title = "Open this base in the single-base view";

      var change = e.mixedProducts
        ? e.base + "→" + e.spectrum.map(function (o) { return o.observedBase; }).join("/")
        : e.base + "→" + e.spectrum[0].observedBase;

      var consequence = state.frame < 0 ? "—"
        : (e.mixedProducts
            ? e.spectrum.map(function (o) {
                return o.observedBase + ": " + (o.description || "—");
              }).join("  ·  ")
            : (e.spectrum[0].description || "—"));

      var cells = [
        ["mono", String(e.position) + " " + e.base],
        ["mono", change],
        ["tag-" + e.effectClass, consequence],
        ["", g.editor.id + (g.editor.derived ? " (predicted)" : "")],
        ["mono", g.spacer + " " + g.pam],
        ["mono", String(g.position)],
        ["mono", g.bystanders.length ? String(g.bystanders.length) : "—"],
        ["mono", String(e.guideCount)]
      ];
      cells.forEach(function (c) {
        var td = document.createElement("td");
        if (c[0]) td.className = c[0];
        td.textContent = c[1];
        tr.appendChild(td);
      });

      function open() {
        state.target = e.index;
        $("pos").value = String(e.position);
        setMode("one");
      }
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); }
      });
      tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    box.appendChild(wrap);

    var hint = document.createElement("p");
    hint.className = "hint";
    hint.style.marginTop = "12px";
    hint.textContent = "Rows show the best-scoring guide for each base. Click a row to see every guide for it."
      + (unreachable > 0 ? "  " + unreachable + " editable base" + (unreachable > 1 ? "s have" : " has")
          + " no usable guide — usually no PAM in range." : "");
    box.appendChild(hint);
  }

  function setMode(mode) {
    state.mode = mode;
    state.scanConfirmed = false;
    $("modeone").className = "segbtn" + (mode === "one" ? " on" : "");
    $("modeall").className = "segbtn" + (mode === "all" ? " on" : "");
    $("results").hidden = mode !== "one";
    $("scanresults").hidden = mode !== "all";
    $("consequence").hidden = mode !== "all";
    $("filter").hidden = mode !== "one";
    render();
  }

  function renderReference() {
    var tbody = $("reftable").querySelector("tbody");
    tbody.textContent = "";
    activeEditors().forEach(function (ed) {
      var tr = document.createElement("tr");
      [ed.id, UMAX.FAMILY[ed.family].label, ed.pam,
       ed.window[0] + "–" + ed.window[1], ed.peak[0] + "–" + ed.peak[1], ed.use
      ].forEach(function (value, i) {
        var td = document.createElement("td");
        if (i >= 1 && i <= 4) td.className = "num";
        if (i === 0) {
          var s = document.createElement("strong"); s.textContent = value; td.appendChild(s);
          if (ed.derived) {
            var dpred = document.createElement("span");
            dpred.className = "pred"; dpred.textContent = " predicted";
            td.appendChild(dpred);
          } else if (ed.unpublished) {
            var u = document.createElement("span");
            u.className = "unpub"; u.textContent = " unpublished";
            td.appendChild(u);
          }
        }
        else td.textContent = value;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    var cites = $("citations");
    cites.textContent = "Editor parameters from: " +
      state.sources.map(function (s) { return s.citation + " doi:" + s.doi; }).join(" · ");
  }

  /* ---------- clipboard ---------- */

  var toastEl = null, toastTimer = null;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  function copyText(text, message) {
    function fallback() { toast("Copy blocked — select the text manually."); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(message); }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  /* ---------- events ---------- */

  function render() {
    recompute();
    renderTrack();
    renderTarget();
    if (state.mode === "all") renderScan(); else renderResults();
  }

  function wire() {
    $("track").addEventListener("click", function (ev) {
      var btn = ev.target.closest ? ev.target.closest(".base") : null;
      if (!btn) return;
      state.target = parseInt(btn.getAttribute("data-i"), 10);
      $("pos").value = String(state.target + 1);
      render();
    });

    $("seq").addEventListener("input", function () {
      var cleaned = UMAX.cleanSequence(this.value);
      if (cleaned !== state.seq) {
        state.seq = cleaned;
        state.target = -1;
        state.scanConfirmed = false;
        render();
      }
    });

    $("edit").addEventListener("change", function () {
      state.family = this.value;
      $("ayenotice").hidden = !UMAX.FAMILY[state.family].mixedProducts;
      render();
    });
    $("frame").addEventListener("change", function () { state.frame = parseInt(this.value, 10); render(); });
    $("filter").addEventListener("change", function () { state.filter = this.value; renderResults(); });

    $("pos").addEventListener("input", function () {
      var n = parseInt(this.value, 10);
      if (n >= 1 && n <= state.seq.length) { state.target = n - 1; render(); }
    });

    $("copy").addEventListener("click", function () {
      if (state.mode === "all") { copyScan(); return; }
      var rows = [["editor", "cas9", "evidence", "strand", "spacer_5to3", "pam",
                   "target_position", "bystander_positions", "gc_percent",
                   "context", "window", "note"]];
      state.guides.filter(passesFilter).forEach(function (g) {
        var evidence = g.editor.derived ? "predicted pairing"
          : (g.editor.unpublished ? "unpublished" : "published");
        rows.push([g.editor.id, g.editor.cas, evidence, g.strand, g.spacer, g.pam,
                   g.position, g.bystanders.join("|") || "none", g.gc.toFixed(0),
                   g.context || "", g.editor.window[0] + "-" + g.editor.window[1],
                   g.editor.use]);
      });
      copyText(rows.map(function (r) { return r.join("\t"); }).join("\n"), "Table copied as TSV");
    });

    $("modeone").addEventListener("click", function () { setMode("one"); });
    $("modeall").addEventListener("click", function () { setMode("all"); });

    $("consequence").addEventListener("change", function () {
      state.consequence = this.value;
      renderScan();
    });

    $("untested").addEventListener("change", function () {
      state.includeUntested = this.checked;
      renderReference();
      render();
    });

    $("example").addEventListener("click", loadExample);
  }

  function copyScan() {
    if (!state.scan) { toast("Run the scan first"); return; }
    var header = ["base_position", "base", "change", "consequence", "effect_class",
                  "editor", "cas9", "evidence", "strand", "spacer_5to3", "pam",
                  "target_position", "bystander_positions", "gc_percent",
                  "context", "guides_for_this_base"];
    var rows = [header];

    state.scan.entries.filter(function (e) {
      return e.guideCount > 0 && scanRowMatches(e);
    }).forEach(function (e) {
      var g = e.best;
      var change = e.mixedProducts
        ? e.base + ">" + e.spectrum.map(function (o) { return o.observedBase; }).join("/")
        : e.base + ">" + e.spectrum[0].observedBase;
      var consequence = state.frame < 0 ? ""
        : e.spectrum.map(function (o) {
            return o.observedBase + ":" + (o.description || "");
          }).join(" | ");
      rows.push([
        e.position, e.base, change, consequence, e.effectClasses.join("|"),
        g.editor.id, g.editor.cas,
        g.editor.derived ? "predicted pairing" : (g.editor.unpublished ? "unpublished" : "published"),
        g.strand, g.spacer, g.pam, g.position,
        g.bystanders.join("|") || "none", g.gc.toFixed(0), g.context || "",
        e.guideCount
      ]);
    });
    copyText(rows.map(function (r) { return r.join("\t"); }).join("\n"),
      "Scan copied as TSV (" + (rows.length - 1) + " rows)");
  }

  function loadExample() {
    $("seq").value = EXAMPLE;
    $("edit").value = "CBE";
    $("frame").value = "0";
    $("pos").value = String(EXAMPLE_TARGET + 1);
    state.seq = EXAMPLE;
    state.family = "CBE";
    state.frame = 0;
    state.target = EXAMPLE_TARGET;
    $("ayenotice").hidden = !UMAX.FAMILY[state.family].mixedProducts;
    render();
  }

  /* ---------- boot ---------- */

  fetch(versioned("editors.json"))
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      var problems = UMAX.validateEditors(data);
      if (problems.length) throw new Error("editors.json is invalid:\n" + problems.join("\n"));
      state.data = data;
      state.sources = data.sources || [];
      state.casVariants = data.casVariants || [];
      state.allEditors = UMAX.expandEditors(data, { includeUntested: true });

      /* A backbone whose every pairing is predicted contributes nothing until
         predicted pairings are switched on, so it starts unticked and its
         chip says why. Ticking it is then an explicit choice to work with
         predictions, matching how the predicted pairings themselves default. */
      state.casHasPublished = {};
      state.casVariants.forEach(function (c) {
        state.casHasPublished[c.id] = (data.editors || []).some(function (e) {
          return e.cas === c.id;
        });
        state.casEnabled[c.id] = state.casHasPublished[c.id];
      });
      renderCasFilter();
      renderReference();
      $("consequence").hidden = true;
      wire();
      loadExample();
    })
    .catch(function (err) {
      $("loaderror").hidden = false;
      if (window.console) console.error(err);
    });
})();
