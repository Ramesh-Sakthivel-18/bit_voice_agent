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
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');

    const voiceHandlerRef = useRef(null);
    const recognitionRef = useRef(null);
    const silenceTimeoutRef = useRef(null);
    const utteranceRef = useRef(null);
    const lastProcessedRef = useRef('');

    // Speak helper using Web Speech Synthesis
    const speak = useCallback((text, langCode = language) => {
        if (!text || !('speechSynthesis' in window)) return;

        window.speechSynthesis.cancel();
        setLastPromptState(text);
        setIsSpeaking(true);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langCode || 'ta-IN';
        utterance.volume = 0.6; // Strictly constrained as per guidelines
        utterance.rate = 0.95;

        utterance.onend = () => {
            setIsSpeaking(false);
        };
        utterance.onerror = () => {
            setIsSpeaking(false);
        };

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    }, [language]);

    // Double Tap / Direct ASR Activation: activates Speech Recognition immediately
    const startListening = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("Speech recognition not supported in this browser.");
            return;
        }

        // Cancel any active speech synthesis before listening
        window.speechSynthesis.cancel();
        setIsSpeaking(false);

        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) {}
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;

        setTranscript('');
        setIsListening(true);
        lastProcessedRef.current = '';

        let accumulatedFinal = '';
        let latestInterim = '';

        const dispatchVoiceHandler = (rawText) => {
            const clean = (rawText || '').trim();
            if (!clean) return;
            if (lastProcessedRef.current === clean) return; // avoid duplicate calls
            lastProcessedRef.current = clean;
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

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    accumulatedFinal += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }

            latestInterim = interim;
            const currentSpoken = (accumulatedFinal || interim).trim();
            setTranscript(currentSpoken);

            if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
            }

            // Auto-commit on brief silence (900ms) after speech detected
            if (currentSpoken) {
                silenceTimeoutRef.current = setTimeout(() => {
                    try { recognition.stop(); } catch(e){}
                    dispatchVoiceHandler(accumulatedFinal || latestInterim || currentSpoken);
                }, 900);
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            const finalText = (accumulatedFinal || latestInterim).trim();
            if (finalText) {
                dispatchVoiceHandler(finalText);
            }
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
        } catch (e) {
            console.error("Failed to start speech recognition:", e);
            setIsListening(false);
        }
    }, [language]);

    const stopListening = useCallback(() => {
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
        }
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
        }
        setIsListening(false);
    }, []);

    // 1-Click Conversational Voice: speaks options then immediately starts listening
    const speakThenListen = useCallback((customPrompt = null) => {
        const textToSpeak = customPrompt || guidePrompt || screenInstruction;

        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e) {}
        }
        setIsListening(false);
        window.speechSynthesis.cancel();

        if (!textToSpeak || !('speechSynthesis' in window)) {
            startListening();
            return;
        }

        setIsSpeaking(true);
        setLastPromptState(textToSpeak);

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = language || 'ta-IN';
        utterance.volume = 0.6;
        utterance.rate = 0.95;

        let hasFiredListen = false;
        const triggerListen = () => {
            if (!hasFiredListen) {
                hasFiredListen = true;
                setIsSpeaking(false);
                startListening();
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
        window.speechSynthesis.speak(utterance);
    }, [guidePrompt, screenInstruction, language, startListening, isSpeaking]);

    // Instant barge-in: cancels speech and opens mic immediately
    const bargeInAndListen = useCallback(() => {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        startListening();
    }, [startListening]);

    // Single Tap helper: instantly repeats screen instruction aloud
    const speakCurrentInstruction = useCallback(() => {
        const textToSpeak = screenInstruction || lastPrompt || (
            language === 'ta-IN' ? "வழிமுறைகள் இல்லை." : "No instruction available."
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
            window.speechSynthesis.cancel();
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
        isListening,
        isSpeaking,
        transcript,
        speak,
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
