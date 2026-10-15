import React, { useState, useRef, useEffect } from 'react';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { getTranslation } from '../utils/translations';
import { translateField } from '../utils/fieldTranslation';

export const SmartVoiceDock = () => {
    const {
        language,
        pageContext,
        isListening,
        isSpeaking,
        transcript,
        spokenText,
        lastPrompt,
        screenInstruction,
        lastRecognized,
        voiceFeedback,
        speakCurrentInstruction,
        startListening,
        stopListening,
        stopSpeaking
    } = useSmartVoice();

    const t = getTranslation(language);
    const [actionFeedback, setActionFeedback] = useState('');
    const [pressActive, setPressActive] = useState(false);
    const [speakGraceActive, setSpeakGraceActive] = useState(false);
    const [recognizedGraceActive, setRecognizedGraceActive] = useState(false);
    const [userDismissed, setUserDismissed] = useState(false);

    // ─── DYNAMIC DRAG & SIDE-DOCKING POPUP SYSTEM ───
    const [sidePosition, setSidePosition] = useState(() => {
        return localStorage.getItem('voicePopupSide') || 'left';
    });
    const [dragPosition, setDragPosition] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isMinimized, setIsMinimized] = useState(false);
    const popupRef = useRef(null);

    const toggleSide = () => {
        setDragPosition(null);
        setSidePosition(prev => {
            const next = prev === 'left' ? 'right' : 'left';
            localStorage.setItem('voicePopupSide', next);
            return next;
        });
    };

    const handleDragStart = (e) => {
        if (!popupRef.current) return;
        const rect = popupRef.current.getBoundingClientRect();
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    };

    const handleTouchStart = (e) => {
        if (!popupRef.current || !e.touches || e.touches.length === 0) return;
        const touch = e.touches[0];
        const rect = popupRef.current.getBoundingClientRect();
        setIsDragging(true);
        setDragOffset({
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        });
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            const w = popupRef.current?.offsetWidth || 360;
            const h = popupRef.current?.offsetHeight || 160;
            const maxX = Math.max(10, window.innerWidth - w - 12);
            const maxY = Math.max(10, window.innerHeight - h - 12);
            const newX = Math.max(10, Math.min(e.clientX - dragOffset.x, maxX));
            const newY = Math.max(10, Math.min(e.clientY - dragOffset.y, maxY));
            setDragPosition({ x: newX, y: newY });
        };

        const handleTouchMove = (e) => {
            if (!e.touches || e.touches.length === 0) return;
            const touch = e.touches[0];
            const w = popupRef.current?.offsetWidth || 360;
            const h = popupRef.current?.offsetHeight || 160;
            const maxX = Math.max(10, window.innerWidth - w - 12);
            const maxY = Math.max(10, window.innerHeight - h - 12);
            const newX = Math.max(10, Math.min(touch.clientX - dragOffset.x, maxX));
            const newY = Math.max(10, Math.min(touch.clientY - dragOffset.y, maxY));
            setDragPosition({ x: newX, y: newY });
        };

        const handleDragEnd = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleDragEnd);
        window.addEventListener('touchmove', handleTouchMove);
        window.addEventListener('touchend', handleDragEnd);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleDragEnd);
        };
    }, [isDragging, dragOffset]);

    const tapTimerRef = useRef(null);
    const tapCountRef = useRef(0);
    const holdTimerRef = useRef(null);
    const isHoldTriggeredRef = useRef(false);
    const speakGraceTimerRef = useRef(null);
    const recognizedTimerRef = useRef(null);
    const lastListenTriggerTimeRef = useRef(0);

    const showFeedback = (msg) => {
        setActionFeedback(msg);
        setTimeout(() => setActionFeedback(''), 2500);
    };

    // Keep speech bubble visible while speaking and for 4.5s grace period after speaking finishes
    useEffect(() => {
        if (isSpeaking) {
            setUserDismissed(false);
            setSpeakGraceActive(true);
            if (speakGraceTimerRef.current) clearTimeout(speakGraceTimerRef.current);
        } else if (spokenText && !isListening) {
            if (speakGraceTimerRef.current) clearTimeout(speakGraceTimerRef.current);
            speakGraceTimerRef.current = setTimeout(() => {
                setSpeakGraceActive(false);
            }, 4500);
        }
        return () => {
            if (speakGraceTimerRef.current) clearTimeout(speakGraceTimerRef.current);
        };
    }, [isSpeaking, spokenText, isListening]);

    // Keep recognized speech visible for 3s grace period
    useEffect(() => {
        if (lastRecognized && !isListening) {
            setRecognizedGraceActive(true);
            if (recognizedTimerRef.current) clearTimeout(recognizedTimerRef.current);
            recognizedTimerRef.current = setTimeout(() => {
                setRecognizedGraceActive(false);
            }, 3000);
        }
        return () => {
            if (recognizedTimerRef.current) clearTimeout(recognizedTimerRef.current);
        };
    }, [lastRecognized, isListening]);

    // Reset dismiss when user starts listening
    useEffect(() => {
        if (isListening) {
            setUserDismissed(false);
            setSpeakGraceActive(false);
        }
    }, [isListening]);

    // Cleanup timers
    useEffect(() => {
        return () => {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
            if (speakGraceTimerRef.current) clearTimeout(speakGraceTimerRef.current);
            if (recognizedTimerRef.current) clearTimeout(recognizedTimerRef.current);
        };
    }, []);

    // ─── ACTION HANDLERS ───
    const triggerListening = () => {
        const now = Date.now();
        // Prevent accidental rapid re-triggering within 380ms
        if (now - lastListenTriggerTimeRef.current < 380) {
            return;
        }
        lastListenTriggerTimeRef.current = now;

        if (isListening) {
            stopListening();
            showFeedback(language === 'ta-IN' ? "நிறுத்தப்பட்டது" : "Stopped listening");
        } else {
            if (isSpeaking) {
                stopSpeaking();
            }
            setSpeakGraceActive(false);
            startListening();
        }
    };

    const triggerSpeaking = () => {
        if (isSpeaking) {
            stopSpeaking();
            setSpeakGraceActive(false);
            showFeedback(language === 'ta-IN' ? "பேசுவது நிறுத்தப்பட்டது" : "Speech paused");
        } else if (isListening) {
            stopListening();
            showFeedback(language === 'ta-IN' ? "நிறுத்தப்பட்டது" : "Stopped");
        } else {
            speakCurrentInstruction();
        }
    };

    // Pointer events for press-and-hold (420ms) to listen
    const handlePointerDown = () => {
        setPressActive(true);
        isHoldTriggeredRef.current = false;

        holdTimerRef.current = setTimeout(() => {
            isHoldTriggeredRef.current = true;
            triggerListening();
        }, 420);
    };

    const handlePointerUp = () => {
        setPressActive(false);
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    };

    const handlePointerCancel = () => {
        setPressActive(false);
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    };

    // Unified Click & Double-Tap Handling (handles mouse double-click and touchscreen double-tap)
    const handleClick = (e) => {
        e.stopPropagation();

        if (isHoldTriggeredRef.current) {
            isHoldTriggeredRef.current = false;
            return;
        }

        // Single click while listening stops listening immediately
        if (isListening) {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
            tapCountRef.current = 0;
            stopListening();
            showFeedback(language === 'ta-IN' ? "நிறுத்தப்பட்டது" : "Stopped");
            return;
        }

        tapCountRef.current += 1;

        if (tapCountRef.current === 2) {
            // DOUBLE TAP / DOUBLE CLICK -> LISTEN IMMEDIATELY
            if (tapTimerRef.current) {
                clearTimeout(tapTimerRef.current);
                tapTimerRef.current = null;
            }
            tapCountRef.current = 0;
            triggerListening();
        } else if (tapCountRef.current === 1) {
            // SINGLE TAP CANDIDATE -> Wait 300ms for possible second tap
            tapTimerRef.current = setTimeout(() => {
                tapCountRef.current = 0;
                tapTimerRef.current = null;
                triggerSpeaking();
            }, 300);
        }
    };

    // Text to display for speaking mode
    const rawSpokenText = spokenText || lastPrompt || screenInstruction;
    const localizedSpokenText = rawSpokenText ? translateField(rawSpokenText, language) : '';

    // Decide if popup card should be shown
    const isShowingSpeakingPopup = !userDismissed && (isSpeaking || speakGraceActive) && !isListening && !!localizedSpokenText;
    const isShowingListeningPopup = isListening;
    const isShowingRecognizedPopup = !userDismissed && recognizedGraceActive && !isListening && !isSpeaking && !!lastRecognized;
    const isShowingFeedbackPopup = !!(voiceFeedback || actionFeedback) && !isListening && !isSpeaking;

    const hasActivePopup = isShowingSpeakingPopup || isShowingListeningPopup || isShowingRecognizedPopup || isShowingFeedbackPopup;

    return (
        <>
            {/* ─── 1. DYNAMIC SIDE-DOCKING & DRAGGABLE SPEECH POPUP (DOES NOT COVER DETAILS!) ─── */}
            {hasActivePopup && (
                <div
                    ref={popupRef}
                    style={dragPosition ? {
                        position: 'fixed',
                        left: `${dragPosition.x}px`,
                        top: `${dragPosition.y}px`,
                        zIndex: 60
                    } : undefined}
                    className={`z-50 select-none ${
                        dragPosition
                            ? ''
                            : sidePosition === 'right'
                            ? 'fixed bottom-24 right-4 sm:right-6 w-[360px] sm:w-[420px] max-w-[92vw]'
                            : 'fixed bottom-24 left-4 sm:left-6 w-[360px] sm:w-[420px] max-w-[92vw]'
                    } animate-in fade-in zoom-in-95 duration-200 transition-all`}
                >
                    {/* Compact Minimized View */}
                    {isMinimized ? (
                        <div 
                            onClick={() => setIsMinimized(false)}
                            className="flex items-center justify-between p-3 px-4 rounded-2xl bg-gradient-to-r from-[#091E3A]/98 to-[#051329]/98 border border-cyan-400/70 shadow-[0_10px_35px_rgba(6,182,212,0.4)] backdrop-blur-2xl cursor-pointer hover:border-cyan-300 transition-all group"
                        >
                            <div className="flex items-center gap-2 overflow-hidden mr-2">
                                <span className="text-base animate-pulse">📢</span>
                                <span className="text-xs text-cyan-200 font-bold truncate max-w-[200px] sm:max-w-[260px]">
                                    {localizedSpokenText || lastRecognized || (language === 'ta-IN' ? "உதவிக்குரல்" : "Voice Assistant")}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] text-cyan-300 font-bold bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-500/40 group-hover:bg-cyan-900">
                                    {language === 'ta-IN' ? "விரிவாக்கு ▲" : "Expand ▲"}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setUserDismissed(true);
                                        setSpeakGraceActive(false);
                                    }}
                                    className="text-gray-400 hover:text-white text-xs p-1 rounded"
                                    title="Dismiss"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* A. SPEAKING STATE POPUP (When site is speaking TTS) */}
                            {isShowingSpeakingPopup && (
                                <div className="relative w-full rounded-2xl p-4 sm:p-5 bg-gradient-to-b from-[#091E3A]/98 to-[#051329]/98 border border-cyan-400/60 shadow-[0_12px_45px_rgba(6,182,212,0.45)] backdrop-blur-2xl flex flex-col gap-2.5 text-center">
                                    {/* Header row with drag handle and dynamic controls */}
                                    <div 
                                        onMouseDown={handleDragStart}
                                        onTouchStart={handleTouchStart}
                                        className="flex items-center justify-between w-full border-b border-cyan-500/20 pb-2 cursor-grab active:cursor-grabbing select-none"
                                        title={language === 'ta-IN' ? "இழுத்து எங்கு வேண்டுமானாலும் நகர்த்தலாம்" : "Drag to move anywhere"}
                                    >
                                        <div className="flex items-center gap-2">
                                            {/* Drag Grip Handle */}
                                            <span className="text-cyan-400/60 text-xs hover:text-cyan-300 px-0.5" title="Drag handle">
                                                ⋮⋮
                                            </span>
                                            {/* Animated sound wave bars */}
                                            <div className="flex items-center gap-1 h-5 px-1 bg-cyan-950/60 rounded-md border border-cyan-500/30">
                                                <span className="w-1 bg-cyan-400 rounded-full voice-wave-1"></span>
                                                <span className="w-1 bg-cyan-300 rounded-full voice-wave-2"></span>
                                                <span className="w-1 bg-cyan-400 rounded-full voice-wave-3"></span>
                                                <span className="w-1 bg-cyan-300 rounded-full voice-wave-4"></span>
                                                <span className="w-1 bg-cyan-400 rounded-full voice-wave-5"></span>
                                            </div>
                                            <span className="text-cyan-300 text-xs sm:text-sm font-bold flex items-center gap-1">
                                                <span className="text-base animate-pulse">📢</span>
                                                <span>{language === 'ta-IN' ? "உதவிக்குரல் பேசுகிறது" : "Assistant Speaking"}</span>
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                                            {/* Status Pill */}
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                isSpeaking 
                                                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 animate-pulse' 
                                                    : 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'}`}></span>
                                                <span>{isSpeaking ? (language === 'ta-IN' ? "ஒலிக்கிறது..." : "Speaking...") : (language === 'ta-IN' ? "முடிந்தது" : "Finished")}</span>
                                            </span>

                                            {/* Side Switch Button */}
                                            <button
                                                onClick={toggleSide}
                                                className="text-[11px] text-cyan-300 bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-500/40 px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer"
                                                title={sidePosition === 'left' ? "Move to Right Side (⇄)" : "Move to Left Side (⇄)"}
                                            >
                                                ⇄ {sidePosition === 'left' ? "Right" : "Left"}
                                            </button>

                                            {/* Minimize Toggle Button */}
                                            <button
                                                onClick={() => setIsMinimized(true)}
                                                className="text-gray-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                                                title="Minimize"
                                            >
                                                ⎯
                                            </button>

                                            {/* Close / Dismiss */}
                                            <button 
                                                onClick={() => { setUserDismissed(true); setSpeakGraceActive(false); }}
                                                className="text-gray-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                                                title="Close"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    {/* Spoken Text in Preferred Language */}
                                    <div className="py-1">
                                        <p className="text-cyan-100 font-semibold text-sm sm:text-base leading-relaxed text-center drop-shadow-md">
                                            "{localizedSpokenText}"
                                        </p>
                                    </div>

                                    {/* Bottom instruction hint */}
                                    <div className="flex items-center justify-between text-[11px] text-cyan-300/80 pt-1 border-t border-cyan-500/15">
                                        <span className="flex items-center gap-1">
                                            <span>💡</span>
                                            <span>{language === 'ta-IN' ? "பேச மைக்கை 2-முறை தட்டவும்" : "Double-tap mic to speak"}</span>
                                        </span>
                                        <span>{language === 'ta-IN' ? "1 முறை தட்டினால் நிற்கும்" : "Tap once to pause"}</span>
                                    </div>
                                </div>
                            )}

                            {/* B. LISTENING STATE POPUP (When user double taps and speaks) */}
                            {isShowingListeningPopup && (
                                <div className="relative w-full rounded-2xl p-4 sm:p-5 bg-gradient-to-b from-[#1C0D1B]/98 to-[#100612]/98 border border-rose-500/70 shadow-[0_12px_45px_rgba(244,63,94,0.5)] backdrop-blur-2xl flex flex-col gap-2.5 text-center">
                                    {/* Header row with drag handle and dynamic controls */}
                                    <div 
                                        onMouseDown={handleDragStart}
                                        onTouchStart={handleTouchStart}
                                        className="flex items-center justify-between w-full border-b border-rose-500/25 pb-2 cursor-grab active:cursor-grabbing select-none"
                                        title={language === 'ta-IN' ? "இழுத்து எங்கு வேண்டுமானாலும் நகர்த்தலாம்" : "Drag to move anywhere"}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-rose-400/60 text-xs hover:text-rose-300 px-0.5">⋮⋮</span>
                                            {/* Animated rose sound wave bars */}
                                            <div className="flex items-center gap-1 h-5 px-1 bg-rose-950/60 rounded-md border border-rose-500/40">
                                                <span className="w-1 bg-rose-500 rounded-full voice-wave-1"></span>
                                                <span className="w-1 bg-pink-400 rounded-full voice-wave-2"></span>
                                                <span className="w-1 bg-rose-500 rounded-full voice-wave-3"></span>
                                                <span className="w-1 bg-pink-400 rounded-full voice-wave-4"></span>
                                                <span className="w-1 bg-rose-500 rounded-full voice-wave-5"></span>
                                            </div>
                                            <span className="text-rose-300 text-xs sm:text-sm font-black flex items-center gap-1">
                                                <span>🎙️</span>
                                                <span>{language === 'ta-IN' ? "கேட்கிறது... சொல்லுங்கள்" : "Listening... Speak now"}</span>
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/25 text-rose-200 border border-rose-400/50 animate-pulse">
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                                                <span>{language === 'ta-IN' ? "நேரலை" : "LIVE"}</span>
                                            </span>

                                            {/* Side Switch Button */}
                                            <button
                                                onClick={toggleSide}
                                                className="text-[11px] text-rose-300 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer"
                                                title={sidePosition === 'left' ? "Move to Right Side (⇄)" : "Move to Left Side (⇄)"}
                                            >
                                                ⇄ {sidePosition === 'left' ? "Right" : "Left"}
                                            </button>

                                            <button 
                                                onClick={stopListening}
                                                className="text-xs bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 px-2 py-0.5 rounded-full font-bold transition-all border border-rose-400/40 cursor-pointer"
                                            >
                                                ⏹️ {language === 'ta-IN' ? "முடி" : "Stop"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Live transcription display */}
                                    <div className="py-1 min-h-[48px] flex items-center justify-center">
                                        {transcript ? (
                                            <div className="w-full bg-black/40 border border-emerald-500/50 rounded-xl p-3 shadow-inner">
                                                <span className="text-emerald-300 font-extrabold text-base sm:text-lg tracking-wide drop-shadow-[0_0_15px_rgba(16,185,129,0.7)]">
                                                    “{transcript}”
                                                </span>
                                                <span className="inline-block w-1.5 h-4 ml-1.5 bg-emerald-400 animate-pulse align-middle rounded-sm"></span>
                                            </div>
                                        ) : (
                                            <p className="text-gray-300 italic text-sm sm:text-base animate-pulse">
                                                {language === 'ta-IN' 
                                                    ? "இப்போது பேசுங்கள்... நாங்கள் கேட்கிறோம் (எ.கா: பிக்-அப், பேக், விற்பனை)" 
                                                    : "Speak into your mic... (e.g. Schedule Pickup, Pack, New Sale)"}
                                            </p>
                                        )}
                                    </div>

                                    {/* Live hints */}
                                    <div className="flex items-center justify-between text-[11px] text-rose-300/80 pt-1 border-t border-rose-500/15">
                                        <span className="flex items-center gap-1">
                                            <span>✨</span>
                                            <span>{language === 'ta-IN' ? "பேசி முடித்ததும் தானாக ஏற்கும்" : "Auto-commits when you pause"}</span>
                                        </span>
                                        <span>{pageContext || (language === 'ta-IN' ? "செயலில் உள்ளது" : "Active")}</span>
                                    </div>
                                </div>
                            )}

                            {/* C. RECOGNIZED SUCCESS POPUP (After speech finished) */}
                            {isShowingRecognizedPopup && (
                                <div className="relative w-full rounded-2xl p-3.5 sm:p-4 bg-gradient-to-b from-[#07241A]/98 to-[#03140E]/98 border border-emerald-500/70 shadow-[0_12px_40px_rgba(16,185,129,0.45)] backdrop-blur-2xl flex flex-col gap-2 text-center">
                                    <div 
                                        onMouseDown={handleDragStart}
                                        onTouchStart={handleTouchStart}
                                        className="flex items-center justify-between w-full border-b border-emerald-500/20 pb-1.5 cursor-grab select-none"
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-emerald-400/60 text-xs">⋮⋮</span>
                                            <span className="text-emerald-300 text-xs sm:text-sm font-bold flex items-center gap-1">
                                                <span>✓</span>
                                                <span>{language === 'ta-IN' ? "குரல் புரிந்து கொள்ளப்பட்டது" : "Speech Understood"}</span>
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={toggleSide}
                                                className="text-[10px] text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded cursor-pointer"
                                            >
                                                ⇄ {sidePosition === 'left' ? "Right" : "Left"}
                                            </button>
                                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                                {language === 'ta-IN' ? "செயல்படுகிறது..." : "Processing..."}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="py-1">
                                        <p className="text-emerald-200 font-extrabold text-base sm:text-lg">
                                            “{lastRecognized}”
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* D. FEEDBACK / ERROR POPUP */}
                            {isShowingFeedbackPopup && (
                                <div className="relative w-full rounded-2xl p-3 bg-gradient-to-b from-gray-900/98 to-gray-950/98 border border-amber-500/50 shadow-[0_10px_35px_rgba(245,158,11,0.35)] backdrop-blur-2xl text-center">
                                    <div className="flex items-center justify-between pb-1 mb-1 border-b border-amber-500/20">
                                        <span className="text-amber-400/60 text-xs cursor-grab" onMouseDown={handleDragStart}>⋮⋮</span>
                                        <button onClick={toggleSide} className="text-[10px] text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded cursor-pointer">
                                            ⇄ {sidePosition === 'left' ? "Right" : "Left"}
                                        </button>
                                    </div>
                                    <p className="text-amber-200 font-bold text-xs sm:text-sm">
                                        🔔 {voiceFeedback || actionFeedback}
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ─── 2. STANDALONE PROMINENT BOTTOM MICROPHONE BUTTON (CLEAN & CENTERED) ─── */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center select-none pointer-events-none">
                
                {/* Idle Guidance Pill */}
                {(!hasActivePopup || isMinimized) && (
                    <div className="pointer-events-auto mb-2.5 px-4 py-1.5 rounded-full bg-slate-900/95 border border-amber-500/40 text-amber-300 text-xs sm:text-[13px] font-bold shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md flex items-center gap-2 transition-all hover:border-amber-400">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                        <span>
                            {language === 'ta-IN' 
                                ? "1 முறை தட்டவும்: கேட்க 🔊 | 2 முறை தட்டவும்: பேச 🎙️" 
                                : "1 Tap: Hear 🔊 | 2 Taps: Speak 🎙️"}
                        </span>
                    </div>
                )}

            {/* ─── 3. STANDALONE PROMINENT BOTTOM MICROPHONE BUTTON ─── */}
            <div className="relative flex items-center justify-center pointer-events-auto">
                {/* Animated Pulsing Rings */}
                {isListening && (
                    <>
                        <div className="absolute w-24 h-24 rounded-full bg-rose-500/35 animate-ping pointer-events-none"></div>
                        <div className="absolute w-28 h-28 rounded-full bg-red-600/25 animate-pulse pointer-events-none"></div>
                    </>
                )}
                {isSpeaking && (
                    <>
                        <div className="absolute w-24 h-24 rounded-full bg-cyan-400/35 animate-ping pointer-events-none"></div>
                        <div className="absolute w-28 h-28 rounded-full bg-blue-500/25 animate-pulse pointer-events-none"></div>
                    </>
                )}

                {/* Central Microphone Button */}
                <button
                    onClick={handleClick}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    title={language === 'ta-IN' ? "1 முறை: கேட்க | 2 முறை: பேச" : "1-Tap: Hear | 2-Taps: Speak"}
                    className={`relative z-10 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-[0_10px_35px_rgba(0,0,0,0.8)] transition-all duration-300 select-none cursor-pointer ${
                        pressActive ? 'scale-90' : 'hover:scale-105 active:scale-95'
                    } ${
                        isListening
                            ? 'bg-gradient-to-tr from-red-600 via-rose-500 to-pink-600 text-white shadow-[0_0_40px_rgba(239,68,68,0.95)] ring-4 ring-rose-400/70'
                            : isSpeaking
                            ? 'bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-[0_0_40px_rgba(6,182,212,0.95)] ring-4 ring-cyan-400/70'
                            : 'bg-gradient-to-tr from-amber-400 via-amber-500 to-yellow-500 text-gray-950 shadow-[0_0_35px_rgba(245,158,11,0.7)] ring-4 ring-amber-400/50 hover:ring-amber-300'
                    }`}
                    style={{ touchAction: 'manipulation' }}
                    aria-label="Smart Voice Microphone"
                >
                    {isListening ? (
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 sm:w-2 h-7 bg-white rounded-full animate-bounce"></span>
                            <span className="w-1.5 sm:w-2 h-9 bg-white rounded-full animate-bounce delay-100"></span>
                            <span className="w-1.5 sm:w-2 h-6 bg-white rounded-full animate-bounce delay-200"></span>
                        </div>
                    ) : isSpeaking ? (
                        <span className="text-3xl sm:text-4xl animate-pulse">📢</span>
                    ) : (
                        <svg className="w-8 h-8 sm:w-10 sm:h-10 fill-current" viewBox="0 0 24 24">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                    )}
                </button>
            </div>
        </div>
        </>
    );
};
