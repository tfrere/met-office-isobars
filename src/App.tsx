import { useEffect, useState, type ReactNode } from "react";
import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useArchive } from "./useArchive";
import { imageUrl } from "./api";
import Timeline from "./Timeline";
import ZoomableImage from "./ZoomableImage";

const MET_OFFICE_URL =
  "https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure";

// "2026-06-27" -> "27 juin 2026"
function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Frosted-glass panel, used only for the provenance tooltip.
const panelSx = {
  bgcolor: "rgba(255,255,255,0.92)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 2,
  boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
} as const;

function StatusOverlay({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box sx={{ ...panelSx, px: 4, py: 3, textAlign: "center", maxWidth: 360 }}>
        {children}
      </Box>
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{ textAlign: "right", color: "text.primary" }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

// Minimum time the intro spinner stays up, even when the archive is already
// cached, so the app never flashes a half-painted UI on load.
const MIN_SPLASH_MS = 1500;

export default function App() {
  const arch = useArchive();
  const dates = arch.data?.dates ?? [];
  const total = dates.length;

  // Gate the UI behind both "data ready" and a short minimum splash delay.
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);
  const ready = arch.status === "ready" && total > 0 && minElapsed;

  // `rawIndex === -1` means "stick to the most recent frame" until the user
  // scrubs, then it becomes an explicit position.
  const [rawIndex, setRawIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const index =
    rawIndex < 0 ? Math.max(total - 1, 0) : Math.min(rawIndex, total - 1);
  const date = dates[index];

  // Preload neighbouring frames so scrubbing / playback stays smooth.
  useEffect(() => {
    if (!total) return;
    for (let d = -2; d <= 2; d++) {
      const i = index + d;
      if (i >= 0 && i < total) {
        const img = new Image();
        img.src = imageUrl(dates[i]);
      }
    }
  }, [index, total, dates]);

  // Space bar toggles playback of the timeline. Ignored when a form control is
  // focused (avoids double-firing with a button / hijacking typing), and
  // preventDefault stops the page from scrolling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (arch.status !== "ready" || total <= 1) return;
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(tag)) return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arch.status, total]);

  const provenance = arch.data ? (
    <Box sx={{ minWidth: 252 }}>
      <Typography sx={{ fontSize: "0.8rem", fontWeight: 700, mb: 0.75 }}>
        Carte de pression de surface (MSLP)
      </Typography>
      <Stack spacing={0.4}>
        <InfoRow label="Source" value={arch.data.source} />
        <InfoRow label="Type" value="Analyse (T+0, observé)" />
        <InfoRow label="Run" value={`${arch.data.run.slice(0, 2)}:00 UTC`} />
        <InfoRow label="Zone" value="Europe / Atlantique NE" />
        <InfoRow label="Archive" value={`${total} jour${total > 1 ? "s" : ""}`} />
        {date && <InfoRow label="Carte" value={longDate(date)} />}
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 0.75, lineHeight: 1.4 }}
      >
        Images officielles du Met Office récupérées chaque jour et archivées au
        fil de l'eau{arch.data.dataset ? ` dans le dataset ${arch.data.dataset}` : ""}.
        Le Met Office ne conserve en ligne que les ~7 derniers jours&nbsp;; cette
        archive grandit ensuite jour après jour.
      </Typography>
      <Divider sx={{ my: 1 }} />
      <Typography variant="caption" color="text.secondary">
        © Crown copyright, Met Office
      </Typography>
    </Box>
  ) : null;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "#fff",
      }}
    >
      {/* Chart image, fitted (contain) in the space above the timeline.
          Pinch / drag / double-tap to zoom and pan (mobile-friendly). */}
      <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
        {ready && date && (
          <ZoomableImage
            src={imageUrl(date)}
            alt={`Carte de pression de surface du ${longDate(date)} (Met Office)`}
          />
        )}

        {!ready && (
          <StatusOverlay>
            {arch.status === "error" ? (
              <>
                <Typography color="error">Erreur</Typography>
                <Typography variant="caption" color="text.secondary">
                  {arch.error}
                </Typography>
              </>
            ) : (
              <>
                <CircularProgress size={28} />
                <Typography sx={{ mt: 2 }} color="text.secondary">
                  Récupération des cartes Met Office…
                </Typography>
                <LinearProgress sx={{ mt: 1.5 }} />
              </>
            )}
          </StatusOverlay>
        )}
      </Box>

      {/* Timeline bar, sitting just below the image (no overlap). */}
      {ready && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            flexShrink: 0,
            px: { xs: 1, sm: 2 },
            py: 0.75,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Box sx={{ flexGrow: 1 }}>
            <Timeline
              dates={dates}
              index={index}
              playing={playing}
              onIndexChange={setRawIndex}
              onPlayToggle={() => setPlaying((p) => !p)}
              onStop={() => setPlaying(false)}
            />
          </Box>
          {provenance && (
            <Tooltip
              title={provenance}
              placement="top-end"
              slotProps={{
                tooltip: {
                  sx: {
                    ...panelSx,
                    color: "text.primary",
                    px: 1.75,
                    py: 1.5,
                    maxWidth: 340,
                  },
                },
              }}
            >
              <IconButton
                size="small"
                sx={{ color: "text.secondary" }}
                aria-label="Informations sur les données"
              >
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Voir sur le site du Met Office">
            <IconButton
              size="small"
              component="a"
              href={MET_OFFICE_URL}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "text.secondary" }}
              aria-label="Voir la source Met Office"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
}
