import React, { useState, useRef, useEffect } from 'react';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { getTranslation } from '../utils/translations';

export const SmartVoiceDock = () => {
    const {
        language,
        pageContext,
        isListening,
        isSpeaking,
        transcript,
        screenInstruction,
        speakCurrentInstruction,
        startListening,
        stopListening
    } = useSmartVoice();

    const t = getTranslation(language);
    const [actionFeedback, setActionFeedback] = useState('');
    const [pressActive, setPressActive] = useState(false);

    const tapTimerRef = useRef(null);
    const lastTapTimeRef = useRef(0);
    const longPressTimerRef = useRef(null);
    const isLongPressRef = useRef(false);

    const showFeedback = (msg) => {
        setActionFeedback(msg);
        setTimeout(() => setActionFeedback(''), 2500);
    };

    // ─── UNIFIED TOUCH MECHANICS (RULE 4) ───
    // Single Tap: Triggers TTS to speak current screen instructions and options in active language
    const handleSingleTap = () => {
        if (isListening) {
            stopListening();
            showFeedback(language === 'ta-IN' ? "நிறுத்தப்பட்டது" : "Stopped");
            return;
        }
        showFeedback(t.micSpeaking || (language === 'ta-IN' ? "வழிமுறைகள்..." : "Instructions..."));
        speakCurrentInstruction();
    };

    // Double Tap / Hold: Activates ASR listening and routes captured voice keywords
    const handleDoubleTapOrHold = () => {
        if (isListening) {
            stopListening();
            showFeedback(language === 'ta-IN' ? "நிறுத்தப்பட்டது" : "Stopped");
        } else {
            showFeedback(language === 'ta-IN' ? "கேட்கிறது... சொல்லுங்கள்" : "Listening... Speak now");
            startListening();
        }
    };

    const handlePointerDown = (e) => {
        e.preventDefault();
        setPressActive(true);
        isLongPressRef.current = false;

        // Long Press / Hold Detection (450ms) -> Triggers ASR
        longPressTimerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            handleDoubleTapOrHold();
        }, 450);
    };

    const handlePointerUp = (e) => {
        e.preventDefault();
        setPressActive(false);

        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        // If triggered via hold, return
        if (isLongPressRef.current) return;

        const now = Date.now();
        const diff = now - lastTapTimeRef.current;

        if (diff < 320 && diff > 40) {
            // Double Tap Detected -> Triggers ASR
            if (tapTimerRef.current) {
                clearTimeout(tapTimerRef.current);
                tapTimerRef.current = null;
            }
            lastTapTimeRef.current = 0;
            handleDoubleTapOrHold();
        } else {
            // Single Tap Candidate -> Wait 260ms to distinguish double tap, then trigger TTS
            lastTapTimeRef.current = now;
            tapTimerRef.current = setTimeout(() => {
                handleSingleTap();
                lastTapTimeRef.current = 0;
                tapTimerRef.current = null;
            }, 260);
        }
    };

    const handlePointerCancel = () => {
        setPressActive(false);
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        };
    }, []);

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center select-none pointer-events-none w-full max-w-sm px-4">
            
            {/* ─── LIVE FLOATING SPEECH BOX (RULE 2) - Only active when listening, speaking, or brief feedback ─── */}
            {(isListening || isSpeaking || actionFeedback) && (
                <div className={`pointer-events-auto mb-3.5 px-6 py-3.5 rounded-2xl shadow-2xl backdrop-blur-xl transition-all duration-300 max-w-xs md:max-w-sm w-full text-center border flex flex-col items-center gap-1.5 ${
                    isListening
                        ? 'bg-[#0B132B]/95 border-red-500/60 shadow-[0_0_35px_rgba(239,68,68,0.45)]'
                        : isSpeaking
                        ? 'bg-[#061B2E]/95 border-cyan-400/60 shadow-[0_0_35px_rgba(6,182,212,0.45)]'
                        : 'bg-gray-900/95 border-yellow-500/40 text-yellow-200'
                }`}>
                    
                    {/* Line 1 (Context Badge): Current Page Context */}
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                            isListening 
                                ? 'bg-red-500/20 text-red-300 border border-red-400/40 animate-pulse'
                                : isSpeaking
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                                : 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/40'
                        }`}>
                            <span className={`w-2 h-2 rounded-full ${isListening ? 'bg-red-500 animate-ping' : isSpeaking ? 'bg-cyan-400 animate-pulse' : 'bg-yellow-400'}`}></span>
                            <span>{pageContext || (language === 'ta-IN' ? "செயலில் உள்ளது" : "Active Screen")}</span>
                        </span>
                    </div>

                    {/* Line 2 (Live Speech Output): Word-by-word real-time speech output */}
                    <div className="text-sm font-bold tracking-wide min-h-[24px] flex items-center justify-center w-full">
                        {isListening && (
                            <span className="text-white drop-shadow truncate max-w-full">
                                {transcript ? (
                                    <span className="text-emerald-300 font-extrabold text-base">"{transcript}"</span>
                                ) : (
                                    <span className="text-gray-300 italic">{language === 'ta-IN' ? "கேட்கிறது... சொல்லுங்கள்" : "Listening... Speak now"}</span>
                                )}
                            </span>
                        )}
                        {isSpeaking && (
                            <span className="text-cyan-200 font-medium truncate max-w-full">
                                📢 {actionFeedback || (t.micSpeaking || (language === 'ta-IN' ? "பேசுகிறது..." : "Speaking instructions..."))}
                            </span>
                        )}
                        {!isListening && !isSpeaking && (
                            <span className="text-amber-200 font-semibold truncate max-w-full">{actionFeedback}</span>
                        )}
                    </div>
                </div>
            )}

            {/* ─── STANDALONE FLOATING VOICE BUTTON (VOICE ALONE - NO TAB BAR) ─── */}
            <div className="relative flex items-center justify-center pointer-events-auto">
                {/* Pulsing Ripple Rings */}
                {isListening && (
                    <>
                        <div className="absolute w-20 h-20 rounded-full bg-red-500/40 animate-ping pointer-events-none"></div>
                        <div className="absolute w-24 h-24 rounded-full bg-red-600/30 animate-pulse pointer-events-none"></div>
                    </>
                )}
                {isSpeaking && (
                    <>
                        <div className="absolute w-20 h-20 rounded-full bg-cyan-400/40 animate-ping pointer-events-none"></div>
                        <div className="absolute w-24 h-24 rounded-full bg-blue-500/30 animate-pulse pointer-events-none"></div>
                    </>
                )}

                {/* Central Prominent Microphone Button (Single Tap: TTS | Double Tap/Hold: ASR) */}
                <button
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    title="1-Tap: Hear Instructions | 2-Tap or Hold: Speak"
                    className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.7)] transition-all duration-300 select-none cursor-pointer ${
                        pressActive ? 'scale-90' : 'hover:scale-105 active:scale-95'
                    } ${
                        isListening
                            ? 'bg-gradient-to-tr from-red-600 via-rose-500 to-pink-600 text-white shadow-[0_0_35px_rgba(239,68,68,0.9)] ring-4 ring-red-400/60'
                            : isSpeaking
                            ? 'bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-[0_0_35px_rgba(6,182,212,0.9)] ring-4 ring-cyan-400/60'
                            : 'bg-gradient-to-tr from-amber-400 via-amber-500 to-yellow-500 text-gray-950 shadow-[0_0_30px_rgba(245,158,11,0.6)] ring-4 ring-amber-400/40 hover:ring-amber-300'
                    }`}
                    style={{ touchAction: 'none' }}
                    aria-label="Smart Voice Microphone"
                >
                    {isListening ? (
                        <div className="flex items-center gap-1">
                            <span className="w-1.5 h-6 bg-white rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-8 bg-white rounded-full animate-bounce delay-100"></span>
                            <span className="w-1.5 h-5 bg-white rounded-full animate-bounce delay-200"></span>
                        </div>
                    ) : isSpeaking ? (
                        <span className="text-2xl animate-pulse">📢</span>
                    ) : (
                        <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
};
