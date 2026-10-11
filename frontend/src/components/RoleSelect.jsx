import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getTranslation } from '../utils/translations';

const ROLE_KEYWORDS = {
    buyer: ['வாங்க', 'வாங்குபவர்', 'buyer', 'buy', 'खरीदार', 'खरीदना', 'కొనుగోలుదారు', 'కొనడానికి', 'vang', 'vaang', 'kharid'],
    seller: ['விற்பனை', 'விற்க', 'seller', 'sell', 'வியாபாரி', 'விற்பனையாளர்', 'विक्रेता', 'बेचना', 'విక్రేత', 'అమ్మడానికి', 'virk', 'vikka', 'bech', 'vyapari']
};

export const RoleSelect = ({ language, onSelect }) => {
    const [orbState, setOrbState] = useState('speaking'); // 'speaking' | 'listening' | 'success'
    const [transcript, setTranscript] = useState('');
    const [selectedRole, setSelectedRole] = useState(null);
    
    const recognitionRef = useRef(null);
    const timeoutRef = useRef(null);
    const selectedRef = useRef(false);
    
    const t = getTranslation(language);

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
            
            // Keyword matching logic
            let matchedRole = null;
            for (const keyword of ROLE_KEYWORDS.buyer) {
                if (spokenText.includes(keyword.toLowerCase())) matchedRole = 'buyer';
            }
            for (const keyword of ROLE_KEYWORDS.seller) {
                if (spokenText.includes(keyword.toLowerCase())) matchedRole = 'seller';
            }
            
            if (matchedRole) {
                confirmRole(matchedRole);
            }
        };
        
        recognition.onend = () => {
             if (!selectedRef.current && orbState === 'listening') {
                 try { recognition.start(); } catch(e){}
             }
        };

        recognitionRef.current = recognition;
        try { recognition.start(); } catch(e){}
        
        // 7-second auto-timeout for empathetic re-prompt
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
            ? "வணக்கம்! நீங்கள் பொருட்களை விற்க வந்துள்ளீர்களா, அல்லது வாங்க வந்துள்ளீர்களா? சொல்லுங்கள்."
            : t.rolePrompt;
            
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = language;
        utter.volume = 0.6; // Lower volume to prevent blast
        
        // When Agent finishes speaking, microphone auto-activates
        utter.onend = () => startListening();
        
        // Fallback just in case the browser TTS drops the onend event
        setTimeout(() => {
            if (orbState === 'speaking' && !selectedRef.current) {
                startListening();
            }
        }, 7000);

        window.speechSynthesis.speak(utter);
    }, [language, t.rolePrompt, startListening, orbState]);

    const playReprompt = useCallback(() => {
        setOrbState('speaking');
        setTranscript(language === 'ta-IN' ? 'மன்னிக்கவும், சரியாகக் கேட்கவில்லை...' : 'I did not catch that...');
        
        const text = language === 'ta-IN'
            ? "பொருட்களை விற்க வேண்டுமானால் 'விற்க' என்று சொல்லுங்கள். வாங்க வேண்டுமானால் 'வாங்க' என்று சொல்லுங்கள்."
            : (language === 'hi-IN' ? "अगर बेचना है तो 'बेचना' कहें। खरीदना है तो 'खरीदना' कहें।" : "If you want to sell, say 'Sell'. If you want to buy, say 'Buy'.");
            
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = language;
        utter.volume = 0.6; // Lower volume to prevent blast
        utter.onend = () => startListening();
        window.speechSynthesis.speak(utter);
    }, [language, startListening]);

    const confirmRole = useCallback((role) => {
        selectedRef.current = true;
        setSelectedRole(role);
        setOrbState('success');
        clearTimeout(timeoutRef.current);
        
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }
        
        window.speechSynthesis.cancel();
        const confirmText = language === 'ta-IN'
            ? (role === 'seller' ? "சரி, நீங்கள் விற்பனையாளர் என பதிவு செய்கிறேன்." : "சரி, நீங்கள் வாங்குபவர் என பதிவு செய்கிறேன்.")
            : (role === 'seller' ? "Understood, setting you up as a Seller." : "Understood, setting you up as a Buyer.");
            
        setTranscript(`✅ ${confirmText}`);
        
        const utter = new SpeechSynthesisUtterance(confirmText);
        utter.lang = language;
        utter.volume = 0.6;
        
        // Trigger MCP API/Next screen transition
        utter.onend = () => onSelect(role);
        
        setTimeout(() => {
            onSelect(role);
        }, 4000);

        window.speechSynthesis.speak(utter);
    }, [language, onSelect]);

    // Boot sequence
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
    }, []); // Only run once on mount

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
            
            {/* Live Voice Subtitle Box */}
            <div className={`mb-12 px-10 py-5 rounded-full border-2 text-2xl font-bold min-w-[350px] shadow-lg transition-colors
                ${orbState === 'listening' ? 'border-green-500 text-green-400 bg-green-900/30' : ''}
                ${orbState === 'speaking' ? 'border-purple-500 text-purple-300 bg-purple-900/30' : ''}
                ${orbState === 'success' ? 'border-yellow-400 text-yellow-400 bg-yellow-900/30' : ''}
            `}>
                {transcript}
            </div>

            {/* Visual Cue Cards */}
            <div className="grid grid-cols-2 gap-8 w-full">
                {/* Buyer Card */}
                <div 
                    onClick={() => confirmRole('buyer')}
                    className={`
                    flex flex-col items-center justify-center p-8 rounded-3xl border-4 transition-all duration-700 cursor-pointer hover:scale-105
                    ${selectedRole === 'buyer' ? 'bg-yellow-500/20 border-yellow-400 scale-110 shadow-[0_0_40px_rgba(250,204,21,0.6)]' : 'bg-gray-900/80 border-gray-700 opacity-60'}
                    ${selectedRole && selectedRole !== 'buyer' ? 'opacity-20 scale-95' : ''}
                `}>
                    <div className="text-7xl mb-4 drop-shadow-md">🛒</div>
                    <div className={`text-3xl font-bold ${selectedRole === 'buyer' ? 'text-yellow-400' : 'text-gray-300'}`}>
                        {t.buyerUI}
                    </div>
                    <div className="text-gray-400 mt-3 font-mono text-lg">(Buyer)</div>
                </div>

                {/* Seller Card */}
                <div 
                    onClick={() => confirmRole('seller')}
                    className={`
                    flex flex-col items-center justify-center p-8 rounded-3xl border-4 transition-all duration-700 cursor-pointer hover:scale-105
                    ${selectedRole === 'seller' ? 'bg-yellow-500/20 border-yellow-400 scale-110 shadow-[0_0_40px_rgba(250,204,21,0.6)]' : 'bg-gray-900/80 border-gray-700 opacity-60'}
                    ${selectedRole && selectedRole !== 'seller' ? 'opacity-20 scale-95' : ''}
                `}>
                    <div className="text-7xl mb-4 drop-shadow-md">🌾</div>
                    <div className={`text-3xl font-bold ${selectedRole === 'seller' ? 'text-yellow-400' : 'text-gray-300'}`}>
                        {t.sellerUI}
                    </div>
                    <div className="text-gray-400 mt-3 font-mono text-lg">(Seller)</div>
                </div>
            </div>
        </div>
    );
};
