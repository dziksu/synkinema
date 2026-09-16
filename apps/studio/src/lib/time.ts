export const timecode = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`;
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
