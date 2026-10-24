# Umax Guide Designer

sgRNA design for zebrafish base editing with the **ABE-Umax**, **TCBE-Umax** and **zAYE** editor families — A→G, C→T, and adenine transversions (A→C / A→T).

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

- **Scans both strands.** Base editors deaminate the displaced protospacer strand, so an A or C needs a sense-strand guide and a T or G needs an antisense one. The tool picks the strand; you never reverse-complement by hand. Note which side the PAM then falls on: for a sense-strand guide it is **downstream** of the target in the sequence you pasted, for an antisense-strand guide it is **upstream**. A target near the 5' end of a short pasted region therefore has no room for an antisense guide — paste roughly 30 nt of flanking sequence on *both* sides of the target and every editor in the suite can be reached.
- **Places the target in each editor's real window**, not a generic 4–8.
- **Finds bystanders** — every other editable base inside the window — and shows where they fall.
- **Translates the consequence.** Give it a reading frame and each guide reports the on-target change and every bystander change: silent, missense, or premature stop. Leave the frame unset for splice-site and non-coding work.
- **Reports the whole product spectrum** for adenine transversion editing, where one edited base resolves into A→C, A→T and residual A→G — each with its own protein consequence.
- **Ranks candidates** by window fit, PAM quality, bystander burden, reported on-target activity, GC content and poly-T tracts. Two parts of that are worth knowing: a bystander the reading frame shows to be silent is discounted almost to nothing, and the narrow-window editors are discounted by the activity they give up, so they rise to the top only where they actually remove a bystander.
- **Tiers relaxed PAMs** the way the papers do: NGN > NAN > NYN for ABE-Umax-SpRY, NAN > NYN for TCBE-Umax-SpRY.
- **Lets you pick the Cas9 backbone** you have on the bench, and will enumerate untested deaminase × nickase pairings on request, clearly marked as predictions.

## Two ways to use it

**One base.** Click the base you want changed and get every guide that can reach it, ranked. This is the variant-modelling workflow: you know the substitution, you need the best way to install it.

**Scan whole sequence.** Paste a region and get one row per editable base, each with its best guide and the protein consequence. This is the other direction — you have a region and want to know what it is possible to do to it. Filter by consequence to answer specific questions:

- *Premature stop only* lists every base whose edit creates a stop codon, which is the F0 knockout workflow: pick whichever has a clean guide in a favourable position.
- *Silent only* finds edits that change the sequence without changing the protein, useful for a restriction site or a genotyping handle.
- *Missense only* is the variant-modelling survey across a whole exon.

The scan reports unreachable bases too, not just reachable ones — a base with no usable guide is a real constraint on an experiment, and it is better seen than inferred from an absence. Click any row to drop into the single-base view for that base. The copy button exports whichever view you are in.

A large scan is a lot of work (bases × editors × window positions), so above roughly 40,000 combinations the tool says so and waits rather than freezing the tab. Shortening the sequence or unticking backbones brings it back under.

## What it deliberately does not do

**No genome-wide off-target search.** That needs the GRCz11 reference and an index, which is a server, not a web page. Copy a spacer into [CRISPOR](https://crispor.gi.ucsc.edu/) or [Cas-OFFinder](http://www.rgenome.net/cas-offinder/) against *Danio rerio* GRCz11/danRer11 — the same tools both papers used, allowing up to four mismatches and then amplicon-sequencing the top three sites.

**No efficiency prediction.** [BE-Hive](http://crisprbehive.design/) and DeepBE are trained models, and neither was trained on zebrafish embryos. The ranking here is a triage heuristic built from the published selection strategies. It tells you which guides are worth trying; it does not tell you how well they will work. Both papers are explicit that locus behaviour varies and that several candidates should be tested in parallel.

**No sequence lookup.** You paste the sequence. Gene-name and variant lookup against Ensembl is on the roadmap below.

## Editors covered

All nineteen published editors from the three studies, on five selectable Cas9 backbones. Windows are protospacer positions counted from the PAM-distal end of the 20-nt spacer, with the PAM at positions 21–23.

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

### Adenine transversion (A→C / A→T) — unpublished

| Editor | PAM | Window | Peak | Notes |
|---|---|---|---|---|
| zAYE-1028 | NGG | 6–8 | 7 | First choice. MPGv3 at Cas9 residue 1028 |
| zAYE-1028-SpG | NGN | 6–8 | 7 | NGN sites; beat SpRY at both NGN targets compared |
| zAYE-1028-SpRY | NNN | 6–8 | 7 | Last resort; editing seen at NAG, NAA, NTG |

**These parameters are from a manuscript in preparation and may change before publication.** Two things make this family behave unlike the transition editors:

*The window is narrow.* Positions 6–8 only, peaking sharply at 7. Far fewer sites are reachable than with ABE-Umax or TCBE-Umax, so PAM availability is usually the binding constraint — which is why the SpG and SpRY variants matter more here than elsewhere.

*Products are mixed.* Deamination leaves an abasic intermediate, and cellular repair resolves it several ways, so a single edited adenine yields A→C and A→T together, plus residual A→G and some indels. At the two disease variants reported (*myo7aa* Q613P, *cdh23* Q1716P), A→C was predominant at ~31–33%, with ~10% A→T and 10–18% A→G alongside. The tool therefore reports the protein consequence of **all three products** rather than a single outcome — the intended allele is a fraction of the edited alleles, not all of them, so plan genotyping for a mixture.

*Sequence context matters more than for the transition editors.* CAG and CAA contexts (the trinucleotide centred on the target adenine) were the most favourable, and the tool scores guides accordingly and labels the context on each card.

One negative result worth knowing: co-expressing Polη helped in mammalian and maize systems but **did not** help in zebrafish — it left the A→C fraction unchanged and reduced overall efficiency. Not worth trying.

Plasmids are on Addgene: [#222138–222144](https://www.addgene.org/browse/article/28248191/) for the ABE-Umax series.

## Cas9 backbones

An editor is two separable things: a **deaminase architecture**, which fixes the editing window, and a **Cas9 nickase**, which fixes the PAM. The tool models them separately, so you can restrict the search to the nickases your lab actually has.

| Backbone | PAM | Notes |
|---|---|---|
| SpCas9 | NGG | Canonical. Highest activity wherever a GG is available |
| SpG | NGN | Only a single G needed, at PAM position 2 |
| Cas9-NG | NGN | Also NGN; can beat SpG or SpRY at particular loci |
| SpRY | NNN | Near-PAMless. Broadest access, lower per-site activity |
| iSpyMac | NAA | Adenine-dinucleotide PAMs — reaches A-rich sites no NGN or NGG backbone can |

[iSpyMac](https://doi.org/10.1038/s41467-020-16117-8) recognizes 5′-NAAN-3′, including AAAA sites that SpyMac edits poorly. That makes it complementary rather than redundant with SpRY: where the only PAM available is A-rich, it is the backbone with a defined preference for it rather than a near-PAMless fallback.

**Published pairings versus predicted ones.** The papers built only some architectures on some backbones — SpRY for ABE-Umax, and SpG/NG/SpRY for TCBE-Umax and zAYE-1028. Any other combination is a construct a lab can make but nobody has reported. The tool will enumerate those if you tick **Include predicted pairings**, and marks each one *predicted pairing* in the results, in the reference table and in the exported table. Their windows are assumed to carry over from the parent editor, which is what happened for every published PAM variant, but the activity is unknown. They are off by default.

No iSpyMac pairing with any Umax editor has been reported, so **every iSpyMac row is predicted** — which is why its chip is marked *predicted only* and selecting it switches predicted pairings on. SpRY, SpG and Cas9-NG each have published pairings, so those work with predictions left off. SpyMac itself has been used in a zebrafish cytosine base editor (ancBE4max-SpymacCas9, NAA PAM), which is the nearest precedent.

## Adding a Cas9 backbone

Add an entry to `casVariants` in [`editors.json`](editors.json):

```json
{
  "id": "SaCas9",
  "pam": "NNGRRT",
  "note": "One line on when to reach for this backbone."
}
```

It becomes available to every architecture immediately; no code change. `pam` accepts IUPAC codes and any length. Optionally add `"pamPreference": ["NGN", "NAN", "NYN"]` to tier a relaxed PAM, and `"untestedWithUmax": true` if no pairing has been characterized. The test suite cross-checks every editor's PAM against this registry, so a typo in either place fails loudly.

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

Then run the tests and re-stamp the page:

```sh
node test.js
node tools/stamp.js
```

The second command is not optional. GitHub Pages revalidates `index.html` much more eagerly than the files it references, so without a version on those URLs a visitor can be served new HTML alongside a cached old script — the page then looks updated but behaves like the previous release, which is harder to diagnose than an obviously stale page. `tools/stamp.js` hashes the assets and writes that hash onto their URLs; CI fails the build if the page is out of date.

The test suite itself:

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

The adenine transversion editors are from a manuscript in preparation:

> Qin W, Zhang Y, Huang K, Varshney GK. Adenine transversion base editing expands precise genome engineering in zebrafish. Manuscript in preparation.

Once you have tagged a release and connected [Zenodo](https://zenodo.org/account/settings/github/), add the software DOI here too. See [`CITATION.cff`](CITATION.cff).

## License

MIT — see [LICENSE](LICENSE).
