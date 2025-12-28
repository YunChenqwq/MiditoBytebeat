
export interface Note {
  id: string;
  pitch: number; // MIDI pitch
  startTime: number; // In ticks or relative units
  duration: number; // In ticks or relative units
  coeff: number; // Frequency coefficient (e.g., 4.0 for C)
  restAfter: number; // Silent interval after this note (ms or units)
}

export interface ConverterOptions {
  baseUnit: number; // e.g., 2000
  restDuration: number; // e.g., 200
  totalPeriod: number; // e.g., 32000
  basePitch: number; // e.g., 60 (C4)
  baseCoeff: number; // e.g., 4.0
}

export const MIDI_PITCH_MAP: Record<number, string> = {
  0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F', 6: 'F#', 7: 'G', 8: 'G#', 9: 'A', 10: 'A#', 11: 'B'
};

export const getNoteName = (pitch: number) => {
  const octave = Math.floor(pitch / 12) - 1;
  const name = MIDI_PITCH_MAP[pitch % 12];
  return `${name}${octave}`;
};
