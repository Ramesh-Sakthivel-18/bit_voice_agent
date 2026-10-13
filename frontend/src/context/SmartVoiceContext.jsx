import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { getTranslation } from '../utils/translations';
import {
    matchesAnyKeyword,
    normalizeText,
    similarityRatio,
    isNewSaleIntent,
    isMyProductsIntent,
    isAcceptOrderIntent,
    isInterestIntent,
    isExpressInterestIntent,
    isSearchIntent,
    isPaymentIntent,
    isHomeIntent,
    isLogoutIntent,
    isTakePhotoIntent
} from '../utils/voiceMatcher';

const SmartVoiceContext = createContext(null);

export const SmartVoiceProvider = ({ children, language = 'ta-IN' }) => {
    const [pageContext, setPageContext] = useState('');
    const [screenInstruction, setScreenInstructionState] = useState('');
    const [guidePrompt, setGuidePromptState] = useState('');
    const [lastPrompt, setLastPromptState] = useState('');
    const [spokenText, setSpokenText] = useState('');
    const [lastRecognized, setLastRecognized] = useState('');
    const [voiceFeedback, setVoiceFeedback] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');

    const voiceHandlerRef = useRef(null);
    const recognitionRef = useRef(null);
    const isRecognizingRef = useRef(false);
    const silenceTimeoutRef = useRef(null);
    const utteranceRef = useRef(null);
    const lastProcessedRef = useRef('');

    // Cancel speech helper
    const stopSpeaking = useCallback(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
    }, []);

    // Speak helper using Web Speech Synthesis
    const speak = useCallback((text, langCode = language) => {
        if (!text || !('speechSynthesis' in window)) return;

        // Cancel previous speech safely
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel();

        // Safely abort active recognition so microphone doesn't pick up assistant's voice
        if (recognitionRef.current && isRecognizingRef.current) {
            try { recognitionRef.current.abort(); } catch (e) {}
            isRecognizingRef.current = false;
            setIsListening(false);
        }

        setSpokenText(text);
        setLastPromptState(text);
        setIsSpeaking(true);

        // Chrome bugfix: dispatch speech synthesis slightly after cancel() to avoid dropped utterance
        setTimeout(() => {
            try {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = langCode || language || 'ta-IN';
                utterance.volume = 0.85;
                utterance.rate = 0.95;

                utterance.onend = () => {
                    setIsSpeaking(false);
                };
                utterance.onerror = (err) => {
                    console.warn("Speech synthesis ended or interrupted:", err);
                    setIsSpeaking(false);
                };

                utteranceRef.current = utterance;
                window.speechSynthesis.speak(utterance);
            } catch (err) {
                console.error("Speech synthesis invocation failed:", err);
                setIsSpeaking(false);
            }
        }, 30);
    }, [language]);

    // Double Tap / Direct ASR Activation: activates Speech Recognition safely
    const startListening = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setVoiceFeedback(
                language === 'ta-IN' 
                    ? "இந்த உலாவியில் குரல் ஏற்பு வசதி இல்லை." 
                    : "Speech recognition not supported in this browser."
            );
            return;
        }

        // Cancel any active speech synthesis before listening
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);

        const launchRecognition = () => {
            try {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = language || 'ta-IN';

                setTranscript('');
                setVoiceFeedback('');
                lastProcessedRef.current = '';

                let accumulatedFinal = '';
                let latestInterim = '';

                const dispatchVoiceHandler = (rawText) => {
                    const clean = (rawText || '').trim();
                    if (!clean) return;
                    if (lastProcessedRef.current === clean) return;
                    lastProcessedRef.current = clean;
                    setLastRecognized(clean);
                    console.log("[ASR Final Voice Captured]:", clean);

                    // Global Help/Repeat trigger: 'மீண்டும்', 'உதவி', 'repeat', 'help'
                    const lower = clean.toLowerCase();
                    if (lower.includes('மீண்டும்') || lower.includes('உதவி') || lower.includes('repeat') || lower.includes('help')) {
                        speakCurrentInstruction();
                        return;
                    }

                    if (voiceHandlerRef.current) {
                        voiceHandlerRef.current(clean);
                    }
                };

                recognition.onstart = () => {
                    isRecognizingRef.current = true;
                    setIsListening(true);
                };

                recognition.onresult = (event) => {
                    let interim = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            accumulatedFinal += ' ' + event.results[i][0].transcript;
                        } else {
                            interim += ' ' + event.results[i][0].transcript;
                        }
                    }

                    latestInterim = interim.trim();
                    const currentSpoken = (accumulatedFinal.trim() + ' ' + latestInterim).trim();
                    setTranscript(currentSpoken);

                    if (silenceTimeoutRef.current) {
                        clearTimeout(silenceTimeoutRef.current);
                    }

                    // Auto-commit on comfortable silence (1800ms) after speech detected
                    if (currentSpoken) {
                        silenceTimeoutRef.current = setTimeout(() => {
                            try { recognition.stop(); } catch(e){}
                            const fullCaptured = (accumulatedFinal || latestInterim || currentSpoken).trim();
                            dispatchVoiceHandler(fullCaptured);
                        }, 1800);
                    }
                };

                recognition.onerror = (event) => {
                    isRecognizingRef.current = false;
                    setIsListening(false);
                    if (event.error === 'no-speech') {
                        setVoiceFeedback(
                            language === 'ta-IN' 
                                ? "குரல் கேட்கவில்லை. மீண்டும் 2-முறை தட்டவும்." 
                                : "No speech heard. Double-tap to try again."
                        );
                    } else if (event.error === 'not-allowed') {
                        setVoiceFeedback(
                            language === 'ta-IN' 
                                ? "மைக் அனுமதி தேவை. உலாவியில் அனுமதிக்கவும்." 
                                : "Microphone access blocked. Please allow mic."
                        );
                    } else if (event.error !== 'aborted') {
                        console.warn("Speech Recognition Error:", event.error);
                    }
                };

                recognition.onend = () => {
                    isRecognizingRef.current = false;
                    setIsListening(false);
                    const finalText = (accumulatedFinal || latestInterim).trim();
                    if (finalText) {
                        dispatchVoiceHandler(finalText);
                    }
                };

                recognitionRef.current = recognition;
                recognition.start();
            } catch (err) {
                console.warn("Recognition start failed, scheduled retry:", err);
                isRecognizingRef.current = false;
                setTimeout(() => {
                    try {
                        if (recognitionRef.current) recognitionRef.current.start();
                    } catch (retryErr) {
                        console.error("Recognition retry failed:", retryErr);
                        setIsListening(false);
                    }
                }, 90);
            }
        };

        // If recognition is currently active, abort cleanly and wait 70ms before restarting
        if (isRecognizingRef.current && recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) {}
            isRecognizingRef.current = false;
            setTimeout(launchRecognition, 70);
        } else {
            launchRecognition();
        }
    }, [language]);

    const stopListening = useCallback(() => {
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
        }
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
        }
        isRecognizingRef.current = false;
        setIsListening(false);
    }, []);

    // 1-Click Conversational Voice: speaks options then immediately starts listening
    const speakThenListen = useCallback((customPrompt = null) => {
        const textToSpeak = customPrompt || guidePrompt || screenInstruction;

        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e) {}
        }
        isRecognizingRef.current = false;
        setIsListening(false);
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }

        if (!textToSpeak || !('speechSynthesis' in window)) {
            startListening();
            return;
        }

        setSpokenText(textToSpeak);
        setLastPromptState(textToSpeak);
        setIsSpeaking(true);

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = language || 'ta-IN';
        utterance.volume = 0.85;
        utterance.rate = 0.95;

        let hasFiredListen = false;
        const triggerListen = () => {
            if (!hasFiredListen) {
                hasFiredListen = true;
                setIsSpeaking(false);
                setTimeout(() => {
                    startListening();
                }, 80);
            }
        };

        utterance.onend = triggerListen;
        utterance.onerror = (err) => {
            console.warn("TTS ended with error/abort:", err);
            triggerListen();
        };

        // Fallback safety timer in case browser does not trigger onend
        const wordsCount = textToSpeak.split(/\s+/).length;
        const estDurationMs = Math.max(3000, wordsCount * 450);
        const fallbackTimer = setTimeout(() => {
            if (!hasFiredListen && isSpeaking) {
                triggerListen();
            }
        }, estDurationMs + 1000);

        utteranceRef.current = utterance;
        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, 30);
    }, [guidePrompt, screenInstruction, language, startListening, isSpeaking]);

    // Instant barge-in: cancels speech and opens mic immediately
    const bargeInAndListen = useCallback(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
        startListening();
    }, [startListening]);

    // Single Tap helper: instantly repeats screen instruction aloud
    const speakCurrentInstruction = useCallback(() => {
        const textToSpeak = screenInstruction || lastPrompt || (
            language === 'ta-IN' ? "உங்களுக்கு உதவ நான் தயாராக உள்ளேன். வழிமுறைகளை செயல்படுத்தவும்." : "I am ready to help you. Please follow screen instructions."
        );
        speak(textToSpeak, language);
    }, [screenInstruction, lastPrompt, language, speak]);

    // Set screen instruction and optionally announce immediately
    const setScreenInstruction = useCallback((text, announceImmediately = false) => {
        setScreenInstructionState(text);
        if (announceImmediately && text) {
            speak(text, language);
        }
    }, [speak, language]);

    // Set contextual guide prompt (for 1-click voice navigation)
    const setGuidePrompt = useCallback((text) => {
        setGuidePromptState(text);
    }, []);

    // Register active voice command handler for the active screen
    const registerVoiceHandler = useCallback((handlerFn) => {
        voiceHandlerRef.current = handlerFn;
    }, []);

    const unregisterVoiceHandler = useCallback(() => {
        voiceHandlerRef.current = null;
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) {}
            }
            if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
            }
        };
    }, []);

    const value = {
        language,
        pageContext,
        setPageContext,
        screenInstruction,
        setScreenInstruction,
        guidePrompt,
        setGuidePrompt,
        lastPrompt,
        setLastPrompt: setLastPromptState,
        spokenText,
        setSpokenText,
        lastRecognized,
        setLastRecognized,
        voiceFeedback,
        setVoiceFeedback,
        isListening,
        isSpeaking,
        transcript,
        speak,
        stopSpeaking,
        speakThenListen,
        bargeInAndListen,
        speakCurrentInstruction,
        startListening,
        stopListening,
        registerVoiceHandler,
        unregisterVoiceHandler,
        // Fuzzy & Intent matcher utilities
        matchesAnyKeyword,
        matchIntent: (text, keywords, threshold) => matchesAnyKeyword(text, keywords, threshold),
        normalizeText,
        similarityRatio,
        isNewSaleIntent,
        isMyProductsIntent,
        isAcceptOrderIntent,
        isInterestIntent,
        isExpressInterestIntent,
        isSearchIntent,
        isPaymentIntent,
        isHomeIntent,
        isLogoutIntent,
        isTakePhotoIntent
    };

    return (
        <SmartVoiceContext.Provider value={value}>
            {children}
        </SmartVoiceContext.Provider>
    );
};

export const useSmartVoice = () => {
    const context = useContext(SmartVoiceContext);
    if (!context) {
        throw new Error('useSmartVoice must be used within a SmartVoiceProvider');
    }
    return context;
};
