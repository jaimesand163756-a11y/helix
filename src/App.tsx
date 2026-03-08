import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Table, Upload, Dna, User, Search, Loader2, Download, Info, AlertCircle, ChevronRight, Mic, MicOff, X, MessageSquare } from 'lucide-react';
import { TableVirtuoso } from 'react-virtuoso';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { analyzeDNA, generatePortrait, type DNAEntry, type PhysicalTraits } from './services/dnaService';
import { GoogleGenAI, Modality } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Live Conversation Component ---
function LiveConversation({ traits, portraitUrl, onClose }: { traits: PhysicalTraits; portraitUrl: string; onClose: () => void }) {
  const [isConnecting, setIsConnecting] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    const startSession = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
        
        // Setup Audio Context
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        
        const systemInstruction = `
          You are the person in the portrait. Your physical traits are:
          - Eye Color: ${traits.eyeColor}
          - Hair: ${traits.hairColor}, ${traits.hairType}
          - Skin Tone: ${traits.skinTone}
          - Facial Features: ${traits.facialFeatures}
          - Estimated Age: ${traits.estimatedAge}
          - Gender: ${traits.gender}
          
          Act as this person. Be natural, conversational, and friendly. 
          Respond with a voice that matches your described age and gender.
          Keep your responses concise and engaging.
        `;

        const sessionPromise = ai.live.connect({
          model: "gemini-2.5-flash-native-audio-preview-09-2025",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: traits.gender.toLowerCase().includes('female') ? 'Kore' : 'Zephyr' } },
            },
            systemInstruction,
          },
          callbacks: {
            onopen: () => {
              setIsConnecting(false);
              setIsListening(true);
              startMic();
            },
            onmessage: async (message) => {
              if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
                const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
                playAudio(base64Audio);
              }
              if (message.serverContent?.interrupted) {
                stopPlayback();
              }
            },
            onerror: (err) => {
              console.error("Live API Error:", err);
              setError("Connection failed. Please check your microphone permissions.");
              setIsConnecting(false);
            },
            onclose: () => {
              onClose();
            }
          }
        });

        sessionRef.current = await sessionPromise;
      } catch (err) {
        console.error("Failed to start session:", err);
        setError("Failed to initialize conversation.");
        setIsConnecting(false);
      }
    };

    const startMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        const source = audioContextRef.current!.createMediaStreamSource(stream);
        const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (sessionRef.current && isListening) {
            const inputData = e.inputBuffer.getChannelData(0);
            // Convert Float32 to Int16 PCM
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
            }
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
            sessionRef.current.sendRealtimeInput({
              media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          }
        };

        source.connect(processor);
        processor.connect(audioContextRef.current!.destination);
      } catch (err) {
        console.error("Mic error:", err);
        setError("Could not access microphone.");
      }
    };

    const playAudio = async (base64Data: string) => {
      if (!audioContextRef.current) return;
      setIsSpeaking(true);
      
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // PCM 16-bit 24kHz (Gemini TTS default) or 16kHz
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsSpeaking(false);
      source.start();
    };

    const stopPlayback = () => {
      // Logic to stop current audio source if needed
      setIsSpeaking(false);
    };

    startSession();

    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (processorRef.current) processorRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
      if (sessionRef.current) sessionRef.current.close();
    };
  }, [traits, onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141414]/90 backdrop-blur-xl p-4"
    >
      <div className="bg-[#E4E3E0] w-full max-w-2xl overflow-hidden relative border border-[#141414]">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 hover:bg-[#141414]/10 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Avatar View */}
          <div className="aspect-square bg-[#141414] relative overflow-hidden">
            <motion.img 
              src={portraitUrl} 
              alt="Avatar" 
              className="w-full h-full object-cover"
              animate={isSpeaking ? {
                scale: [1, 1.02, 1],
                filter: ["grayscale(0%) brightness(100%)", "grayscale(0%) brightness(110%)", "grayscale(0%) brightness(100%)"],
              } : {
                scale: 1,
                filter: "grayscale(0%) brightness(100%)"
              }}
              transition={{ duration: 0.5, repeat: isSpeaking ? Infinity : 0 }}
              referrerPolicy="no-referrer"
            />
            {isSpeaking && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1 px-8">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-[#E4E3E0]"
                    animate={{ height: [4, 24, 4] }}
                    transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.05 }}
                  />
                ))}
              </div>
            )}
            <div className="absolute top-4 left-4 bg-[#141414] text-[#E4E3E0] px-2 py-1 text-[8px] font-mono uppercase tracking-widest">
              {isSpeaking ? "Avatar Speaking..." : isListening ? "Listening..." : "Connecting..."}
            </div>
          </div>

          {/* Controls & Status */}
          <div className="p-8 flex flex-col justify-center space-y-6">
            <div className="space-y-2">
              <h3 className="text-xl font-bold uppercase tracking-tighter">Live Conversation</h3>
              <p className="text-xs font-mono opacity-50 uppercase">Neural Link Established</p>
            </div>

            {error ? (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-mono flex items-center gap-3">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500",
                    isListening ? "bg-[#141414] text-[#E4E3E0] scale-110 shadow-lg" : "bg-[#141414]/10 text-[#141414]"
                  )}>
                    {isListening ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold uppercase">{isListening ? "Microphone Active" : "Microphone Muted"}</p>
                    <p className="text-[10px] font-mono opacity-50 uppercase">Speak naturally to interact</p>
                  </div>
                </div>
                
                <div className="pt-8 border-t border-[#141414]/10">
                  <p className="text-xs italic font-serif opacity-70 leading-relaxed">
                    "Hello. I am the individual represented by the DNA sequence you've analyzed. Ask me anything about my traits or heritage."
                  </p>
                </div>
              </div>
            )}

            {isConnecting && (
              <div className="flex items-center gap-3 text-xs font-mono uppercase opacity-50">
                <Loader2 className="w-4 h-4 animate-spin" />
                Initializing Voice Synthesis...
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const getChrLabel = (chr: string) => {
  switch (chr) {
    case '23': return 'X';
    case '24': return 'NRY';
    case '25': return 'PseudoRegions';
    case '26': return 'mDNA';
    default: return chr;
  }
};

export default function App() {
  const [dnaData, setDnaData] = useState<DNAEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImagining, setIsImagining] = useState(false);
  const [traits, setTraits] = useState<PhysicalTraits | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isConversing, setIsConversing] = useState(false);
  const [selectedChromosome, setSelectedChromosome] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setSelectedChromosome(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      Papa.parse(text, {
        comments: '#',
        delimiter: '',
        skipEmptyLines: true,
        complete: (results) => {
          const parsedData = results.data
            .map((row: any) => ({
              rsid: row[0],
              chromosome: row[1],
              position: row[2],
              allele1: row[3],
              allele2: row[4],
            }))
            .filter((entry: any) => entry.rsid && entry.rsid !== 'rsid');
          
          setDnaData(parsedData);
          setIsLoading(false);
        },
        error: (error) => {
          console.error('Parsing error:', error);
          setIsLoading(false);
        }
      });
    };
    reader.readAsText(file);
  };

  const handleImagine = async () => {
    if (dnaData.length === 0) return;
    setIsImagining(true);
    try {
      const inferredTraits = await analyzeDNA(dnaData);
      setTraits(inferredTraits);
      const imageUrl = await generatePortrait(inferredTraits);
      setPortraitUrl(imageUrl);
    } catch (error) {
      console.error('Imagination error:', error);
    } finally {
      setIsImagining(false);
    }
  };

  const chromosomeGroups = React.useMemo(() => {
    const groups: Record<string, number> = {};
    dnaData.forEach(entry => {
      groups[entry.chromosome] = (groups[entry.chromosome] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => {
      const aNum = parseInt(a[0]);
      const bNum = parseInt(b[0]);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a[0].localeCompare(b[0]);
    });
  }, [dnaData]);

  const filteredData = dnaData.filter(entry => {
    const label = getChrLabel(entry.chromosome).toLowerCase();
    const matchesSearch = entry.rsid.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         entry.chromosome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         label.includes(searchTerm.toLowerCase());
    const matchesChromosome = selectedChromosome ? entry.chromosome === selectedChromosome : true;
    return matchesSearch && matchesChromosome;
  });

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase flex items-center gap-2">
            <Dna className="w-6 h-6" />
            Genome Explorer
          </h1>
          <p className="text-xs opacity-50 font-mono mt-1">v1.2.0 // ANCESTRY_DNA_PARSER</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const sample = `rsid\tchromosome\tposition\tallele1\tallele2
rs12913832\t15\t28365618\tA\tG
rs1805007\t16\t89986345\tC\tC
rs16891982\t5\t33951693\tC\tG
rs1426654\t15\t48426484\tA\tA
rs12896399\t14\t92539000\tG\tG
rs3827760\t2\t109513601\tA\tG`;
              Papa.parse(sample, {
                header: true,
                complete: (results) => {
                  setDnaData(results.data as DNAEntry[]);
                  setSelectedChromosome(null);
                }
              });
            }}
            className="text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
          >
            Try Sample
          </button>
          {dnaData.length > 0 && (
            <button
              onClick={handleImagine}
              disabled={isImagining}
              className="flex items-center gap-2 bg-[#141414] text-[#E4E3E0] px-4 py-2 rounded-none hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isImagining ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
              <span className="text-sm font-bold uppercase tracking-widest">Imagine Appearance</span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 border border-[#141414] px-4 py-2 rounded-none hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-widest">Upload DNA</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".txt,.csv"
          />
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-89px)]">
        {/* Left Panel: Data Grid */}
        <div className="lg:col-span-8 border-r border-[#141414] flex flex-col">
          <div className="p-4 border-b border-[#141414] flex items-center gap-4 bg-white/50">
            {selectedChromosome && (
              <button 
                onClick={() => setSelectedChromosome(null)}
                className="p-2 hover:bg-[#141414]/10 transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                Back to Chromosomes
              </button>
            )}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30" />
              <input
                type="text"
                placeholder="SEARCH BY RSID OR CHROMOSOME..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-transparent border-none focus:ring-0 text-xs font-mono placeholder:opacity-30"
              />
            </div>
            <div className="text-[10px] font-mono opacity-50 uppercase">
              {selectedChromosome ? `${filteredData.length} SNPs in ${getChrLabel(selectedChromosome)}` : `${chromosomeGroups.length} Chromosomes`}
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/20 backdrop-blur-sm">
                <Loader2 className="w-8 h-8 animate-spin opacity-20" />
              </div>
            ) : dnaData.length > 0 ? (
              !selectedChromosome ? (
                <div className="h-full overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 content-start">
                  {chromosomeGroups.map(([chr, count]) => (
                    <button
                      key={chr}
                      onClick={() => setSelectedChromosome(chr)}
                      className="group border border-[#141414] p-4 text-left hover:bg-[#141414] hover:text-[#E4E3E0] transition-all flex flex-col justify-between aspect-square"
                    >
                      <span className={cn(
                        "font-bold tracking-tighter leading-none",
                        chr.length > 2 ? "text-lg" : "text-3xl"
                      )}>
                        {getChrLabel(chr)}
                      </span>
                      <div>
                        <span className="block text-[10px] font-mono uppercase opacity-50 group-hover:opacity-70">Markers</span>
                        <span className="text-sm font-bold font-mono">{count.toLocaleString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <TableVirtuoso
                  data={filteredData}
                  fixedHeaderContent={() => (
                    <tr className="bg-[#141414] text-[#E4E3E0]">
                      <th className="p-3 text-left text-[10px] font-mono uppercase tracking-widest border-r border-white/10 w-1/4">RSID</th>
                      <th className="p-3 text-left text-[10px] font-mono uppercase tracking-widest border-r border-white/10 w-1/6">CHR</th>
                      <th className="p-3 text-left text-[10px] font-mono uppercase tracking-widest border-r border-white/10 w-1/4">Position</th>
                      <th className="p-3 text-left text-[10px] font-mono uppercase tracking-widest border-r border-white/10 w-1/6">A1</th>
                      <th className="p-3 text-left text-[10px] font-mono uppercase tracking-widest w-1/6">A2</th>
                    </tr>
                  )}
                  itemContent={(index, entry) => (
                    <>
                      <td className="p-3 text-xs font-mono border-r border-[#141414]/10 border-b border-[#141414]/10">{entry.rsid}</td>
                      <td className="p-3 text-xs font-mono border-r border-[#141414]/10 border-b border-[#141414]/10">{getChrLabel(entry.chromosome)}</td>
                      <td className="p-3 text-xs font-mono border-r border-[#141414]/10 border-b border-[#141414]/10">{entry.position}</td>
                      <td className="p-3 text-xs font-mono border-r border-[#141414]/10 border-b border-[#141414]/10 font-bold">{entry.allele1}</td>
                      <td className="p-3 text-xs font-mono border-b border-[#141414]/10 font-bold">{entry.allele2}</td>
                    </>
                  )}
                />
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-30">
                <div className="w-24 h-24 border-2 border-dashed border-[#141414] rounded-full flex items-center justify-center mb-6">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold uppercase tracking-tighter">No Data Loaded</h3>
                <p className="text-sm max-w-xs mt-2">Upload an AncestryDNA .txt file to begin the genomic analysis.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: AI Imagination */}
        <div className="lg:col-span-4 bg-[#D9D8D5] overflow-y-auto">
          <div className="p-6 border-b border-[#141414]">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] flex items-center gap-2">
              <Info className="w-4 h-4" />
              Phenotype Prediction
            </h2>
          </div>

          <div className="p-6 space-y-8">
            <AnimatePresence mode="wait">
              {isImagining ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="aspect-square bg-[#141414]/5 border border-[#141414]/10 flex flex-col items-center justify-center relative overflow-hidden">
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-t from-[#141414]/10 to-transparent"
                      animate={{ y: ['100%', '-100%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                    <Loader2 className="w-12 h-12 animate-spin opacity-20 mb-4" />
                    <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">Analyzing Genetic Markers...</p>
                  </div>
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-4 bg-[#141414]/5 animate-pulse" />
                    ))}
                  </div>
                </motion.div>
              ) : portraitUrl ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="group relative aspect-square bg-[#141414] border border-[#141414] overflow-hidden">
                    <img 
                      src={portraitUrl} 
                      alt="AI Generated Portrait" 
                      className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-4 left-4 bg-[#141414] text-[#E4E3E0] px-2 py-1 text-[8px] font-mono uppercase tracking-widest">
                      AI GENERATED_PORTRAIT_V2.5
                    </div>
                    <div className="absolute inset-0 bg-[#141414]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button 
                        onClick={() => setIsConversing(true)}
                        className="bg-[#E4E3E0] text-[#141414] px-6 py-3 font-bold uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-transform"
                      >
                        <MessageSquare className="w-5 h-5" />
                        Converse
                      </button>
                    </div>
                  </div>

                  {traits && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <TraitItem label="Eye Color" value={traits.eyeColor} />
                        <TraitItem label="Hair Color" value={traits.hairColor} />
                        <TraitItem label="Skin Tone" value={traits.skinTone} />
                        <TraitItem label="Gender" value={traits.gender} />
                      </div>
                      
                      <div className="border-t border-[#141414]/10 pt-6">
                        <h4 className="text-[10px] font-mono uppercase opacity-40 mb-2">Facial Characteristics</h4>
                        <p className="text-sm leading-relaxed italic font-serif">"{traits.facialFeatures}"</p>
                      </div>

                      <div className="border-t border-[#141414]/10 pt-6">
                        <h4 className="text-[10px] font-mono uppercase opacity-40 mb-2">Age Estimation</h4>
                        <div className="flex items-center gap-2">
                          <div className="h-1 flex-1 bg-[#141414]/10 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: '65%' }}
                              className="h-full bg-[#141414]"
                            />
                          </div>
                          <span className="text-xs font-mono">{traits.estimatedAge}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="aspect-square border border-dashed border-[#141414]/30 flex flex-col items-center justify-center text-center p-8 opacity-40">
                  <User className="w-12 h-12 mb-4" />
                  <p className="text-xs font-mono uppercase tracking-widest leading-relaxed">
                    Upload DNA data and click 'Imagine' to generate a phenotypic visualization.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Technical Specs Footer */}
          <div className="mt-auto p-6 border-t border-[#141414] bg-[#141414] text-[#E4E3E0]">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 opacity-50" />
              <p className="text-[9px] font-mono uppercase leading-tight opacity-50">
                Disclaimer: This visualization is a creative interpretation based on limited genetic markers. 
                It is not a medically accurate diagnostic tool.
              </p>
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isConversing && traits && portraitUrl && (
          <LiveConversation 
            traits={traits} 
            portraitUrl={portraitUrl} 
            onClose={() => setIsConversing(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TraitItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#141414]/10 pb-2">
      <span className="block text-[9px] font-mono uppercase opacity-40 mb-1">{label}</span>
      <span className="text-xs font-bold uppercase tracking-tight">{value}</span>
    </div>
  );
}
