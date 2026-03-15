import React, { useState, useEffect } from 'react';
import { Dropzone } from './components/Dropzone';
import { SolutionDisplay } from './components/SolutionDisplay';
import { resizeImage } from './utils/image';
import { solveQuestion, solveTextQuestion, chatWithTutor, generateVisualExplanation, gradeWork } from './services/gemini';
import { Loader2, X, Check, Copy, RefreshCw, Search, Zap, BrainCircuit, MessageSquare, Send, Image as ImageIcon, Moon, Sun, History, Printer, PenTool, ChevronDown } from 'lucide-react';

type AppState = 'IDLE' | 'PREVIEWING' | 'LOADING' | 'SOLVED' | 'ERROR';

interface HistoryItem {
  id: string;
  timestamp: number;
  solution: string;
  type: 'solve' | 'grade';
  visualUrl?: string | null;
}

const COPY_FEEDBACK_DURATION_MS = 2000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export default function App() {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [textInput, setTextInput] = useState<string | null>(null);
  const [solution, setSolution] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastMode, setLastMode] = useState<'deep' | 'fast' | 'search'>('deep');
  
  // V2 Features State
  const [darkMode, setDarkMode] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [subject, setSubject] = useState('Auto-detect');
  const [inkColor, setInkColor] = useState('red');

  // Chat state
  const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Visual Explanation state
  const [visualUrl, setVisualUrl] = useState<string | null>(null);
  const [isVisualLoading, setIsVisualLoading] = useState(false);
  const [showVisualOptions, setShowVisualOptions] = useState(false);

  const [handwritingFile, setHandwritingFile] = useState<File | null>(null);
  const [handwritingPreviewUrl, setHandwritingPreviewUrl] = useState<string | null>(null);

  // Initialization
  useEffect(() => {
    const savedHistory = localStorage.getItem('aqs_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {}
    }
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(isDark);
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImagePreviewUrl(null);
    }
  }, [imageFile]);

  useEffect(() => {
    if (handwritingFile) {
      const url = URL.createObjectURL(handwritingFile);
      setHandwritingPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setHandwritingPreviewUrl(null);
    }
  }, [handwritingFile]);

  const saveToHistory = (item: HistoryItem) => {
    const newHistory = [item, ...history].slice(0, 5);
    setHistory(newHistory);
    localStorage.setItem('aqs_history', JSON.stringify(newHistory));
  };

  const handleImageSelected = (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMsg("Image is too large. Try a cropped screenshot.");
      setAppState('ERROR');
      return;
    }
    setImageFile(file);
    setTextInput(null);
    setAppState('PREVIEWING');
    setErrorMsg(null);
  };

  const handleHandwritingSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorMsg("Image is too large. Try a cropped screenshot.");
        setAppState('ERROR');
        return;
      }
      setHandwritingFile(file);
    }
  };

  const handleTextPasted = (text: string) => {
    setTextInput(text);
    setImageFile(null);
    setAppState('PREVIEWING');
    setErrorMsg(null);
  };

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setAppState('ERROR');
  };

  const handleSolve = async (mode: 'deep' | 'fast' | 'search', detailed = false) => {
    setAppState('LOADING');
    setErrorMsg(null);
    setSolution(null);
    setChatHistory([]);
    setVisualUrl(null);
    setShowVisualOptions(false);
    setLastMode(mode);

    try {
      let result = '';
      if (imageFile) {
        const base64 = await resizeImage(imageFile);
        result = await solveQuestion(base64, mode, subject, detailed);
      } else if (textInput) {
        result = await solveTextQuestion(textInput, mode, subject, detailed);
      } else {
        throw new Error("No input provided.");
      }
      
      setSolution(result);
      setAppState('SOLVED');
      saveToHistory({ id: Date.now().toString(), timestamp: Date.now(), solution: result, type: 'solve' });
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('429') || err.message?.includes('quota')) {
        setErrorMsg("We're getting too many requests right now. Please wait a moment and try again.");
      } else if (err.message?.includes('offline') || err.message?.includes('fetch')) {
        setErrorMsg("No internet connection detected. Please check your connection.");
      } else if (err.message?.includes('API key')) {
        setErrorMsg("Configuration error. Please check the API key setup.");
      } else {
        setErrorMsg("Something went wrong on our end. Please try again.");
      }
      setAppState('ERROR');
    }
  };

  const handleGradeWork = async () => {
    if (!imageFile) return;
    setAppState('LOADING');
    setErrorMsg(null);
    setSolution(null);
    setChatHistory([]);
    setVisualUrl(null);

    try {
      const base64 = await resizeImage(imageFile);
      let handwritingBase64 = null;
      if (handwritingFile) {
        handwritingBase64 = await resizeImage(handwritingFile);
      }
      
      const { text, image } = await gradeWork(base64, inkColor, handwritingBase64);
      
      setSolution(text);
      setVisualUrl(image);
      setAppState('SOLVED');
      saveToHistory({ id: Date.now().toString(), timestamp: Date.now(), solution: text, type: 'grade', visualUrl: image });
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to grade work. Please try again.");
      setAppState('ERROR');
    }
  };

  const handleClear = () => {
    setAppState('IDLE');
    setImageFile(null);
    setTextInput(null);
    setSolution(null);
    setErrorMsg(null);
    setChatHistory([]);
    setVisualUrl(null);
    setShowVisualOptions(false);
    setHandwritingFile(null);
  };

  const handleCopy = () => {
    if (solution) {
      navigator.clipboard.writeText(solution);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setSolution(item.solution);
    setVisualUrl(item.visualUrl || null);
    setAppState('SOLVED');
    setShowHistory(false);
    setImageFile(null);
    setTextInput(null);
    setImagePreviewUrl(null);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !solution) return;
    
    const newMessage = chatInput.trim();
    setChatInput('');
    
    const newHistory = [...chatHistory, { role: 'user', text: newMessage }];
    setChatHistory(newHistory);
    setIsChatLoading(true);
    
    try {
      const contextHistory = chatHistory.length === 0 
        ? [{ role: 'tutor', text: `Here is the solution I provided earlier:\n\n${solution}` }, ...newHistory]
        : newHistory;
        
      const reply = await chatWithTutor(contextHistory, newMessage);
      setChatHistory([...newHistory, { role: 'tutor', text: reply }]);
    } catch (err) {
      console.error(err);
      setChatHistory([...newHistory, { role: 'tutor', text: "Sorry, I couldn't process that right now. Please try again." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerateVisual = async (size: '1K' | '2K' | '4K') => {
    if (!solution) return;
    setIsVisualLoading(true);
    setShowVisualOptions(false);
    try {
      const prompt = `Create a clear, educational diagram or visual explanation for the following solution:\n\n${solution.substring(0, 1000)}`;
      const url = await generateVisualExplanation(prompt, size);
      if (url) {
        setVisualUrl(url);
      } else {
        alert("Failed to generate visual explanation.");
      }
    } catch (err) {
      console.error(err);
      alert("Error generating visual explanation. Please check your API key and try again.");
    } finally {
      setIsVisualLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 bg-grid-pattern text-gray-900 dark:text-gray-100 font-sans selection:bg-indigo-100 selection:text-indigo-900 dark:selection:bg-indigo-900 dark:selection:text-indigo-100 transition-colors duration-200">
      
      {/* History Sidebar/Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end animate-in fade-in duration-200 no-print">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md h-full overflow-y-auto p-6 shadow-xl border-l-2 border-gray-900 dark:border-gray-100 animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2 font-sans tracking-tight">
                <History className="w-6 h-6" /> Recent Solutions
              </h2>
              <button onClick={() => setShowHistory(false)} className="p-2 rounded-lg border-2 border-transparent hover:border-gray-900 dark:hover:border-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                <X className="w-5 h-5 dark:text-gray-300" />
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center mt-10 font-mono text-sm">No history yet.</p>
            ) : (
              <div className="space-y-4">
                {history.map(item => (
                  <div 
                    key={item.id} 
                    className="p-4 border-2 border-gray-900 dark:border-gray-100 rounded-xl cursor-pointer bg-white dark:bg-gray-800 hover:-translate-y-1 hover:neo-shadow dark:hover:neo-shadow transition-all" 
                    onClick={() => loadHistoryItem(item)}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold font-mono px-2 py-1 rounded bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100 border border-indigo-900 dark:border-indigo-100">
                        {item.type === 'grade' ? 'GRADED WORK' : 'SOLUTION'}
                      </span>
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm font-medium dark:text-gray-200 line-clamp-2 mt-2">
                      {item.solution.replace(/[*#_`]/g, '')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        
        <header className="flex items-center justify-between mb-8 md:mb-12 no-print">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-white font-sans">AnyQuestionSolver</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowHistory(true)}
              className="p-2 rounded-xl border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:-translate-y-0.5 hover:neo-shadow-sm transition-all"
              title="History"
            >
              <History className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:-translate-y-0.5 hover:neo-shadow-sm transition-all"
              title="Toggle Dark Mode"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <main className="space-y-8">
          {appState === 'IDLE' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-4 flex items-center justify-end gap-2 no-print">
                <label className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100">SUBJECT:</label>
                <div className="relative">
                  <select 
                    value={subject} 
                    onChange={e => setSubject(e.target.value)} 
                    className="appearance-none bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium dark:text-white focus:outline-none neo-shadow-sm"
                  >
                    <option>Auto-detect</option>
                    <option>Mathematics</option>
                    <option>Physics</option>
                    <option>Chemistry</option>
                    <option>Biology</option>
                    <option>Computer Science</option>
                    <option>History</option>
                    <option>Literature</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-900 dark:text-gray-100 pointer-events-none" />
                </div>
              </div>
              <Dropzone 
                onImageSelected={handleImageSelected} 
                onTextPasted={handleTextPasted}
                onError={handleError}
              />
            </div>
          )}

          {(appState === 'PREVIEWING' || appState === 'LOADING' || appState === 'SOLVED' || appState === 'ERROR') && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 no-print">
              <div className="p-4 bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-900 dark:border-gray-100 flex justify-between items-center">
                <h2 className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100 uppercase tracking-wider">Input Preview</h2>
                <button 
                  onClick={handleClear}
                  className="text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors p-1 rounded-lg border-2 border-transparent hover:border-gray-900 dark:hover:border-gray-100"
                  title="Clear input"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 flex flex-col items-center">
                {imagePreviewUrl && (
                  <img 
                    src={imagePreviewUrl} 
                    alt="Question preview" 
                    className="max-h-[300px] object-contain rounded-lg border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm"
                  />
                )}
                {textInput && !imagePreviewUrl && (
                  <div className="w-full bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border-2 border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono text-sm max-h-[300px] overflow-y-auto neo-shadow-sm">
                    {textInput}
                  </div>
                )}
                
                {appState === 'PREVIEWING' && (
                  <div className="mt-8 flex flex-col items-center gap-8 w-full">
                    <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 w-full">
                      <button 
                        onClick={() => handleSolve('deep')}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white border-2 border-gray-900 dark:border-gray-100 px-6 py-3 rounded-xl font-bold transition-all neo-shadow hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(17,24,39,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(243,244,246,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                      >
                        <BrainCircuit className="w-5 h-5" />
                        Deep Solve (Pro)
                      </button>
                      <button 
                        onClick={() => handleSolve('fast')}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-gray-900 dark:border-gray-100 px-6 py-3 rounded-xl font-bold transition-all neo-shadow hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(17,24,39,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(243,244,246,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                      >
                        <Zap className="w-5 h-5 text-amber-500" />
                        Fast Solve
                      </button>
                      <button 
                        onClick={() => handleSolve('search')}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-gray-900 dark:border-gray-100 px-6 py-3 rounded-xl font-bold transition-all neo-shadow hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(17,24,39,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(243,244,246,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                      >
                        <Search className="w-5 h-5 text-blue-500" />
                        Search Web
                      </button>
                    </div>

                    {imageFile && (
                      <div className="flex flex-col items-center gap-4 pt-8 border-t-2 border-gray-200 dark:border-gray-800 w-full max-w-2xl">
                        <h3 className="font-bold font-sans text-xl text-gray-900 dark:text-gray-100">Check My Work</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-md">Upload an optional handwriting sample so the AI can mimic your style when grading.</p>
                        
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-center gap-4 w-full">
                          <div className="flex flex-col gap-2 w-full sm:w-auto">
                            <label className="text-xs font-bold font-mono text-gray-900 dark:text-gray-100 uppercase">Ink Color</label>
                            <select 
                              value={inkColor} 
                              onChange={e => setInkColor(e.target.value)}
                              className="w-full bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 rounded-lg px-3 py-2 text-sm font-medium dark:text-white focus:outline-none neo-shadow-sm"
                            >
                              <option value="red">Red</option>
                              <option value="blue">Blue</option>
                              <option value="green">Green</option>
                              <option value="purple">Purple</option>
                            </select>
                          </div>
                          
                          <div className="flex flex-col gap-2 w-full sm:flex-1 sm:min-w-[200px]">
                            <label className="text-xs font-bold font-mono text-gray-900 dark:text-gray-100 uppercase">Handwriting Sample (Optional)</label>
                            <div className="flex items-center gap-2 w-full">
                              <label className="flex-1 bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 rounded-lg px-3 py-2 text-sm font-medium dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors neo-shadow-sm flex items-center justify-between">
                                <span className="truncate max-w-[150px] sm:max-w-[200px]">{handwritingFile ? handwritingFile.name : 'Choose image...'}</span>
                                <ImageIcon className="w-4 h-4 flex-shrink-0" />
                                <input type="file" accept="image/*" onChange={handleHandwritingSelected} className="hidden" />
                              </label>
                              {handwritingPreviewUrl && (
                                <img src={handwritingPreviewUrl} alt="Handwriting" className="w-10 h-10 rounded border-2 border-gray-900 dark:border-gray-100 object-cover flex-shrink-0" />
                              )}
                            </div>
                          </div>
                        </div>

                        <button 
                          onClick={handleGradeWork}
                          className="mt-2 w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-400 dark:bg-emerald-600 text-gray-900 dark:text-white border-2 border-gray-900 dark:border-gray-100 px-8 py-3 rounded-xl font-bold transition-all neo-shadow hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(17,24,39,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(243,244,246,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                        >
                          <PenTool className="w-5 h-5" />
                          Grade My Work
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {appState === 'LOADING' && (
            <div className="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500 no-print">
              <Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin mb-4" />
              <p className="text-gray-900 dark:text-gray-100 font-bold font-sans text-xl">Analyzing your question...</p>
              <p className="text-sm font-mono text-gray-600 dark:text-gray-400 mt-2">This usually takes a few seconds.</p>
            </div>
          )}

          {appState === 'ERROR' && (
            <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-900 dark:border-red-100 rounded-xl p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 no-print neo-shadow">
              <p className="text-red-900 dark:text-red-100 font-bold mb-6 text-lg">{errorMsg}</p>
              <div className="flex justify-center gap-4">
                <button 
                  onClick={() => handleSolve('deep')}
                  className="flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 px-6 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
                <button 
                  onClick={handleClear}
                  className="flex items-center gap-2 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 px-6 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          {appState === 'SOLVED' && solution && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <SolutionDisplay solution={solution} />
              
              {visualUrl && (
                <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow">
                  <h3 className="font-bold font-sans text-xl text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
                    <ImageIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    Visual Corrections / Explanation
                  </h3>
                  <img src={visualUrl} alt="Visual Explanation" className="w-full rounded-lg border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm" />
                </div>
              )}

              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow no-print">
                <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full sm:w-auto">
                  <button 
                    onClick={handleCopy}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-2 border-gray-900 dark:border-gray-100 px-4 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy Markdown'}
                  </button>
                  
                  <button 
                    onClick={handlePrint}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-2 border-gray-900 dark:border-gray-100 px-4 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  >
                    <Printer className="w-4 h-4" />
                    Print / PDF
                  </button>

                  <div 
                    className="relative w-full sm:w-auto"
                    onMouseEnter={() => setShowVisualOptions(true)}
                    onMouseLeave={() => setShowVisualOptions(false)}
                  >
                    <button 
                      onClick={() => setShowVisualOptions(!showVisualOptions)}
                      disabled={isVisualLoading || !!visualUrl}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-800 text-indigo-900 dark:text-indigo-100 border-2 border-indigo-900 dark:border-indigo-100 px-4 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[2px_2px_0px_0px_rgba(17,24,39,1)]"
                    >
                      {isVisualLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                      Explain Visually
                    </button>
                    
                    {showVisualOptions && (
                      <div className="absolute top-full left-0 sm:left-auto mt-2 w-full sm:w-48 bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow overflow-hidden z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 text-xs font-bold font-mono text-gray-900 dark:text-gray-100 uppercase tracking-wider bg-gray-100 dark:bg-gray-900 border-b-2 border-gray-900 dark:border-gray-100">Select Quality</div>
                        <button onClick={() => handleGenerateVisual('1K')} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 transition-colors">Standard (1K)</button>
                        <button onClick={() => handleGenerateVisual('2K')} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 transition-colors">High (2K)</button>
                        <button onClick={() => handleGenerateVisual('4K')} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium dark:text-gray-100 transition-colors">Ultra (4K)</button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
                  <button 
                    onClick={() => handleSolve(lastMode, true)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-2 border-gray-900 dark:border-gray-100 px-4 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  >
                    <RefreshCw className="w-4 h-4" />
                    More Detail
                  </button>
                  <button 
                    onClick={handleClear}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 px-4 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                </div>
              </div>

              {/* Chatbot Section */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow overflow-hidden mt-8 no-print">
                <div className="p-4 bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-900 dark:border-gray-100 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                  <h3 className="font-bold font-sans text-lg text-gray-900 dark:text-gray-100">Follow-up Questions</h3>
                </div>
                
                <div className="p-4 md:p-6">
                  {chatHistory.length > 0 && (
                    <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto pr-2">
                      {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-xl px-4 py-3 border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm ${msg.role === 'user' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-gray-900 dark:text-gray-100' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}>
                            <p className="whitespace-pre-wrap text-sm font-medium">{msg.text}</p>
                          </div>
                        </div>
                      ))}
                      {isChatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm rounded-xl px-4 py-3 flex items-center gap-2">
                            <div className="w-2 h-2 bg-gray-900 dark:bg-gray-100 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-gray-900 dark:bg-gray-100 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-gray-900 dark:bg-gray-100 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                      placeholder="Ask a follow-up question..."
                      className="flex-1 bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 focus:outline-none neo-shadow-sm font-medium"
                      disabled={isChatLoading}
                    />
                    <button 
                      onClick={handleSendChat}
                      disabled={!chatInput.trim() || isChatLoading}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:border-gray-400 dark:disabled:border-gray-600 text-white border-2 border-gray-900 dark:border-gray-100 p-3 rounded-xl transition-all flex items-center justify-center neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[2px_2px_0px_0px_rgba(17,24,39,1)]"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
