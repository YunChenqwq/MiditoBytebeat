
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Note, ConverterOptions, getNoteName } from './types';
import { generateBytebeat, pitchToCoeff } from './bytebeatUtils';
import { parseMidiFile } from './midiParser';

const DEFAULT_OPTIONS: ConverterOptions = {
  baseUnit: 8000, 
  restDuration: 200,
  totalPeriod: 64000,
  basePitch: 60, // C4
  baseCoeff: 8.37 // 在 8000Hz 下，8.37 对应 C4 (261.6Hz)
};

const GlassCard = ({ children, className = "", hover = false }: { children?: React.ReactNode, className?: string, hover?: boolean }) => (
  <div className={`backdrop-blur-xl bg-white/30 border border-white/50 rounded-[2rem] shadow-[0_8px_32px_0_rgba(14,165,233,0.05)] transition-all duration-500 ${hover ? 'hover:shadow-[0_12px_40px_0_rgba(14,165,233,0.15)] hover:bg-white/40' : ''} ${className}`}>
    {children}
  </div>
);

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteLimit, setNoteLimit] = useState<number>(1000);
  const [transpose, setTranspose] = useState<number>(0);
  const [options, setOptions] = useState<ConverterOptions>(DEFAULT_OPTIONS);
  const [expression, setExpression] = useState("0");
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const [playProgress, setPlayProgress] = useState(0); 

  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const virtualTRef = useRef(0);

  // 计算移调后的音符
  const transposedNotes = useMemo(() => {
    return notes.map(note => {
      const newPitch = note.pitch + transpose;
      return {
        ...note,
        pitch: newPitch,
        coeff: pitchToCoeff(newPitch, options.basePitch, options.baseCoeff)
      };
    });
  }, [notes, transpose, options.basePitch, options.baseCoeff]);

  const activeNotes = transposedNotes.slice(0, noteLimit);

  useEffect(() => {
    setExpression(generateBytebeat(activeNotes, options));
  }, [activeNotes, options]);

  useEffect(() => {
    let animId: number;
    const updateProgress = () => {
      if (isPlaying) {
        const progress = virtualTRef.current / options.totalPeriod;
        setPlayProgress(progress);
        
        if (timelineRef.current) {
          const scrollWidth = timelineRef.current.scrollWidth - timelineRef.current.clientWidth;
          if (scrollWidth > 0) {
            timelineRef.current.scrollLeft = progress * scrollWidth;
          }
        }
        animId = requestAnimationFrame(updateProgress);
      }
    };
    if (isPlaying) animId = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, options.totalPeriod]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const parsedNotes = await parseMidiFile(file, options);
      setNotes(parsedNotes);
      setNoteLimit(parsedNotes.length);
      setError(null);
    } catch (err) {
      setError("MIDI 解析失败，请上传标准的单轨 MIDI 文件。");
    }
  };

  const startPlayback = async () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      if (processorNodeRef.current) processorNodeRef.current.disconnect();

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const func = new Function('t', `return ${expression};`) as (t: number) => number;
      
      const virtualSampleRate = 8000;
      const ratio = virtualSampleRate / ctx.sampleRate;
      virtualTRef.current = 0;

      processor.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) {
          const val = func(Math.floor(virtualTRef.current));
          output[i] = ((val & 0xFF) / 128) - 1.0;
          virtualTRef.current += ratio;
          if (virtualTRef.current >= options.totalPeriod) virtualTRef.current = 0;
        }
      };

      processor.connect(ctx.destination);
      processorNodeRef.current = processor;
      setIsPlaying(true);
    } catch (e) {
      setError("音频引擎启动失败。");
    }
  };

  const stopPlayback = () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    setIsPlaying(false);
    setPlayProgress(0);
    virtualTRef.current = 0;
  };

  const loadExample = () => {
    // 完整版小星星旋律
    const melody = [
      60, 60, 67, 67, 69, 69, 67, // 一闪一闪亮晶晶
      65, 65, 64, 64, 62, 62, 60, // 满天都是小星星
      67, 67, 65, 65, 64, 64, 62, // 挂在天上放光明
      67, 67, 65, 65, 64, 64, 62, // 好像许多小眼睛
      60, 60, 67, 67, 69, 69, 67, // 一闪一闪亮晶晶
      65, 65, 64, 64, 62, 62, 60  // 满天都是小星星
    ];

    const exampleNotes: Note[] = melody.map((pitch, idx) => ({
      id: `note-${idx}-${Date.now()}`,
      pitch: pitch,
      startTime: idx,
      duration: (idx % 7 === 6) ? 2 : 1, // 每句最后一个音符长一点
      coeff: pitchToCoeff(pitch, 60, 8.37),
      restAfter: 200
    }));

    setFileName("示例：完整小星星旋律");
    setNotes(exampleNotes);
    setNoteLimit(exampleNotes.length);
    setOptions({ ...DEFAULT_OPTIONS, totalPeriod: 320000, baseUnit: 8000 });
    setTranspose(0);
  };

  const resetFile = () => {
    setFileName(null);
    setNotes([]);
    setNoteLimit(1000);
    setTranspose(0);
    stopPlayback();
  };

  return (
    <div className="min-h-screen bg-[#f8fbff] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sky-50 via-white to-blue-50 p-6 lg:p-10 font-sans selection:bg-sky-200 text-sky-900">
      
      {/* 顶部导航 */}
      <nav className="max-w-[1440px] mx-auto w-full flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center shadow-xl shadow-sky-200">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">MIDItoByteBeat</h1>
            <a 
              href="https://github.com/EvilLockVirusFramework" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[10px] font-bold text-sky-400 tracking-[0.05em] uppercase mt-1 block hover:text-sky-600 transition-colors"
            >
              本项目属于 EvilLockVirusFramework
            </a>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <button onClick={loadExample} className="hidden md:block px-5 py-2.5 rounded-full bg-white border border-sky-100 shadow-sm text-[10px] font-black text-sky-600 hover:shadow-md hover:bg-sky-50 transition-all uppercase">加载示例</button>
          
          <a href="https://github.com/yunchenqwq" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-bold text-sky-300 uppercase group-hover:text-sky-400 transition-colors">GitHub</p>
              <p className="text-sm font-black text-sky-600 group-hover:text-sky-800 transition-colors leading-tight">yunchenqwq</p>
            </div>
            <div className="relative">
              <img 
                src="https://github.com/yunchenqwq.png" 
                alt="yunchenqwq" 
                className="w-11 h-11 rounded-full border-2 border-white shadow-md group-hover:scale-105 transition-transform"
                onError={(e) => { (e.target as any).src = 'https://ui-avatars.com/api/?name=yunchenqwq&background=0ea5e9&color=fff'; }}
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></div>
            </div>
          </a>
        </div>
      </nav>

      <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* 左侧控制栏 */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-8">
          <GlassCard className="p-8" hover>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-black text-[10px] uppercase tracking-[0.2em] text-sky-400">控制台</h2>
              <div className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
            </div>
            
            <div className="space-y-6">
              <div className="space-y-3">
                { !fileName ? (
                  <label className="relative group block overflow-hidden rounded-[2rem] bg-sky-50/50 border-2 border-dashed border-sky-100 hover:border-sky-400 hover:bg-sky-100/30 transition-all cursor-pointer p-10 text-center animate-in fade-in zoom-in-95">
                    <div className="relative z-10">
                      <svg className="w-8 h-8 text-sky-200 mx-auto mb-3 group-hover:text-sky-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      <span className="text-xs font-black text-sky-400 group-hover:text-sky-600 transition-colors uppercase block">选择 MIDI 文件</span>
                    </div>
                    <input type="file" accept=".mid,.midi" onChange={handleFileUpload} className="hidden" />
                  </label>
                ) : (
                  <div className="flex flex-col gap-3 p-5 bg-sky-50/50 rounded-3xl border border-sky-100 animate-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                       <p className="text-[10px] font-black text-sky-300 uppercase">当前文件</p>
                       <button onClick={resetFile} className="text-[10px] font-black text-rose-400 hover:text-rose-600 transition-colors">重新上传</button>
                    </div>
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-xl bg-sky-500 flex items-center justify-center text-white shadow-lg shadow-sky-100">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>
                       </div>
                       <span className="text-xs font-bold text-sky-700 truncate flex-1">{fileName}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 移调功能 */}
              <div className="space-y-4 bg-white/40 p-5 rounded-3xl border border-white/60">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">全局移调 (Transpose)</span>
                  <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-xl shadow-sm border ${transpose !== 0 ? 'bg-sky-500 text-white border-sky-400' : 'bg-white text-sky-600 border-sky-50'}`}>
                    {transpose > 0 ? `+${transpose}` : transpose} 半音
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-12" 
                  max="12" 
                  step="1"
                  value={transpose} 
                  onChange={(e) => setTranspose(Number(e.target.value))}
                  className="w-full h-1 bg-sky-100 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
              </div>

              {/* 音符截断控制 */}
              <div className="space-y-4 bg-white/40 p-5 rounded-3xl border border-white/60">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">音符数量限制</span>
                  <span className="text-[10px] font-mono font-bold text-sky-600 bg-white px-2.5 py-1 rounded-xl shadow-sm border border-sky-50">{noteLimit} / {notes.length}</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max={Math.max(1, notes.length)} 
                  value={noteLimit} 
                  onChange={(e) => setNoteLimit(Number(e.target.value))}
                  className="w-full h-1 bg-sky-100 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <p className="text-[9px] font-black text-sky-300 uppercase tracking-widest">高级参数</p>
                  <div className="flex-1 h-px bg-sky-50" />
                </div>
                {[
                  { label: "周期上限", key: "totalPeriod", desc: "决定 Bytebeat 循环一周的总步数（t 的最大上限）" },
                  { label: "音符单位", key: "baseUnit", desc: "基础时间单位，决定每个音符的持续步数，数值越小节奏越快" },
                ].map(item => (
                  <div key={item.key} className="space-y-2 group relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-sky-600 group-hover:text-sky-400 transition-colors">{item.label}</span>
                      <input 
                        type="number" 
                        value={(options as any)[item.key]} 
                        onChange={e => setOptions({...options, [item.key]: Number(e.target.value)})}
                        className="bg-white/60 rounded-xl px-3 py-1.5 text-right font-mono text-sky-700 outline-none w-24 text-[10px] border border-transparent focus:border-sky-300 shadow-sm transition-all"
                      />
                    </div>
                    <p className="text-[9px] text-sky-300 pl-1 leading-tight">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {selectedIndex !== null && activeNotes[selectedIndex] && (
            <GlassCard className="p-6 bg-sky-600 border-none animate-in fade-in slide-in-from-bottom-2" hover>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-black text-white">#{selectedIndex + 1}</div>
                  <h3 className="font-black text-white text-[10px] uppercase tracking-widest">音符属性</h3>
                </div>
                <button onClick={() => setSelectedIndex(null)} className="text-white/40 hover:text-white transition-colors">✕</button>
              </div>
              <div className="flex justify-between items-center bg-white/10 p-3 rounded-xl border border-white/5">
                <span className="text-[10px] font-bold text-white/70">频率系数 (Coeff)</span>
                <span className="text-white/90 font-mono text-[10px]">{activeNotes[selectedIndex].coeff.toFixed(3)}</span>
              </div>
            </GlassCard>
          )}
        </aside>

        {/* 右侧主视口 */}
        <main className="lg:col-span-8 space-y-6">
          
          {/* 流动钢琴窗 */}
          <GlassCard className="p-8 flex flex-col min-h-[350px]" hover>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
              <div className="flex items-center gap-5">
                <button 
                  onClick={isPlaying ? stopPlayback : startPlayback}
                  className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all transform active:scale-95 shadow-2xl ${isPlaying ? 'bg-rose-500 shadow-rose-200 hover:bg-rose-600' : 'bg-sky-500 shadow-sky-200 hover:bg-sky-600'}`}
                >
                  {isPlaying ? (
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"/></svg>
                  ) : (
                    <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/></svg>
                  )}
                </button>
                <div>
                  <h2 className="text-xl font-black tracking-tighter uppercase leading-tight">{isPlaying ? "正在播放 MIDI" : "钢琴窗"}</h2>
                  <p className="text-[10px] font-bold text-sky-400 mt-1 uppercase tracking-widest">
                    {activeNotes.length > 0 ? `音符数量: ${activeNotes.length}` : "等待数据输入"}
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-1">
                <span className="text-[9px] font-black text-sky-300 uppercase">播放进度</span>
                <div className="w-32 h-1.5 bg-sky-50 rounded-full overflow-hidden border border-sky-100/50 shadow-inner">
                  <div className="h-full bg-gradient-to-r from-sky-400 to-sky-500 transition-all duration-100 ease-linear" style={{ width: `${playProgress * 100}%` }} />
                </div>
              </div>
            </div>
            
            <div ref={timelineRef} className="flex-grow overflow-x-auto overflow-y-hidden relative flex items-end scrollbar-hide pb-10 px-4 border-b border-sky-50/50 rounded-b-3xl">
              {/* 播放头指示线 */}
              <div className="absolute top-0 bottom-0 w-[3px] bg-rose-500/60 z-20 pointer-events-none transition-all duration-100 ease-linear shadow-[0_0_8px_rgba(244,63,94,0.4)]" style={{ left: `${playProgress * 100}%` }} />

              <div className="flex items-end gap-1.5 relative h-full min-w-full pb-2">
                {activeNotes.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-sky-50 border-t-sky-400 animate-spin" />
                    <p className="text-[9px] font-black text-sky-200 uppercase tracking-[0.4em]">Empty Input Buffer</p>
                  </div>
                ) : (
                  activeNotes.map((note, idx) => {
                    // 动态计算宽度：基于 duration，并设置最小宽度
                    const noteWidth = Math.max(32, note.duration * 120);
                    return (
                      <div key={note.id} className="flex items-end transition-all">
                        <button
                          onClick={() => setSelectedIndex(idx)}
                          style={{ 
                            height: `${Math.max(10, (note.pitch - 24) * 3.5)}px`, 
                            width: `${noteWidth}px`,
                          }}
                          className={`relative rounded-t-2xl transition-all duration-500 group overflow-hidden shadow-sm ${selectedIndex === idx ? 'bg-gradient-to-t from-sky-600 to-sky-400 shadow-xl shadow-sky-200 z-10 scale-[1.02] ring-2 ring-white/50' : 'bg-sky-300/80 hover:bg-sky-400/90'}`}
                        >
                          <div className={`absolute inset-0 flex items-center justify-center text-[9px] font-black transition-all ${selectedIndex === idx ? 'text-white' : 'text-sky-700 opacity-0 group-hover:opacity-100'}`}>
                            {getNoteName(note.pitch)}
                          </div>
                        </button>
                        {note.restAfter > 0 && (
                          <div style={{ width: `${(note.restAfter / options.baseUnit) * 120}px` }} className="h-px bg-sky-200/50 mx-0.5 self-center border-t border-dashed border-sky-300" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </GlassCard>

          {/* 代码区域 */}
          <GlassCard className="p-8" hover>
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest leading-none">Bytebeat 逻辑表达式</p>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(expression);
                  const btn = document.getElementById('copy-btn');
                  if (btn) btn.innerText = "已复制";
                  setTimeout(() => { if (btn) btn.innerText = "复制表达式"; }, 2000);
                }}
                id="copy-btn"
                className="text-[9px] font-black text-sky-600 hover:text-white hover:bg-sky-500 bg-white px-5 py-2 rounded-full transition-all uppercase border border-sky-100 shadow-sm"
              >
                复制表达式
              </button>
            </div>
            <div className="bg-[#0c111c] rounded-[2rem] p-8 shadow-2xl relative group overflow-hidden border border-white/5">
              <code className="text-[11px] font-mono text-sky-400/80 break-all leading-relaxed block max-h-[120px] overflow-y-auto custom-scrollbar pr-4">
                {expression}
              </code>
            </div>
          </GlassCard>
        </main>
      </div>

      {error && (
        <div className="fixed bottom-10 right-10 bg-rose-600 text-white px-8 py-4 rounded-3xl shadow-2xl text-[10px] font-black tracking-widest animate-in fade-in slide-in-from-right-8 z-50">
          SYSTEM ERROR: {error}
        </div>
      )}
      
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(56,189,248,0.2); border-radius: 10px; }
        input[type=range] {
          height: 4px;
          border-radius: 10px;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #0ea5e9;
          box-shadow: 0 0 10px rgba(14,165,233,0.4);
          cursor: pointer;
          border: 2px solid white;
          transition: transform 0.2s;
        }
        input[type=range]::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
}
