---
title: Cartes de pression Met Office
emoji: 🌬️
colorFrom: gray
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Cartes de pression · Met Office

Petite app web qui **archive jour après jour** la carte d'analyse de pression de
surface (isobares + fronts) publiée par le [Met Office](https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure)
pour l'Europe et l'Atlantique Nord-Est, et permet de **scruber dans le temps**
via une timeline.

Le Met Office ne garde en ligne que les ~7 derniers jours. Cette app récupère la
carte du jour (et backfill les jours encore disponibles), puis la stocke dans un
**dataset Hugging Face** pour constituer une archive qui grandit au fil de l'eau.

- **Frontend** : Vite + React + TypeScript + MUI. Image plein écran + timeline.
- **Backend** : FastAPI. Tâche de fond qui récupère la carte d'analyse N&B,
  l'archive dans un dataset HF (`huggingface_hub`) et expose le manifest.
- **Déploiement** : un seul conteneur Docker (pattern Hugging Face Space).

## API

| Endpoint                 | Description                                                     |
| ------------------------ | -------------------------------------------------------------- |
| `GET /api/frames`        | Manifest : `dates` disponibles + métadonnées (JSON).           |
| `GET /api/image/{date}.gif` | Carte GIF archivée pour la date (`YYYY-MM-DD`).             |
| `GET /api/health`        | Healthcheck.                                                   |

Tant que l'archive se remplit, `/api/frames` renvoie `{ "status": "building" }`,
puis le payload complet une fois `"status": "ready"`.

## Source des données

Cartes officielles "Surface Pressure Charts" du Met Office (API consommateur
utilisée par leur site) :

```
https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure/
    bw/{YYYY-MM-DD}T1200/1200_ASXX_Assistant_FC000.gif
```

On récupère la **carte d'analyse** (T+0, état observé) en **noir & blanc**, run
de **12:00 UTC** (repli sur le run 00:00 si absent).

© Crown copyright, Met Office. Réutilisation soumise à leurs conditions
([fair usage](https://www.metoffice.gov.uk/about-us/legal)).

## Archive (dataset Hugging Face)

Les cartes sont commitées dans un dataset HF (une image par jour + `manifest.json`),
ce qui permet de survivre aux redémarrages / rebuilds du Space et de bâtir une
archive longue durée.

Configuration via variables d'environnement :

| Variable              | Défaut                                  | Rôle                                              |
| --------------------- | --------------------------------------- | ------------------------------------------------- |
| `MET_OFFICE_DATASET`  | `tfrere/met-office-isobars-archive`     | Dataset cible.                                    |
| `HF_TOKEN`            | _(aucun)_                               | Token write. **Secret du Space** pour persister.  |
| `ARCHIVE_DATA_DIR`    | `server/data`                           | Miroir local du dataset.                          |

> Sans `HF_TOKEN`, l'app fonctionne quand même : elle archive localement pour la
> session courante (perdu au redémarrage), mais ne persiste pas dans le dataset.
> Sur le Space, ajoute `HF_TOKEN` dans **Settings → Secrets** (write).

## Développement local

Deux terminaux :

```bash
# 1. Backend (port 7860)
cd server
pip install -r requirements.txt
# optionnel : export HF_TOKEN=hf_xxx pour tester la persistance dataset
python app.py

# 2. Frontend (port 5173, proxy /api -> 7860)
npm install
npm run dev
```

## Build de production (comme sur le Space)

```bash
docker build -t met-office-isobars .
docker run -p 7860:7860 -e HF_TOKEN=hf_xxx met-office-isobars
# -> http://localhost:7860
```

## CI/CD (GitHub → Hugging Face)

Le dépôt [`tfrere/met-office-isobars`](https://github.com/tfrere/met-office-isobars)
sur GitHub est la source de vérité. Deux workflows GitHub Actions :

| Workflow | Déclencheur | Rôle |
| --- | --- | --- |
| `.github/workflows/deploy.yml` | push sur `main` | Mirror vers le Space HF → rebuild Docker. |
| `.github/workflows/ingest.yml` | cron quotidien (~20:17 UTC) + manuel | Récupère la carte du jour et la commit dans le dataset, **indépendamment du Space**. |

Il suffit donc de :

```bash
git push origin main   # -> déploie sur le Space automatiquement
```

Prérequis : le secret `HF_TOKEN` (write) doit être configuré dans les *Settings →
Secrets* du repo GitHub **et** dans ceux du Space (pour l'archivage côté Space).

Le Space détecte le `Dockerfile` (SDK `docker`) et publie sur le port `7860`.
