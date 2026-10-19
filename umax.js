/*!
 * Umax Guide Designer — sgRNA design for zebrafish ABE-Umax and TCBE-Umax base editors.
 * https://github.com/thevarshneylab/umax-guide-designer
 *
 * Runs in the browser (loaded by index.html) and in Node (required by test.js).
 * All editor parameters live in editors.json; nothing editor-specific is hard-coded here.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.UMAX = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  var IUPAC = {
    A: "A", C: "C", G: "G", T: "T",
    R: "AG", Y: "CT", S: "CG", W: "AT", K: "GT", M: "AC",
    B: "CGT", D: "AGT", H: "ACT", V: "ACG", N: "ACGT"
  };

  var CODONS = {
    TTT:"F",TTC:"F",TTA:"L",TTG:"L",CTT:"L",CTC:"L",CTA:"L",CTG:"L",
    ATT:"I",ATC:"I",ATA:"I",ATG:"M",GTT:"V",GTC:"V",GTA:"V",GTG:"V",
    TCT:"S",TCC:"S",TCA:"S",TCG:"S",CCT:"P",CCC:"P",CCA:"P",CCG:"P",
    ACT:"T",ACC:"T",ACA:"T",ACG:"T",GCT:"A",GCC:"A",GCA:"A",GCG:"A",
    TAT:"Y",TAC:"Y",TAA:"*",TAG:"*",CAT:"H",CAC:"H",CAA:"Q",CAG:"Q",
    AAT:"N",AAC:"N",AAA:"K",AAG:"K",GAT:"D",GAC:"D",GAA:"E",GAG:"E",
    TGT:"C",TGC:"C",TGA:"*",TGG:"W",CGT:"R",CGC:"R",CGA:"R",CGG:"R",
    AGT:"S",AGC:"S",AGA:"R",AGG:"R",GGT:"G",GGC:"G",GGA:"G",GGG:"G"
  };

  var AA3 = {
    A:"Ala",R:"Arg",N:"Asn",D:"Asp",C:"Cys",E:"Glu",Q:"Gln",G:"Gly",H:"His",
    I:"Ile",L:"Leu",K:"Lys",M:"Met",F:"Phe",P:"Pro",S:"Ser",T:"Thr",W:"Trp",
    Y:"Tyr",V:"Val","*":"Stop"
  };

  var SPACER_LENGTH = 20;

  /* The base each family deaminates on the protospacer strand, and the
     product it becomes. Everything downstream derives from this table. */
  var FAMILY = {
    ABE: { from: "A", to: "G", senseBase: "A", antisenseBase: "T", label: "A→G" },
    CBE: { from: "C", to: "T", senseBase: "C", antisenseBase: "G", label: "C→T" }
  };

  /* ------------------------------------------------------------------ *
   * Sequence utilities
   * ------------------------------------------------------------------ */

  /** Strip FASTA headers, digits, whitespace and anything that is not a base. */
  function cleanSequence(text) {
    return String(text || "")
      .split("\n")
      .filter(function (line) { return line.charAt(0) !== ">"; })
      .join("")
      .toUpperCase()
      .replace(/[^ACGTN]/g, "");
  }

  function reverseComplement(seq) {
    var map = { A: "T", T: "A", G: "C", C: "G", N: "N" };
    var out = "";
    for (var i = seq.length - 1; i >= 0; i--) out += map[seq.charAt(i)] || "N";
    return out;
  }

  function matchesPam(site, pattern) {
    if (site.length !== pattern.length) return false;
    for (var i = 0; i < pattern.length; i++) {
      var allowed = IUPAC[pattern.charAt(i)];
      if (!allowed || allowed.indexOf(site.charAt(i)) < 0) return false;
    }
    return true;
  }

  /** Classify a 3-nt PAM into the tiers the Umax papers rank by. */
  function pamTier(site) {
    var second = site.charAt(1);
    if (second === "G") return "NGN";
    if (second === "A") return "NAN";
    return "NYN";
  }

  function gcPercent(seq) {
    if (!seq.length) return 0;
    return (seq.match(/[GC]/g) || []).length / seq.length * 100;
  }

  function translate(seq) {
    var out = "";
    for (var i = 0; i + 2 < seq.length; i += 3) out += CODONS[seq.substr(i, 3)] || "X";
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Guide finding
   * ------------------------------------------------------------------ */

  /**
   * Which strand's guide can edit the base at `index`?
   * Base editors deaminate the displaced protospacer strand, so an A or C on
   * the sense strand needs a sense-strand guide, and a T or G needs an
   * antisense one.
   * @returns {"+"|"-"|null}
   */
  function guideStrandFor(base, family) {
    var f = FAMILY[family];
    if (!f) throw new Error("Unknown editor family: " + family);
    if (base === f.senseBase) return "+";
    if (base === f.antisenseBase) return "-";
    return null;
  }

  /**
   * Find every guide that places the base at `target` inside an editing window.
   * @param {string} seq      cleaned sense-strand sequence
   * @param {number} target   0-based index into seq
   * @param {string} family   "ABE" | "CBE"
   * @param {Array}  editors  entries from editors.json
   * @returns {Array} guide objects
   */
  function findGuides(seq, target, family, editors) {
    var base = seq.charAt(target);
    var strand = guideStrandFor(base, family);
    if (!strand) return [];

    var onSense = strand === "+";
    var length = seq.length;
    var work = onSense ? seq : reverseComplement(seq);
    var workTarget = onSense ? target : length - 1 - target;
    var editedBase = FAMILY[family].from;
    var results = [];

    function toSenseIndex(start, positionInSpacer) {
      var idx = start + positionInSpacer - 1;
      return onSense ? idx : length - 1 - idx;
    }

    for (var e = 0; e < editors.length; e++) {
      var ed = editors[e];
      if (ed.family !== family) continue;

      var pamLength = ed.pam.length;
      var winStart = ed.window[0];
      var winEnd = ed.window[1];

      for (var pos = winStart; pos <= winEnd; pos++) {
        var start = workTarget - (pos - 1);
        if (start < 0 || start + SPACER_LENGTH + pamLength > work.length) continue;

        var spacer = work.substr(start, SPACER_LENGTH);
        var pamSite = work.substr(start + SPACER_LENGTH, pamLength);
        if (spacer.indexOf("N") >= 0 || pamSite.indexOf("N") >= 0) continue;
        if (!matchesPam(pamSite, ed.pam)) continue;

        var bystanders = [];
        for (var w = winStart; w <= winEnd; w++) {
          if (w !== pos && spacer.charAt(w - 1) === editedBase) bystanders.push(w);
        }

        results.push({
          editor: ed,
          strand: strand,
          spacer: spacer,
          pam: pamSite,
          pamTier: pamTier(pamSite),
          start: start,
          position: pos,
          inPeak: pos >= ed.peak[0] && pos <= ed.peak[1],
          bystanders: bystanders,
          targetIndex: target,
          bystanderIndices: bystanders.map(function (w) { return toSenseIndex(start, w); }),
          gc: gcPercent(spacer),
          hasPolyT: /TTTT/.test(spacer)
        });
      }
    }
    return results;
  }

  /* ------------------------------------------------------------------ *
   * Protein consequence
   * ------------------------------------------------------------------ */

  /** Apply base-editor edits at the given sense-strand indices. */
  function applyEdits(seq, family, strand, senseIndices) {
    var f = FAMILY[family];
    var chars = seq.split("");
    for (var i = 0; i < senseIndices.length; i++) {
      chars[senseIndices[i]] = strand === "+" ? f.to : reverseComplement(f.to);
    }
    return chars.join("");
  }

  /**
   * Codon-level consequences of a set of edits.
   * @param {number} frame  0-based index of the first base of codon 1, or -1 for non-coding
   * @returns {Array|null}  one entry per affected codon
   */
  function codonEffects(seq, frame, family, strand, senseIndices) {
    if (frame < 0 || !senseIndices.length) return null;
    var edited = applyEdits(seq, family, strand, senseIndices);
    var seen = {};
    var changes = [];

    for (var i = 0; i < senseIndices.length; i++) {
      var idx = senseIndices[i];
      if (idx < frame) continue;
      var codonNumber = Math.floor((idx - frame) / 3);
      if (seen[codonNumber]) continue;
      seen[codonNumber] = true;

      var startBase = frame + codonNumber * 3;
      if (startBase + 3 > seq.length) continue;

      var before = CODONS[seq.substr(startBase, 3)];
      var after = CODONS[edited.substr(startBase, 3)];
      if (!before || !after) continue;

      changes.push({
        codon: codonNumber + 1,
        from: before,
        to: after,
        fromCodon: seq.substr(startBase, 3),
        toCodon: edited.substr(startBase, 3),
        silent: before === after
      });
    }
    return changes;
  }

  function describeEffect(change) {
    if (change.silent) return change.from + change.codon + "= (silent)";
    if (change.to === "*") return change.from + change.codon + "* (premature stop)";
    if (change.from === "*") return "stop" + change.codon + change.to + " (stop lost)";
    return change.from + change.codon + change.to +
      " (" + AA3[change.from] + "→" + AA3[change.to] + ")";
  }

  /* ------------------------------------------------------------------ *
   * Ranking
   * ------------------------------------------------------------------ *
   * A triage heuristic, not a trained efficiency model. It encodes the
   * published selection strategies: prefer the peak window, prefer NGG,
   * punish bystanders unless the reading frame shows they are silent.
   */

  var WEIGHTS = {
    peakWindow: 30,
    edgeOfWindow: 8,
    nggPam: 20,
    engineeredPam: 15,
    pamPreferenceTop: 12,
    pamPreferenceStep: 4,
    pamUnlisted: 6,
    bystanderInPeak: -12,
    bystanderInWindow: -7,
    bystanderSilent: -2,
    activityScale: 20,
    gcInRange: 5,
    gcOutOfRange: -6,
    polyT: -15,
    leadingG: 2
  };

  function scoreGuide(guide, seq, frame, family) {
    var ed = guide.editor;
    var score = guide.inPeak ? WEIGHTS.peakWindow : WEIGHTS.edgeOfWindow;

    if (ed.pam === "NGG") {
      score += WEIGHTS.nggPam;
    } else if (ed.pamPreference) {
      var rank = ed.pamPreference.indexOf(guide.pamTier);
      score += rank < 0
        ? WEIGHTS.pamUnlisted
        : WEIGHTS.pamPreferenceTop - WEIGHTS.pamPreferenceStep * rank;
    } else {
      score += WEIGHTS.engineeredPam;
    }

    var silentCodons = {};
    var bystanderChanges = codonEffects(seq, frame, family, guide.strand, guide.bystanderIndices);
    if (bystanderChanges) {
      bystanderChanges.forEach(function (c) { if (c.silent) silentCodons[c.codon] = true; });
    }

    for (var i = 0; i < guide.bystanders.length; i++) {
      var w = guide.bystanders[i];
      var idx = guide.bystanderIndices[i];
      var codon = frame >= 0 ? Math.floor((idx - frame) / 3) + 1 : null;
      if (codon !== null && silentCodons[codon]) {
        score += WEIGHTS.bystanderSilent;
      } else if (w >= ed.peak[0] && w <= ed.peak[1]) {
        score += WEIGHTS.bystanderInPeak;
      } else {
        score += WEIGHTS.bystanderInWindow;
      }
    }

    /* Narrow-window editors buy precision by giving up on-target activity, so
       they are discounted by that reported activity. They then win only where
       the bystander penalties above say they earn it. */
    var activity = typeof ed.activity === "number" ? ed.activity : 1;
    score += (activity - 1) * WEIGHTS.activityScale;
    if (ed.penalty) score -= ed.penalty;
    score += (guide.gc >= 35 && guide.gc <= 75) ? WEIGHTS.gcInRange : WEIGHTS.gcOutOfRange;
    if (guide.hasPolyT) score += WEIGHTS.polyT;
    if (guide.spacer.charAt(0) === "G") score += WEIGHTS.leadingG;

    return score;
  }

  /** Find, score and rank in one call. */
  function design(seq, target, family, editors, frame) {
    var guides = findGuides(seq, target, family, editors);
    guides.forEach(function (g) { g.score = scoreGuide(g, seq, frame, family); });
    guides.sort(function (a, b) { return b.score - a.score; });
    return guides;
  }

  /** Validate editors.json so a bad contribution fails loudly. */
  function validateEditors(data) {
    var problems = [];
    if (!data || !Array.isArray(data.editors)) return ["editors.json has no `editors` array"];
    var ids = {};
    data.editors.forEach(function (ed, i) {
      var where = ed.id || "entry " + i;
      if (!ed.id) problems.push(where + ": missing id");
      if (ids[ed.id]) problems.push(where + ": duplicate id");
      ids[ed.id] = true;
      if (!FAMILY[ed.family]) problems.push(where + ": family must be ABE or CBE");
      if (!ed.pam || !/^[ACGTRYSWKMBDHVN]+$/.test(ed.pam)) problems.push(where + ": invalid pam");
      ["window", "peak"].forEach(function (k) {
        var r = ed[k];
        if (!Array.isArray(r) || r.length !== 2) { problems.push(where + ": " + k + " must be [start, end]"); return; }
        if (r[0] < 1 || r[1] > SPACER_LENGTH) problems.push(where + ": " + k + " outside 1-" + SPACER_LENGTH);
        if (r[0] > r[1]) problems.push(where + ": " + k + " start is after its end");
      });
      if (Array.isArray(ed.window) && Array.isArray(ed.peak)) {
        if (ed.peak[0] < ed.window[0] || ed.peak[1] > ed.window[1]) {
          problems.push(where + ": peak must sit inside window");
        }
      }
      if (!ed.use) problems.push(where + ": missing `use` note");
    });
    return problems;
  }

  return {
    SPACER_LENGTH: SPACER_LENGTH,
    FAMILY: FAMILY,
    AA3: AA3,
    CODONS: CODONS,
    WEIGHTS: WEIGHTS,
    cleanSequence: cleanSequence,
    reverseComplement: reverseComplement,
    matchesPam: matchesPam,
    pamTier: pamTier,
    gcPercent: gcPercent,
    translate: translate,
    guideStrandFor: guideStrandFor,
    findGuides: findGuides,
    applyEdits: applyEdits,
    codonEffects: codonEffects,
    describeEffect: describeEffect,
    scoreGuide: scoreGuide,
    design: design,
    validateEditors: validateEditors
  };
});
