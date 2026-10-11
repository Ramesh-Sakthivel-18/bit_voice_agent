import React, { useState, useRef, useCallback, useEffect } from 'react';

const LANGUAGES = [
    { code: 'ta-IN', native: 'தமிழ்', english: 'Tamil', confirm: 'தமிழ் தேர்ந்தெடுக்கப்பட்டது. முக அடையாளம் தொடங்குகிறது...' },
    { code: 'hi-IN', native: 'हिन्दी', english: 'Hindi', confirm: 'हिन्दी चुनी गई है। चेहरा पहचान शुरू हो रही है...' },
    { code: 'te-IN', native: 'తెలుగు', english: 'Telugu', confirm: 'తెలుగు ఎంచుకోబడింది. ముఖ గుర్తింపు ప్రారంభమవుతోంది...' },
    { code: 'kn-IN', native: 'ಕನ್ನಡ', english: 'Kannada', confirm: 'ಕನ್ನಡ ಆಯ್ಕೆ ಮಾಡಲಾಗಿದೆ. ಮುಖ ಗುರುತಿಸುವಿಕೆ ಪ್ರಾರಂಭವಾಗುತ್ತಿದೆ...' },
    { code: 'ml-IN', native: 'മലയാളം', english: 'Malayalam', confirm: 'മലയാളം തിരഞ്ഞെടുത്തു. മുഖം തിരിച്ചറിയൽ ആരംഭിക്കുന്നു...' },
    { code: 'mr-IN', native: 'मराठी', english: 'Marathi', confirm: 'मराठी निवडली आहे. चेहरा ओळख सुरू होत आहे...' },
    { code: 'bn-IN', native: 'বাংলা', english: 'Bengali', confirm: 'বাংলা নির্বাচন করা হয়েছে। মুখ সনাক্তকরণ শুরু হচ্ছে...' },
    { code: 'gu-IN', native: 'ગુજરાતી', english: 'Gujarati', confirm: 'ગુજરાતી પસંદ કરવામાં આવી છે. ચહેરો ઓળખ શરૂ થઈ રહી છે...' },
    { code: 'or-IN', native: 'ଓଡ଼ିଆ', english: 'Odia', confirm: 'ଓଡ଼ିଆ ମନୋନୀତ ହୋଇଛି. ଚେହେରା ଚିହ୍ନଟ ଆରମ୍ଭ ହେଉଛି...' },
    { code: 'pa-IN', native: 'ਪੰਜਾਬੀ', english: 'Punjabi', confirm: 'ਪੰਜਾਬੀ ਚੁਣੀ ਗਈ ਹੈ। ਚਿਹਰਾ ਪਛਾਣ ਸ਼ੁਰੂ ਹੋ ਰਹੀ ਹੈ...' },
    { code: 'en-IN', native: 'English', english: 'English (India)', confirm: 'English selected. Starting Face Login...' },
];

const LANGUAGE_MAP = {
    "tamil": "ta-IN",
    "thamil": "ta-IN",
    "thamizh": "ta-IN",
    "tamizh": "ta-IN",
    "hindi": "hi-IN",
    "hindee": "hi-IN",
    "telugu": "te-IN",
    "kannada": "kn-IN",
    "malayalam": "ml-IN",
    "marathi": "mr-IN",
    "bengali": "bn-IN",
    "bangla": "bn-IN",
    "gujarati": "gu-IN",
    "odia": "or-IN",
    "oriya": "or-IN",
    "punjabi": "pa-IN",
    "english": "en-IN",
};

export const LanguageSelect = ({ onSelect }) => {
    const [isListening, setIsListening] = useState(false);
    const [selectedCode, setSelectedCode] = useState(null);
    const [transcript, setTranscript] = useState('Waiting to start...');

    const isListeningRef = useRef(false);
    const selectedRef = useRef(false);

    // Clean up when the component unmounts
    useEffect(() => {
        return () => {
            if (window.speechEngine) {
                window.speechEngine.abort();
            }
        };
    }, []);

    // ─── CONFIRM SELECTION ───
    const confirmSelection = useCallback((code) => {
        selectedRef.current = true;
        isListeningRef.current = false;
        setSelectedCode(code);
        setIsListening(false);

        // Stop recognition immediately
        if (window.speechEngine) {
            try { window.speechEngine.abort(); } catch (e) { }
        }

        const lang = LANGUAGES.find(l => l.code === code);
        const successMsg = lang ? lang.confirm : 'Language Selected!';
        setTranscript(`✅ ${lang ? lang.english : code} selected!`);

        // Voice Feedback
        window.speechSynthesis.cancel();
        localStorage.setItem('selected_language', code);
        const utter = new SpeechSynthesisUtterance(successMsg);
        utter.lang = code;
        window.speechSynthesis.speak(utter);

        setTimeout(() => {
            if (onSelect) onSelect(code);
        }, 2500);
    }, [onSelect]);

    // ─── START CONTINUOUS LISTENING ───
    const startContinuousListening = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setTranscript('⚠️ Please use Google Chrome or Edge!');
            return;
        }

        // FIX 1: Attach to window to prevent React/Chrome Garbage Collection killing it silently
        window.speechEngine = new SpeechRecognition();
        const recognition = window.speechEngine;
        
        recognition.continuous = true;
        
        // Strictly matching sample.html
        recognition.interimResults = false; 
        
        recognition.lang = 'en-IN';

        recognition.onstart = () => {
            isListeningRef.current = true;
            setIsListening(true);
            setTranscript('Listening continuously...');
        };

        recognition.onresult = (event) => {
            if (selectedRef.current) return;

            // Get the latest word spoken (exact match to sample.html)
            const latestResultIndex = event.results.length - 1;
            const spokenText = event.results[latestResultIndex][0].transcript.toLowerCase().trim();

            console.log("Live audio heard:", spokenText);
            setTranscript(`You said: "${spokenText}"`);

            // Check if ANY of the words spoken match our languages
            for (const [langName, langCode] of Object.entries(LANGUAGE_MAP)) {
                if (spokenText.includes(langName)) {
                    confirmSelection(langCode);
                    break;
                }
            }
        };

        recognition.onerror = (event) => {
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            console.error("Speech recognition error:", event.error);
        };

        recognition.onend = () => {
            // Restart loop if the browser automatically paused it
            if (isListeningRef.current && !selectedRef.current) {
                setTimeout(() => {
                    if (isListeningRef.current && !selectedRef.current) {
                        try {
                            window.speechEngine.start();
                        } catch (e) {
                            console.log("Restart collision prevented");
                        }
                    }
                }, 300);
            }
        };

        // Start the engine
        try {
            recognition.start();
        } catch (e) {
            console.error("Mic already started.");
        }
    }, [confirmSelection]);

    // ─── Audio Preview on Hover ───
    const playAudioPreview = (lang) => {
        if (selectedRef.current) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(lang.native);
        utterance.lang = lang.code;
        window.speechSynthesis.speak(utterance);
    };

    return (
        <div className="w-full flex flex-col items-center justify-start min-h-screen bg-[#0A192F] text-white p-4 pt-6">
            
            {/* ── Status Pill Button ── */}
            <div
                onClick={() => !isListening && !selectedRef.current && startContinuousListening()}
                className={`
                    flex items-center gap-4 px-8 py-4 rounded-full mb-4 transition-all duration-300 select-none
                    ${isListening
                        ? 'bg-emerald-900/80 border-2 border-emerald-500 cursor-default pointer-events-none'
                        : 'bg-[#152238] border-2 border-blue-500 cursor-pointer hover:border-blue-400 hover:scale-[1.02]'
                    }
                `}
            >
                <div className={`w-5 h-5 rounded-full transition-all ${isListening ? 'bg-emerald-500 animate-ping' : 'bg-blue-500'}`} />
                <div className={`w-5 h-5 rounded-full absolute ${isListening ? 'bg-emerald-500' : 'bg-blue-500'}`} />

                <div>
                    <h4 className={`text-base font-bold ${isListening ? 'text-emerald-400' : 'text-white'}`}>
                        {isListening ? 'Hands-Free Mode Active' : 'Click Once to Start'}
                    </h4>
                    <p className="text-xs text-gray-400">
                        {isListening ? 'Just say a language name out loud!' : 'Required once for mic permission'}
                    </p>
                </div>
            </div>

            {/* ── Live Transcript Box ── */}
            <div className="w-full max-w-xl bg-black/70 border border-gray-700 rounded-xl px-5 py-3 mb-8 min-h-[52px] flex items-center justify-center text-center">
                <span className={`text-lg font-semibold ${selectedCode ? 'text-amber-400' : 'text-sky-400'}`}>
                    {transcript}
                </span>
            </div>

            {/* ── Language Grid ── */}
            <div className="w-full max-w-5xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-2">
                {LANGUAGES.map((lang) => {
                    const isSelected = selectedCode === lang.code;
                    return (
                        <button
                            key={lang.code}
                            onMouseEnter={() => !selectedCode && playAudioPreview(lang)}
                            onClick={() => !selectedCode && confirmSelection(lang.code)}
                            className={`
                                relative p-5 rounded-2xl flex flex-col items-center justify-center transition-all duration-200 h-28
                                border-2
                                ${isSelected
                                    ? 'bg-blue-900 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.6)] scale-105'
                                    : 'bg-[#131d31] border-[#1f2e4d] hover:border-sky-400 hover:-translate-y-0.5'
                                }
                                ${selectedCode && !isSelected ? 'opacity-40 pointer-events-none' : ''}
                            `}
                        >
                            <span className={`text-3xl font-bold mb-1 ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                                {lang.native}
                            </span>
                            <span className={`text-sm ${isSelected ? 'text-amber-300 font-bold' : 'text-gray-400'}`}>
                                {lang.english}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};