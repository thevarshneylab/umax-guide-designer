/*
 * Umax Guide Designer — test suite. Run with: node test.js
 * No dependencies. Exits non-zero on failure, so it works as a CI step.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const UMAX = require("./umax.js");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "editors.json"), "utf8"));
const EDITORS = data.editors;

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; return; }
  failures.push(name + (detail ? "\n    " + detail : ""));
}
function equal(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    "expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}

/* ------------------------------------------------------------------ *
 * editors.json is well formed
 * ------------------------------------------------------------------ */

equal("editors.json validates", UMAX.validateEditors(data), []);
check("editors.json has both families",
  EDITORS.some(e => e.family === "ABE") && EDITORS.some(e => e.family === "CBE"));

/* Published windows — these are the numbers the tool exists to get right,
   so they are asserted explicitly against the papers. */
const WINDOWS = {
  "ABE-Umax": [3, 9], "ABE-Umax-ex1": [4, 12], "ABE-Umax-ex2": [8, 16],
  "ABE-Umax-rest1": [5, 6], "ABE-Umax-ex1-rest1": [4, 6], "ABE-Umax-ex2-rest1": [12, 15],
  "TCBE-Umax": [4, 10], "TCBE-Umax-ex1": [3, 12], "TCBE-Umax-ex2": [4, 16],
  "TCBE-Umax-rest1": [5, 7], "TCBE-Umax-rest2": [4, 7]
};
Object.keys(WINDOWS).forEach(id => {
  const ed = EDITORS.find(e => e.id === id);
  check(id + " is present", !!ed);
  if (ed) equal(id + " window matches publication", ed.window, WINDOWS[id]);
});

/* ------------------------------------------------------------------ *
 * Sequence utilities
 * ------------------------------------------------------------------ */

equal("cleanSequence strips FASTA and numbers",
  UMAX.cleanSequence(">chr1 test\nacgt 123\nNNtt"), "ACGTNNTT");
equal("reverseComplement", UMAX.reverseComplement("ATGGCN"), "NGCCAT");
check("matchesPam NGG accepts AGG", UMAX.matchesPam("AGG", "NGG"));
check("matchesPam NGG rejects AGT", !UMAX.matchesPam("AGT", "NGG"));
check("matchesPam NNN accepts anything", UMAX.matchesPam("TCA", "NNN"));
equal("pamTier NGN", UMAX.pamTier("AGT"), "NGN");
equal("pamTier NAN", UMAX.pamTier("CAT"), "NAN");
equal("pamTier NYN", UMAX.pamTier("ATT"), "NYN");
equal("translate", UMAX.translate("ATGCGATGA"), "MR*");

/* ------------------------------------------------------------------ *
 * Strand selection
 * ------------------------------------------------------------------ */

equal("ABE edits sense-strand A with a sense guide", UMAX.guideStrandFor("A", "ABE"), "+");
equal("ABE edits sense-strand T with an antisense guide", UMAX.guideStrandFor("T", "ABE"), "-");
equal("ABE cannot edit C", UMAX.guideStrandFor("C", "ABE"), null);
equal("CBE edits sense-strand C with a sense guide", UMAX.guideStrandFor("C", "CBE"), "+");
equal("CBE edits sense-strand G with an antisense guide", UMAX.guideStrandFor("G", "CBE"), "-");

/* ------------------------------------------------------------------ *
 * Worked example: nonsense edit in a CGA (Arg) codon
 *
 *   ATG GCA TCC GAG TTC AAG CGA GGC TAC ACC AAG AGG ...
 *    1   2   3   4   5   6   7
 *                            ^ base 19, the C of CGA
 *
 * This is the CGA->TGA pattern used for myo7aa R570* in the TCBE-Umax paper.
 * ------------------------------------------------------------------ */

const EXAMPLE = "ATGGCATCCGAGTTCAAGCGAGGCTACACCAAGAGGCTGAACTGCTCAGATGTGCCTCAGTTTGACAAGCTACAGGCTACGTGGAACCCAGAGTACAGCTGA";
const TARGET = 18;      // 0-based index of the C in CGA
const FRAME = 0;

equal("example target base is C", EXAMPLE.charAt(TARGET), "C");
equal("example codon 7 is CGA (Arg)", UMAX.CODONS[EXAMPLE.substr(18, 3)], "R");

const onTarget = UMAX.codonEffects(EXAMPLE, FRAME, "CBE", "+", [TARGET]);
equal("C19>T hits codon 7", onTarget[0].codon, 7);
equal("C19>T gives a stop codon", onTarget[0].to, "*");
equal("C19>T is described as a premature stop",
  UMAX.describeEffect(onTarget[0]), "R7* (premature stop)");

const guides = UMAX.design(EXAMPLE, TARGET, "CBE", EDITORS, FRAME);
check("example yields guides", guides.length > 0);

const byId = id => guides.filter(g => g.editor.id === id);

const tcbe = byId("TCBE-Umax")[0];
check("TCBE-Umax finds the NGG guide", !!tcbe);
equal("target lands at position 6", tcbe.position, 6);
equal("spacer is correct", tcbe.spacer, "TCAAGCGAGGCTACACCAAG");
equal("PAM is AGG", tcbe.pam, "AGG");
equal("no bystanders in the 4-10 window", tcbe.bystanders, []);
check("position 6 is inside the peak window", tcbe.inPeak);

/* The precision editors should also come back clean here. */
equal("rest1 is bystander-free", byId("TCBE-Umax-rest1")[0].bystanders, []);
equal("rest2 is bystander-free", byId("TCBE-Umax-rest2")[0].bystanders, []);

/* ex2's window reaches positions 4-16 and so picks up extra cytosines. */
equal("ex2 reports the extra cytosines in its wider window",
  byId("TCBE-Umax-ex2")[0].bystanders, [11, 14, 16]);

/* Ranking: a clean peak-window NGG guide should outrank the same site
   designed with a wide-window editor that drags in three bystanders. */
check("clean NGG guide outranks the wide-window alternative",
  tcbe.score > byId("TCBE-Umax-ex2")[0].score,
  "TCBE-Umax " + tcbe.score + " vs ex2 " + byId("TCBE-Umax-ex2")[0].score);
equal("top-ranked guide is bystander-free", guides[0].bystanders, []);

/* The precision editors trade on-target activity for a narrow window, so they
   should only outrank TCBE-Umax where that narrower window removes a real
   bystander. With no bystanders to remove, the high-activity editor wins. */
equal("with no bystanders, TCBE-Umax is top", guides[0].editor.id, "TCBE-Umax");
check("TCBE-Umax outranks rest2 when both are clean",
  tcbe.score > byId("TCBE-Umax-rest2")[0].score);
check("TCBE-Umax outranks rest1 when both are clean",
  tcbe.score > byId("TCBE-Umax-rest1")[0].score);

/* Base 5: TCBE-Umax picks up two non-silent bystanders, rest2 is clean. */
const crowded = UMAX.design(EXAMPLE, 4, "CBE", EDITORS, FRAME);
const crowdedUmax = crowded.find(g => g.editor.id === "TCBE-Umax");
const crowdedRest2 = crowded.find(g => g.editor.id === "TCBE-Umax-rest2");
equal("base 5 gives TCBE-Umax two bystanders", crowdedUmax.bystanders, [8, 9]);
equal("base 5 leaves rest2 clean", crowdedRest2.bystanders, []);
equal("precision editor wins when it removes bystanders",
  crowded[0].editor.id, "TCBE-Umax-rest2");

/* Base 66: the single bystander is silent, so it is not worth half the
   activity and the high-activity editor should still win. */
const silentCase = UMAX.design(EXAMPLE, 65, "CBE", EDITORS, FRAME);
const silentUmax = silentCase.find(g => g.editor.id === "TCBE-Umax");
check("base 66 gives TCBE-Umax a bystander", silentUmax.bystanders.length === 1);
check("that bystander is silent",
  UMAX.codonEffects(EXAMPLE, FRAME, "CBE", silentUmax.strand, silentUmax.bystanderIndices)[0].silent);
equal("a silent bystander does not hand the win to the precision editor",
  silentCase[0].editor.id, "TCBE-Umax");

/* ------------------------------------------------------------------ *
 * Antisense targeting
 * ------------------------------------------------------------------ */

const gIndex = EXAMPLE.indexOf("G", 30);
const antisense = UMAX.design(EXAMPLE, gIndex, "CBE", EDITORS, FRAME);
check("a sense-strand G is targeted by antisense guides",
  antisense.every(g => g.strand === "-"));
antisense.slice(0, 5).forEach(g => {
  check("antisense spacer matches the reverse complement at " + g.editor.id,
    UMAX.reverseComplement(EXAMPLE).indexOf(g.spacer) === g.start);
});

/* Antisense design must work for every editable base that has room for it,
   on both families. This is the regression guard for "no antisense guides". */
["ABE", "CBE"].forEach(family => {
  const editable = [];
  for (let i = 0; i < EXAMPLE.length; i++) {
    if (UMAX.guideStrandFor(EXAMPLE.charAt(i), family) === "-") editable.push(i);
  }
  check(family + " has antisense-targetable bases in the example", editable.length > 0);

  const withGuides = editable.filter(i => UMAX.design(EXAMPLE, i, family, EDITORS, FRAME).length > 0);
  check(family + " designs antisense guides", withGuides.length > 0,
    withGuides.length + " of " + editable.length + " antisense bases yielded guides");

  /* Every antisense base with ≥30 nt of upstream room must be designable. */
  editable.filter(i => i >= 30 && i < EXAMPLE.length - 5).forEach(i => {
    check(family + " antisense base " + (i + 1) + " with ample upstream flank is designable",
      UMAX.design(EXAMPLE, i, family, EDITORS, FRAME).length > 0);
  });
});

/* ------------------------------------------------------------------ *
 * Flank reporting — the PAM side depends on the guide strand
 * ------------------------------------------------------------------ */

const senseFlank = UMAX.flankReport(EXAMPLE, TARGET, "CBE", EDITORS);
equal("a sense-strand target needs downstream room", senseFlank.pamSide, "downstream");
equal("sense target reports its strand", senseFlank.strand, "+");

const gIdx = EXAMPLE.indexOf("G", 20);
const antiFlank = UMAX.flankReport(EXAMPLE, gIdx, "CBE", EDITORS);
equal("an antisense-strand target needs upstream room", antiFlank.pamSide, "upstream");
equal("antisense target reports its strand", antiFlank.strand, "-");
check("with ample flank, nothing is reported short", !antiFlank.shortOnPamSide);
check("and a guide physically fits", antiFlank.roomForAnyGuide);

/* Two distinct reasons a target can yield nothing, which the UI must not
   conflate: no physical room for a spacer, versus room but no matching PAM.
   The minimum PAM-side room any CBE placement needs is 20 - 16 + 3 = 7
   (TCBE-Umax-ex2 at position 16), so 4 nt upstream cannot fit anything. */
const noRoom = EXAMPLE.slice(gIdx - 4);
const cramped = UMAX.flankReport(noRoom, 4, "CBE", EDITORS);
equal("a cramped antisense target is short on the upstream side", cramped.shortOnPamSide, true);
equal("and the side named is upstream, not downstream", cramped.pamSide, "upstream");
equal("no placement fits at all", cramped.roomForAnyGuide, false);
check("it says how many more bases are needed", cramped.extraPamSide > 0);
equal("no guides are found for it", UMAX.design(noRoom, 4, "CBE", EDITORS, -1).length, 0);

/* With 10 nt upstream, TCBE-Umax-ex2 placements do fit geometrically, so a
   lack of guides there is a PAM problem and must NOT be reported as short. */
const roomButNoPam = UMAX.flankReport(EXAMPLE.slice(gIdx - 10), 10, "CBE", EDITORS);
equal("room for a placement is reported as such", roomButNoPam.roomForAnyGuide, true);
equal("and it is not blamed on flank length", roomButNoPam.shortOnPamSide, false);

check("the same base with full upstream context is designable",
  UMAX.design(EXAMPLE, gIdx, "CBE", EDITORS, -1).length > 0);

equal("flankReport returns null for a base this family cannot edit",
  UMAX.flankReport(EXAMPLE, EXAMPLE.indexOf("A"), "CBE", EDITORS), null);

/* Edits on an antisense guide change the sense strand to the complement. */
equal("antisense CBE edit writes G>A on the sense strand",
  UMAX.applyEdits("ATGCG", "CBE", "-", [4]), "ATGCA");
equal("sense CBE edit writes C>T",
  UMAX.applyEdits("ATGCG", "CBE", "+", [3]), "ATGTG");
equal("antisense ABE edit writes T>C on the sense strand",
  UMAX.applyEdits("ATGCG", "ABE", "-", [1]), "ACGCG");

/* ------------------------------------------------------------------ *
 * Window boundaries are respected
 * ------------------------------------------------------------------ */

/* For NGG editors, build a sequence whose only GG dinucleotide is the PAM, so
   exactly one spacer alignment is possible and the window edges can be probed
   directly. Filler is chosen to contain no G at all (or no C, for CBE). */
EDITORS.filter(ed => ed.pam === "NGG").forEach(ed => {
  const base = UMAX.FAMILY[ed.family].from;
  const filler = base === "C" ? "A" : "C";
  for (let pos = 1; pos <= UMAX.SPACER_LENGTH; pos++) {
    const spacer = Array.from({ length: UMAX.SPACER_LENGTH },
      (_, i) => (i === pos - 1 ? base : filler)).join("");
    const seq = filler.repeat(20) + spacer + "AGG" + filler.repeat(20);
    const target = 20 + (pos - 1);
    const found = UMAX.findGuides(seq, target, ed.family, [ed]);
    const expected = pos >= ed.window[0] && pos <= ed.window[1];
    check(ed.id + " position " + pos + (expected ? " is designable" : " is correctly rejected"),
      (found.length > 0) === expected,
      "found " + found.length + " guide(s)");
    if (expected) equal(ed.id + " reports position " + pos, found[0].position, pos);
  }
});

/* Editors with relaxed PAMs can slide the spacer, so a base outside one
   alignment's window is still reachable by another. The invariant that must
   hold for every editor is that a returned guide always places the target
   inside that editor's own window, and always at the base it was asked for. */
[EXAMPLE, UMAX.reverseComplement(EXAMPLE)].forEach((seq, s) => {
  const label = s === 0 ? "sense" : "revcomp";
  ["ABE", "CBE"].forEach(family => {
    for (let i = 0; i < seq.length; i++) {
      if (!UMAX.guideStrandFor(seq.charAt(i), family)) continue;
      UMAX.findGuides(seq, i, family, EDITORS).forEach(g => {
        check(label + " " + family + " base " + (i + 1) + ": " + g.editor.id + " stays in window",
          g.position >= g.editor.window[0] && g.position <= g.editor.window[1],
          "position " + g.position + " outside " + g.editor.window.join("-"));
        check(label + " " + family + " base " + (i + 1) + ": " + g.editor.id + " targets the right base",
          g.spacer.charAt(g.position - 1) === UMAX.FAMILY[family].from);
        check(label + " " + family + " base " + (i + 1) + ": " + g.editor.id + " PAM is valid",
          UMAX.matchesPam(g.pam, g.editor.pam));
      });
    }
  });
});

/* A base with no PAM anywhere downstream yields nothing. */
equal("no PAM means no guides",
  UMAX.findGuides("A".repeat(60), 30, "ABE", EDITORS.filter(e => e.pam === "NGG")).length, 0);

/* ------------------------------------------------------------------ *
 * Adenine transversion editing (zAYE, unpublished)
 *
 * Unlike the transition editors, one edited adenine resolves into several
 * products, so the tool must report the whole spectrum rather than a single
 * consequence. Window is 6-8 with peak activity at 7.
 * ------------------------------------------------------------------ */

const AYE_WINDOWS = {
  "zAYE-1028": [6, 8], "zAYE-1028-SpG": [6, 8], "zAYE-1028-SpRY": [6, 8]
};
Object.keys(AYE_WINDOWS).forEach(id => {
  const ed = EDITORS.find(e => e.id === id);
  check(id + " is present", !!ed);
  if (ed) {
    equal(id + " window matches the manuscript", ed.window, AYE_WINDOWS[id]);
    equal(id + " peaks at position 7", ed.peak, [7, 7]);
    equal(id + " is flagged unpublished", ed.unpublished, true);
    equal(id + " prefers CAG and CAA", ed.favorableContexts, ["CAG", "CAA"]);
  }
});

equal("AYE acts on adenine via a sense guide", UMAX.guideStrandFor("A", "AYE"), "+");
equal("AYE acts on a sense-strand T via an antisense guide", UMAX.guideStrandFor("T", "AYE"), "-");
equal("AYE cannot edit C", UMAX.guideStrandFor("C", "AYE"), null);
equal("AYE is declared as producing mixed products", UMAX.FAMILY.AYE.mixedProducts, true);
equal("the transition families are not", UMAX.FAMILY.ABE.mixedProducts, false);

/* The spectrum: three products, correctly ordered and classified. */
const aIdx = EXAMPLE.indexOf("A", 15);
const spectrum = UMAX.outcomeSpectrum(EXAMPLE, FRAME, "AYE", "+", aIdx);
equal("three products are reported", spectrum.length, 3);
equal("the intended product is C", spectrum[0].base, "C");
equal("and is classified as intended", spectrum[0].kind, "intended");
equal("A-to-T is the alternate product", spectrum[1].base, "T");
equal("residual A-to-G is flagged as a byproduct", spectrum[2].kind, "byproduct");
equal("A-to-G is the byproduct base", spectrum[2].base, "G");
check("each product carries a protein consequence",
  spectrum.every(o => typeof o.description === "string" && o.description.length > 0));
check("the three products give different consequences here",
  new Set(spectrum.map(o => o.description)).size === 3);

/* A transition editor still reports exactly one outcome. */
equal("CBE reports a single product",
  UMAX.outcomeSpectrum(EXAMPLE, FRAME, "CBE", "+", TARGET).length, 1);

/* On an antisense guide the products are complemented onto the sense strand:
   an A-to-C edit on the protospacer reads as T-to-G on the pasted sequence. */
const tIdx = EXAMPLE.indexOf("T", 20);
const antiSpec = UMAX.outcomeSpectrum(EXAMPLE, FRAME, "AYE", "-", tIdx);
equal("antisense intended product is read as G on the sense strand",
  antiSpec[0].observedBase, "G");
equal("antisense alternate reads as A", antiSpec[1].observedBase, "A");
equal("antisense byproduct reads as C", antiSpec[2].observedBase, "C");
equal("the protospacer-strand base is still C for the intended product",
  antiSpec[0].base, "C");

/* applyEdits must honour the requested product rather than always the default. */
equal("applyEdits installs the alternate product when asked",
  UMAX.applyEdits("GGAGG", "AYE", "+", [2], "T"), "GGTGG");
equal("applyEdits defaults to the intended product",
  UMAX.applyEdits("GGAGG", "AYE", "+", [2]), "GGCGG");
equal("applyEdits complements the product on an antisense guide",
  UMAX.applyEdits("GGTGG", "AYE", "-", [2], "C"), "GGGGG");

/* Sequence context is read as the trinucleotide centred on the target. */
equal("targetContext reads the trinucleotide", UMAX.targetContext("GGCAGTTTTTTTTTTTTTTT", 4), "CAG");
equal("targetContext is null at the spacer's first position",
  UMAX.targetContext("ACGTACGTACGTACGTACGT", 1), null);

/* Context preference must actually move the ranking: the same guide geometry
   in a CAG context should outrank one in a context the editor dislikes. */
(() => {
  const pre = "GGGGG";                      // positions 1-5
  const tail = "TTTTTTTTTTTT";              // pad to 20 nt
  const favSpacer  = (pre + "CAG" + tail).slice(0, 20);   // A at position 7, CAG
  const plainSpacer = (pre + "GAG" + tail).slice(0, 20);  // A at position 7, GAG
  const fav = UMAX.design(favSpacer + "AGG" + "TTTTT", 6, "AYE", EDITORS, -1);
  const plain = UMAX.design(plainSpacer + "AGG" + "TTTTT", 6, "AYE", EDITORS, -1);
  check("a CAG context is detected", fav.length > 0 && fav[0].context === "CAG");
  check("and marked favorable", fav.length > 0 && fav[0].contextFavorable === true);
  check("a non-preferred context is marked as such",
    plain.length > 0 && plain[0].contextFavorable === false);
  check("the favorable context scores higher",
    fav.length > 0 && plain.length > 0 && fav[0].score > plain[0].score,
    "CAG " + (fav[0] || {}).score + " vs GAG " + (plain[0] || {}).score);
})();

/* Context is only scored for editors that declare a preference. */
const cbeGuide = UMAX.design(EXAMPLE, TARGET, "CBE", EDITORS, FRAME)[0];
equal("transition editors report no context verdict", cbeGuide.contextFavorable, null);

/* The narrow 6-8 window must be enforced exactly. */
EDITORS.filter(e => e.family === "AYE" && e.pam === "NGG").forEach(ed => {
  for (let pos = 1; pos <= UMAX.SPACER_LENGTH; pos++) {
    const spacer = Array.from({ length: UMAX.SPACER_LENGTH },
      (_, i) => (i === pos - 1 ? "A" : "C")).join("");
    const seq = "C".repeat(20) + spacer + "AGG" + "C".repeat(20);
    const found = UMAX.findGuides(seq, 20 + pos - 1, "AYE", [ed]);
    const expected = pos >= 6 && pos <= 8;
    check(ed.id + " position " + pos + (expected ? " is designable" : " is correctly rejected"),
      (found.length > 0) === expected);
  }
});

/* Antisense A-to-Y must work, same as the transition families. */
(() => {
  const editable = [];
  for (let i = 0; i < EXAMPLE.length; i++) {
    if (UMAX.guideStrandFor(EXAMPLE.charAt(i), "AYE") === "-") editable.push(i);
  }
  const withGuides = editable.filter(i => UMAX.design(EXAMPLE, i, "AYE", EDITORS, FRAME).length > 0);
  check("AYE designs antisense guides", withGuides.length > 0,
    withGuides.length + " of " + editable.length + " antisense bases yielded guides");
})();

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

if (failures.length) {
  console.error("\n" + failures.length + " failed:\n");
  failures.forEach(f => console.error("  ✗ " + f));
  console.error("\n" + passed + " passed, " + failures.length + " failed\n");
  process.exit(1);
}
console.log(passed + " checks passed");
