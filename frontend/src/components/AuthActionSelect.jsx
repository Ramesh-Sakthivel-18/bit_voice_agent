import React, { useState, useEffect, useRef, useCallback } from 'react';
import { playTTS } from '../services/api';

const ACTION_KEYWORDS = {
    login: ['login', 'log in', 'log', 'புகுபதிகை', 'பதிகை', 'உள்நுழை', 'लॉगिन', 'लाग इन', 'लाग', 'లాగిన్', 'புகு', 'pugu', 'ulnulai'],
    register: ['register', 'reg', 'பதிவு', 'புதிய பதிவு', 'new', 'signup', 'रजिस्टर', 'नया', 'రిజిస్టర్', 'kotta', 'puthiya', 'pathivu']
};

export const AuthActionSelect = ({ language, onSelect }) => {
    const [orbState, setOrbState] = useState('speaking'); // 'speaking' | 'listening' | 'success'
    const [transcript, setTranscript] = useState('');
    const [selectedAction, setSelectedAction] = useState(null);
    
    const recognitionRef = useRef(null);
    const timeoutRef = useRef(null);
    const selectedRef = useRef(false);

    const startListening = useCallback(() => {
        if (selectedRef.current) return;
        setOrbState('listening');
        setTranscript(language === 'ta-IN' ? 'உங்களைக் கேட்கிறது... சொல்லுங்கள்' : 'Listening to you... speak now');
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;
        
        recognition.onresult = (event) => {
            if (selectedRef.current) return;
            
            const spokenText = Array.from(event.results)
                .map(res => res[0].transcript)
                .join(' ')
                .toLowerCase();
                
            setTranscript(`"${spokenText}"`);
            
            let matchedAction = null;
            for (const keyword of ACTION_KEYWORDS.login) {
                if (spokenText.includes(keyword.toLowerCase())) matchedAction = 'login';
            }
            for (const keyword of ACTION_KEYWORDS.register) {
                if (spokenText.includes(keyword.toLowerCase())) matchedAction = 'register';
            }
            
            if (matchedAction) {
                confirmAction(matchedAction);
            }
        };
        
        recognition.onend = () => {
             if (!selectedRef.current && orbState === 'listening') {
                 try { recognition.start(); } catch(e){}
             }
        };

        recognitionRef.current = recognition;
        try { recognition.start(); } catch(e){}
        
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (!selectedRef.current) {
                if (recognitionRef.current) {
                    try { recognitionRef.current.abort(); } catch(e){}
                }
                playReprompt();
            }
        }, 7000);
        
    }, [language, orbState]);

    const playInitialPrompt = useCallback(() => {
        setOrbState('speaking');
        setTranscript(language === 'ta-IN' ? 'ஏஜென்ட் பேசுகிறது...' : 'Agent is speaking...');
        window.speechSynthesis.cancel();
        
        const text = language === 'ta-IN' 
            ? "நீங்கள் ஏற்கனவே பதிவு செய்துள்ளீர்களா? உள்நுழைய 'புகுபதிகை' என்று சொல்லுங்கள். புதிய கணக்கு தொடங்க 'பதிவு' என்று சொல்லுங்கள்."
            : "Have you registered before? Say 'Login' to enter, or 'Register' to create a new account.";
            
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = language;
        utter.volume = 0.6;
        utter.onend = () => startListening();
        
        setTimeout(() => {
            if (orbState === 'speaking' && !selectedRef.current) {
                startListening();
            }
        }, 8000);

        window.speechSynthesis.speak(utter);
    }, [language, startListening, orbState]);

    const playReprompt = useCallback(() => {
        setOrbState('speaking');
        setTranscript(language === 'ta-IN' ? 'மன்னிக்கவும், சரியாகக் கேட்கவில்லை...' : 'I did not catch that...');
        
        const text = language === 'ta-IN'
            ? "உள்நுழைய 'புகுபதிகை' என்று சொல்லுங்கள். புதிய பதிவு செய்ய 'பதிவு' என்று சொல்லுங்கள்."
            : "Say 'Login' to login, or 'Register' to sign up.";
            
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = language;
        utter.volume = 0.6;
        utter.onend = () => startListening();
        window.speechSynthesis.speak(utter);
    }, [language, startListening]);

    const confirmAction = useCallback(async (action) => {
        selectedRef.current = true;
        setSelectedAction(action);
        setOrbState('success');
        clearTimeout(timeoutRef.current);
        
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }
        
        window.speechSynthesis.cancel();
        const confirmText = language === 'ta-IN'
            ? (action === 'login' ? "புகுபதிகை செய்கிறோம்..." : "புதிய பதிவை தொடங்குவோம்...")
            : (action === 'login' ? "Logging you in..." : "Starting new registration...");
            
        setTranscript(`✅ ${confirmText}`);
        
        const utter = new SpeechSynthesisUtterance(confirmText);
        utter.lang = language;
        utter.volume = 0.6;
        
        utter.onend = () => onSelect(action);
        window.speechSynthesis.speak(utter);
        
        setTimeout(() => {
            onSelect(action);
        }, 3000);
    }, [language, onSelect]);

    useEffect(() => {
        playInitialPrompt();
        return () => {
            selectedRef.current = true;
            clearTimeout(timeoutRef.current);
            window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(e){}
            }
        };
    }, []);

    return (
        <div className="w-full max-w-2xl text-center flex flex-col items-center">
            {/* The Voice Orb / Soundwave */}
            <div className="relative w-48 h-48 mb-10 flex items-center justify-center">
                {orbState === 'speaking' && (
                    <>
                        <div className="absolute inset-0 rounded-full bg-purple-500 opacity-40 animate-ping"></div>
                        <div className="absolute inset-4 rounded-full bg-blue-500 opacity-60 animate-pulse"></div>
                        <div className="relative z-10 w-28 h-28 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 shadow-[0_0_50px_rgba(147,51,234,0.8)] flex items-center justify-center">
                            <span className="text-5xl">🤖</span>
                        </div>
                    </>
                )}
                {orbState === 'listening' && (
                    <>
                        <div className="absolute inset-0 rounded-full bg-green-500 opacity-50 animate-ping"></div>
                        <div className="relative z-10 w-28 h-28 rounded-full bg-green-500 shadow-[0_0_60px_rgba(34,197,94,0.9)] flex items-center justify-center">
                            <span className="text-5xl">🎙️</span>
                        </div>
                    </>
                )}
                {orbState === 'success' && (
                    <div className="relative z-10 w-28 h-28 rounded-full bg-yellow-400 shadow-[0_0_60px_rgba(250,204,21,1)] flex items-center justify-center scale-110 transition-transform">
                        <span className="text-5xl">✅</span>
                    </div>
                )}
            </div>
            
            <div className={`mb-12 px-10 py-5 rounded-full border-2 text-2xl font-bold min-w-[350px] shadow-lg transition-colors
                ${orbState === 'listening' ? 'border-green-500 text-green-400 bg-green-900/30' : ''}
                ${orbState === 'speaking' ? 'border-purple-500 text-purple-300 bg-purple-900/30' : ''}
                ${orbState === 'success' ? 'border-yellow-400 text-yellow-400 bg-yellow-900/30' : ''}
            `}>
                {transcript}
            </div>

            <div className="grid grid-cols-2 gap-8 w-full">
                <div 
                    onClick={() => confirmAction('login')}
                    className={`
                    flex flex-col items-center justify-center p-8 rounded-3xl border-4 transition-all duration-700 cursor-pointer hover:scale-105
                    ${selectedAction === 'login' ? 'bg-yellow-500/20 border-yellow-400 scale-110 shadow-[0_0_40px_rgba(250,204,21,0.6)]' : 'bg-gray-900/80 border-gray-700 opacity-60'}
                    ${selectedAction && selectedAction !== 'login' ? 'opacity-20 scale-95' : ''}
                `}>
                    <div className="text-7xl mb-4 drop-shadow-md">👤</div>
                    <div className={`text-3xl font-bold ${selectedAction === 'login' ? 'text-yellow-400' : 'text-gray-300'}`}>
                        {language === 'ta-IN' ? "புகுபதிகை" : "Login"}
                    </div>
                </div>

                <div 
                    onClick={() => confirmAction('register')}
                    className={`
                    flex flex-col items-center justify-center p-8 rounded-3xl border-4 transition-all duration-700 cursor-pointer hover:scale-105
                    ${selectedAction === 'register' ? 'bg-yellow-500/20 border-yellow-400 scale-110 shadow-[0_0_40px_rgba(250,204,21,0.6)]' : 'bg-gray-900/80 border-gray-700 opacity-60'}
                    ${selectedAction && selectedAction !== 'register' ? 'opacity-20 scale-95' : ''}
                `}>
                    <div className="text-7xl mb-4 drop-shadow-md">📝</div>
                    <div className={`text-3xl font-bold ${selectedAction === 'register' ? 'text-yellow-400' : 'text-gray-300'}`}>
                        {language === 'ta-IN' ? "புதிய பதிவு" : "Register"}
                    </div>
                </div>
            </div>
        </div>
    );
};
