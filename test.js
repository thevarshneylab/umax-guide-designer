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
 * Report
 * ------------------------------------------------------------------ */

if (failures.length) {
  console.error("\n" + failures.length + " failed:\n");
  failures.forEach(f => console.error("  ✗ " + f));
  console.error("\n" + passed + " passed, " + failures.length + " failed\n");
  process.exit(1);
}
console.log(passed + " checks passed");
