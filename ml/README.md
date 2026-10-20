# ML Pipeline

Everything behind Sproutly's model: getting and cleaning the photos, splitting them, training
and comparing models, adding symptom text, calibrating the confidence and choosing the
referral threshold. It all runs in **Google Colab**; the backend only loads the finished model
file and never imports anything from here.

## Where things live

| What | Where | In Git |
|---|---|---|
| Code, notebooks, settings | this repository, cloned into Drive at `MyDrive/Sproutly-app` | yes |
| Datasets, trained models, logs | Drive at `MyDrive/CropDiseaseDiagnosis` | no (too large) |
| Result tables, charts, and a copy of each notebook as run | [`results/`](results/) | yes |

[`config.py`](config.py) holds the paths, the 11 classes, the split ratios and the seed (42).
It points at Drive by default; set `CDD_DATA_ROOT` to use another folder.

## The notebooks, in order

Each notebook says at the top what it does, what it decides and which rule decides it.
Decisions (D1, D2, …) were fixed *before* the results were seen; follow-ups added after seeing
results are labelled as follow-ups.

| # | Notebook | What it does | Results in |
|---|---|---|---|
| 01 | [environment setup](notebooks/01_environment_setup.ipynb) | Mounts Drive, clones the repository, installs pinned libraries | — |
| 02 | [PlantVillage](notebooks/02_data_acquisition.ipynb) | Lab photos of the 11 classes, with leaf groupings | — |
| 03 | [FieldPlant](notebooks/03_fieldplant_acquisition.ipynb) | Field photos (Cameroon), each annotated leaf cropped | — |
| 04 | [PlantDoc](notebooks/04_plantdoc_acquisition.ipynb) | Internet photos, **only ever used for the final out-of-domain test** | — |
| 05 | [Tanzania potato](notebooks/05_tanzania_potato_acquisition.ipynb) | Smartphone field photos from Mbeya, grouped by capture time | — |
| 06 | [cleaning](notebooks/06_image_cleaning.ipynb) | Unreadable, tiny, duplicate and conflicting photos recorded in `clean_manifest.csv` (nothing deleted) | — |
| 07 | [split](notebooks/07_data_split.ipynb) | Grouped, stratified 70/15/15: train 11,477 / val 2,385 / test 2,441; related photos never cross partitions | — |
| 08 | [EfficientNet-B0 baseline](notebooks/08_image_baseline.ipynb) | First image-only model | — |
| 08b | [PlantVillage-only](notebooks/08b_image_plantvillage_only.ipynb) | Same model trained on lab photos only, to measure what field photos add | [`plantvillage_only_resnet50/`](results/plantvillage_only_resnet50/) |
| 09 | [architecture comparison](notebooks/09_architecture_comparison.ipynb) | Five more architectures trained the same way | `compare_*/` |
| 10 | [comparison results](notebooks/10_architecture_comparison_results.ipynb) | **D1:** ResNet-50 chosen by the pre-set rule (macro-F1 on field validation photos) | [`comparison/`](results/comparison/) |
| 11 | [text and fusion](notebooks/11_text_fusion_comparison.ipynb) | Six text encoders and three fusion methods compared in stages | [`fusion/`](results/fusion/) |
| 11b | [late fusion follow-up](notebooks/11b_late_fusion_followup.ipynb) | **D4/D5:** BERT-base with late fusion; with no text it is exactly ResNet-50 | [`fusion_late_followup/`](results/fusion_late_followup/) |
| 12 | [selection set](notebooks/12_selection_set_acquisition.ipynb) | 3,821 field photos from four sources never used in training (Bangladesh, Ethiopia), for calibration and the threshold | [`selection_set/`](results/selection_set/) |
| 13 | [calibration and threshold](notebooks/13_calibration_and_threshold.ipynb) | **D2:** ResNet-50 over the ensemble; **D6:** temperature scaling, T = 3.04 | [`calibration/`](results/calibration/) |
| 13b | [threshold follow-up](notebooks/13b_threshold_followup.ipynb) | **D7:** threshold 0.877; where the model fails, by source and class | [`calibration_followup/`](results/calibration_followup/) |
| 14 | [D17 field training data](notebooks/14_d17_field_training_data.ipynb) | Extra field photos (Pakistan and Taiwan tomato, India potato, Bangladesh maize) checked and added to training only, as `train_d17.csv` | `d17_field_data/` (after it runs) |

The model the backend uses today ("v1") is ResNet-50 from notebook 09 with T and the
threshold from notebooks 13 and 13b. Copies of v1's model, calibration and splits are kept on
Drive in `backups/v1_2026-10-20/`; new models are saved in new folders and never overwrite v1.

## Datasets and their roles

| Source | Role | Why |
|---|---|---|
| PlantVillage | training | many clean lab photos of every class |
| FieldPlant, Tanzania potato | training | real field conditions |
| PlantDoc | final out-of-domain test only | internet photos, never used for any choice |
| Selection set (four Mendeley field datasets, CC BY 4.0) | calibration, threshold, model choice | unseen places; validation is 99.5% right and has too few mistakes to learn from |
| D17 additions (notebook 14) | extra training (pending the D17 rule) | targets the weakness on new field photos, especially tomato |

Every photo used for training or choosing is compared with all the others first: exact copies
and near-copies (also turned or mirrored) never appear on both sides of a comparison.
Licences and citations are recorded in each source's results folder.

## Code

```
ml/
├── config.py             paths, classes, ratios, seed
├── requirements.txt      pinned to the verified Colab environment
├── notebooks/            the notebooks above
├── results/              what each notebook produced (tables, charts, notebook copy)
└── src/
    ├── training.py       fine-tuning loop, evaluation, saving
    ├── metrics.py        macro-F1, calibration error (ECE), risk-coverage (AURC)
    ├── calibration.py    the six calibration methods and the threshold rules (D6, D7)
    ├── text_encoders.py  TF-IDF and the language-model encoders
    ├── fusion.py         late, concatenation and gated fusion heads
    ├── explain.py        Grad-CAM heat maps
    ├── github_sync.py    commit and push results from Colab to a new branch
    └── data/             one module per dataset, cleaning, split, selection set, D17
```

## Working in Colab

**First time only**

1. Add two Colab secrets (key icon, left sidebar): `GITHUB_TOKEN` (a GitHub personal access
   token with repo access) and `GIT_EMAIL`.
2. Open `01_environment_setup.ipynb` from GitHub (**File → Open notebook → GitHub**) and run
   it. It clones this repository into Drive.

**Every session after that**

1. Open notebooks from Drive: `MyDrive/Sproutly-app/ml/notebooks/`. The first cells pull the
   latest code from GitHub.
2. Runtime → Change runtime type: **T4 GPU** for training notebooks, CPU for data notebooks.
   Run top to bottom.
3. At the end, save the notebook (Ctrl+S) and run the last cell: it commits only that
   notebook's results folder to a new `colab/...` branch and prints the pull-request link.

A notebook that changes code must reach `main` through a pull request **before** it runs in
Colab, because Colab pulls the code from GitHub.
