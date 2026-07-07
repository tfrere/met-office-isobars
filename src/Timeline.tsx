import { useEffect, useMemo } from "react";
import { Box, IconButton, Slider, Stack, useMediaQuery, useTheme } from "@mui/material";
import { scaleUtc } from "d3-scale";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface Props {
  dates: string[];
  index: number;
  playing: boolean;
  onIndexChange: (i: number) => void;
  onPlayToggle: () => void;
  onStop: () => void;
}

// Daily charts: a slower frame rate than a smooth animation reads better.
const FRAME_MS = 650;

export default function Timeline({
  dates,
  index,
  playing,
  onIndexChange,
  onPlayToggle,
  onStop,
}: Props) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const total = dates.length;
  const last = Math.max(total - 1, 0);

  // Playback runs through the archive exactly once, then stops. Starting from
  // the last frame rewinds to the beginning so a fresh press always replays.
  useEffect(() => {
    if (!playing || total <= 1) return;
    if (index >= last) {
      onIndexChange(0);
      return;
    }
    const id = setTimeout(() => {
      const next = index + 1;
      if (next >= last) {
        onIndexChange(last);
        onStop();
      } else {
        onIndexChange(next);
      }
    }, FRAME_MS);
    return () => clearTimeout(id);
  }, [playing, index, last, total, onIndexChange, onStop]);

  // Tick marks driven by a D3 UTC time scale: d3 picks "nice", evenly spaced
  // tick dates (days / weeks / months as the archive grows), which reads far
  // better than a fixed every-N stride. Each tick is snapped to its nearest
  // frame index; labels are month names on month boundaries, day numbers
  // otherwise, and thinned on phones.
  const marks = useMemo(() => {
    if (total <= 1) return [] as { value: number; label?: string }[];
    const times = dates.map((d) => new Date(`${d}T12:00:00Z`).getTime());
    const ticks = scaleUtc()
      .domain([times[0], times[last]])
      .ticks(compact ? 4 : 8);
    const fmt = (t: Date) =>
      t.getUTCDate() === 1
        ? t.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })
        : t.toLocaleDateString("fr-FR", {
            day: "2-digit",
            ...(compact ? {} : { month: "2-digit" }),
            timeZone: "UTC",
          });
    const seen = new Set<number>();
    const out: { value: number; label?: string }[] = [];
    for (const t of ticks) {
      const tt = t.getTime();
      // Nearest frame index (dates may have gaps, so snap by time, not stride).
      let lo = 0;
      let hi = last;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < tt) lo = mid + 1;
        else hi = mid;
      }
      let i = lo;
      if (i > 0 && Math.abs(times[i - 1] - tt) < Math.abs(times[i] - tt)) i -= 1;
      if (!seen.has(i)) {
        seen.add(i);
        out.push({ value: i, label: fmt(t) });
      }
    }
    return out;
  }, [dates, total, last, compact]);

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <IconButton
        onClick={onPlayToggle}
        color="primary"
        size="small"
        disabled={total <= 1}
        aria-label={playing ? "Pause" : "Lecture"}
      >
        {playing ? <PauseIcon /> : <PlayArrowIcon />}
      </IconButton>
      <IconButton
        onClick={() => onIndexChange(Math.max(0, index - 1))}
        size="small"
        disabled={index <= 0}
        aria-label="Jour précédent"
      >
        <ChevronLeftIcon />
      </IconButton>
      <Box sx={{ flexGrow: 1, px: 1 }}>
        <Slider
          size="small"
          min={0}
          max={last}
          value={Math.min(Math.max(index, 0), last)}
          marks={marks}
          onChange={(_, v) => onIndexChange(v as number)}
          aria-label="Date"
          sx={{
            "& .MuiSlider-markLabel": {
              fontSize: compact ? "0.6rem" : "0.7rem",
            },
          }}
        />
      </Box>
      <IconButton
        onClick={() => onIndexChange(Math.min(last, index + 1))}
        size="small"
        disabled={index >= last}
        aria-label="Jour suivant"
      >
        <ChevronRightIcon />
      </IconButton>
    </Stack>
  );
}
