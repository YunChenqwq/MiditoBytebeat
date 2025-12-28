
import { Note, ConverterOptions } from './types';

/**
 * 将音符序列转换为紧凑的 Bytebeat 表达式
 */
export function generateBytebeat(notes: Note[], options: ConverterOptions): string {
  if (notes.length === 0) return "0";

  let expression = "(";
  let accumulatedTime = 0;

  notes.forEach((note, index) => {
    // 计算当前音符的实际发音截止时间
    const noteEndTime = accumulatedTime + (note.duration * options.baseUnit) - note.restAfter;
    
    // 生成音符部分 (保留 2 位小数以减小长度)
    expression += `(t%${options.totalPeriod}<${Math.floor(noteEndTime)})?(t*${parseFloat(note.coeff.toFixed(2))}):`;
    
    // 更新累积时间并添加静音判断
    accumulatedTime += (note.duration * options.baseUnit);
    
    if (note.restAfter > 0 && index < notes.length - 1) {
       expression += `(t%${options.totalPeriod}<${Math.floor(accumulatedTime)})?0:`;
    }
  });

  expression += "0)";
  return expression;
}

/**
 * 根据 MIDI 音高计算频率系数
 */
export function pitchToCoeff(pitch: number, basePitch: number, baseCoeff: number): number {
  // 核心公式：基于半音程 2^(1/12)
  return baseCoeff * Math.pow(2, (pitch - basePitch) / 12);
}
