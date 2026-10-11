import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { playTTS, transcribeAudio, searchBuyerListings, expressBuyerInterest } from '../services/api';

const BUYER_STATES = {
    IDLE: 0,
    LISTENING: 1,
    SEARCHING: 2,
    RESULTS: 3
};

export const BuyerCommerceView = ({ language, user }) => {
    const [state, setState] = useState(BUYER_STATES.IDLE);
    const [transcript, setTranscript] = useState('');
    const [results, setResults] = useState([]);
    
    const recognitionRef = useRef(null);
    const timeoutRef = useRef(null);
    const unmounted = useRef(false);

    const startSearch = async () => {
        if (unmounted.current) return;
        
        setState(BUYER_STATES.LISTENING);
        const prompt = language === 'ta-IN' ? "நீங்கள் என்ன வாங்க விரும்புகிறீர்கள்? சொல்லுங்கள்." : "What do you want to buy? Speak now.";
        
        const utter = new SpeechSynthesisUtterance(prompt);
        utter.lang = language;
        utter.volume = 0.6;
        
        utter.onend = () => {
            if (unmounted.current) return;
            startListening();
        };
        
        window.speechSynthesis.speak(utter);
    };
    
    const startListening = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;
        
        let finalTranscript = "";

        setTranscript(language === 'ta-IN' ? "கேட்கிறது..." : "Listening...");

        recognition.onresult = (event) => {
            let interimTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            setTranscript(`"${finalTranscript || interimTranscript}"`);
            
            if (finalTranscript) {
                clearTimeout(timeoutRef.current);
                processTranscript(finalTranscript);
            }
        };

        recognition.onend = () => {
             // Let it time out naturally if no final result
        };

        recognitionRef.current = recognition;
        try { recognition.start(); } catch(e){}
        
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(e){}
            }
            setState(BUYER_STATES.IDLE);
            setTranscript(language === 'ta-IN' ? "நேரம் முடிந்தது. மீண்டும் தட்டவும்." : "Timed out. Tap again.");
        }, 10000);
    };

    const processTranscript = async (text) => {
        if (unmounted.current) return;
        
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }
        
        try {
            setState(BUYER_STATES.SEARCHING);
            setTranscript(language === 'ta-IN' ? "தேடுகிறது..." : "Searching...");
            
            const searchRes = await searchBuyerListings(text, language);
            setResults(searchRes.results || []);
            setState(BUYER_STATES.RESULTS);
            
            const foundCount = (searchRes.results || []).length;
            if (foundCount > 0) {
                const successMsg = language === 'ta-IN' ? `${foundCount} முடிவுகள் கிடைத்துள்ளன.` : `Found ${foundCount} results.`;
                const utter = new SpeechSynthesisUtterance(successMsg);
                utter.lang = language;
                utter.volume = 0.6;
                window.speechSynthesis.speak(utter);
            } else {
                const failMsg = language === 'ta-IN' ? "மன்னிக்கவும், எதுவும் கிடைக்கவில்லை." : "Sorry, no matches found.";
                const utter = new SpeechSynthesisUtterance(failMsg);
                utter.lang = language;
                utter.volume = 0.6;
                window.speechSynthesis.speak(utter);
                setTimeout(() => setState(BUYER_STATES.IDLE), 3000);
            }
            
        } catch (err) {
            console.error("Search Error", err);
            const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. மீண்டும் கூறவும்." : "I didn't catch that. Please repeat.";
            const utter = new SpeechSynthesisUtterance(errorMsg);
            utter.lang = language;
            utter.volume = 0.6;
            window.speechSynthesis.speak(utter);
            setState(BUYER_STATES.IDLE);
        }
    };

    const handleExpressInterest = async (listingId) => {
        try {
            await expressBuyerInterest(user.user_id, listingId);
            const msg = language === 'ta-IN' ? "உங்கள் விருப்பம் பதிவு செய்யப்பட்டது. விற்பனையாளர் உங்களை தொடர்பு கொள்வார்." : "Interest registered. The seller will contact you.";
            const utter = new SpeechSynthesisUtterance(msg);
            utter.lang = language;
            utter.volume = 0.6;
            window.speechSynthesis.speak(utter);
            
            // Optionally set UI state for the specific item, but an alert/TTS is fine for now
            alert(msg);
        } catch (e) {
            console.error("Interest Error", e);
        }
    };

    useEffect(() => {
        return () => {
            unmounted.current = true;
            clearTimeout(timeoutRef.current);
            window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(e){}
            }
        };
    }, []);

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center p-8">
            <h1 className="text-4xl font-bold text-white mb-8">
                {language === 'ta-IN' ? "பொருட்களை தேடுங்கள்" : "Search for Products"}
            </h1>

            {/* Central Search Orb */}
            {state !== BUYER_STATES.RESULTS && (
                <div 
                    onClick={state === BUYER_STATES.IDLE ? startSearch : undefined}
                    className={`relative w-48 h-48 mb-8 flex items-center justify-center rounded-full transition-all duration-300 ${state === BUYER_STATES.IDLE ? 'cursor-pointer hover:scale-105' : ''}`}
                >
                    {state === BUYER_STATES.LISTENING && (
                        <div className="absolute inset-0 rounded-full bg-green-500 opacity-50 animate-ping"></div>
                    )}
                    {state === BUYER_STATES.SEARCHING && (
                        <div className="absolute inset-0 rounded-full bg-yellow-500 opacity-50 animate-pulse"></div>
                    )}
                    
                    <div className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-colors duration-500
                        ${state === BUYER_STATES.IDLE ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-[0_0_40px_rgba(79,70,229,0.8)]' : ''}
                        ${state === BUYER_STATES.LISTENING ? 'bg-green-500 shadow-[0_0_60px_rgba(34,197,94,0.9)]' : ''}
                        ${state === BUYER_STATES.SEARCHING ? 'bg-yellow-500 shadow-[0_0_60px_rgba(234,179,8,0.9)]' : ''}
                    `}>
                        {state === BUYER_STATES.SEARCHING ? (
                            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-white"></div>
                        ) : (
                            <span className="text-6xl">🎙️</span>
                        )}
                    </div>
                </div>
            )}

            {/* Status / Transcript Text */}
            <div className="text-2xl font-bold text-blue-300 mb-8 min-h-[40px] text-center">
                {state === BUYER_STATES.IDLE && (language === 'ta-IN' ? "தொடங்க மைக்ரோஃபோனை தட்டவும்" : "Tap to speak what you want to buy")}
                {state !== BUYER_STATES.IDLE && transcript}
            </div>

            {/* Results Grid */}
            {state === BUYER_STATES.RESULTS && (
                <div className="w-full">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-white">
                            {language === 'ta-IN' ? "முடிவுகள்" : "Search Results"}
                        </h2>
                        <button 
                            onClick={() => setState(BUYER_STATES.IDLE)}
                            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
                        >
                            {language === 'ta-IN' ? "மீண்டும் தேடு" : "Search Again"}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {results.map((item) => (
                            <div key={item.id} className="bg-gray-800/80 rounded-2xl p-6 border border-gray-700 shadow-xl flex flex-col h-full">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-2xl font-bold text-brightYellow">{item.title}</h3>
                                    <span className="bg-green-900/50 text-green-400 px-3 py-1 rounded-full text-sm font-bold border border-green-700">
                                        ₹{item.price_per_unit} / {item.unit}
                                    </span>
                                </div>
                                
                                <p className="text-gray-300 mb-6 flex-grow">{item.description}</p>
                                
                                <div className="bg-gray-900/50 p-4 rounded-xl mb-6">
                                    <p className="text-gray-400 text-sm mb-1">{language === 'ta-IN' ? "விற்பனையாளர்" : "Seller"}</p>
                                    <p className="text-white font-bold">{item.seller_name}</p>
                                    <p className="text-gray-400 text-sm">📍 {item.seller_village}</p>
                                    <p className="text-blue-400 font-bold mt-2">📦 {item.quantity} {item.unit} {language === 'ta-IN' ? "இருப்பு உள்ளது" : "Available"}</p>
                                </div>
                                
                                <div className="flex gap-4 w-full mt-2">
                                    <button 
                                        onClick={() => handleExpressInterest(item.id)}
                                        className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-lg text-center transition-colors"
                                    >
                                        ✅ {language === 'ta-IN' ? "விருப்பம் தெரிவியுங்கள்" : "I'm Interested"}
                                    </button>
                                    <a 
                                        href={`tel:${item.seller_phone}`}
                                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-lg text-center transition-colors"
                                    >
                                        📞 {language === 'ta-IN' ? "அழைக்க" : "Call"}
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
