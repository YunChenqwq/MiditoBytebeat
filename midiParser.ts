
import { Midi } from '@tonejs/midi';
import { Note, ConverterOptions } from './types';
// Fixed: pitchToCoeff is exported from bytebeatUtils.ts, not types.ts
import { pitchToCoeff } from './bytebeatUtils';

export async function parseMidiFile(file: File, options: ConverterOptions): Promise<Note[]> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);
  
  // 仅处理第一个有音符的轨道
  const track = midi.tracks.find(t => t.notes.length > 0) || midi.tracks[0];
  if (!track) return [];

  return track.notes.map((n, i) => ({
    id: `note-${i}-${Date.now()}`,
    pitch: n.midi,
    startTime: n.time, // 这里简化，使用秒作为单位
    duration: n.duration,
    coeff: pitchToCoeff(n.midi, options.basePitch, options.baseCoeff),
    restAfter: options.restDuration
  }));
}
