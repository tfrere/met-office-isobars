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
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useArchive } from "./useArchive";
import { imageUrl } from "./api";
import Timeline from "./Timeline";

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

// Frosted-glass floating panel, readable over the white chart.
const panelSx = {
  bgcolor: "rgba(255,255,255,0.78)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 2,
  boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
} as const;

function Overlay({ children, sx }: { children: ReactNode; sx?: object }) {
  return <Box sx={{ position: "absolute", zIndex: 10, ...sx }}>{children}</Box>;
}

function StatusOverlay({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
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

export default function App() {
  const arch = useArchive();
  const dates = arch.data?.dates ?? [];
  const total = dates.length;

  // `index === -1` means "stick to the most recent frame"; it stays pinned to
  // the latest until the user scrubs, then becomes an explicit position.
  const [rawIndex, setRawIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const index =
    rawIndex < 0 ? Math.max(total - 1, 0) : Math.min(rawIndex, total - 1);
  const date = dates[index];

  // Preload the neighbouring frames so scrubbing / playback stays smooth.
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

  const building = arch.status !== "ready";

  return (
    <Box sx={{ position: "fixed", inset: 0, overflow: "hidden", bgcolor: "#fff" }}>
      {/* Chart image, fitted (contain) on the white "paper". */}
      {date && (
        <Box
          component="img"
          key={date}
          src={imageUrl(date)}
          alt={`Carte de pression de surface du ${longDate(date)} (Met Office)`}
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            p: { xs: 1, sm: 2 },
            boxSizing: "border-box",
          }}
        />
      )}

      {/* Loading / error / building states */}
      {building && (
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

      {/* Top-left: title + active date */}
      <Overlay sx={{ top: 16, left: 16, maxWidth: 320 }}>
        <Box sx={{ ...panelSx, px: 1.75, py: 1.25 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <CloudQueueIcon sx={{ fontSize: 22, color: "text.primary" }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography
                sx={{
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              >
                Pression de surface
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Met Office · Europe
              </Typography>
            </Box>
            {provenance && (
              <Tooltip
                title={provenance}
                placement="bottom-start"
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
          </Stack>
          {date && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography
                sx={{
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              >
                {longDate(date)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {arch.data ? `${arch.data.run.slice(0, 2)}:00 UTC · analyse` : "analyse"}
              </Typography>
            </>
          )}
        </Box>
      </Overlay>

      {/* Top-right: link to the source */}
      <Overlay sx={{ top: 16, right: 16 }}>
        <Box sx={{ ...panelSx, px: 0.5, py: 0.5 }}>
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
        </Box>
      </Overlay>

      {/* Bottom: timeline scrubber */}
      {arch.status === "ready" && total > 0 && (
        <Overlay sx={{ bottom: 16, left: 16, right: 16 }}>
          <Box sx={{ ...panelSx, px: 1.5, py: 1 }}>
            <Timeline
              dates={dates}
              index={index}
              playing={playing}
              onIndexChange={setRawIndex}
              onPlayToggle={() => setPlaying((p) => !p)}
            />
          </Box>
        </Overlay>
      )}
    </Box>
  );
}
