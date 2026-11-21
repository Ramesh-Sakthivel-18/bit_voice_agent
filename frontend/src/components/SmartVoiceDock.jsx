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
    const [isMinimized, setIsMinimized] = useState(false);

    // ─── DYNAMIC DRAG & SIDE-DOCKING SYSTEM ───
    const [sidePosition, setSidePosition] = useState(() => {
        return localStorage.getItem('voicePopupSide') || 'left';
    });
    const [dragPosition, setDragPosition] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const popupRef = useRef(null);

    const toggleSide = (e) => {
        if (e) e.stopPropagation();
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
            const w = popupRef.current?.offsetWidth || 320;
            const h = popupRef.current?.offsetHeight || 120;
            const maxX = Math.max(10, window.innerWidth - w - 10);
            const maxY = Math.max(10, window.innerHeight - h - 10);
            const newX = Math.max(10, Math.min(e.clientX - dragOffset.x, maxX));
            const newY = Math.max(10, Math.min(e.clientY - dragOffset.y, maxY));
            setDragPosition({ x: newX, y: newY });
        };

        const handleTouchMove = (e) => {
            if (!e.touches || e.touches.length === 0) return;
            const touch = e.touches[0];
            const w = popupRef.current?.offsetWidth || 320;
            const h = popupRef.current?.offsetHeight || 120;
            const maxX = Math.max(10, window.innerWidth - w - 10);
            const maxY = Math.max(10, window.innerHeight - h - 10);
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
        if (now - lastListenTriggerTimeRef.current < 240) return;
        lastListenTriggerTimeRef.current = now;

        if (isListening) {
            stopListening();
            showFeedback(language === 'ta-IN' ? "நிறுத்தப்பட்டது" : "Stopped listening");
        } else {
            if (isSpeaking) stopSpeaking();
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

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        if (tapTimerRef.current) {
            clearTimeout(tapTimerRef.current);
            tapTimerRef.current = null;
        }
        tapCountRef.current = 0;
        triggerListening();
    };

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

    const handleClick = (e) => {
        e.stopPropagation();
        if (isHoldTriggeredRef.current) {
            isHoldTriggeredRef.current = false;
            return;
        }
        if (isListening) {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
            tapCountRef.current = 0;
            stopListening();
            showFeedback(language === 'ta-IN' ? "நிறுத்தப்பட்டது" : "Stopped");
            return;
        }
        if (isSpeaking) {
            stopSpeaking();
            setSpeakGraceActive(false);
        }
        tapCountRef.current += 1;
        if (tapCountRef.current >= 2) {
            if (tapTimerRef.current) {
                clearTimeout(tapTimerRef.current);
                tapTimerRef.current = null;
            }
            tapCountRef.current = 0;
            triggerListening();
        } else if (tapCountRef.current === 1) {
            tapTimerRef.current = setTimeout(() => {
                tapCountRef.current = 0;
                tapTimerRef.current = null;
                triggerSpeaking();
            }, 360);
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
            {/* ─── 1. COMPACT, DYNAMIC & DOCKABLE VOICE POPUP (NEVER HIDES DETAILS) ─── */}
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
                            ? 'fixed bottom-24 right-3 sm:right-6 w-[92vw] sm:w-auto sm:min-w-[280px] sm:max-w-[360px]'
                            : 'fixed bottom-24 left-3 sm:left-6 w-[92vw] sm:w-auto sm:min-w-[280px] sm:max-w-[360px]'
                    } animate-in fade-in zoom-in-95 duration-200 transition-all`}
                >
                    {/* Compact Minimized View */}
                    {isMinimized ? (
                        <div 
                            onClick={() => setIsMinimized(false)}
                            className="flex items-center justify-between p-2 px-3 rounded-full bg-white/98 border border-slate-200 shadow-lg backdrop-blur-xl cursor-pointer hover:border-blue-400 transition-all group text-slate-900"
                        >
                            <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                <span className="text-sm animate-pulse">📢</span>
                                <span className="text-xs text-slate-800 font-bold truncate max-w-[150px] sm:max-w-[200px]">
                                    {localizedSpokenText || lastRecognized || (language === 'ta-IN' ? "உதவிக்குரல்" : "Voice Assistant")}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 group-hover:bg-blue-100">
                                    ▲
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setUserDismissed(true);
                                        setSpeakGraceActive(false);
                                    }}
                                    className="text-slate-400 hover:text-slate-700 text-xs p-0.5 rounded cursor-pointer"
                                    title="Dismiss"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="relative w-full rounded-2xl p-3 sm:p-3.5 bg-white/98 border border-slate-200 shadow-xl backdrop-blur-xl flex flex-col gap-1.5 text-slate-900 transition-all">
                            {/* A. SPEAKING STATE */}
                            {isShowingSpeakingPopup && (
                                <>
                                    <div 
                                        onMouseDown={handleDragStart}
                                        onTouchStart={handleTouchStart}
                                        className="flex items-center justify-between w-full border-b border-slate-100 pb-1.5 cursor-grab active:cursor-grabbing select-none"
                                        title={language === 'ta-IN' ? "இழுத்து நகர்த்தலாம்" : "Drag to move"}
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-slate-400 text-xs hover:text-slate-600 px-0.5 shrink-0" title="Drag handle">⋮⋮</span>
                                            <div className="flex items-center gap-0.5 h-4 px-1 bg-blue-50 rounded border border-blue-200 shrink-0">
                                                <span className="w-0.5 bg-blue-600 rounded-full voice-wave-1"></span>
                                                <span className="w-0.5 bg-blue-500 rounded-full voice-wave-2"></span>
                                                <span className="w-0.5 bg-blue-600 rounded-full voice-wave-3"></span>
                                            </div>
                                            <span className="text-blue-900 text-xs font-bold truncate">
                                                {language === 'ta-IN' ? "உதவிக்குரல்" : "Assistant"}
                                            </span>
                                            <span className={`inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase shrink-0 ${
                                                isSpeaking 
                                                    ? 'bg-blue-50 text-blue-800 border border-blue-200 animate-pulse' 
                                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                            }`}>
                                                {isSpeaking ? (language === 'ta-IN' ? "ஒலிக்கிறது" : "Speaking") : (language === 'ta-IN' ? "முடிந்தது" : "Done")}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={toggleSide}
                                                className="text-[10px] text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer"
                                                title={sidePosition === 'left' ? "Move to Right (⇄)" : "Move to Left (⇄)"}
                                            >
                                                ⇄ {sidePosition === 'left' ? "Right" : "Left"}
                                            </button>
                                            <button
                                                onClick={() => setIsMinimized(true)}
                                                className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold cursor-pointer border border-slate-200"
                                                title="Minimize"
                                                aria-label="Minimize"
                                            >
                                                ⎯
                                            </button>
                                            <button 
                                                onClick={() => { setUserDismissed(true); setSpeakGraceActive(false); }}
                                                className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-500 text-[10px] font-bold cursor-pointer border border-slate-200"
                                                title="Close"
                                                aria-label="Close"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    {/* Spoken Text (compact scrollable area if long) */}
                                    <div className="py-0.5 max-h-[75px] overflow-y-auto">
                                        <p className="text-slate-900 font-semibold text-xs sm:text-sm leading-snug">
                                            "{localizedSpokenText}"
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                                        <span>💡 {language === 'ta-IN' ? "மைக்கை 2-முறை தட்டவும்" : "Double-tap mic to speak"}</span>
                                        <span>{language === 'ta-IN' ? "1 முறை தட்டினால் நிற்கும்" : "Tap once to pause"}</span>
                                    </div>
                                </>
                            )}

                            {/* B. LISTENING STATE */}
                            {isShowingListeningPopup && (
                                <>
                                    <div 
                                        onMouseDown={handleDragStart}
                                        onTouchStart={handleTouchStart}
                                        className="flex items-center justify-between w-full border-b border-rose-100 pb-1.5 cursor-grab active:cursor-grabbing select-none"
                                        title={language === 'ta-IN' ? "இழுத்து நகர்த்தலாம்" : "Drag to move"}
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-slate-400 text-xs hover:text-slate-600 px-0.5 shrink-0">⋮⋮</span>
                                            <div className="flex items-center gap-0.5 h-4 px-1 bg-rose-50 rounded border border-rose-200 shrink-0">
                                                <span className="w-0.5 bg-rose-500 rounded-full voice-wave-1"></span>
                                                <span className="w-0.5 bg-pink-400 rounded-full voice-wave-2"></span>
                                                <span className="w-0.5 bg-rose-500 rounded-full voice-wave-3"></span>
                                            </div>
                                            <span className="text-rose-700 text-xs font-black truncate">
                                                🎙️ {language === 'ta-IN' ? "கேட்கிறது..." : "Listening..."}
                                            </span>
                                            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-rose-50 text-rose-800 border border-rose-200 animate-pulse shrink-0">
                                                LIVE
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={toggleSide}
                                                className="text-[10px] text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer"
                                                title={sidePosition === 'left' ? "Move to Right (⇄)" : "Move to Left (⇄)"}
                                            >
                                                ⇄ {sidePosition === 'left' ? "Right" : "Left"}
                                            </button>
                                            <button 
                                                onClick={stopListening}
                                                className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold border border-rose-200 cursor-pointer"
                                            >
                                                ⏹ {language === 'ta-IN' ? "முடி" : "Stop"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Live transcription */}
                                    <div className="py-1 min-h-[36px] max-h-[75px] overflow-y-auto flex items-center">
                                        {transcript ? (
                                            <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2">
                                                <span className="text-slate-900 font-bold text-xs sm:text-sm">
                                                    “{transcript}”
                                                </span>
                                                <span className="inline-block w-1 h-3 ml-1 bg-blue-600 animate-pulse rounded-sm"></span>
                                            </div>
                                        ) : (
                                            <p className="text-slate-500 italic text-xs animate-pulse">
                                                {language === 'ta-IN' 
                                                    ? "இப்போது பேசுங்கள்... நாங்கள் கேட்கிறோம்" 
                                                    : "Speak into your mic..."}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                                        <span>✨ {language === 'ta-IN' ? "பேசி முடித்ததும் தானாக ஏற்கும்" : "Auto-commits on pause"}</span>
                                        <span>{pageContext || (language === 'ta-IN' ? "செயலில்" : "Active")}</span>
                                    </div>
                                </>
                            )}

                            {/* C. RECOGNIZED SUCCESS */}
                            {isShowingRecognizedPopup && (
                                <>
                                    <div 
                                        onMouseDown={handleDragStart}
                                        onTouchStart={handleTouchStart}
                                        className="flex items-center justify-between w-full border-b border-emerald-100 pb-1 cursor-grab select-none"
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-slate-400 text-xs">⋮⋮</span>
                                            <span className="text-emerald-800 text-xs font-bold flex items-center gap-1">
                                                <span>✓</span>
                                                <span>{language === 'ta-IN' ? "புரிந்து கொள்ளப்பட்டது" : "Understood"}</span>
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={toggleSide}
                                                className="text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded cursor-pointer"
                                            >
                                                ⇄ {sidePosition === 'left' ? "Right" : "Left"}
                                            </button>
                                            <button 
                                                onClick={() => { setUserDismissed(true); setRecognizedGraceActive(false); }}
                                                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-slate-900 font-bold text-xs sm:text-sm py-1">
                                        “{lastRecognized}”
                                    </p>
                                </>
                            )}

                            {/* D. FEEDBACK / ERROR */}
                            {isShowingFeedbackPopup && (
                                <>
                                    <div className="flex items-center justify-between pb-1 border-b border-amber-100">
                                        <span className="text-slate-400 text-xs cursor-grab" onMouseDown={handleDragStart} onTouchStart={handleTouchStart}>⋮⋮</span>
                                        <button onClick={toggleSide} className="text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer border border-slate-200">
                                            ⇄ {sidePosition === 'left' ? "Right" : "Left"}
                                        </button>
                                    </div>
                                    <p className="text-amber-800 font-bold text-xs sm:text-sm py-1">
                                        🔔 {voiceFeedback || actionFeedback}
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ─── 2. STANDALONE PROMINENT BOTTOM MICROPHONE BUTTON (CLEAN & CENTERED) ─── */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none pointer-events-none">
                
                {/* Idle Guidance Pill */}
                {(!hasActivePopup || isMinimized) && (
                    <div className="pointer-events-auto mb-2.5 px-4 py-1.5 rounded-full bg-white/95 border border-slate-200 text-slate-800 text-xs sm:text-[13px] font-bold shadow-md backdrop-blur-md flex items-center gap-2 transition-all hover:border-slate-300">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        <span>
                            {language === 'ta-IN' 
                                ? "1 முறை தட்டவும்: கேட்க 🔊 | 2 முறை தட்டவும்: பேச 🎙️" 
                                : "1 Tap: Hear 🔊 | 2 Taps: Speak 🎙️"}
                        </span>
                    </div>
                )}

                {/* ─── Central Microphone Button ─── */}
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

                    {/* Microphone Button */}
                    <button
                        onClick={handleClick}
                        onDoubleClick={handleDoubleClick}
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
