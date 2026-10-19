# Umax Guide Designer

sgRNA design for zebrafish base editing with the **ABE-Umax** and **TCBE-Umax** editor families.

Pick the base you want to change, and the tool returns every guide that places it inside a published editing window — with bystander edits and codon consequences worked out for each editor in the suite.

**→ [Use it here](https://thevarshneylab.github.io/umax-guide-designer/)**

It runs entirely in your browser. Nothing is uploaded, nothing is logged, and it works offline once loaded.

---

## Why this exists

The Umax suites solved the targeting problem by giving you sixteen editors with different windows and PAMs — but that moves the work to choosing among them. Both papers end with a decision tree, and this tool is that decision tree, applied to your sequence.

The window numbers matter more than they look. ABE-Umax edits positions 3–9, ABE-Umax-ex2 edits 8–16, and ABE-Umax-rest1 edits only 5–6. A guide that is perfect for one is useless for another, and a bystander adenine that ruins a variant assay with ABE-Umax may be entirely outside the window of rest1.

## Worked example

Open the tool and press **Load example**. It opens on this sequence in frame, with base 19 selected:

```
    1 ATGGCATCCG AGTTCAAGCG AGGCTACACC AAGAGGCTGA ACTGCTCAGA TGTGCCTCAG
      M  A  S  E  F  K  R  G  Y  T  K  R  L  N  C  S  D  V  P  Q
                            ^
                            base 19 — the C of CGA (Arg7)
```

A C→T edit here turns `CGA` (Arg) into `TGA` (stop) — the same premature-stop strategy used for *myo7aa* R570\* in the TCBE-Umax paper. The tool returns:

| Rank | Editor | Position | PAM | Bystanders | Protein |
|---|---|---|---|---|---|
| 1 | **TCBE-Umax** | 6 (peak) | AGG | none | R7\* |
| 2 | TCBE-Umax-ex1 | 6 | AGG | C11 | R7\*; G8= |
| 3 | TCBE-Umax-rest2 | 6 | AGG | none | R7\* |
| … | TCBE-Umax-ex2 | 6 | AGG | C11, C14, C16 | R7\*; G8=; Y9=; T10I |

Spacer: `TCAAGCGAGGCTACACCAAG` + `AGG`

TCBE-Umax ranks first: the target sits at position 6, inside the peak window, with no other cytosine anywhere in positions 4–10. TCBE-Umax-ex2 reaches the same site but its 4–16 window drags in three more cytosines, one of which changes Thr10 to Ile — exactly the kind of confound the ranking exists to surface.

Note that **rest2 does not win here**, even though it is the narrowest editor. It buys precision by giving up about a quarter of its on-target activity, and there is no bystander to remove. Click base 5 instead, where TCBE-Umax picks up two non-silent bystanders, and rest2 moves to the top.

## What it does

- **Scans both strands.** Base editors deaminate the displaced protospacer strand, so an A or C needs a sense-strand guide and a T or G needs an antisense one. The tool picks the strand; you never reverse-complement by hand.
- **Places the target in each editor's real window**, not a generic 4–8.
- **Finds bystanders** — every other editable base inside the window — and shows where they fall.
- **Translates the consequence.** Give it a reading frame and each guide reports the on-target change and every bystander change: silent, missense, or premature stop. Leave the frame unset for splice-site and non-coding work.
- **Ranks candidates** by window fit, PAM quality, bystander burden, reported on-target activity, GC content and poly-T tracts. Two parts of that are worth knowing: a bystander the reading frame shows to be silent is discounted almost to nothing, and the narrow-window editors are discounted by the activity they give up, so they rise to the top only where they actually remove a bystander.
- **Tiers relaxed PAMs** the way the papers do: NGN > NAN > NYN for ABE-Umax-SpRY, NAN > NYN for TCBE-Umax-SpRY.

## What it deliberately does not do

**No genome-wide off-target search.** That needs the GRCz11 reference and an index, which is a server, not a web page. Copy a spacer into [CRISPOR](https://crispor.gi.ucsc.edu/) or [Cas-OFFinder](http://www.rgenome.net/cas-offinder/) against *Danio rerio* GRCz11/danRer11 — the same tools both papers used, allowing up to four mismatches and then amplicon-sequencing the top three sites.

**No efficiency prediction.** [BE-Hive](http://crisprbehive.design/) and DeepBE are trained models, and neither was trained on zebrafish embryos. The ranking here is a triage heuristic built from the published selection strategies. It tells you which guides are worth trying; it does not tell you how well they will work. Both papers are explicit that locus behaviour varies and that several candidates should be tested in parallel.

**No sequence lookup.** You paste the sequence. Gene-name and variant lookup against Ensembl is on the roadmap below.

## Editors covered

All sixteen editors from the two papers. Windows are protospacer positions counted from the PAM-distal end of the 20-nt spacer, with the PAM at positions 21–23.

### Adenine (A→G) — Qin et al. 2024

| Editor | PAM | Window | Peak | Notes |
|---|---|---|---|---|
| ABE-Umax | NGG | 3–9 | 4–8 | First choice at NGG sites |
| ABE-Umax-ex1 | NGG | 4–12 | 4–8 | Target past position 9 |
| ABE-Umax-ex2 | NGG | 8–16 | 12–15 | PAM-proximal adenines |
| ABE-Umax-rest1 | NGG | 5–6 | 5–6 | Precision; ~55% of ABE-Umax activity |
| ABE-Umax-ex1-rest1 | NGG | 4–6 | 4–6 | Precision, shifted earlier |
| ABE-Umax-ex2-rest1 | NGG | 12–15 | 12–15 | Precision, PAM-proximal |
| ABE-Umax-SpRY | NNN | 3–9 | 4–8 | No GG motif available |

ABE-Umax-nanos1 carries the *nanos1* 3′UTR for germline-restricted editing and shares ABE-Umax's window and PAM — use it when biallelic F0 editing would be lethal.

### Cytosine (C→T) — Qin et al. 2026

| Editor | PAM | Window | Peak | Notes |
|---|---|---|---|---|
| TCBE-Umax | NGG | 4–10 | 4–8 | First choice; no context bias |
| TCBE-Umax-ex1 | NGG | 3–12 | 4–10 | Lowest indels — top pick when that matters |
| TCBE-Umax-ex2 | NGG | 4–16 | 13–15 | PAM-proximal cytosines |
| TCBE-Umax2 | NGG | 4–10 | 4–8 | Rescue tool for refractory loci; higher indels |
| TCBE-Umax-rest1 | NGG | 5–7 | 5–7 | Avoids C4; ~44% activity |
| TCBE-Umax-rest2 | NGG | 4–7 | 4–7 | Best precision editor; ~75% activity |
| TCBE-Umax-SpRY | NNN | 4–10 | 4–8 | No G in the PAM |
| TCBE-Umax-SpG | NGN | 4–10 | 4–8 | NGN sites |
| TCBE-Umax-NG | NGN | 4–10 | 4–8 | NGN sites |

The rest1/rest2/rest3 cytosine editors can produce C-to-G products at TCT motifs — check your chromatograms if the target sits in one.

Plasmids are on Addgene: [#222138–222144](https://www.addgene.org/browse/article/28248191/) for the ABE-Umax series.

## Adding an editor

Editor parameters live in [`editors.json`](editors.json) and nothing is hard-coded in the application. To add one, copy a block and edit it:

```json
{
  "id": "ABE-Umax-ex3",
  "family": "ABE",
  "cas": "SpCas9",
  "pam": "NGG",
  "window": [6, 14],
  "peak": [8, 11],
  "precise": false,
  "source": "qin2024",
  "use": "One line on when to reach for this editor."
}
```

`family` is `ABE` or `CBE`. `pam` accepts IUPAC codes. `window` is the full range where editing is observed and `peak` the range of highest activity, which must sit inside it.

Three optional keys affect ranking: `"activity": 0.75` for an editor whose reported on-target activity is a fraction of its parent's, `"pamPreference": ["NGN", "NAN", "NYN"]` to tier the PAMs of a relaxed-PAM editor, and `"penalty": 6` to push an editor below its peers for reasons the other fields do not capture.

Then run the tests:

```sh
node test.js
```

This validates `editors.json`, checks every published window against the papers, and verifies the invariants — a returned guide always places the requested base inside that editor's window with a valid PAM, on the correct strand. Pull requests that add an editor should cite the publication for its window in the description.

## Running locally

```sh
git clone https://github.com/thevarshneylab/umax-guide-designer.git
cd umax-guide-designer
python3 -m http.server
# open http://localhost:8000
```

A web server is needed because the page fetches `editors.json`, and browsers block file reads from `file://` pages. Any static server works.

## Deploying your own copy

Fork it, then in **Settings → Pages** set the source to the `main` branch, root folder. No build step; it is static files.

## Roadmap

- Gene and variant lookup against Ensembl (type `myo7aa` or a ClinVar ID instead of pasting sequence)
- Batch mode: a list of variants in, a guide table out — for VUS panels
- Primer design for the genotyping amplicon around each target

Issues and pull requests are welcome, particularly reports of guides that behaved differently at the bench than the tool suggested.

## Citing

If this tool was useful, please cite the papers the editor parameters come from:

> Qin W, Liang F, Lin S-J, et al. ABE-ultramax for high-efficiency biallelic adenine base editing in zebrafish. *Nat Commun*. 2024;15:5613. doi:[10.1038/s41467-024-49943-1](https://doi.org/10.1038/s41467-024-49943-1)

> Qin W, Lin S-J, Zhang Y, et al. High-efficiency TadA cytosine base editors for precise modelling of human disease variants. *Nat Biomed Eng*. 2026. doi:[10.1038/s41551-025-01607-1](https://doi.org/10.1038/s41551-025-01607-1)

Once you have tagged a release and connected [Zenodo](https://zenodo.org/account/settings/github/), add the software DOI here too. See [`CITATION.cff`](CITATION.cff).

## License

MIT — see [LICENSE](LICENSE).
