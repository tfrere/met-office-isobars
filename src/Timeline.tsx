import { useEffect } from "react";
import { Box, IconButton, Slider, Stack } from "@mui/material";
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
}

// Daily charts: a slower frame rate than a smooth animation reads better.
const FRAME_MS = 650;
// Above this many frames we label whole months instead of individual days.
const MONTH_LABEL_THRESHOLD = 40;

export default function Timeline({
  dates,
  index,
  playing,
  onIndexChange,
  onPlayToggle,
}: Props) {
  const total = dates.length;
  const last = Math.max(total - 1, 0);

  useEffect(() => {
    if (!playing || total <= 1) return;
    const id = setInterval(() => {
      // Loop back to the start after the most recent frame.
      onIndexChange(index >= last ? 0 : index + 1);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [playing, index, last, total, onIndexChange]);

  // Adaptive tick marks: month boundaries for long archives, otherwise a few
  // evenly spaced day labels.
  const marks: { value: number; label?: string }[] = [];
  if (total > MONTH_LABEL_THRESHOLD) {
    let lastMonth = "";
    for (let i = 0; i < total; i++) {
      const m = dates[i].slice(0, 7);
      if (m !== lastMonth) {
        lastMonth = m;
        marks.push({
          value: i,
          label: new Date(`${dates[i]}T12:00:00Z`).toLocaleDateString("fr-FR", {
            month: "short",
          }),
        });
      }
    }
  } else if (total > 1) {
    const everyN = Math.max(1, Math.ceil(total / 8));
    for (let i = 0; i < total; i++) {
      if (i % everyN === 0 || i === last) {
        marks.push({
          value: i,
          label: new Date(`${dates[i]}T12:00:00Z`).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
          }),
        });
      }
    }
  }

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
