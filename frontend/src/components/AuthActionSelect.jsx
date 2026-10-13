import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { matchesAnyKeyword, normalizeText } from '../utils/voiceMatcher';

const ACTION_KEYWORDS = {
    login: ['login', 'log in', 'log', 'புகுபதிகை', 'பதிகை', 'உள்நுழை', 'लॉगिन', 'लाग इन', 'लाग', 'లాగిన్', 'புகு', 'pugu', 'ulnulai'],
    register: ['register', 'reg', 'பதிவு', 'புதிய பதிவு', 'new', 'signup', 'रजिस्टर', 'नया', 'రిజిస్టర్', 'kotta', 'puthiya', 'pathivu']
};

export const AuthActionSelect = ({ language, onSelect }) => {
    const { 
        setPageContext,
        setScreenInstruction, 
        setGuidePrompt, 
        speak,
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();

    const [statusText, setStatusText] = useState('');
    const [selectedAction, setSelectedAction] = useState(null);
    const selectedRef = useRef(false);

    const confirmAction = useCallback((action) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        setSelectedAction(action);

        window.speechSynthesis.cancel();
        const confirmText = language === 'ta-IN'
            ? (action === 'login' ? "புகுபதிகை செய்கிறோம்..." : "புதிய பதிவை தொடங்குவோம்...")
            : (action === 'login' ? "Logging you in..." : "Starting new registration...");
            
        setStatusText(`✅ ${confirmText}`);
        speak(confirmText, language);

        setTimeout(() => {
            onSelect(action);
        }, 1600);
    }, [language, onSelect, speak]);

    useEffect(() => {
        const pageCtx = language === 'ta-IN' ? "உள்நுழைவு / தொடக்கம்" : "Login / Register";
        setPageContext(pageCtx);

        const prompt = language === 'ta-IN' 
            ? "நீங்கள் ஏற்கனவே பதிவு செய்துள்ளீர்களா? உள்நுழைய 'புகுபதிகை' என்றும், புதிய கணக்கு தொடங்க 'பதிவு' என்றும் சொல்லுங்கள்."
            : "Have you registered before? Say 'Login' to enter, or 'Register' to create a new account.";
        
        setScreenInstruction(prompt, true);

        const guide = language === 'ta-IN'
            ? "உள்நுழைய 'புகுபதிகை' என்றும், பதிவு செய்ய 'பதிவு' என்றும் சொல்லுங்கள்."
            : "Say 'Login' or 'Register' into the microphone below.";
        setGuidePrompt(guide);

        // Register Voice Handler with fuzzy keyword matching
        const handleVoiceInput = (rawText) => {
            if (selectedRef.current || !rawText) return;
            const text = normalizeText(rawText);
            console.log("[Auth Action Voice Input]:", text);

            if (matchesAnyKeyword(text, ACTION_KEYWORDS.login)) {
                confirmAction('login');
            } else if (matchesAnyKeyword(text, ACTION_KEYWORDS.register)) {
                confirmAction('register');
            } else {
                const retry = language === 'ta-IN'
                    ? "உள்நுழைய 'புகுபதிகை' என்று சொல்லுங்கள். புதிய பதிவு செய்ய 'பதிவு' என்று சொல்லுங்கள்."
                    : "Say 'Login' or 'Register' to continue.";
                setStatusText(retry);
                speak(retry, language);
            }
        };

        registerVoiceHandler(handleVoiceInput);

        return () => {
            unregisterVoiceHandler();
            setPageContext('');
        };
    }, [language, setPageContext, setScreenInstruction, setGuidePrompt, registerVoiceHandler, unregisterVoiceHandler, confirmAction, speak]);

    return (
        <div className="w-full max-w-3xl text-center flex flex-col items-center p-6 pb-36">
            <h1 className="text-3xl md:text-5xl font-black text-white mb-3">
                {language === 'ta-IN' ? "உள்நுழைவு அல்லது புதிய பதிவு" : "Login or Register"}
            </h1>
            <p className="text-gray-400 text-sm md:text-base max-w-lg mb-8 leading-relaxed">
                {language === 'ta-IN'
                    ? "ஏற்கனவே கணக்கு இருந்தால் உள்நுழையவும், இல்லையெனில் புதிய பதிவு தொடங்கவும்"
                    : "Access your existing account, or register as a new producer or buyer."}
            </p>

            {/* Status / Feedback Pill (No local mic buttons, no middle mic orbs) */}
            <div className="w-full max-w-lg bg-[#0B152B]/90 border border-slate-700/80 rounded-2xl px-6 py-4 mb-10 shadow-xl text-center min-h-[56px] flex items-center justify-center">
                <span className={`text-base font-bold ${selectedAction ? 'text-emerald-400' : 'text-cyan-300'}`}>
                    {statusText || (language === 'ta-IN' ? "கீழே உள்ள மைக்கை இரட்டை தட்டி 'புகுபதிகை' அல்லது 'பதிவு' என்று சொல்லுங்கள்" : "Double-tap bottom mic & say 'Login' or 'Register'")}
                </span>
            </div>

            {/* Visual Action Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
                {/* Login Card */}
                <div 
                    onClick={() => confirmAction('login')}
                    className={`
                    flex flex-col items-center justify-center p-8 rounded-3xl border-2 transition-all duration-300 cursor-pointer hover:scale-[1.02]
                    ${selectedAction === 'login' 
                        ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.5)]' 
                        : 'bg-[#0B152B]/80 border-slate-700 hover:border-amber-400/60'}
                    ${selectedAction && selectedAction !== 'login' ? 'opacity-30 pointer-events-none' : ''}
                `}>
                    <div className="text-7xl mb-4 drop-shadow-md">👤</div>
                    <div className="text-2xl font-black text-amber-400">
                        {language === 'ta-IN' ? "புகுபதிகை" : "Login"}
                    </div>
                    <div className="text-gray-400 mt-2 text-sm">(Existing User Face Login)</div>
                    <p className="text-gray-400 text-xs mt-3 text-center">
                        {language === 'ta-IN' ? "முக அங்கீகாரம் மூலம் உடனடியாக உள்நுழைய" : "Instant sign-in with your registered face"}
                    </p>
                </div>

                {/* Register Card */}
                <div 
                    onClick={() => confirmAction('register')}
                    className={`
                    flex flex-col items-center justify-center p-8 rounded-3xl border-2 transition-all duration-300 cursor-pointer hover:scale-[1.02]
                    ${selectedAction === 'register' 
                        ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_35px_rgba(6,182,212,0.5)]' 
                        : 'bg-[#0B152B]/80 border-slate-700 hover:border-cyan-400/60'}
                    ${selectedAction && selectedAction !== 'register' ? 'opacity-30 pointer-events-none' : ''}
                `}>
                    <div className="text-7xl mb-4 drop-shadow-md">📝</div>
                    <div className="text-2xl font-black text-cyan-400">
                        {language === 'ta-IN' ? "புதிய பதிவு" : "Register"}
                    </div>
                    <div className="text-gray-400 mt-2 text-sm">(New Producer / Buyer)</div>
                    <p className="text-gray-400 text-xs mt-3 text-center">
                        {language === 'ta-IN' ? "குரல் வழியே பெயர், கிராமம் விவரங்களை பதிவு செய்ய" : "Voice-guided profile setup & face enrollment"}
                    </p>
                </div>
            </div>
        </div>
    );
};

