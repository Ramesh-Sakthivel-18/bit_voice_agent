import React, { useState, useRef, useEffect } from 'react';
import { askMarketAssistant } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';

export const MarketAssistantWidget = ({ language = 'ta-IN', userRole = 'buyer' }) => {
    const { speak, stopSpeaking } = useSmartVoice();

    // ─── 1. STATELESS ARCHITECTURE (NO DB OR STORAGE PERSISTENCE) ───
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [autoVoiceResponse, setAutoVoiceResponse] = useState(true);
    
    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    // Setup Speech Recognition for Voice-First Chat
    useEffect(() => {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
            const recog = new SpeechRec();
            recog.continuous = false;
            recog.interimResults = false;
            recog.lang = language || 'ta-IN';

            recog.onresult = (e) => {
                const transcript = e.results[0][0].transcript;
                console.log("[Market Assistant Voice Input]:", transcript);
                setInputText(transcript);
                setIsListening(false);
                // Auto-send voice input
                handleSendMessage(transcript);
            };

            recog.onerror = (e) => {
                console.warn("[Market Assistant Speech Error]:", e.error);
                setIsListening(false);
            };

            recog.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = recog;
        }

        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) {}
            }
        };
    }, [language, userRole]);

    const toggleSpeechInput = () => {
        if (!recognitionRef.current) {
            alert(language === 'ta-IN' ? "உங்கள் உலாவியில் குரல் உள்ளீடு ஆதரிக்கப்படவில்லை." : "Speech recognition not supported in this browser.");
            return;
        }

        if (isListening) {
            try { recognitionRef.current.stop(); } catch (e) {}
            setIsListening(false);
        } else {
            stopSpeaking();
            try {
                recognitionRef.current.lang = language || 'ta-IN';
                recognitionRef.current.start();
                setIsListening(true);
            } catch (e) {
                console.error("Recognition start error:", e);
                setIsListening(false);
            }
        }
    };

    // Send Message Pipeline
    const handleSendMessage = async (textToSend) => {
        const query = (textToSend || inputText).trim();
        if (!query || isLoading) return;

        setInputText('');
        stopSpeaking();

        // Ephemeral user message
        const userMsg = {
            id: `usr-${Date.now()}`,
            sender: 'user',
            text: query,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            // Live Search + Gemini + Localization Pipeline
            const res = await askMarketAssistant(query, language, userRole);
            
            const botMsg = {
                id: `bot-${Date.now()}`,
                sender: 'assistant',
                text: res.answer_localized || res.answer_english,
                englishText: res.answer_english,
                sources: res.sources || ['Agmarknet 2.0', 'TRIFED Tribes India'],
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            setMessages(prev => [...prev, botMsg]);

            // Voice pipeline: read aloud in user's UI language
            if (autoVoiceResponse && botMsg.text) {
                speak(botMsg.text, language);
            }
        } catch (err) {
            console.error("Market assistant query failed:", err);
            const errorMsg = {
                id: `err-${Date.now()}`,
                sender: 'assistant',
                isError: true,
                text: language === 'ta-IN' 
                    ? "மன்னிக்கவும், நேரடி சந்தை தகவலைப் பெறுவதில் பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்."
                    : "Apologies, could not fetch live market prices at this moment. Please try again.",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    // Clear stateless chat
    const handleClearChat = () => {
        stopSpeaking();
        setMessages([]);
    };

    // Quick prompt chips
    const quickPrompts = language === 'ta-IN' ? [
        "🍯 இன்றைய காட்டு தேன் விலை என்ன?",
        "🌿 மஞ்சள் அக்மார்க்நெட் சந்தை விலை",
        "🧄 பூண்டு மற்றும் இஞ்சி மண்டி விலை",
        "🌾 பழங்குடி பொருட்களுக்கான TRIFED MSP"
    ] : [
        "🍯 What is the price of honey today?",
        "🌿 Turmeric Agmarknet mandi rates",
        "🧄 Garlic & Ginger wholesale price",
        "🌾 TRIFED tribal products MSP"
    ];

    return (
        <aside 
            aria-label="AI Market Assistant"
            className="fixed bottom-24 right-4 sm:right-7 z-40 select-none"
        >
            {/* ─── FLOATING TOGGLE BUTTON (UNDISTURBED IN CORNER) ─── */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center gap-2.5 px-4 sm:px-5 py-3 rounded-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black shadow-[0_8px_30px_rgba(6,182,212,0.5)] border-2 border-cyan-400/60 transform hover:scale-105 active:scale-95 transition-all cursor-pointer group"
                    title="Open AI Market Assistant"
                >
                    <div className="relative">
                        <span className="text-xl sm:text-2xl group-hover:rotate-12 transition-transform inline-block">🤖</span>
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    </div>
                    <div className="text-left">
                        <p className="text-xs sm:text-sm font-black leading-tight flex items-center gap-1.5">
                            <span>{language === 'ta-IN' ? "சந்தை வழிகாட்டி" : "Market Assistant"}</span>
                            <span className="text-[10px] bg-cyan-900/90 text-cyan-200 px-1.5 py-0.2 rounded border border-cyan-400/40">AI</span>
                        </p>
                        <p className="text-[10px] text-cyan-100/80 font-normal leading-tight">
                            {language === 'ta-IN' ? "Agmarknet & TRIFED நேரலை" : "Live Mandi & MSP"}
                        </p>
                    </div>
                </button>
            )}

            {/* ─── STATELESS CHAT DRAWER / WINDOW ─── */}
            {isOpen && (
                <div className="w-[360px] sm:w-[420px] max-w-[94vw] h-[580px] max-h-[80vh] flex flex-col bg-gradient-to-b from-[#09152B]/98 via-[#061122]/98 to-[#040C1A]/98 border-2 border-cyan-500/70 rounded-3xl shadow-[0_15px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    
                    {/* Widget Header */}
                    <div className="p-3.5 sm:p-4 bg-[#081730]/90 border-b border-cyan-500/30 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-lg shadow-md">
                                🤖
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-black text-white leading-tight">
                                        {language === 'ta-IN' ? "AI சந்தை வழிகாட்டி" : "AI Market Assistant"}
                                    </h3>
                                    <span className="text-[10px] bg-emerald-950 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                        <span>Live</span>
                                    </span>
                                </div>
                                <p className="text-[10px] text-cyan-300/80">
                                    {language === 'ta-IN' ? "அக்மார்க்நெட் & ட்ரைஃபெட் நேரடி தேடல்" : "Agmarknet & TRIFED Live Search"}
                                </p>
                            </div>
                        </div>

                        {/* Controls: Audio Toggle, Clear, Close */}
                        <div className="flex items-center gap-1">
                            {/* Auto Voice Output Toggle */}
                            <button
                                onClick={() => setAutoVoiceResponse(!autoVoiceResponse)}
                                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                    autoVoiceResponse ? 'text-cyan-300 bg-cyan-950/60 border border-cyan-500/40' : 'text-gray-500 hover:text-gray-300'
                                }`}
                                title={autoVoiceResponse ? "Voice response ON" : "Voice response MUTED"}
                            >
                                {autoVoiceResponse ? '🔊' : '🔇'}
                            </button>

                            {/* Clear Ephemeral Chat */}
                            <button
                                onClick={handleClearChat}
                                className="p-1.5 rounded-lg text-xs text-gray-400 hover:text-amber-400 hover:bg-white/5 transition-colors cursor-pointer"
                                title="Clear conversation (Stateless)"
                            >
                                🗑️
                            </button>

                            {/* Close Widget */}
                            <button
                                onClick={() => {
                                    stopSpeaking();
                                    setIsOpen(false);
                                }}
                                className="p-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Stateless Conversation Message Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 side-panel-scrollbar">
                        
                        {/* Initial stateless helper badge */}
                        <div className="bg-[#0A1A33]/80 border border-cyan-500/30 rounded-2xl p-3 text-[11px] text-cyan-200/90 flex items-start gap-2.5">
                            <span className="text-base">💡</span>
                            <div>
                                <p className="font-bold text-white">
                                    {language === 'ta-IN' 
                                        ? "நேரடி சந்தை விலை & MSP உதவி" 
                                        : "Live Mandi & Tribal Price Intelligence"}
                                </p>
                                <p className="text-gray-300 mt-0.5 leading-relaxed text-[11px]">
                                    {language === 'ta-IN' 
                                        ? "அக்மார்க்நெட் & ட்ரைஃபெட் நேரடி தேடல் மூலம் ஜெமினி AI பதிலளிக்கும். மைக்கை தட்டி குரல் வழியே கேட்கலாம்." 
                                        : "Direct Gemini grounding with live Agmarknet & TRIFED search. Tap mic or type to ask."}
                                </p>
                            </div>
                        </div>

                        {/* Quick Prompt Suggestion Chips (when chat is empty) */}
                        {messages.length === 0 && (
                            <div className="space-y-1.5 pt-1">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                                    {language === 'ta-IN' ? "விரைவு கேள்விகள்:" : "Suggested Inquiries:"}
                                </p>
                                <div className="flex flex-col gap-1.5">
                                    {quickPrompts.map((chip, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleSendMessage(chip)}
                                            className="text-left text-xs bg-[#0B1E38]/90 hover:bg-[#0F284C] border border-slate-700 hover:border-cyan-400/60 text-cyan-200 p-2 rounded-xl transition-all hover:translate-x-1 cursor-pointer"
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Messages Stream */}
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} animate-in fade-in duration-150`}
                            >
                                <div
                                    className={`max-w-[88%] rounded-2xl p-3 text-xs sm:text-[13px] leading-relaxed shadow-md ${
                                        msg.sender === 'user'
                                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-sm'
                                            : msg.isError
                                            ? 'bg-red-950/90 text-red-200 border border-red-500/50 rounded-bl-sm'
                                            : 'bg-[#0B1E3B]/95 text-gray-100 border border-cyan-500/40 rounded-bl-sm'
                                    }`}
                                >
                                    {/* Assistant Header Tag */}
                                    {msg.sender === 'assistant' && !msg.isError && (
                                        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-cyan-500/20 text-[10px]">
                                            <span className="text-emerald-300 font-bold flex items-center gap-1">
                                                <span>🌿</span>
                                                <span>Agmarknet & TRIFED Live Context</span>
                                            </span>
                                            <button
                                                onClick={() => speak(msg.text, language)}
                                                className="text-cyan-300 hover:text-white p-0.5 rounded cursor-pointer"
                                                title="Read aloud"
                                            >
                                                🔊
                                            </button>
                                        </div>
                                    )}

                                    <p className="whitespace-pre-wrap">{msg.text}</p>

                                    {/* Sources Footer */}
                                    {msg.sources && (
                                        <div className="mt-2 pt-1.5 border-t border-slate-700/50 text-[10px] text-gray-400 flex flex-wrap gap-1 items-center">
                                            <span className="font-semibold text-cyan-300">Sources:</span>
                                            {msg.sources.map((s, i) => (
                                                <span key={i} className="bg-slate-800/80 px-1.5 py-0.5 rounded text-[9px] text-gray-300">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <span className="text-[9px] text-gray-500 mt-0.5 px-1 font-mono">
                                    {msg.time}
                                </span>
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {isLoading && (
                            <div className="flex items-center gap-2 p-3 bg-[#0B1E3B]/80 border border-cyan-500/30 rounded-2xl w-fit animate-pulse">
                                <span className="text-sm">🔍</span>
                                <span className="text-xs text-cyan-300 font-bold">
                                    {language === 'ta-IN' ? "நேரடி சந்தை விலை தேடப்படுகிறது..." : "Searching Agmarknet & TRIFED with Gemini..."}
                                </span>
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Widget Footer: Voice & Text Input */}
                    <div className="p-3 bg-[#071326] border-t border-cyan-500/30 flex flex-col gap-2">
                        {isListening && (
                            <div className="flex items-center justify-center gap-2 text-xs text-amber-300 py-1 bg-amber-950/40 rounded-xl border border-amber-500/30 animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                                <span>{language === 'ta-IN' ? "கேட்கிறது... உங்கள் கேள்வியைப் பேசுங்கள்" : "Listening... Speak your market query"}</span>
                            </div>
                        )}

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSendMessage();
                            }}
                            className="flex items-center gap-2"
                        >
                            {/* Voice-First Microphone Button */}
                            <button
                                type="button"
                                onClick={toggleSpeechInput}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-md ${
                                    isListening
                                        ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-400/40'
                                        : 'bg-gradient-to-tr from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-gray-950 font-bold'
                                }`}
                                title={isListening ? "Stop listening" : "Tap to speak in native language"}
                            >
                                <span className="text-lg">{isListening ? '🛑' : '🎙️'}</span>
                            </button>

                            {/* Typing Input */}
                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder={
                                    language === 'ta-IN'
                                        ? "கேள்வியைத் தட்டச்சு செய்க அல்லது பேசவும்..."
                                        : "Ask prices or tap mic..."
                                }
                                disabled={isLoading}
                                className="flex-1 bg-[#0B1E38] border border-slate-700 focus:border-cyan-400 focus:outline-none rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-gray-500 transition-colors"
                            />

                            {/* Send Button */}
                            <button
                                type="submit"
                                disabled={!inputText.trim() || isLoading}
                                className="w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
                                title="Send"
                            >
                                <span className="text-sm">➤</span>
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </aside>
    );
};
